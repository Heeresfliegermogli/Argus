#!/usr/bin/env python3
"""Probelauf Lobby und Teams (Schritt 4b): jede Aufgabe nur über sichtbare Beschriftungen
(Knopftexte, Feldhinweise, Teamnamen), so wie eine Testperson es täte. Ersetzt den Bedientest mit
Menschen nicht (docs/BEDIENTEST.md, Teil Lobby), zeigt aber, dass jede Aufgabe mit dem lösbar ist,
was auf dem Bildschirm steht – ohne Erklärung.

Startseite:  zuerst nur „Ich spiele mit“ und „Spielleitung“; wer mitspielt, sieht nur das Codefeld (B1, 25.10.2026).
Teilnehmer:  Code eingeben (drei Zeichen, auch klein und mit Leerzeichen), falscher Code, Team mit eigenem Namen,
             Würfel, beitreten, Rolle abgeben und wechseln, Doppelrolle, Team wechseln, gleichzeitiger
             Zugriff auf dieselbe Rolle, Neuladen, später Beitritt in ein laufendes Spiel.
Spielleitung: umbenennen, verschieben, Teilnehmer ohne Team zuweisen, Team löschen, Spiel öffnen und
             Uhr starten für alle, Zuschauen, Plenum mit Code und Teamwahl, zuletzt genutzte Sitzung fortsetzen.
Rollen heißen Aufklärung, Zielprüfung, Führung (B3); die Einweisung sind Folien mit „Überspringen“ (B5).

Aufruf (nach `npm run build` und `npx vite preview --port 4173`):
  python3 tools/lobby_probe.py http://localhost:4173/ [--bilder lobby-bilder]
"""
import argparse
import os
import re
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

W, H = 1530, 800


