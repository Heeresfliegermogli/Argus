#!/usr/bin/env python3
"""Ende-zu-Ende-Test: vier Browserfenster (SL, G1, G2, G3) im selben Raum.

Prüft das Fertig-Kriterium von Schritt 4: Die Fenster bleiben synchron (gleiche Laufnummer und
gleicher Fingerabdruck des Spielstands), und jede Aktion steht im Protokoll der Spielleitung.
Außerdem: Jede Ansicht passt ohne Rollbalken in 1530 × 800 Pixel, feste Felder schneiden nichts ab.

Aufruf:
  python3 tools/e2e_vier_fenster.py http://localhost:4173/            # gebaute Seite, lokaler Sync
  python3 tools/e2e_vier_fenster.py file:///…/dist/argus-offline.html  # Offline-Datei
  python3 tools/e2e_vier_fenster.py https://…github.io/argus/ --sync firebase --raum test-e2e
  python3 tools/e2e_vier_fenster.py http://localhost:4173/ --sync firebase --transport auto \
      --db "http://localhost:5555?ns=argus-test"                     # gegen tools/firebase-testserver
Screenshots landen in --bilder (Standard: ./e2e-bilder).
"""
import argparse
import json
import os
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

ROLLEN = ["sl", "g1", "g2", "g3"]
W, H = 1530, 800


def adresse(basis, rolle, a):
    sep = "&" if "?" in basis else "?"
    q = {"rolle": rolle, "raum": a.raum, "sync": a.sync}
    if a.db:
        q["db"] = a.db
    if a.transport:
        q["transport"] = a.transport
    return f"{basis}{sep}{urllib.parse.urlencode(q)}"


