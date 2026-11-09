#!/usr/bin/env python3
"""Ende-zu-Ende-Test (seit 2.6): Sitzung mit Code, Lobby, 7 Teams mit je einem Laptop und Spielleitung (8 Fenster, dazu Plenum).

Ablauf nur über die Oberfläche, wie im Hörsaal:
  1. Spielleitung legt auf der Startseite eine Sitzung an und liest den Code ab; das Plenum öffnet die Sitzung.
  2. 7 Team-Laptops („Ich spiele mit“) geben den Code ein und legen je ein Team an (keine Rollenwahl, H2.1). Ein zweites
     Fenster tritt Team 1 bei und sieht nur zu.
  3. Spielleitung: „Spiel öffnen – alle Teams“ (jeder Laptop legt sein Spiel an und lädt es hoch), Spielzeit 00:15 für alle,
     „Uhr starten – alle“.
  4. Jedes Team entscheidet Ziel 1 (M01) anders: BEKÄMPFEN mit LM, mit Mörser, mit Kanone, ZURÜCKSTELLEN, ABLEHNEN – am
     eigenen Laptop, ohne Netz. Die Spielleitung schreibt eine Notiz in Team 2 und schaut Team 3 zu.
  5. Tempo ×10 für alle, kurz laufen lassen, „Anhalten – alle“.
Geprüft wird:
  • je Team gleicher Lauf, gleiche Laufnummer und gleicher Fingerabdruck am Laptop, im zweiten Fenster und bei der
    Spielleitung (hochgeladenes Protokoll), gleiche Uhr; die Läufe der Teams sind verschieden;
  • nur der Laptop rechnet; die Entscheidungen gehen nicht über das Netz (gespeicherte Aktionen nur von der Spielleitung);
    kein Absender taucht im Protokoll eines fremden Teams auf; Statusmeldung jedes Teams bei der Spielleitung;
  • die Spielstände der Teams unterscheiden sich wie gespielt;
  • alle Fenster passen in 1530 × 800 (kein Rollbalken, nichts abgeschnitten), keine Konsolenfehler.
Mit --verzug 5000 läuft jedes Fenster mit künstlichem Netzverzug (H1.6): das Spiel der Teams bleibt sofort, Spielleitung und
zweites Fenster holen auf.

Aufruf (nach `npm run build` und `npx vite preview --port 4173`):
  python3 tools/e2e_teams.py http://localhost:4173/                                  # lokaler Sync
  python3 tools/e2e_teams.py file://$PWD/dist/argus-offline.html                     # Offline-Datei
  node tools/firebase-testserver/start.js &                                          # Firebase-Nachbildung
  python3 tools/e2e_teams.py http://localhost:4173/ --sync firebase --transport auto --db "http://localhost:5555?ns=argus-test" [--verzug 5000]
"""
import argparse
import json
import os
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

W, H = 1530, 800
TEAMNAMEN = ["Falke Nord", "Löwe 2", "Team Ömer & Co", "Wega", "Kassiopeia-Süd-Ost 24 Zch", "Rigel", "Deneb"]
# Entscheidung je Team zu Ziel 1 (M01): (entscheid, wirkmittel)
ENTSCHEIDE = [("bekaempfen", "LM"), ("ablehnen", None), ("bekaempfen", "MRS"), ("zurueckstellen", None), ("bekaempfen", "PZA"),
              ("ablehnen", None), ("zurueckstellen", None)]

LAYOUT_JS = """
() => {
  const de = document.documentElement;
  const zuGross = [];
  for (const r of document.querySelectorAll('.panel > .rumpf:not([data-liste])')) {
    if (r.scrollHeight > r.clientHeight + 2 || r.scrollWidth > r.clientWidth + 2) {
      const t = r.parentElement.querySelector('header h2')?.textContent?.trim() || '?';
      zuGross.push(`${t}: ${r.scrollWidth}×${r.scrollHeight} in ${r.clientWidth}×${r.clientHeight}`);
    }
  }
  for (const el of document.querySelectorAll('.stapel, .inhalt, main, .kopf, .kopf-links, .kopf-rechts')) {
    if (el.scrollHeight > el.clientHeight + 2) zuGross.push(`${el.className}: Höhe ${el.scrollHeight} > ${el.clientHeight}`);
    if (el.scrollWidth > el.clientWidth + 2) zuGross.push(`${el.className}: Breite ${el.scrollWidth} > ${el.clientWidth}`);
  }
  return { seite: [de.scrollWidth, de.scrollHeight], zuGross };
}
"""


