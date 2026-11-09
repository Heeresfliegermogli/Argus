#!/usr/bin/env python3
"""Ende-zu-Ende-Test (seit 2.6): vier Browserfenster im selben Raum – Spielleitung, Team-Laptop (Zielbearbeitung, rechnet das
Spiel), ein zweites Fenster desselben Teams (sieht nur zu) und Plenum.

Prüft: Der Team-Laptop rechnet sein Spiel selbst (Entscheidung sofort im eigenen Stand, ohne Netz); die anderen Fenster folgen
dem hochgeladenen Protokoll und haben am Ende denselben Stand (Laufnummer, seq, Fingerabdruck); das zweite Fenster kann nichts
senden; jede Aktion steht im Protokoll, das Protokoll ist lückenlos; Statusmeldung bei der Spielleitung; jede Ansicht passt ohne
Rollbalken in 1530 × 800, feste Felder schneiden nichts ab.

Aufruf:
  python3 tools/e2e_vier_fenster.py http://localhost:4173/            # gebaute Seite, lokaler Sync
  python3 tools/e2e_vier_fenster.py file:///…/dist/argus-offline.html  # Offline-Datei
  python3 tools/e2e_vier_fenster.py http://localhost:4173/ --sync firebase --transport auto \
      --db "http://localhost:5555?ns=argus-test" [--verzug 5000]     # gegen tools/firebase-testserver, mit künstlichem Verzug
Screenshots landen in --bilder (Standard: ./e2e-bilder).
"""
import argparse
import json
import os
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

FENSTER = [("sl", "sl"), ("zb", "zb"), ("zu", "zb"), ("plenum", "plenum")]
W, H = 1530, 800


def adresse(basis, rolle, a, verzug=True):
    sep = "&" if "?" in basis else "?"
    q = {"rolle": rolle, "raum": a.raum, "sync": a.sync}
    if a.db:
        q["db"] = a.db
    if a.transport:
        q["transport"] = a.transport
    if a.verzug and verzug:
        q["verzug"] = a.verzug
    return f"{basis}{sep}{urllib.parse.urlencode(q)}"


