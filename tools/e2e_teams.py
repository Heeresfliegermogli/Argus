#!/usr/bin/env python3
"""Ende-zu-Ende-Test Schritt 4b: Sitzung mit Code, Lobby, 5 Teams à 3 und Spielleitung (16 Fenster).

Ablauf nur über die Oberfläche, wie im Hörsaal:
  1. Spielleitung legt auf der Startseite eine Sitzung an und liest den Code ab.
  2. 15 Teilnehmer-Fenster geben den Code ein, je ein Fenster erstellt ein Team mit eigenem Namen
     (G1), die anderen beiden treten ihm als G2 und G3 bei.
  3. Spielleitung: „Spiel öffnen – alle Teams“, Spielzeit 00:15 für alle, „Uhr starten – alle“.
  4. Jedes Team bearbeitet M01 anders (annehmen/ablehnen, LM/Mörser, Freigabe/Ablehnung, Fast-Track,
     Lagehinweis). Die Spielleitung schreibt eine Notiz in Team 2 und schaut G1 von Team 3 zu.
  5. Tempo ×10 für alle, kurz laufen lassen, „Anhalten – alle“.
Geprüft wird:
  • je Team gleicher Lauf, gleiche Laufnummer und gleicher Fingerabdruck in allen vier Fenstern
    (drei Teilnehmer und Spielleitung), gleiche Uhr; die Läufe der Teams sind verschieden;
  • jede gespeicherte Aktion eines Teams steht im Protokoll DIESES Teams, kein Fenster hat
    unbestätigte Aktionen, kein Absender taucht im Protokoll eines fremden Teams auf;
  • die Spielstände der Teams unterscheiden sich wie gespielt;
  • alle 16 Fenster passen in 1530 × 800 (kein Rollbalken, nichts abgeschnitten), keine Konsolenfehler.

Aufruf (nach `npm run build` und `npx vite preview --port 4173`):
  python3 tools/e2e_teams.py http://localhost:4173/                                  # lokaler Sync
  python3 tools/e2e_teams.py file://$PWD/dist/argus-offline.html                     # Offline-Datei
  node tools/firebase-testserver/start.js &                                          # Firebase-Nachbildung
  python3 tools/e2e_teams.py http://localhost:4173/ --sync firebase --transport auto --db "http://localhost:5555?ns=argus-test"
"""
import argparse
import json
import os
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