def warte(bedingung, sek=10, text="Bedingung"):
    ende = time.time() + sek
    while time.time() < ende:
        if bedingung():
            return
        time.sleep(0.1)
    raise AssertionError(f"{text} nicht erfüllt nach {sek} s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("basis")
    ap.add_argument("--sync", default="lokal")
    ap.add_argument("--raum", default=f"e2e-{int(time.time()) % 100000}")
    ap.add_argument("--bilder", default="e2e-bilder")
    ap.add_argument("--db", default=None, help="Firebase-Adresse, z. B. http://localhost:5555?ns=argus-test")
    ap.add_argument("--transport", default=None, help="lp oder auto")
    a = ap.parse_args()
    os.makedirs(a.bilder, exist_ok=True)
    fehler = []

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--allow-file-access-from-files", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
        konsole = []
        seiten = {}
        for r in ROLLEN:
            s = ctx.new_page()
            s.on("console", lambda m, r=r: konsole.append(f"{r}: {m.type}: {m.text}") if m.type in ("error", "warning") else None)
            s.on("pageerror", lambda e, r=r: konsole.append(f"{r}: pageerror: {e}"))
            s.goto(adresse(a.basis, r, a))
            seiten[r] = s
            if r == "sl":
                warte(lambda: s.locator(".rahmen[data-host='1']").count() == 1, 20, "SL steuert")
            else:
                # Vor Spielbeginn öffnet sich die Einweisung der Rolle (Folien, überspringbar – B5)
                warte(lambda: s.locator(f"[data-testid=einweisung-{r}]").count() == 1, 10, f"Einweisung {r}")
                s.get_by_test_id("einweisung-ueberspringen").click()
        sl, g1, g2, g3 = (seiten[r] for r in ROLLEN)

        def attr(s, name):
            return s.locator(".rahmen").get_attribute(name)

        def stand(s):
            return (attr(s, "data-lauf"), int(attr(s, "data-seq") or 0), attr(s, "data-fp"))

        def synchron():
            st = [stand(seiten[r]) for r in ROLLEN]
            return all(x == st[0] for x in st) and st[0][1] > 0

        warte(synchron, 20, "Grundstand synchron")
        print("Start:", stand(sl))

        # Spielleitung: Uhr auf 00:55, Tempo ×10, Start → M01 (01:00) und M02 (02:30) kommen
        sl.fill("[data-testid=sl-zeit]", "00:55")
        sl.get_by_text("Spielzeit setzen").click()
        sl.get_by_role("button", name="×10").click()
        sl.get_by_role("button", name="▶ Start").click()
        warte(lambda: g1.locator("[data-testid=g1-offen]").inner_text() != "0", 20, "Meldung bei G1")
        print("G1 hat Meldung:", g1.get_by_test_id("offene-meldung").get_attribute("data-meldung"))

        # G1 nimmt die erste Meldung an
        g1.get_by_role("button", name="ANNEHMEN").click()
        warte(lambda: g2.locator("[data-testid=g2-offen]").inner_text() != "0", 20, "Zielmeldung bei G2")

        # G2 wählt LM und empfiehlt BEKÄMPFEN
        g2.locator("label[data-wm=LM]").click()
        g2.get_by_role("button", name="BEKÄMPFEN mit LM").click()
        warte(lambda: g3.locator("[data-testid=g3-offen]").inner_text() != "0", 20, "Empfehlung bei G3")

        # G3: Inject quittieren, Lagehinweis, Freigabe
        warte(lambda: g3.locator("[data-inject]").count() > 0, 20, "Inject bei G3")
        g3.locator("[data-inject]").first.get_by_role("button", name="Gelesen", exact=True).click()
        g3.fill("textarea", "Feldweg Süd: kein Feuer ohne Rückfrage")
        g3.get_by_role("button", name="Senden").click()
        g3.get_by_role("button", name="FREIGABE").click()

        # Zweite Meldung: G1 lehnt ab; G3 schaltet Fast-Track; SL schreibt Notiz; Uhr anhalten
        warte(lambda: g1.locator("[data-testid=g1-offen]").inner_text() != "0", 30, "zweite Meldung bei G1")
        g1.get_by_role("button", name="ABLEHNEN").click()
        g3.get_by_role("button", name="einschalten").click()
        sl.fill("input[placeholder^='Beobachtung']", "G3 bespricht den Lagehinweis")
        sl.keyboard.press("Enter")
        time.sleep(1.5)
        sl.get_by_role("button", name="❚❚ Anhalten").click()
        warte(lambda: "angehalten" in sl.locator(".uhr-info").inner_text(), 10, "Uhr steht")

        warte(synchron, 20, "Endstand synchron")
        st = [stand(seiten[r]) for r in ROLLEN]
        print("Ende:", st[0], "in allen vier Fenstern" if synchron() else st)
        uhren = {r: seiten[r].locator("[data-testid=uhr]").inner_text() for r in ROLLEN}
        if len(set(uhren.values())) != 1:
            fehler.append(f"Uhren unterschiedlich: {uhren}")
        print("Uhr:", uhren)

        # Jede Aktion im Protokoll? Gesendete Aktionen aus den Fenstern holen und mit dem Protokoll abgleichen
        protokoll = sl.evaluate("() => window.argus.stand.protokoll")
        aktionen_im_protokoll = {e.get("aktion") for e in protokoll if e.get("aktion")}
        offen = {r: seiten[r].evaluate("() => Object.keys(window.argus.stand.offen)") for r in ROLLEN}
        if any(offen.values()):
            fehler.append(f"Aktionen ohne Protokolleintrag: {offen}")
        typen = [e["typ"] for e in protokoll]
        erwartet = ["spiel_neu", "uhr", "meldung", "g1_entscheid", "g2_empfehlung", "inject_quittiert",
                    "lagehinweis", "g3_entscheid", "fast_track", "notiz", "inject"]
        for t in erwartet:
            if t not in typen:
                fehler.append(f"Ereignistyp {t} fehlt im Protokoll")
        seqs = [e["seq"] for e in protokoll]
        if seqs != list(range(1, len(seqs) + 1)):
            fehler.append("Protokoll nicht lückenlos")
        sl.locator(".reiter button", has_text="Protokoll").click()
        warte(lambda: sl.locator("[data-testid=protokoll] tr").count() == len(protokoll), 5, "Protokollanzeige vollständig")
        zeilen = sl.locator("[data-testid=protokoll] tr").count()
        if zeilen != len(protokoll):
            fehler.append(f"Protokollanzeige {zeilen} Zeilen, Protokoll {len(protokoll)} Einträge")
        nutzer = [e for e in protokoll if e.get("aktion")]
        print(f"Protokoll: {len(protokoll)} Einträge, davon {len(nutzer)} aus Aktionen ({len(aktionen_im_protokoll)} verschiedene)")

        # Layout: kein Rollbalken auf Seitenebene in 1530 × 800, nichts abgeschnitten in festen Feldern
        for r in ROLLEN:
            s = seiten[r]
            groesse = s.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]")
            if groesse[0] > W or groesse[1] > H:
                fehler.append(f"{r}: Seite {groesse[0]}×{groesse[1]} größer als {W}×{H}")
            abgeschnitten = s.evaluate("""() => [...document.querySelectorAll('.panel > .rumpf:not([data-liste])')]
                .filter((x) => x.scrollHeight > x.clientHeight + 2).map((x) => x.parentElement.querySelector('h2').textContent)""")
            if abgeschnitten:
                fehler.append(f"{r}: Inhalt abgeschnitten in {abgeschnitten}")
            s.screenshot(path=os.path.join(a.bilder, f"{r}.png"))
        with open(os.path.join(a.bilder, "protokoll.json"), "w", encoding="utf-8") as f:
            json.dump(protokoll, f, ensure_ascii=False, indent=1)

        relevante = [k for k in konsole if "favicon" not in k]
        if relevante:
            print("Konsole:", *relevante[:12], sep="\n  ")
            if any("pageerror" in k or ": error:" in k for k in relevante):
                fehler.append("Fehler in der Browserkonsole")
        browser.close()

    if fehler:
        print("FEHLER:", *fehler, sep="\n  ")
        sys.exit(1)
    print("OK – vier Fenster synchron, jede Aktion im Protokoll, Layout passt in 1530×800")


if __name__ == "__main__":
    main()