def warte(bedingung, sek=15, text="Bedingung"):
    ende = time.time() + sek
    letzter = None
    while time.time() < ende:
        try:
            if bedingung():
                return
        except Exception as e:  # noqa: BLE001 – Seite lädt noch
            letzter = e
        time.sleep(0.1)
    raise AssertionError(f"{text} nicht erfüllt nach {sek} s" + (f" ({letzter})" if letzter else ""))


def startseite(basis, a):
    q = {"sync": a.sync}
    if a.verzug:
        q["verzug"] = a.verzug
    if a.fps:
        q["fps"] = a.fps
    if a.db:
        q["db"] = a.db
    if a.transport:
        q["transport"] = a.transport
    sep = "&" if "?" in basis else "?"
    return f"{basis}{sep}{urllib.parse.urlencode(q)}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("basis")
    ap.add_argument("--sync", default="lokal")
    ap.add_argument("--db", default=None)
    ap.add_argument("--transport", default=None)
    ap.add_argument("--teams", type=int, default=7)
    ap.add_argument("--bilder", default="e2e-teams-bilder")
    ap.add_argument("--renderer", choices=["canvas", "webgl"], default="canvas")
    ap.add_argument("--fps", type=int, default=2, help="höchste Bildrate der Karten (0 = ohne Grenze)")
    ap.add_argument("--verzug", type=int, default=0, help="künstlicher Netzverzug je Richtung in ms (H1.6)")
    a = ap.parse_args()
    os.makedirs(a.bilder, exist_ok=True)
    fehler = []
    konsole = []
    t0 = time.time()
    nach = 30 + 8 * a.verzug / 1000          # Fristen für alles, was über das Netz geht
    frist = int(1000 * nach)

    with sync_playwright() as p:
        grafik = (["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] if a.renderer == "webgl"
                  else ["--disable-gpu", "--disable-software-rasterizer"])
        browser = p.chromium.launch(args=["--allow-file-access-from-files", *grafik,
                                          "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
                                          "--disable-backgrounding-occluded-windows"])
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
        if a.sync == "firebase" and a.transport == "auto":
            # Die Nachbildung (firebase-server) kann nur WebSocket; das SDK soll nicht auf Long-Polling ausweichen.
            ctx.add_init_script("try { localStorage.removeItem('firebase:previous_websocket_failure') } catch (e) {}")

        def seite(name):
            s = ctx.new_page()
            s.on("console", lambda m, n=name: konsole.append(f"{n}: {m.type}: {m.text}") if m.type in ("error", "warning") else None)
            s.on("pageerror", lambda e, n=name: konsole.append(f"{n}: pageerror: {e}"))
            return s

        # 1. Spielleitung legt die Sitzung an, Plenum öffnet sie
        sl = seite("SL")
        sl.goto(startseite(a.basis, a))
        sl.get_by_test_id("zur-spielleitung").click()
        sl.get_by_placeholder("Name, z. B. SL 1").fill("SL 1")
        sl.get_by_test_id("sitzung-anlegen").click()
        warte(lambda: sl.locator(".rahmen[data-host='1'][data-ansicht=uebersicht]").count() == 1, nach, "SL steuert")
        code = sl.get_by_test_id("code").inner_text().strip()
        print(f"Sitzung {code} angelegt ({time.time() - t0:.1f} s)")
        pl = seite("Plenum")
        q = urllib.parse.urlencode({"sitzung": code, "rolle": "plenum"})
        pl.goto(startseite(a.basis, a) + "&" + q)

        def beitreten(s, i):
            s.goto(startseite(a.basis, a))
            s.get_by_test_id("ich-spiele-mit").click()
            # Teilnehmer tippen den Code so, wie er am Smartboard steht – Team 2 klein
            s.get_by_test_id("code-eingabe").fill(code.lower() if i == 1 else code)
            s.get_by_test_id("beitreten").click()
            warte(lambda: s.locator("[data-rolle=lobby]").count() == 1, nach, f"Lobby {i + 1}")

        # 2. Team-Laptops: Code eingeben, Team anlegen
        teams = []
        for i in range(a.teams):
            name = TEAMNAMEN[i % len(TEAMNAMEN)][:24]
            s = seite(f"{name[:8]}")
            beitreten(s, i)
            s.get_by_test_id("lobby-name").fill(f"Lt A-{i + 1}, Lt B-{i + 1}")
            s.get_by_test_id("lobby-teamname").fill(name)
            s.get_by_test_id("team-erstellen").click()
            warte(lambda: s.get_by_test_id("lobby-ich").count() == 1, nach, f"Team {name} angelegt")
            teams.append({"name": name, "laptop": s})
            print(f"Team {name}: Laptop in der Lobby ({time.time() - t0:.1f} s)")
        # zweites Fenster tritt Team 1 bei (sieht nur zu)
        zu = seite("Zuschauer T1")
        beitreten(zu, 0)
        karte = zu.locator(f"section.team-karte[data-teamname='{teams[0]['name']}']")
        warte(lambda: karte.count() == 1, nach, "Team 1 sichtbar")
        karte.locator("[data-beitreten]").click()
        warte(lambda: zu.get_by_test_id("lobby-ich").count() == 1, nach, "zweites Fenster im Team 1")
        if "nur zuschauen" not in zu.get_by_test_id("lobby-ich").inner_text():
            fehler.append("zweites Fenster: Lobby sagt nicht „nur zuschauen“")
        teams[0]["zu"] = zu
        alle_tt = [t["laptop"] for t in teams] + [zu]

        def sl_teams():
            return sl.evaluate("() => window.argusTeams()")

        warte(lambda: len(sl_teams()) == a.teams and all(t["spieler"] and t["spieler"][0]["online"] for t in sl_teams()), nach, "alle Teams mit Laptop")
        ids = {t["name"]: t["id"] for t in sl_teams()}
        for t in teams:
            t["id"] = ids[t["name"]]
        teams[0]["laptop"].screenshot(path=os.path.join(a.bilder, "lobby-team.png"))
        sl.screenshot(path=os.path.join(a.bilder, "sl-uebersicht-lobby.png"))

        # 3. Spiel öffnen, Übersicht und Einweisung schließen, Spielzeit und Start für alle
        sl.get_by_test_id("alle-oeffnen").click()
        for t in teams:
            s = t["laptop"]
            warte(lambda: s.get_by_test_id("tour").count() == 1, nach, f"Übersicht {t['name']}")
            if t is teams[0]:
                s.wait_for_timeout(500)
                s.screenshot(path=os.path.join(a.bilder, "tt-tour.png"))
            s.get_by_test_id("tour-ueberspringen").click()
            warte(lambda: s.get_by_test_id("einweisung-zb").count() == 1, 10, f"Einweisung {t['name']}")
            s.get_by_test_id("einweisung-ueberspringen").click()
        warte(lambda: zu.get_by_test_id("zuschau-banner").count() == 1, nach, "zweites Fenster sieht zu")
        warte(lambda: all(x["seq"] >= 2 for x in sl_teams()), nach, "Spielstände angelegt und hochgeladen")
        laeufe = {x["lauf"] for x in sl_teams()}
        if len(laeufe) != a.teams:
            fehler.append(f"Läufe nicht getrennt: {laeufe}")

        sl.get_by_test_id("alle-zeit").fill("00:15")  # M01 kommt um 00:20, M02 erst um 01:15
        sl.get_by_role("button", name="Spielzeit setzen").click(timeout=frist)
        warte(lambda: all(x["uhr"]["t_s"] >= 15 for x in sl_teams()), nach, "Spielzeit für alle gesetzt")
        sl.get_by_test_id("alle-start").click(timeout=frist)
        warte(lambda: all(t["laptop"].evaluate("() => window.argus.stand.zustand.uhr.laeuft") for t in teams), nach, "alle Uhren laufen (Laptops)")
        # Spielzeit jedes Laptops auf denselben Augenblick (Serverzeit) umgerechnet – die Fenster nacheinander abzufragen dauert
        # unter Last mehrere Sekunden
        roh = [t["laptop"].evaluate("() => ({ t: window.argus.spielzeit(), s: window.argusSitzung.adapter.serverJetzt(), tempo: window.argus.stand.zustand.uhr.tempo })") for t in teams]
        zeiten = [x["t"] - (x["s"] - roh[0]["s"]) / 1000 * x["tempo"] for x in roh]
        print(f"Uhren gestartet, Spanne der Spielzeiten {max(zeiten) - min(zeiten):.2f} s (abgefragt in {(roh[-1]['s'] - roh[0]['s']) / 1000:.1f} s)")
        if max(zeiten) - min(zeiten) > 2:
            fehler.append(f"Start für alle nicht gleichzeitig: Spielzeiten {min(zeiten):.1f}–{max(zeiten):.1f} s (H1.4: ≤ 1–2 s)")

        # 4. Jedes Team entscheidet M01 anders – am eigenen Laptop
        for i, t in enumerate(teams):
            s = t["laptop"]
            was, wm = ENTSCHEIDE[i % len(ENTSCHEIDE)]
            warte(lambda: s.get_by_test_id("offene-meldung").get_attribute("data-meldung") == "M01", 30, f"{t['name']}: Ziel 1 offen")
            vorher = s.evaluate("() => window.argus.stand.zustand.seq")
            if was == "bekaempfen":
                s.locator(f"label[data-wm={wm}]").click()
                s.get_by_test_id("zb-bekaempfen").click()
            else:
                s.get_by_test_id(f"zb-{was}").click()
            warte(lambda: s.evaluate("() => window.argus.stand.zustand.seq") > vorher, 3, f"{t['name']}: sofort im eigenen Stand")
        print(f"M01 in allen Teams entschieden ({time.time() - t0:.1f} s)")

        # Spielleitung: Notiz in Team 2 (über die Teamansicht), Zuschauen bei Team 3
        sl.locator(f"[data-ansehen='{teams[1]['name']}']").click(timeout=frist)
        warte(lambda: sl.get_by_test_id("sl-leiste").count() == 1, 10, "Teamansicht der SL")
        sl.locator("input[placeholder^='Beobachtung']").fill("Team 2 diskutiert die Lagemeldung")
        sl.keyboard.press("Enter")
        sl.screenshot(path=os.path.join(a.bilder, "sl-team-steuerung.png"))
        sl.get_by_test_id("sl-teamwahl").select_option(teams[2]["id"])
        sl.locator("[data-sl-rolle=zb]").click()
        warte(lambda: sl.locator(".rahmen[data-rolle=zb]").count() == 1, 10, "Zuschauen Zielbearbeitung")
        if sl.get_by_test_id("zb-ablehnen").count() and sl.get_by_test_id("zb-ablehnen").first.is_enabled():
            if sl.evaluate("() => window.argus.senden('notiz', { text: 'x' })") is not None:
                fehler.append("Zuschauen: Spielleitung kann in der Teamansicht senden")
        sl.screenshot(path=os.path.join(a.bilder, "sl-zuschauen-zb.png"))
        sl.get_by_test_id("zur-uebersicht").click()
        warte(lambda: sl.get_by_test_id("uebersicht").count() == 1, 10, "zurück zur Übersicht")

        # 5. Tempo ×10, kurz laufen lassen, Anhalten – alle
        sl.get_by_role("button", name="×10", exact=True).click(timeout=frist)
        warte(lambda: all(t["laptop"].evaluate("() => window.argus.stand.zustand.uhr.tempo") == 10 for t in teams), nach, "Tempo ×10 überall")
        time.sleep(6)
        sl.screenshot(path=os.path.join(a.bilder, "sl-uebersicht-spiel.png"))
        sl.get_by_test_id("alle-halt").click(timeout=frist)
        warte(lambda: not any(t["laptop"].evaluate("() => window.argus.stand.zustand.uhr.laeuft") for t in teams), nach, "alle Uhren stehen")

        # ---------------------------------------------------------------- Prüfungen
        def tt_stand(s):
            r = s.locator(".rahmen").first
            return (r.get_attribute("data-team"), r.get_attribute("data-lauf"), int(r.get_attribute("data-seq") or 0), r.get_attribute("data-fp"))

        def team_synchron(t):
            x = next(y for y in sl_teams() if y["id"] == t["id"])
            soll = tt_stand(t["laptop"])
            fenster = [t["laptop"]] + ([t["zu"]] if "zu" in t else [])
            return soll[0] == t["id"] and (x["lauf"], x["seq"], x["fp"]) == soll[1:] and all(tt_stand(s) == soll for s in fenster)

        for t in teams:
            try:
                warte(lambda: team_synchron(t), nach, f"{t['name']} synchron")
            except AssertionError as e:
                fehler.append(str(e) + f": SL {[(y['seq'], y['fp']) for y in sl_teams() if y['id'] == t['id']]}, Laptop {tt_stand(t['laptop'])}")
        endstand = sl_teams()
        for t in teams:
            if t["laptop"].locator(".rahmen[data-rechnet='1']").count() != 1:
                fehler.append(f"{t['name']}: Laptop rechnet nicht")
        if zu.locator(".rahmen[data-rechnet='1']").count():
            fehler.append("zweites Fenster rechnet")
        for x in endstand:
            print(f"  {x['name']:<26} Lauf {x['lauf']}  seq {x['seq']:>3}  fp {x['fp']}  SL rechnet {'JA' if x['host'] else 'nein'}")
            if x["host"]:
                fehler.append(f"{x['name']}: die Spielleitung rechnet das Spiel")
        if len({x["fp"] for x in endstand}) != a.teams:
            fehler.append("Spielstände der Teams nicht verschieden")
        status = sl.evaluate("() => window.argusSitzung.stand.status")
        for t in teams:
            st = status.get(t["id"])
            if not st or st["lauf"] != next(y["lauf"] for y in endstand if y["id"] == t["id"]):
                fehler.append(f"{t['name']}: keine Statusmeldung bei der Spielleitung")

        # Uhren je Team gleich (Laptop, zweites Fenster)
        uhren = {s.get_by_test_id("uhr").first.inner_text() for s in [teams[0]["laptop"], zu]}
        if len(uhren) != 1:
            fehler.append(f"{teams[0]['name']}: Uhren unterschiedlich {uhren}")

        # Protokolle: nur Laptop und Spielleitung schreiben, Entscheidungen nicht im Netz
        clients = {t["laptop"].evaluate("() => window.argusSitzung.client"): t["id"] for t in teams}
        sl_client = sl.evaluate("() => window.argusSitzung.client")
        for x in endstand:
            # mit künstlichem Verzug kommt auch der erste Stand eines Abos erst nach dem Verzug
            gespeichert = set(sl.evaluate("([t, ms]) => window.argusGespeichert(t, ms)", [x["id"], 2000 + 2 * a.verzug]))
            im_protokoll = {e["aktion"] for e in x["protokoll"] if e["aktion"]}
            von_sl = {e["aktion"] for e in x["protokoll"] if e["aktion"] and e["rolle"] == "sl"}
            if von_sl - gespeichert:
                fehler.append(f"{x['name']}: Aktionen der Spielleitung nicht gespeichert")
            if gespeichert - im_protokoll:
                fehler.append(f"{x['name']}: {len(gespeichert - im_protokoll)} gespeicherte Aktionen nicht im Protokoll")
            ent = [e for e in x["protokoll"] if e["typ"] == "entscheid"]
            if not ent:
                fehler.append(f"{x['name']}: keine Entscheidung im Protokoll")
            if any(e["aktion"] in gespeichert for e in ent):
                fehler.append(f"{x['name']}: Entscheidung ging über das Netz")
            fremd = [e for e in x["protokoll"] if e["client"] and e["client"] != sl_client and clients.get(e["client"]) != x["id"]]
            if fremd:
                fehler.append(f"{x['name']}: {len(fremd)} Einträge von Fenstern anderer Teams")
            seqs = [e["seq"] for e in x["protokoll"]]
            if seqs != list(range(1, len(seqs) + 1)):
                fehler.append(f"{x['name']}: Protokoll nicht lückenlos")
            print(f"  {x['name']:<26} {len(gespeichert):>2} Aktionen der SL gespeichert, {len(ent)} Entscheidungen lokal")
        # Gespielt wie vorgesehen
        for i, t in enumerate(teams):
            z = sl.evaluate("(id) => { const sp = window.argusSitzung.spiel(id); const z = sp.stand.zustand; return { m01: z.meldungen.M01, bestand: z.bestand, notizen: sp.stand.protokoll.filter(e => e.typ === 'notiz').length } }", t["id"])
            was, wm = ENTSCHEIDE[i % len(ENTSCHEIDE)]
            m = z["m01"]
            ok = (was == "bekaempfen" and m.get("freigabe", {}).get("wirkmittel") == wm) or (was == "ablehnen" and m.get("ergebnis") == "abgelehnt") \
                or (was == "zurueckstellen" and m.get("zurueckgestellt"))
            if not ok:
                fehler.append(f"{t['name']}: M01 {m.get('stufe')} {m.get('ergebnis')} – erwartet {was} {wm or ''}")
            if i == 1 and z["notizen"] != 1:
                fehler.append(f"{t['name']}: Notiz der SL fehlt")
            if i != 1 and z["notizen"]:
                fehler.append(f"{t['name']}: fremde Notiz im Protokoll")
            print(f"  {t['name']:<26} M01: {m.get('stufe')} {m.get('ergebnis') or ''}{' zurückgestellt' if m.get('zurueckgestellt') else ''}, LM {z['bestand'].get('LM')}, MRS {z['bestand'].get('MRS')}")

        # Layout aller Fenster
        for n, s in [("SL", sl), ("Plenum", pl)] + [(t["name"], t["laptop"]) for t in teams] + [("Zuschauer", zu)]:
            l = s.evaluate(LAYOUT_JS)
            if l["seite"][0] > W or l["seite"][1] > H:
                fehler.append(f"{n}: Seite {l['seite']} größer als {W}×{H}")
            if l["zuGross"]:
                fehler.append(f"{n}: {l['zuGross'][:3]}")
        teams[0]["laptop"].screenshot(path=os.path.join(a.bilder, "tt-laptop.png"))
        zu.screenshot(path=os.path.join(a.bilder, "tt-zuschauer.png"))
        pl.screenshot(path=os.path.join(a.bilder, "plenum.png"))

        with open(os.path.join(a.bilder, "endstand.json"), "w", encoding="utf-8") as f:
            json.dump(endstand, f, ensure_ascii=False, indent=1)
        print(f"Laufzeit {time.time() - t0:.0f} s")
        relevante = [k for k in konsole if "favicon" not in k and "FIREBASE WARNING" not in k]
        if relevante:
            print("Konsole:", *relevante[:15], sep="\n  ")
            if any("pageerror" in k or ": error:" in k for k in relevante):
                fehler.append("Fehler in der Browserkonsole")
        browser.close()

    if fehler:
        print("FEHLER:", *fehler, sep="\n  ")
        sys.exit(1)
    print(f"OK – {a.teams} Team-Laptops + Spielleitung + Plenum: jedes Team rechnet selbst, getrennte Spielstände, Spielleitung synchron, alles in 1530×800")


if __name__ == "__main__":
    main()