def warte(bedingung, sek=10, text="Bedingung"):
    ende = time.time() + sek
    letzter = None
    while time.time() < ende:
        try:
            if bedingung():
                return
        except Exception as e:  # noqa: BLE001
            letzter = e
        time.sleep(0.1)
    raise AssertionError(f"{text} nicht erfüllt nach {sek} s" + (f" ({letzter})" if letzter else ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("basis")
    ap.add_argument("--sync", default="lokal")
    ap.add_argument("--raum", default=f"e2e-{int(time.time()) % 100000}")
    ap.add_argument("--bilder", default="e2e-bilder")
    ap.add_argument("--db", default=None, help="Firebase-Adresse, z. B. http://localhost:5555?ns=argus-test")
    ap.add_argument("--transport", default=None, help="lp oder auto")
    ap.add_argument("--verzug", type=int, default=0, help="künstlicher Netzverzug je Richtung in ms (H1.6)")
    a = ap.parse_args()
    os.makedirs(a.bilder, exist_ok=True)
    fehler = []
    nachholen = 6 * a.verzug / 1000 + 20

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--allow-file-access-from-files", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
        konsole = []
        seiten = {}
        for name, rolle in FENSTER:
            s = ctx.new_page()
            s.on("console", lambda m, n=name: konsole.append(f"{n}: {m.type}: {m.text}") if m.type in ("error", "warning") else None)
            s.on("pageerror", lambda e, n=name: konsole.append(f"{n}: pageerror: {e}"))
            s.goto(adresse(a.basis, rolle, a))
            seiten[name] = s
            if name == "sl":
                warte(lambda: s.locator(".rahmen[data-host='1']").count() == 1, 20 + nachholen, "SL steuert")
            elif name == "zb":
                # Team-Laptop: erst die Übersicht mit Pfeilen, dann die Folien (H4) – hier übersprungen
                warte(lambda: s.get_by_test_id("tour").count() == 1, 20 + nachholen, "Übersicht am Team-Laptop")
                s.get_by_test_id("tour-ueberspringen").click()
                warte(lambda: s.get_by_test_id("einweisung-zb").count() == 1, 10, "Einweisung am Team-Laptop")
                s.get_by_test_id("einweisung-ueberspringen").click()
                warte(lambda: s.locator(".rahmen[data-rechnet='1']").count() == 1, 10, "Team-Laptop rechnet")
            elif name == "zu":
                warte(lambda: s.get_by_test_id("zuschau-banner").count() == 1, 20 + nachholen, "zweites Fenster sieht zu")
        sl, zb, zu, pl = (seiten[n] for n, _ in FENSTER)

        def attr(s, name):
            return s.locator(".rahmen").first.get_attribute(name)

        def stand(s):
            return (attr(s, "data-lauf"), int(attr(s, "data-seq") or 0), attr(s, "data-fp"))

        def synchron(namen=("sl", "zb", "zu")):
            st = [stand(seiten[n]) for n in namen]
            return all(x == st[0] for x in st) and st[0][1] > 0

        warte(synchron, 20 + nachholen, "Grundstand synchron")
        print("Start:", stand(zb))
        if attr(zu, "data-rechnet") != "0" or attr(sl, "data-rechnet") != "0":
            fehler.append("Nur der Team-Laptop darf das Spiel rechnen")

        # Spielleitung: Uhr auf 00:55, Tempo ×10, Start → M01 (01:00) und M02 kommen
        # mit Verzug wartet der Knopf der Spielleitung, bis der vorige Befehl zurück ist (hin und zurück, Upload)
        frist = 30000 + 10 * a.verzug
        sl.fill("[data-testid=sl-zeit]", "00:55")
        sl.get_by_text("Spielzeit setzen").click(timeout=frist)
        sl.get_by_role("button", name="×10", exact=True).click(timeout=frist)
        sl.get_by_role("button", name="▶ Start").click(timeout=frist)
        warte(lambda: zb.locator(".eingang-zeile[data-meldung]").count() > 0, 30 + nachholen, "Meldung im Eingang")
        erste = zb.get_by_test_id("offene-meldung").get_attribute("data-meldung")
        print("Team-Laptop hat Meldung:", erste)

        # Entscheidung am Team-Laptop: LM wählen, BEKÄMPFEN – sofort im eigenen Stand (ohne Netz)
        zb.locator("label[data-wm=LM]").click()
        vorher = int(attr(zb, "data-seq"))
        zb.get_by_test_id("zb-bekaempfen").click()
        # sofort im eigenen Stand: die Aktion geht nicht über das Netz (auch mit --verzug)
        warte(lambda: int(attr(zb, "data-seq")) > vorher, 5, "Entscheidung im eigenen Stand")
        warte(lambda: zb.locator(f".eingang-zeile.unterwegs[data-unterwegs={erste}]").count() == 1, 5, "Countdown im Eingang")

        # zweites Fenster: kann nicht entscheiden
        gesendet = zu.evaluate("() => window.argus.senden('entscheid', { meldung: 'M02', entscheid: 'ablehnen' })")
        if gesendet is not None:
            fehler.append("zweites Fenster (Zuschauen) konnte senden")

        # Lagemeldung anklicken, zweite Meldung ablehnen, SL-Notiz, anhalten
        warte(lambda: zb.locator(".feed-meldung[data-inject]").count() > 0, 30, "Lagemeldung im Feed")
        zb.locator(".feed-meldung[data-inject]").first.click()
        warte(lambda: zb.locator(".eingang-zeile[data-meldung]").count() > 0, 40 + nachholen, "zweite Meldung im Eingang")
        zb.get_by_test_id("zb-ablehnen").click()
        sl.fill("input[placeholder^='Beobachtung']", "Team bespricht die Lagemeldung")
        sl.keyboard.press("Enter")
        time.sleep(1.5)
        sl.get_by_role("button", name="❚❚ Anhalten").click(timeout=frist)
        warte(lambda: "angehalten" in zb.locator(".uhr-info").first.inner_text(), 10 + nachholen, "Uhr steht am Team-Laptop")

        warte(synchron, 30 + nachholen, "Endstand synchron (Spielleitung und zweites Fenster haben aufgeholt)")
        st = stand(zb)
        print("Ende:", st, "in Spielleitung, Team-Laptop und zweitem Fenster")
        uhren = {n: seiten[n].locator("[data-testid=uhr]").first.inner_text() for n in ("sl", "zb", "zu")}
        if len(set(uhren.values())) != 1:
            fehler.append(f"Uhren unterschiedlich: {uhren}")

        # Jede Aktion im Protokoll, lückenlos; Statusmeldung bei der Spielleitung
        protokoll = sl.evaluate("() => window.argus.stand.protokoll")
        offen = {n: seiten[n].evaluate("() => Object.keys(window.argus.stand.offen)") for n in ("sl", "zb", "zu")}
        if any(offen.values()):
            fehler.append(f"Aktionen ohne Protokolleintrag: {offen}")
        typen = [e["typ"] for e in protokoll]
        for t in ["spiel_neu", "uhr", "meldung", "entscheid", "inject", "inject_quittiert", "notiz"]:
            if t not in typen:
                fehler.append(f"Ereignistyp {t} fehlt im Protokoll")
        for t in ["g1_entscheid", "g2_empfehlung", "g3_entscheid", "fast_track", "lagehinweis"]:
            if t in typen:
                fehler.append(f"alter Ereignistyp {t} im Protokoll")
        seqs = [e["seq"] for e in protokoll]
        if seqs != list(range(1, len(seqs) + 1)):
            fehler.append("Protokoll nicht lückenlos")
        ent = [e for e in protokoll if e["typ"] == "entscheid"]
        if not all("sek_eingang" in e["daten"] for e in ent):
            fehler.append(f"Entscheidung ohne Sekunden ab Eingang: {[e['daten'] for e in ent]}")
        status = sl.evaluate("() => window.argusSitzung.stand.status")
        if not status:
            fehler.append("keine Statusmeldung bei der Spielleitung")
        sl.locator(".reiter button", has_text="Protokoll").click()
        warte(lambda: sl.locator("[data-testid=protokoll] tr").count() == len(protokoll), 5, "Protokollanzeige vollständig")
        print(f"Protokoll: {len(protokoll)} Einträge, Entscheidungen {[(e['daten']['meldung'], e['daten']['entscheid'], e['daten'].get('sek_eingang')) for e in ent]}")

        # Layout: kein Rollbalken auf Seitenebene in 1530 × 800, nichts abgeschnitten in festen Feldern
        for n, _ in FENSTER:
            s = seiten[n]
            groesse = s.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]")
            if groesse[0] > W or groesse[1] > H:
                fehler.append(f"{n}: Seite {groesse[0]}×{groesse[1]} größer als {W}×{H}")
            abgeschnitten = s.evaluate("""() => [...document.querySelectorAll('.panel > .rumpf:not([data-liste]), .zb-meldung, .eingang')]
                .filter((x) => x.scrollHeight > x.clientHeight + 2).map((x) => x.parentElement.querySelector('h2')?.textContent ?? x.className)""")
            if abgeschnitten:
                fehler.append(f"{n}: Inhalt abgeschnitten in {abgeschnitten}")
            s.screenshot(path=os.path.join(a.bilder, f"{n}.png"))
        with open(os.path.join(a.bilder, "protokoll.json"), "w", encoding="utf-8") as f:
            json.dump(protokoll, f, ensure_ascii=False, indent=1)

        relevante = [k for k in konsole if "favicon" not in k and "FIREBASE WARNING" not in k]
        if relevante:
            print("Konsole:", *relevante[:12], sep="\n  ")
            if any("pageerror" in k or ": error:" in k for k in relevante):
                fehler.append("Fehler in der Browserkonsole")
        browser.close()

    if fehler:
        print("FEHLER:", *fehler, sep="\n  ")
        sys.exit(1)
    print("OK – Team-Laptop rechnet, Spielleitung und zweites Fenster synchron, jede Aktion im Protokoll, Layout passt in 1530×800")


if __name__ == "__main__":
    main()