def warte(bedingung, sek=10, text="Bedingung"):
    ende = time.time() + sek
    while time.time() < ende:
        try:
            if bedingung():
                return
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.1)
    raise AssertionError(f"{text} nicht erfüllt nach {sek} s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("basis")
    ap.add_argument("--sync", default="lokal")
    ap.add_argument("--bilder", default="lobby-bilder")
    ap.add_argument("--renderer", choices=["canvas", "webgl"], default="canvas")
    ap.add_argument("--fps", type=int, default=2, help="höchste Bildrate der Karten (0 = ohne Grenze)")
    a = ap.parse_args()
    os.makedirs(a.bilder, exist_ok=True)
    start = f"{a.basis}{'&' if '?' in a.basis else '?'}{urllib.parse.urlencode({'sync': a.sync, **({'fps': a.fps} if a.fps else {})})}"
    ergebnis = []
    konsole = []

    def aufgabe(name, f):
        t0 = time.time()
        try:
            f()
            ergebnis.append((name, True, time.time() - t0, ""))
        except Exception as e:  # noqa: BLE001 – jede Ausnahme ist eine nicht gelöste Aufgabe
            ergebnis.append((name, False, time.time() - t0, str(e).splitlines()[0][:140]))

    with sync_playwright() as p:
        # Seit Schritt 7 bewegen sich die Karten; viele Fenster mit Software-WebGL an einem Rechner ohne Grafikkarte
        # stehen dann (siehe tools/e2e_drehbuch.py) – deshalb Rückfall Canvas mit höchstens 2 Bildern/s.
        grafik = (["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] if a.renderer == "webgl"
                  else ["--disable-gpu", "--disable-software-rasterizer"])
        browser = p.chromium.launch(args=[*grafik, "--disable-background-timer-throttling",
                                          "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"])
        ctx = browser.new_context(viewport={"width": W, "height": H})
        ctx.on("page", lambda pg: (pg.on("pageerror", lambda e: konsole.append(f"pageerror: {e}")),
                                   pg.on("console", lambda m: konsole.append(f"{m.type}: {m.text}") if m.type == "error" else None)))
        bild = lambda pg, n: pg.screenshot(path=os.path.join(a.bilder, f"{n}.png"))  # noqa: E731

        # Startseite: zwei große Knöpfe, sonst nichts zum Anlegen oder Testen (B1)
        sl = ctx.new_page()
        sl.goto(start)
        warte(lambda: sl.get_by_role("button", name="Ich spiele mit").count() == 1, 15, "Startseite")
        for n in ["Neue Sitzung anlegen", "Allein testen", "Lasttest", "Auswertung üben"]:
            assert sl.get_by_text(n).count() == 0, f"„{n}“ schon auf der ersten Seite"
        bild(sl, "start-wahl")
        # Spielleitung legt die Sitzung an
        sl.get_by_role("button", name="Spielleitung").click()
        sl.get_by_placeholder("Name, z. B. SL 1").fill("SL 1")
        bild(sl, "start-spielleitung")
        sl.get_by_role("button", name="Neue Sitzung anlegen").click()
        warte(lambda: sl.get_by_text("steuert alle Teams").count() == 1, 20, "SL steuert")
        code = sl.get_by_test_id("code").inner_text().strip()
        assert re.fullmatch(r"[ACEFHJKMNPRTVWXY34679]{3}", code), f"Code „{code}“ ist kein kurzer Code (B2)"
        with ctx.expect_page() as neu:
            sl.get_by_role("button", name="Plenum öffnen").click()
        plenum = neu.value
        tt = {}

        def mitspielen(pg):
            pg.goto(start)
            pg.get_by_role("button", name="Ich spiele mit").click()

        def teilnehmer(n, eingabe=None):
            pg = ctx.new_page()
            mitspielen(pg)
            pg.get_by_label("Code der Sitzung").fill(eingabe or code)
            pg.get_by_role("button", name="Beitreten").click()
            warte(lambda: pg.get_by_text("Team erstellen oder einem Team beitreten").count() == 1, 15, f"Lobby {n}")
            pg.get_by_placeholder("z. B. Lt Müller (freiwillig)").fill(n)
            pg.get_by_placeholder("z. B. Lt Müller (freiwillig)").press("Enter")
            tt[n] = pg
            return pg

        def karte(pg, team):  # Teamkarte rechts in der Lobby: Teamname oben, darunter Aufklärung, Zielprüfung, Führung
            return pg.locator("section.team-karte", has=pg.get_by_text(team, exact=True))

        def zeile(pg, team, rollentext):
            return karte(pg, team).locator(".slot", has_text=rollentext)

        # ---------------------------------------------------------------- Teilnehmer
        def l1():
            pg = ctx.new_page()
            mitspielen(pg)
            # wer mitspielt, sieht nur das Codefeld (B1)
            for n in ["Neue Sitzung anlegen", "Allein testen", "Fortsetzen"]:
                assert pg.get_by_text(n).count() == 0, f"„{n}“ beim Mitspielen sichtbar"
            pg.get_by_label("Code der Sitzung").fill("K0")
            pg.get_by_role("button", name="Beitreten").click()
            warte(lambda: pg.get_by_text("ist kein Code").count() == 1, 10, "Meldung „ist kein Code“")
            pg.get_by_label("Code der Sitzung").fill("WWW" if code != "WWW" else "YYY")
            pg.get_by_role("button", name="Beitreten").click()
            warte(lambda: pg.get_by_text("gibt es nicht").count() == 1, 10, "Meldung „gibt es nicht“")
            bild(pg, "start-falscher-code")
            pg.close()

        def l2():
            teilnehmer("Lt Anders", f" {code[0].lower()} {code[1:].lower()}")  # klein und mit Leerzeichen
            pg = tt["Lt Anders"]
            pg.get_by_placeholder("Teamname").fill("Adler 1")
            pg.get_by_role("button", name="Zielprüfung", exact=True).click()
            warte(lambda: pg.get_by_text("Du bist im Team").count() == 1, 10, "im Team")
            assert pg.get_by_text("Deine Rolle: Zielprüfung").count() == 1

        def l3():
            pg = teilnehmer("Lt Brandt")
            pg.get_by_title("Namen vorschlagen").click()
            name = pg.get_by_placeholder("Teamname").input_value()
            assert name, "Würfel ohne Vorschlag"
            pg.get_by_role("button", name="Aufklärung", exact=True).click()
            warte(lambda: pg.get_by_text("Du bist im Team").count() == 1, 10, "im Team")
            tt["team_b"] = name

        def l4():
            pg = teilnehmer("Lt Claus")
            warte(lambda: karte(pg, "Adler 1").count() == 1, 10, "Karte Adler 1")
            zeile(pg, "Adler 1", "Aufklärung").get_by_role("button", name="beitreten").click()
            warte(lambda: pg.get_by_text("Deine Rolle: Aufklärung").count() == 1, 10, "Aufklärung in Adler 1")
            bild(pg, "lobby-beigetreten")

        def l5():
            pg = tt["Lt Claus"]
            zeile(pg, "Adler 1", "Aufklärung").get_by_role("button", name="abgeben").click()
            warte(lambda: pg.get_by_text("Team erstellen oder einem Team beitreten").count() == 1, 10, "wieder ohne Team")
            zeile(pg, "Adler 1", "Führung").get_by_role("button", name="beitreten").click()
            warte(lambda: pg.get_by_text("Deine Rolle: Führung").count() == 1, 10, "Führung in Adler 1")

        def l6():
            pg = tt["Lt Anders"]
            zeile(pg, "Adler 1", "Aufklärung").get_by_role("button", name="+ dazu").click()
            warte(lambda: pg.get_by_text("Deine Rolle: Aufklärung und Zielprüfung").count() == 1, 10, "Doppelrolle")
            bild(pg, "lobby-doppelrolle")

        def l7():
            d = teilnehmer("Lt Dorn")
            zeile(d, tt["team_b"], "Zielprüfung").get_by_role("button", name="beitreten").click()
            warte(lambda: d.get_by_text("Du bist im Team").count() == 1, 10, "D im Team B")
            e = teilnehmer("Lt Ernst")
            e.get_by_placeholder("Teamname").fill("Condor")
            e.get_by_role("button", name="Aufklärung", exact=True).click()
            warte(lambda: karte(d, "Condor").count() == 1, 10, "Condor bei D")
            zeile(d, "Condor", "Führung").get_by_role("button", name="wechseln").click()
            warte(lambda: d.get_by_text("Deine Rolle: Führung").count() == 1 and karte(d, tt["team_b"]).get_by_text("Lt Dorn").count() == 0, 10, "D in Condor")

        def l8():
            # gleichzeitiger Zugriff: zwei Teilnehmer klicken dieselbe freie Rolle
            f = teilnehmer("Lt Falk")
            g = teilnehmer("Lt Gerd")
            for pg in (f, g):
                warte(lambda: zeile(pg, "Condor", "Zielprüfung").get_by_role("button", name="beitreten").count() == 1, 10, "Zielprüfung frei")
            kf = zeile(f, "Condor", "Zielprüfung").get_by_role("button", name="beitreten").element_handle()
            kg = zeile(g, "Condor", "Zielprüfung").get_by_role("button", name="beitreten").element_handle()
            f.evaluate("(k) => k.click()", kf)
            g.evaluate("(k) => k.click()", kg)

            def genau_einer():
                drin = [pg.get_by_text("Deine Rolle: Zielprüfung").count() == 1 for pg in (f, g)]
                return sum(drin) == 1 and karte(sl, "Condor").count() == 0  # SL-Übersicht hat keine Karten
            warte(lambda: sum(pg.get_by_text("Deine Rolle: Zielprüfung").count() for pg in (f, g)) == 1, 10, "genau einer behält die Zielprüfung")
            _ = genau_einer
            verlierer = f if g.get_by_text("Deine Rolle: Zielprüfung").count() else g
            tt["frei"] = verlierer
            # Der andere ist in keinem Team und sieht, wer die Rolle hat. Je nach Laufzeit war sein Knopf
            # schon weg, er bekam „hat schon …“, oder er gab die Rolle nach dem Abgleich wieder ab
            # („… schon genommen“). Den echten Gleichstand prüft tests/teams.test.ts.
            sieger = "Lt Gerd" if verlierer is f else "Lt Falk"
            warte(lambda: verlierer.get_by_text("Team erstellen oder einem Team beitreten").count() == 1
                  and zeile(verlierer, "Condor", "Zielprüfung").get_by_text(sieger).count() == 1, 10, "der andere sieht, wer die Zielprüfung hat")
            bild(verlierer, "lobby-gleichzeitig")

        # ---------------------------------------------------------------- Spielleitung in der Lobby
        def s1():
            sl.locator("tr", has_text="Condor").get_by_title("Umbenennen").click()
            feld = sl.locator("tr", has_text="Lt Ernst").get_by_role("textbox")
            feld.fill("Condor Süd")
            feld.press("Enter")
            warte(lambda: karte(tt["Lt Ernst"], "Condor Süd").count() == 1, 10, "neuer Name beim Teilnehmer")

        def s2():
            # Lt Dorn (Führung in Condor Süd) nach Team B als Führung verschieben
            sl.get_by_role("button", name="Lt Dorn").click()
            menue = sl.locator(".menue")
            menue.locator("div", has_text=tt["team_b"]).last.get_by_role("button", name="Führung", exact=True).click()
            warte(lambda: tt["Lt Dorn"].get_by_text("Deine Rolle: Führung").count() == 1
                  and karte(tt["Lt Dorn"], tt["team_b"]).get_by_text("du (Lt Dorn)").count() == 1, 10, "Dorn in Team B")

        def s3():
            # Teilnehmer ohne Team (der bei L8 leer ausging) Condor Süd als Führung zuweisen
            name = "Lt Falk" if tt["frei"] is tt["Lt Falk"] else "Lt Gerd"
            sl.locator("tr", has_text="Condor Süd").get_by_role("button", name="frei").first.click()
            sl.locator(".menue").get_by_role("button", name=name).click()
            warte(lambda: tt["frei"].get_by_text("Du bist im Team").count() == 1, 10, f"{name} zugewiesen")

        def s4():
            h = teilnehmer("Lt Hahn")
            h.get_by_placeholder("Teamname").fill("Weg damit")
            h.get_by_role("button", name="Aufklärung", exact=True).click()
            warte(lambda: sl.locator("tr", has_text="Weg damit").count() == 1, 10, "Team in der Übersicht")
            bild(plenum, "plenum-vor-start")
            sl.locator("tr", has_text="Weg damit").get_by_title("Team Weg damit löschen").click()
            sl.locator("tr", has_text="Weg damit").get_by_role("button", name="löschen?").click()
            warte(lambda: h.get_by_text("Team erstellen oder einem Team beitreten").count() == 1, 10, "Hahn wieder ohne Team")
            assert sl.locator("tr", has_text="Weg damit").count() == 0
            bild(sl, "sl-uebersicht-lobby")

        def p1():
            assert plenum.get_by_text(code).count() >= 1, "Code fehlt am Smartboard"
            assert plenum.get_by_text("Adler 1").count() == 1, "Teams fehlen am Smartboard"

        # ---------------------------------------------------------------- Spiel
        def s5():
            sl.get_by_role("button", name="Spiel öffnen – alle Teams").click()
            for n in ["Lt Anders", "Lt Claus", "Lt Brandt", "Lt Ernst"]:
                pg = tt[n]
                try:
                    warte(lambda: pg.get_by_role("button", name="Überspringen").count() == 1, 10, f"Einweisung {n}")
                except AssertionError:
                    bild(pg, f"fehler-einweisung-{n.replace(' ', '_')}")
                    print(n, pg.evaluate("() => JSON.stringify({ich: window.argusSitzung.stand.ich, teams: window.argusTeams().map(t => [t.name, t.lauf, t.spieler.map(x => x.name + ':' + x.rollen)])})"))
                    raise
                pg.get_by_role("button", name="Überspringen").click()
            sl.get_by_role("button", name="▶ Uhr starten – alle").click()
            warte(lambda: sl.locator("tr", has_text="Adler 1").get_by_text("läuft").count() == 1, 10, "Uhr Adler 1 läuft")

        def t1():
            pg = tt["Lt Anders"]
            warte(lambda: pg.get_by_role("tab", name="Aufklärung").count() == 1, 10, "Umschalter mit Aufklärung")
            bild(pg, "tt-doppelrolle-g1")
            pg.get_by_role("tab", name="Zielprüfung").click()
            warte(lambda: pg.get_by_role("tab", name="Zielprüfung", selected=True).count() == 1 and pg.locator(".rahmen[data-rolle=g2]").count() == 1, 10, "Ansicht Zielprüfung")
            bild(pg, "tt-doppelrolle-g2")

        def s6():
            sl.locator("tr", has_text="Adler 1").get_by_role("button", name="ansehen ›").click()
            sl.get_by_role("tab", name="Führung").click()
            warte(lambda: sl.get_by_text("Zuschauen – nur lesen").count() == 1, 10, "Zuschauen Führung")
            bild(sl, "sl-zuschauen-g3")
            sl.get_by_role("tab", name="Steuerung").click()
            warte(lambda: sl.get_by_role("button", name="❚❚ Anhalten").count() == 1, 10, "Steuerung Adler 1")
            time.sleep(2)
            bild(sl, "sl-team-steuerung")
            sl.get_by_role("button", name="◂ Übersicht").click()
            warte(lambda: sl.get_by_text("Alle Teams").count() >= 1, 10, "zurück")

        def t2():
            pg = tt["Lt Claus"]
            pg.reload()
            warte(lambda: pg.locator(".rahmen[data-rolle=g3]").count() == 1, 15, "nach Neuladen wieder Führung")
            assert pg.get_by_text("Adler 1").count() >= 1

        def t3():
            j = teilnehmer("Lt Jung")
            zeile(j, tt["team_b"], "Zielprüfung").get_by_role("button", name="beitreten").click()
            warte(lambda: j.get_by_role("button", name="weiter ›").count() == 1, 10, "Einweisung Zielprüfung auch beim späten Beitritt")
            # Folien durchblättern bis „Verstanden“ (B5: drei bis fünf Folien je Rolle)
            folien = 1
            while j.get_by_role("button", name="Verstanden – zur Ansicht").count() == 0:
                j.get_by_role("button", name="weiter ›").click()
                folien += 1
                assert folien <= 6, "mehr als fünf Folien"
            assert 3 <= folien <= 5, f"{folien} Folien"
            bild(j, "einweisung-letzte-folie")
            j.get_by_role("button", name="Verstanden – zur Ansicht").click()
            warte(lambda: j.locator(".rahmen[data-rolle=g2]").count() == 1, 10, "Ansicht Zielprüfung")
            # später wieder aufrufbar
            j.get_by_role("button", name="Einweisung", exact=True).click()
            warte(lambda: j.get_by_role("button", name="Überspringen").count() == 1, 10, "Einweisung wieder offen")
            j.get_by_role("button", name="Überspringen").click()
            warte(lambda: j.get_by_role("button", name="Überspringen").count() == 0, 10, "Einweisung zu")

        def p2():
            plenum.get_by_role("combobox").select_option(label="Condor Süd")
            warte(lambda: plenum.locator(".team-wahl").get_by_text("Condor Süd").count() >= 0 and plenum.locator("select").input_value() != "", 10, "Teamwahl")
            bild(plenum, "plenum-team")

        def s7():
            pg = ctx.new_page()
            pg.goto(start)
            pg.get_by_role("button", name="Spielleitung").click()
            warte(lambda: pg.get_by_test_id("letzte-sitzung").get_by_text(code).count() >= 1, 10, f"letzte Sitzung {code} angeboten")
            bild(pg, "start-fortsetzen")
            pg.get_by_role("button", name="Fortsetzen als Spielleitung").click()
            warte(lambda: pg.get_by_text("Alle Teams").count() >= 1 and pg.get_by_test_id("code").inner_text().strip() == code, 20, "Übersicht der Sitzung")
            pg.close()

        for name, f in [
            ("L1 nur Codefeld; falscher Code → verständliche Meldung", l1),
            ("L2 Code klein/mit Leerzeichen, Team mit eigenem Namen als Zielprüfung", l2),
            ("L3 Würfel schlägt Namen vor, Team als Aufklärung", l3),
            ("L4 einem Team als Aufklärung beitreten", l4),
            ("L5 Rolle abgeben, andere Rolle nehmen", l5),
            ("L6 Doppelrolle mit „+ dazu“", l6),
            ("L7 Team wechseln", l7),
            ("L8 gleichzeitig dieselbe Rolle: genau einer behält sie", l8),
            ("S1 SL benennt Team um", s1),
            ("S2 SL verschiebt Spieler in anderes Team", s2),
            ("S3 SL weist Teilnehmer ohne Team zu", s3),
            ("S4 SL löscht Team (zweistufig)", s4),
            ("P1 Plenum zeigt Code und Teams vor dem Start", p1),
            ("S5 Spiel öffnen und Uhr starten – alle", s5),
            ("T1 Doppelrolle: Umschalter Aufklärung/Zielprüfung im Spiel", t1),
            ("S6 SL schaut der Führung zu, Steuerung, zurück", s6),
            ("T2 Neuladen führt in Team und Rolle zurück", t2),
            ("T3 später Beitritt, Folien durchblättern, Einweisung wieder aufrufen", t3),
            ("P2 Plenum: Team wählen", p2),
            ("S7 zuletzt genutzte Sitzung als Spielleitung fortsetzen", s7),
        ]:
            aufgabe(name, f)
        browser.close()

    breite = max(len(n) for n, *_ in ergebnis)
    for n, ok, dauer, text in ergebnis:
        print(f"{'OK  ' if ok else 'FEHL'} {n:<{breite}} {dauer:5.1f} s {text}")
    fehler = [x for x in ergebnis if not x[1]]
    if konsole:
        print("Konsole:", *konsole[:10], sep="\n  ")
    if fehler or any("pageerror" in k for k in konsole):
        sys.exit(1)
    print(f"OK – alle {len(ergebnis)} Aufgaben der Lobby nur über sichtbare Beschriftungen gelöst")


if __name__ == "__main__":
    main()