W, H = 1530, 800
TEAMNAMEN = ["Falke Nord", "Löwe 2", "Team Ömer & Co", "Wega", "Kassiopeia-Süd-Ost 24 Zch"]
ROLLEN = ["g1", "g2", "g3"]

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
    ap.add_argument("--teams", type=int, default=5)
    ap.add_argument("--bilder", default="e2e-teams-bilder")
    a = ap.parse_args()
    os.makedirs(a.bilder, exist_ok=True)
    fehler = []
    konsole = []
    t0 = time.time()

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--allow-file-access-from-files", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
                                          "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
                                          "--disable-backgrounding-occluded-windows"])
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
        if a.sync == "firebase" and a.transport == "auto":
            # Die Nachbildung (firebase-server) kann nur WebSocket. Das SDK merkt sich eine kurze
            # WebSocket-Verbindung (Prüfung des Codes auf der Startseite) als Fehlschlag und beginnt die
            # nächste Seite mit Long-Polling – das echte Firebase kann beides, die Nachbildung nicht.
            ctx.add_init_script("try { localStorage.removeItem('firebase:previous_websocket_failure') } catch (e) {}")

        def seite(name):
            s = ctx.new_page()
            s.on("console", lambda m, n=name: konsole.append(f"{n}: {m.type}: {m.text}") if m.type in ("error", "warning") else None)
            s.on("pageerror", lambda e, n=name: konsole.append(f"{n}: pageerror: {e}"))
            return s

        # 1. Spielleitung legt die Sitzung an
        sl = seite("SL")
        sl.goto(startseite(a.basis, a))
        sl.get_by_placeholder("Name, z. B. SL 1").fill("SL 1")
        sl.get_by_role("button", name="Neue Sitzung anlegen").click()
        warte(lambda: sl.locator(".rahmen[data-host='1'][data-ansicht=uebersicht]").count() == 1, 30, "SL steuert")
        code = sl.get_by_test_id("code").inner_text().strip()
        print(f"Sitzung {code} angelegt ({time.time() - t0:.1f} s)")

        # 2. Teilnehmer: Code eingeben, Team erstellen bzw. beitreten
        teams = []
        for i in range(a.teams):
            name = TEAMNAMEN[i % len(TEAMNAMEN)][:24]
            fenster = []
            for r in ROLLEN:
                s = seite(f"{name[:8]}/{r}")
                s.goto(startseite(a.basis, a))
                # Teilnehmer tippen den Code so, wie er am Smartboard steht – Team 2 nur die zwei Zeichen hinten
                s.get_by_label("Code der Sitzung").fill(code.split("-")[1].lower() if i == 1 else code)
                s.get_by_role("button", name="Beitreten").click()
                warte(lambda: s.locator("[data-rolle=lobby]").count() == 1, 20, f"Lobby {name}/{r}")
                s.get_by_placeholder("z. B. Lt Müller (freiwillig)").fill(f"Lt {r.upper()}-{i + 1}")
                if r == "g1":
                    s.get_by_placeholder("Teamname").fill(name)
                    s.get_by_role("button", name="G1 Aufklärung").click()
                    warte(lambda: s.get_by_test_id("lobby-ich").count() == 1, 15, f"Team {name} erstellt")
                else:
                    karte = s.locator(f"section.team-karte[data-teamname='{name}']")
                    warte(lambda: karte.count() == 1, 20, f"Team {name} sichtbar")
                    slot = karte.locator(f"[data-slot='{name}:{r}']")
                    slot.get_by_role("button", name="beitreten").click()
                    warte(lambda: s.get_by_test_id("lobby-ich").count() == 1, 15, f"{name}/{r} beigetreten")
                fenster.append(s)
            teams.append({"name": name, "fenster": fenster})
            print(f"Team {name}: 3 Fenster in der Lobby ({time.time() - t0:.1f} s)")
        alle_tt = [s for t in teams for s in t["fenster"]]
        print(f"{len(alle_tt)} Teilnehmer-Fenster + Spielleitung")

        def sl_teams():
            return sl.evaluate("() => window.argusTeams()")

        warte(lambda: len(sl_teams()) == a.teams and all(len(t["spieler"]) == 3 and all(x["online"] for x in t["spieler"]) for t in sl_teams()),
              30, "alle Teams voll und verbunden")
        ids = {t["name"]: t["id"] for t in sl_teams()}
        for t in teams:
            t["id"] = ids[t["name"]]
        teams[0]["fenster"][0].screenshot(path=os.path.join(a.bilder, "lobby-team-voll.png"))
        sl.screenshot(path=os.path.join(a.bilder, "sl-uebersicht-lobby.png"))

        # 3. Spiel öffnen, Einweisung schließen, Spielzeit und Start für alle
        sl.get_by_test_id("alle-oeffnen").click()
        for t in teams:
            for r, s in zip(ROLLEN, t["fenster"]):
                warte(lambda: s.locator(f"[data-testid=einweisung-{r}]").count() == 1, 30, f"Einweisung {t['name']}/{r}")
        teams[0]["fenster"][1].screenshot(path=os.path.join(a.bilder, "tt-g2-einweisung.png"))
        for s in alle_tt:
            s.get_by_role("button", name="Verstanden – zur Ansicht").click()
        warte(lambda: all(x["seq"] >= 2 for x in sl_teams()), 20, "Spielstände angelegt")
        laeufe = {x["lauf"] for x in sl_teams()}
        if len(laeufe) != a.teams:
            fehler.append(f"Läufe nicht getrennt: {laeufe}")

        sl.get_by_test_id("alle-zeit").fill("00:15")  # M01 kommt um 00:20, M02 erst um 01:15
        sl.get_by_role("button", name="Spielzeit setzen").click()
        warte(lambda: all(x["uhr"]["t_s"] >= 15 for x in sl_teams()), 20, "Spielzeit für alle gesetzt")
        sl.get_by_role("button", name="▶ Uhr starten – alle").click()
        warte(lambda: all(x["laeuft"] for x in sl_teams()), 20, "alle Uhren laufen")
        starts = [x["uhr"]["ts"] for x in sl_teams()]
        print(f"Uhren gestartet, Abstand der Startzeiten {max(starts) - min(starts)} ms")
        if max(starts) - min(starts) > 3000:
            fehler.append(f"Start für alle nicht gleichzeitig: {max(starts) - min(starts)} ms")

        # 4. Jedes Team bearbeitet M01 anders
        for i, t in enumerate(teams):
            g1, g2, g3 = t["fenster"]
            warte(lambda: g1.get_by_test_id("g1-offen").inner_text() != "0", 30, f"{t['name']}: M01 bei G1")
            if i % 2 == 0:
                g1.get_by_placeholder("Vermerk an G2").fill(f"fährt, heiß – Team {i + 1}")
                g1.get_by_role("button", name="ANNEHMEN").click()
                warte(lambda: g2.get_by_test_id("g2-offen").inner_text() != "0", 20, f"{t['name']}: Zielmeldung bei G2")
                wm = "LM" if i == 0 else "MRS"
                g2.locator(f"label[data-wm={wm}]").click()
                g2.get_by_role("button", name=f"BEKÄMPFEN mit {wm}").click()
                warte(lambda: g3.get_by_test_id("g3-offen").inner_text() != "0", 20, f"{t['name']}: Empfehlung bei G3")
                g3.get_by_role("button", name="ABLEHNEN" if i == 4 else "FREIGABE").click()
            else:
                g1.get_by_role("button", name="ABLEHNEN").click()
                g3.get_by_role("button", name="einschalten").click()
            g3.locator("textarea").fill(f"Hinweis von Team {i + 1}")
            g3.get_by_role("button", name="Senden").click()
        print(f"M01 in allen Teams bearbeitet ({time.time() - t0:.1f} s)")

        # Spielleitung: Notiz in Team 2 (über die Teamansicht), Zuschauen bei G1 von Team 3
        sl.locator(f"[data-ansehen='{teams[1]['name']}']").click()
        warte(lambda: sl.get_by_test_id("sl-leiste").count() == 1, 10, "Teamansicht der SL")
        sl.get_by_placeholder("Beobachtung, z. B. „G3 diskutiert I-04“").fill("Team 2 diskutiert den Lagehinweis")
        sl.keyboard.press("Enter")
        sl.screenshot(path=os.path.join(a.bilder, "sl-team-steuerung.png"))
        sl.get_by_test_id("sl-teamwahl").select_option(teams[2]["id"])
        sl.locator("[data-sl-rolle=g1]").click()
        warte(lambda: sl.get_by_test_id("nur-lesen").count() == 1, 10, "Zuschauen G1")
        if sl.get_by_role("button", name="ANNEHMEN").count() and sl.get_by_role("button", name="ANNEHMEN").first.is_enabled():
            fehler.append("Zuschauen: ANNEHMEN ist bedienbar")
        sl.screenshot(path=os.path.join(a.bilder, "sl-zuschauen-g1.png"))
        for r in ["g2", "g3"]:
            sl.locator(f"[data-sl-rolle={r}]").click()
            warte(lambda: sl.locator(f".rahmen[data-rolle={r}]").count() == 1, 10, f"Zuschauen {r}")
        sl.get_by_test_id("zur-uebersicht").click()
        warte(lambda: sl.get_by_test_id("uebersicht").count() == 1, 10, "zurück zur Übersicht")

        # 5. Tempo ×10, kurz laufen lassen, Anhalten – alle
        sl.get_by_role("button", name="×10", exact=True).click()
        warte(lambda: all(x["uhr"]["tempo"] == 10 for x in sl_teams()), 20, "Tempo ×10 überall")
        time.sleep(6)
        sl.screenshot(path=os.path.join(a.bilder, "sl-uebersicht-spiel.png"))
        sl.get_by_role("button", name="❚❚ Anhalten – alle").click()
        warte(lambda: not any(x["laeuft"] for x in sl_teams()), 20, "alle Uhren stehen")

        # ---------------------------------------------------------------- Prüfungen
        def tt_stand(s):
            r = s.locator(".rahmen")
            return (r.get_attribute("data-team"), r.get_attribute("data-lauf"), int(r.get_attribute("data-seq") or 0), r.get_attribute("data-fp"))

        def team_synchron(t):
            x = next(y for y in sl_teams() if y["id"] == t["id"])
            soll = (t["id"], x["lauf"], x["seq"], x["fp"])
            return all(tt_stand(s) == soll for s in t["fenster"])

        for t in teams:
            try:
                warte(lambda: team_synchron(t), 20, f"{t['name']} synchron")
            except AssertionError as e:
                fehler.append(str(e) + f": SL {[(y['seq'], y['fp']) for y in sl_teams() if y['id'] == t['id']]}, TT {[tt_stand(s) for s in t['fenster']]}")
        endstand = sl_teams()
        for x in endstand:
            print(f"  {x['name']:<26} Lauf {x['lauf']}  seq {x['seq']:>3}  fp {x['fp']}  Host {'ja' if x['host'] else 'NEIN'}")
            if not x["host"]:
                fehler.append(f"{x['name']}: kein Host im SL-Fenster")
        if len({x["fp"] for x in endstand}) != a.teams:
            fehler.append("Spielstände der Teams nicht verschieden")

        # Uhren je Team gleich (Anzeige in allen vier Fenstern)
        for t in teams:
            uhren = {s.get_by_test_id("uhr").inner_text() for s in t["fenster"]}
            if len(uhren) != 1:
                fehler.append(f"{t['name']}: Uhren unterschiedlich {uhren}")

        # Jede Aktion im Protokoll ihres Teams
        clients = {}
        for t in teams:
            for s in t["fenster"]:
                clients[s.evaluate("() => window.argusSitzung.client")] = t["id"]
        sl_client = sl.evaluate("() => window.argusSitzung.client")
        gesamt_aktionen = 0
        for x in endstand:
            gespeichert = set(sl.evaluate("(t) => window.argusGespeichert(t)", x["id"]))
            im_protokoll = {e["aktion"] for e in x["protokoll"] if e["aktion"]}
            fehlt = gespeichert - im_protokoll
            gesamt_aktionen += len(gespeichert)
            if fehlt:
                fehler.append(f"{x['name']}: {len(fehlt)} Aktionen nicht im Protokoll")
            if im_protokoll - gespeichert:
                fehler.append(f"{x['name']}: Protokoll nennt Aktionen, die nicht gespeichert sind")
            fremd = [e for e in x["protokoll"] if e["client"] and e["client"] != sl_client and clients.get(e["client"]) != x["id"]]
            if fremd:
                fehler.append(f"{x['name']}: {len(fremd)} Einträge von Fenstern anderer Teams")
            seqs = [e["seq"] for e in x["protokoll"]]
            if seqs != list(range(1, len(seqs) + 1)):
                fehler.append(f"{x['name']}: Protokoll nicht lückenlos")
            typen = [e["typ"] for e in x["protokoll"]]
            for typ in ["spiel_neu", "uhr", "meldung", "g1_entscheid", "lagehinweis"]:
                if typ not in typen:
                    fehler.append(f"{x['name']}: {typ} fehlt im Protokoll")
            print(f"  {x['name']:<26} {len(gespeichert):>2} Aktionen gespeichert, alle im Protokoll: {'ja' if not fehlt else 'NEIN'}")
        for s in [sl] + alle_tt:
            offen = s.evaluate("() => window.argusTeams().flatMap((t) => t.offen)")
            if offen:
                fehler.append(f"unbestätigte Aktionen in einem Fenster: {offen}")
        # Gespielt wie vorgesehen
        nach_name = {x["name"]: x for x in endstand}
        for i, t in enumerate(teams):
            z = sl.evaluate("(id) => { const z = window.argusSitzung.spiel(id).stand.zustand; return { ft: z.fastTrack, m01: z.meldungen.M01, bestand: z.bestand, notizen: window.argusSitzung.spiel(id).stand.protokoll.filter(e => e.typ === 'notiz').length } }", t["id"])
            erwartet_ft = i % 2 == 1
            if z["ft"] != erwartet_ft:
                fehler.append(f"{t['name']}: Fast-Track {z['ft']}, erwartet {erwartet_ft}")
            if i == 1 and z["notizen"] != 1:
                fehler.append(f"{t['name']}: Notiz der SL fehlt")
            if i != 1 and z["notizen"]:
                fehler.append(f"{t['name']}: fremde Notiz im Protokoll")
            ergebnis = z["m01"].get("ergebnis") or z["m01"].get("stufe")
            print(f"  {t['name']:<26} M01: {ergebnis}, Fast-Track {'EIN' if z['ft'] else 'aus'}, LM {z['bestand'].get('LM')}, MRS {z['bestand'].get('MRS')}")
        _ = nach_name

        # Layout aller 16 Fenster
        for n, s in [("SL", sl)] + [(f"{t['name']}/{r}", f) for t in teams for r, f in zip(ROLLEN, t["fenster"])]:
            l = s.evaluate(LAYOUT_JS)
            if l["seite"][0] > W or l["seite"][1] > H:
                fehler.append(f"{n}: Seite {l['seite']} größer als {W}×{H}")
            if l["zuGross"]:
                fehler.append(f"{n}: {l['zuGross'][:3]}")
        for i, r in enumerate(ROLLEN):
            teams[0]["fenster"][i].screenshot(path=os.path.join(a.bilder, f"tt-{r}.png"))

        with open(os.path.join(a.bilder, "endstand.json"), "w", encoding="utf-8") as f:
            json.dump(endstand, f, ensure_ascii=False, indent=1)
        print(f"Aktionen insgesamt: {gesamt_aktionen}, Laufzeit {time.time() - t0:.0f} s")
        relevante = [k for k in konsole if "favicon" not in k and "FIREBASE WARNING" not in k]
        if relevante:
            print("Konsole:", *relevante[:15], sep="\n  ")
            if any("pageerror" in k or ": error:" in k for k in relevante):
                fehler.append("Fehler in der Browserkonsole")
        browser.close()

    if fehler:
        print("FEHLER:", *fehler, sep="\n  ")
        sys.exit(1)
    print(f"OK – {a.teams} Teams à 3 + Spielleitung synchron in getrennten Spielständen, jede Aktion im Protokoll ihres Teams, alles in 1530×800")


if __name__ == "__main__":
    main()
