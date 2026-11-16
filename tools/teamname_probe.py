#!/usr/bin/env python3
"""Probe Liste Q (16.11.2026): keine Personennamen mehr, nur noch der Teamname – und das Team kann sich umbenennen.

Alles über die Oberfläche, wie eine Testperson es täte (Spielleitung, Plenum, zwei Team-Laptops, ein zuschauendes Fenster):
  Q1  Startseite: Feld der Spielleitung heißt „Kennung, z. B. SL 1“ mit Hilfetext. Lobby: kein Kasten und kein Feld für
      Personennamen; die Chips heißen „Laptop XXXX (du) ★“, das zuschauende Fenster sagt „Das Spiel des Teams läuft an Laptop XXXX“.
      Übersicht, Fensterliste und Anwesenheit der Spielleitung: nur Gerätenamen.
  Q2  Lobby, Kasten „Ihr seid im Team“: „✎ umbenennen“ öffnet das Feld mit dem jetzigen Namen und 🎲; doppelter Name (andere
      Schreibweise) und leerer Name werden abgelehnt (Hinweis, Feld bleibt offen, der Name bleibt); „Wolf“ + Übernehmen wirkt sofort bei
      Spielleitung (mit Hinweis „Team Orion heißt jetzt Wolf.“), Plenum und im zuschauenden Fenster. Nach „Spiel öffnen“ im Kopf des
      Team-Fensters (Klick aufs Teamzeichen) bis zum Start; nach „Start für alle“ gesperrt mit Tooltip – die Spielleitung benennt in
      der Übersicht weiter um (auch dort: doppelter Name abgelehnt). Lauf und Protokoll laufen unverändert weiter.
  Mit --sync firebase gegen tools/firebase-testserver (Regeln aus firebase/database.rules.json, Stand L): kein Regelfehler in
  keinem Fenster – Spieler-Eintrag mit Gerätenamen und Umbenennen aus dem Team-Fenster werden angenommen (Q2.5).
Dazu Fotos (docs/bilder/liste-q) und das Layout (kein Rollbalken, nichts abgeschnitten) der Lobby und des Kopfs mit offenem Feld.

Aufruf (nach `npm run build` und `npx vite preview --port 4173`):
  python3 tools/teamname_probe.py http://localhost:4173/ --bilder q-bilder
  node tools/firebase-testserver/start.js 5555 &
  python3 tools/teamname_probe.py http://localhost:4173/ --sync firebase --transport auto --db "http://localhost:5555?ns=argus-test"
"""
import argparse
import os
import re
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pruefgroessen import STANDARD, pruefe_layout  # noqa: E402

W, H = STANDARD
GESPERRT = "Teamname nach dem Start nur über die Spielleitung"
PERSON = re.compile(r"\b(Lt|OLt|Hptm|Fw|OFw|StFw|Maj)\b\.?\s")   # Dienstgrad vor einem Namen


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
    q = {"sync": a.sync, "fps": 2}
    if a.db:
        q["db"] = a.db
    if a.transport:
        q["transport"] = a.transport
    return f"{basis}{'&' if '?' in basis else '?'}{urllib.parse.urlencode(q)}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("basis")
    ap.add_argument("--sync", default="lokal")
    ap.add_argument("--db", default=None)
    ap.add_argument("--transport", default=None)
    ap.add_argument("--bilder", default="q-bilder")
    a = ap.parse_args()
    os.makedirs(a.bilder, exist_ok=True)
    nach = 30
    punkte = []
    konsole = []

    def pruefe(name, ok, info=""):
        punkte.append((name, bool(ok), info))
        print(f"{'ok  ' if ok else 'FEHLER'} {name}{f' – {info}' if info and not ok else ''}")

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-gpu", "--disable-software-rasterizer", "--disable-background-timer-throttling",
                                          "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"])
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
        if a.sync == "firebase" and a.transport == "auto":
            ctx.add_init_script("try { localStorage.removeItem('firebase:previous_websocket_failure') } catch (e) {}")

        def seite(name):
            s = ctx.new_page()
            s.on("console", lambda m, n=name: konsole.append(f"{n}: {m.text}") if m.type == "error" else None)
            s.on("pageerror", lambda e, n=name: konsole.append(f"{n}: pageerror: {e}"))
            return s

        bild = lambda s, n: s.screenshot(path=os.path.join(a.bilder, f"{n}.png"))  # noqa: E731
        hinweis_da = lambda s, text: s.locator(".hinweise").get_by_text(text, exact=False).count() > 0  # noqa: E731

        # ---------------------------------------------------------------- Startseite: Kennung der Spielleitung (Q1.4)
        sl = seite("SL")
        sl.goto(startseite(a.basis, a))
        sl.get_by_test_id("zur-spielleitung").click()
        feld = sl.get_by_placeholder("Kennung, z. B. SL 1")
        pruefe("Q1.4 Startseite: Feld „Kennung, z. B. SL 1“ mit Hilfetext", feld.count() == 1 and "Kein Name, kein Dienstgrad" in sl.get_by_test_id("sl-name-hilfe").inner_text())
        feld.fill("SL 1")
        bild(sl, "q1_start_spielleitung")
        sl.get_by_test_id("sitzung-anlegen").click()
        warte(lambda: sl.locator(".rahmen[data-host='1'][data-ansicht=uebersicht]").count() == 1, nach, "SL steuert")
        code = sl.get_by_test_id("code").inner_text().strip()
        pl = seite("Plenum")
        pl.goto(startseite(a.basis, a) + "&" + urllib.parse.urlencode({"sitzung": code, "rolle": "plenum"}))

        geraete = [0]

        def lobby(name):
            s = seite(name)
            geraete[0] += 1
            s.goto(startseite(a.basis, a) + f"&geraet=q{geraete[0]}")
            s.get_by_test_id("ich-spiele-mit").click()
            s.get_by_test_id("code-eingabe").fill(code)
            s.get_by_test_id("beitreten").click()
            warte(lambda: s.locator("[data-rolle=lobby]").count() == 1, nach, f"Lobby {name}")
            return s

        def anlegen(s, team):
            s.get_by_test_id("lobby-teamname").fill(team)
            s.get_by_test_id("team-erstellen").click()
            warte(lambda: s.get_by_test_id("lobby-ich").count() == 1, nach, f"Team {team} angelegt")

        def geraet(s):
            return "Laptop " + s.evaluate("() => window.argusSitzung.client")[:4].upper()

        # ---------------------------------------------------------------- Lobby ohne Personennamen (Q1.1, Q1.3)
        ta = lobby("Laptop A")
        text = ta.locator("[data-rolle=lobby]").inner_text()
        titel = ta.locator(".panel header h2").all_inner_texts()
        pruefe("Q1.1 Lobby ohne Kasten und ohne Feld für Personennamen", not any("Namen" in t for t in titel)
               and ta.locator("input[placeholder*='Lt ']").count() == 0 and ta.locator("input").count() == 1 and not PERSON.search(text), str(titel))
        anlegen(ta, "Orion")
        tb = lobby("Laptop B")
        anlegen(tb, "Wega")
        tc = lobby("Zuschauer C")
        karte = tc.locator("section.team-karte[data-teamname='Orion']")
        warte(lambda: karte.count() == 1, nach, "Orion bei C")
        karte.locator("[data-beitreten]").click()
        warte(lambda: tc.get_by_test_id("lobby-ich").count() == 1, nach, "C im Team Orion")
        ga = geraet(ta)
        warte(lambda: ta.locator("section.team-karte[data-teamname='Orion'] .spieler-chip").count() == 2, nach, "zwei Fenster bei Orion")
        chips = ta.locator("section.team-karte[data-teamname='Orion'] .spieler-chip").all_inner_texts()
        pruefe("Q1.3 Lobby-Chips nur mit Gerätenamen („Laptop XXXX (du) ★“)", f"{ga} (du) ★" in [c.strip() for c in chips]
               and all(re.fullmatch(r"Laptop [A-Z0-9]{4}( \(du\))?( ★)?", c.strip()) for c in chips), str(chips))
        pruefe("Q1.3 zuschauendes Fenster: „Das Spiel des Teams läuft an Laptop XXXX – hier nur zuschauen.“",
               f"Das Spiel des Teams läuft an {ga} – hier nur zuschauen." in tc.get_by_test_id("lobby-ich").inner_text())
        ta.wait_for_timeout(600)
        bild(ta, "q1_lobby_nachher_1536x730")
        fehler, _ = pruefe_layout(ta, karte_ganz=False)
        pruefe("Layout Lobby (kein Rollbalken, nichts abgeschnitten)", not fehler, "; ".join(fehler))

        # Übersicht der Spielleitung: Chips „Laptop XXXX“, ohne Personennamen
        warte(lambda: sl.locator("[data-team-zeile='Orion']").count() == 1 and sl.locator("[data-team-zeile='Wega']").count() == 1, nach, "Teams bei der SL")
        sl_text = sl.get_by_test_id("uebersicht").inner_text()
        pruefe("Q1.3 Übersicht der Spielleitung: nur Gerätenamen", ga.split()[1] in sl_text and not PERSON.search(sl_text))

        # ---------------------------------------------------------------- Umbenennen in der Lobby (Q2.1, Q2.3, Q2.4)
        ta.get_by_test_id("lobby-umbenennen").click()
        eingabe = ta.get_by_test_id("teamname-eingabe")
        warte(lambda: eingabe.count() == 1, 5, "Feld umbenennen")
        pruefe("Q2.1 Feld mit dem jetzigen Namen, 🎲, Übernehmen", eingabe.input_value() == "Orion" and ta.get_by_test_id("teamname-wuerfel").count() == 1
               and ta.get_by_test_id("teamname-uebernehmen").count() == 1)
        ta.get_by_test_id("teamname-wuerfel").click()
        vorschlag = eingabe.input_value()
        pruefe("Q2.1 🎲 schlägt einen freien Namen vor", vorschlag and vorschlag.lower() not in ("wega",), vorschlag)
        eingabe.fill("wega")
        eingabe.press("Enter")
        warte(lambda: hinweis_da(ta, "Den Teamnamen „wega“ gibt es schon."), 10, "Hinweis doppelter Name")
        pruefe("Q2.3 doppelter Name (andere Schreibweise) abgelehnt, Feld bleibt offen", eingabe.count() == 1 and sl.locator("[data-team-zeile='Orion']").count() == 1)
        eingabe.fill("   ")
        ta.get_by_test_id("teamname-uebernehmen").click()
        warte(lambda: hinweis_da(ta, "darf nicht leer sein"), 10, "Hinweis leerer Name")
        pruefe("Q2.3 leerer Name abgelehnt, der Name bleibt „Orion“", eingabe.count() == 1 and sl.locator("[data-team-zeile='Orion']").count() == 1)
        eingabe.fill("Wolf")
        ta.wait_for_timeout(300)
        bild(ta, "q2_lobby_feld_umbenennen_1536x730")
        fehler, _ = pruefe_layout(ta, karte_ganz=False)
        pruefe("Layout Lobby mit offenem Feld", not fehler, "; ".join(fehler))
        ta.get_by_test_id("teamname-uebernehmen").click()
        warte(lambda: ta.get_by_test_id("teamname-eingabe").count() == 0, 10, "Feld zu")
        warte(lambda: sl.locator("[data-team-zeile='Wolf']").count() == 1, nach, "SL zeigt Wolf")
        pruefe("Q2.4 Spielleitung: neuer Name sofort, Hinweis „Team Orion heißt jetzt Wolf.“",
               sl.locator("[data-team-zeile='Orion']").count() == 0 and hinweis_da(sl, "Team Orion heißt jetzt Wolf."))
        warte(lambda: "Wolf" in pl.get_by_test_id("beitritt").inner_text(), nach, "Plenum zeigt Wolf")
        pruefe("Q2.4 Plenum zeigt „Wolf“, nicht mehr „Orion“", "Orion" not in pl.get_by_test_id("beitritt").inner_text())
        warte(lambda: "Wolf" in tc.get_by_test_id("lobby-ich").inner_text(), nach, "C zeigt Wolf")
        pruefe("Q2.4 zuschauendes Fenster und Teamkarten zeigen „Wolf“", tb.locator("section.team-karte[data-teamname='Wolf']").count() == 1)
        sl.wait_for_timeout(300)
        bild(sl, "q2_sl_uebersicht_nach_umbenennen_1536x730")
        # das zuschauende Fenster darf auch
        tc.get_by_test_id("lobby-umbenennen").click()
        tc.get_by_test_id("teamname-eingabe").fill("Wolf Nord")
        tc.get_by_test_id("teamname-eingabe").press("Enter")
        warte(lambda: sl.locator("[data-team-zeile='Wolf Nord']").count() == 1, nach, "C benennt um")
        pruefe("Q2.1 auch das zuschauende Fenster benennt in der Lobby um", ta.locator("section.team-karte[data-teamname='Wolf Nord']").count() == 1)

        # ---------------------------------------------------------------- Team-Fenster bis zum Start (Q2.2)
        sl.get_by_test_id("alle-oeffnen").click()
        for s in (ta, tb):
            warte(lambda: s.get_by_test_id("tour").count() == 1, nach, "Übersicht der Ansicht")
            s.get_by_test_id("tour-ueberspringen").click()
            warte(lambda: s.get_by_test_id("einweisung-zb").count() == 1, 10, "Einweisung")
            s.get_by_test_id("einweisung-ueberspringen").click()
        kopf = ta.get_by_test_id("kopf-teamname")
        warte(lambda: kopf.count() == 1 and kopf.get_attribute("data-aenderbar") == "1", nach, "Kopf änderbar")
        lauf = ta.locator(".rahmen").first.get_attribute("data-lauf")
        ta.get_by_test_id("kopf-umbenennen").click()
        warte(lambda: ta.get_by_test_id("kopf-teamname-menue").count() == 1, 5, "Feld im Kopf")
        pruefe("Q2.2 Kopf des Team-Fensters vor dem Start: Feld mit dem jetzigen Namen",
               ta.get_by_test_id("kopf-teamname-menue").get_by_test_id("teamname-eingabe").input_value() == "Wolf Nord")
        ta.get_by_test_id("kopf-teamname-menue").get_by_test_id("teamname-eingabe").fill("Wolf Süd")
        warte(lambda: ta.locator(".hinweise .hinweis").count() == 0, 10, "Hinweise der Lobby verschwunden")  # sauberes Foto
        ta.wait_for_timeout(300)
        bild(ta, "q2_kopf_team_vor_start_1536x730")
        fehler, _ = pruefe_layout(ta)
        pruefe("Layout Team-Fenster mit offenem Feld im Kopf", not fehler, "; ".join(fehler))
        ta.get_by_test_id("kopf-teamname-menue").get_by_test_id("teamname-eingabe").press("Enter")
        warte(lambda: sl.locator("[data-team-zeile='Wolf Süd']").count() == 1, nach, "SL zeigt Wolf Süd")
        pruefe("Q2.2 Umbenennen im Kopf vor dem Start wirkt bei der Spielleitung", ta.get_by_test_id("kopf-teamname-menue").count() == 0
               and "Wolf Süd" in kopf.inner_text())

        # ---------------------------------------------------------------- nach dem Start: nur die Spielleitung
        sl.get_by_test_id("alle-start").click()
        warte(lambda: ta.evaluate("() => window.argus.stand.zustand.uhr.laeuft"), nach, "Uhr läuft")
        warte(lambda: kopf.get_attribute("data-aenderbar") == "0", 10, "Kopf gesperrt")
        pruefe("Q2.2 nach dem Start gesperrt, Tooltip „Teamname nach dem Start nur über die Spielleitung“",
               kopf.get_attribute("title") == GESPERRT and ta.get_by_test_id("kopf-umbenennen").count() == 0)
        seq0 = ta.evaluate("() => window.argus.stand.zustand.seq")
        team_id = ta.locator(".rahmen").first.get_attribute("data-team")
        sl.locator(f"[data-umbenennen='{team_id}']").click()
        sl.get_by_test_id("teamname-eingabe").fill("WEGA")
        sl.get_by_test_id("teamname-eingabe").press("Enter")
        warte(lambda: hinweis_da(sl, "Den Teamnamen „WEGA“ gibt es schon."), 10, "SL: doppelter Name")
        pruefe("Q2.3 auch die Spielleitung: doppelter Name abgelehnt", sl.locator("[data-team-zeile='Wolf Süd']").count() == 1)
        sl.get_by_test_id("teamname-eingabe").fill("Falke")
        sl.get_by_test_id("teamname-eingabe").press("Enter")
        warte(lambda: "Falke" in kopf.inner_text(), nach, "Team-Fenster zeigt Falke")
        warte(lambda: "Falke" in pl.evaluate("() => window.argusTeams().map((t) => t.name).join('|')"), nach, "Plenum kennt Falke")
        ta.wait_for_timeout(1500)
        pruefe("Q2.4 Lauf bleibt, das Spiel läuft weiter", ta.locator(".rahmen").first.get_attribute("data-lauf") == lauf
               and ta.evaluate("() => window.argus.stand.zustand.uhr.laeuft") and ta.evaluate("() => window.argus.stand.zustand.seq") >= seq0)
        bild(ta, "q2_kopf_team_nach_start_1536x730")

        # Fensterliste der Spielleitung (Teamansicht): nur Gerätenamen
        sl.locator(f"[data-ansehen='Falke']").click()
        warte(lambda: sl.get_by_test_id("fenster").count() == 1, 10, "Fensterliste")
        fenster = sl.get_by_test_id("fenster").inner_text()
        pruefe("Q1.3 Fensterliste der Spielleitung: Team-Fenster als „Laptop XXXX“", ga in fenster and not PERSON.search(fenster), fenster.replace("\n", " ")[:200])
        sl.get_by_test_id("zur-uebersicht").click()

        if a.sync == "firebase":
            banner = [n for n, s in (("SL", sl), ("A", ta), ("B", tb), ("C", tc), ("Plenum", pl)) if s.get_by_test_id("regel-banner").count()]
            pruefe("Q2.5 Firebase-Testserver mit den geltenden Regeln: kein Regelfehler (Eintrag mit Gerätenamen, Umbenennen aus dem Team)", not banner, str(banner))
        pruefe("keine Konsolenfehler", not konsole, "; ".join(konsole[:5]))
        browser.close()

    bestanden = sum(1 for _, ok, _ in punkte if ok)
    print(f"\n{bestanden}/{len(punkte)} Prüfpunkte bestanden ({a.sync})")
    sys.exit(0 if bestanden == len(punkte) else 1)


if __name__ == "__main__":
    main()
