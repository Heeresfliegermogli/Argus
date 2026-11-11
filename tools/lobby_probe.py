#!/usr/bin/env python3
"""Probelauf Lobby und Teams (seit 2.6: eine Rolle, je Team ein Laptop): jede Aufgabe nur über sichtbare Beschriftungen
(Knopftexte, Feldhinweise, Teamnamen), so wie eine Testperson es täte. Ersetzt den Bedientest mit Menschen nicht
(docs/BEDIENTEST.md, Teil Lobby), zeigt aber, dass jede Aufgabe mit dem lösbar ist, was auf dem Bildschirm steht.

Startseite:  zuerst nur „Ich spiele mit“ und „Spielleitung“; wer mitspielt, sieht nur das Codefeld.
Teilnehmer:  Code eingeben (drei Zeichen, auch klein und mit Leerzeichen), falscher Code, Team mit eigenem Namen anlegen
             („dieser Laptop spielt für das Team“), Würfel, zweites Fenster bei einem Team mit Laptop („zuschauen“),
             Team verlassen, einem Team ohne Laptop beitreten, Team wechseln, zwei Laptops gleichzeitig an einem Team
             ohne Laptop (genau einer rechnet), Neuladen, später Beitritt in ein laufendes Spiel mit Übersicht und Folien.
Spielleitung: umbenennen, Fenster verschieben, Fenster ohne Team einem Team ohne Laptop zuweisen, Team löschen, Spiel öffnen
             und „▶ Start für alle“, Zuschauen und Steuerung eines Teams, Plenum mit Code und Teamwahl, zuletzt genutzte
             Sitzung fortsetzen; seit Liste J (J2.4) die Fenstergröße je Team-Laptop in der Übersicht („Fenster 1536 × 730“, rot mit
             „F11“ unter 1280 × 600) und Startseite, Lobby, Übersicht, Team-Laptop und Plenum in allen vier Prüfgrößen.

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

from pruefgroessen import GROESSEN, groessen_argument, groesse_text, lies_groesse, pruefe_layout
RECHNET = "Dieser Laptop spielt für das Team."
ZUSCHAUEN = "hier nur zuschauen"
OHNE_TEAM = "Team anlegen oder beitreten"


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
    groessen_argument(ap)
    a = ap.parse_args()
    W, H = lies_groesse(a.groesse)
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
        # Viele Fenster mit Karten an einem Rechner ohne Grafikkarte: Rückfall Canvas mit höchstens 2 Bildern/s
        grafik = (["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] if a.renderer == "webgl"
                  else ["--disable-gpu", "--disable-software-rasterizer"])
        browser = p.chromium.launch(args=[*grafik, "--disable-background-timer-throttling",
                                          "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"])
        ctx = browser.new_context(viewport={"width": W, "height": H})
        ctx.on("page", lambda pg: (pg.on("pageerror", lambda e: konsole.append(f"pageerror: {e}")),
                                   pg.on("console", lambda m: konsole.append(f"{m.type}: {m.text}") if m.type == "error" else None)))
        bild = lambda pg, n: pg.screenshot(path=os.path.join(a.bilder, f"{n}.png"))  # noqa: E731

        # Startseite: zwei große Knöpfe, sonst nichts zum Anlegen oder Testen
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
        assert re.fullmatch(r"[ACEFHJKMNPRTVWXY34679]{3}", code), f"Code „{code}“ ist kein kurzer Code"
        with ctx.expect_page() as neu:
            sl.get_by_role("button", name="Plenum öffnen").click()
        plenum = neu.value
        tt = {}

        geraete = [0]

        def mitspielen(pg):
            # Seit Liste K nimmt derselbe Browser in einer Sitzung seine gemerkte Kennung wieder (ein zweiter Tab sähe nur zu). Alle
            # Fenster dieser Probe teilen sich einen Browser – jedes Teilnehmerfenster ist deshalb ein eigenes „Gerät“ (geraet=…).
            geraete[0] += 1
            pg.goto(f"{start}&geraet=g{geraete[0]}")
            pg.get_by_role("button", name="Ich spiele mit").click()

        def teilnehmer(n, eingabe=None):
            pg = ctx.new_page()
            mitspielen(pg)
            pg.get_by_label("Code der Sitzung").fill(eingabe or code)
            pg.get_by_role("button", name="Beitreten").click()
            warte(lambda: pg.get_by_text(OHNE_TEAM).count() == 1, 15, f"Lobby {n}")
            pg.get_by_placeholder("z. B. Lt Müller, Lt Schmidt (freiwillig)").fill(n)
            pg.get_by_placeholder("z. B. Lt Müller, Lt Schmidt (freiwillig)").press("Enter")
            tt[n] = pg
            return pg

        def karte(pg, team):  # Teamkarte rechts in der Lobby: Teamname, wer da ist, Knopf „beitreten“ oder „zuschauen“
            return pg.locator("section.team-karte", has=pg.get_by_text(team, exact=True))

        def im_team(pg, team, rechnet):
            ich = pg.get_by_test_id("lobby-ich")
            return ich.get_by_text(team, exact=True).count() == 1 and ich.get_by_text(RECHNET if rechnet else ZUSCHAUEN).count() >= 1

        def anlegen(pg, team):
            pg.get_by_placeholder("Teamname").fill(team)
            pg.get_by_role("button", name="Team anlegen").click()
            warte(lambda: im_team(pg, team, True), 10, f"Team {team} angelegt")

        def verlassen(pg):
            pg.get_by_role("button", name="Team verlassen").click()
            warte(lambda: pg.get_by_text(OHNE_TEAM).count() == 1, 10, "wieder ohne Team")

        def zeile(team):  # Zeile eines Teams in der Übersicht der Spielleitung
            return sl.locator("tr", has=sl.get_by_text(team, exact=True))

        # ---------------------------------------------------------------- Teilnehmer
        def l1():
            pg = ctx.new_page()
            mitspielen(pg)
            # wer mitspielt, sieht nur das Codefeld
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
            pg = teilnehmer("Lt Anders, Lt Bauer", f" {code[0].lower()} {code[1:].lower()}")  # klein und mit Leerzeichen
            assert pg.get_by_text("Rolle").count() == 0 or pg.get_by_role("button", name="Aufklärung").count() == 0, "Rollenwahl in der Lobby"
            bild(pg, "lobby-leer")
            anlegen(pg, "Adler 1")
            # Teamkarte rechts: Name mit ★ (rechnet), Knopf zum Beitreten gibt es für das eigene Team nicht
            warte(lambda: karte(pg, "Adler 1").get_by_text("Lt Anders, Lt Bauer (du) ★").count() == 1, 10, "★ am eigenen Laptop")
            bild(pg, "lobby-team-angelegt")

        def l3():
            pg = teilnehmer("Lt Brandt")
            pg.get_by_title("Namen vorschlagen").click()
            name = pg.get_by_placeholder("Teamname").input_value()
            assert name, "Würfel ohne Vorschlag"
            pg.get_by_role("button", name="Team anlegen").click()
            warte(lambda: im_team(pg, name, True), 10, f"Team {name}")
            tt["team_b"] = name

        def l4():
            pg = teilnehmer("Lt Claus")
            warte(lambda: karte(pg, "Adler 1").count() == 1, 10, "Karte Adler 1")
            knopf = karte(pg, "Adler 1").get_by_role("button", name="zuschauen")
            assert karte(pg, "Adler 1").get_by_role("button", name="beitreten").count() == 0, "„beitreten“ bei einem Team mit Laptop"
            knopf.click()
            warte(lambda: im_team(pg, "Adler 1", False), 10, "Zuschauen bei Adler 1")
            bild(pg, "lobby-zuschauen")

        def l5():
            verlassen(tt["Lt Claus"])
            assert karte(tt["Lt Claus"], "Adler 1").get_by_text("Lt Claus").count() == 0, "Lt Claus steht noch bei Adler 1"

        def l6():
            e = teilnehmer("Lt Ernst")
            anlegen(e, "Condor")
            verlassen(e)                                        # Condor hat jetzt keinen Laptop
            c = tt["Lt Claus"]
            warte(lambda: karte(c, "Condor").get_by_text("kein Laptop").count() == 1, 10, "Condor ohne Laptop")
            karte(c, "Condor").get_by_role("button", name="beitreten").click()
            warte(lambda: im_team(c, "Condor", True), 10, "Lt Claus rechnet für Condor")

        def l7():
            d = teilnehmer("Lt Dorn")
            anlegen(d, "Falke")
            karte(d, "Adler 1").get_by_role("button", name="zuschauen").click()   # direkt von Falke zu Adler 1
            warte(lambda: im_team(d, "Adler 1", False), 10, "Lt Dorn schaut bei Adler 1 zu")
            warte(lambda: karte(d, "Falke").get_by_text("Lt Dorn").count() == 0, 10, "Lt Dorn nicht mehr bei Falke")

        def s3():
            # Spielleitung setzt ein Fenster ohne Team (Lt Ernst) an das Team ohne Laptop (Falke)
            zeile("Falke").get_by_role("button", name="frei").click()
            sl.locator(".menue").get_by_role("button", name="Lt Ernst").click()
            warte(lambda: im_team(tt["Lt Ernst"], "Falke", True), 10, "Lt Ernst rechnet für Falke")

        def l8():
            # zwei Laptops klicken gleichzeitig „beitreten“ an einem Team ohne Laptop: genau einer rechnet, der andere schaut zu
            h = teilnehmer("Lt Hahn")
            anlegen(h, "Habicht")
            verlassen(h)
            f = teilnehmer("Lt Falk")
            g = teilnehmer("Lt Gerd")
            for pg in (f, g):
                warte(lambda: karte(pg, "Habicht").get_by_role("button", name="beitreten").count() == 1, 10, "Habicht ohne Laptop")
            kf = karte(f, "Habicht").get_by_role("button", name="beitreten").element_handle()
            kg = karte(g, "Habicht").get_by_role("button", name="beitreten").element_handle()
            f.evaluate("(k) => k.click()", kf)
            g.evaluate("(k) => k.click()", kg)
            warte(lambda: sum(im_team(pg, "Habicht", True) for pg in (f, g)) == 1
                  and sum(im_team(pg, "Habicht", False) for pg in (f, g)) == 1, 10, "genau einer rechnet, der andere schaut zu")
            tt["zuschauer_habicht"] = f if im_team(f, "Habicht", False) else g
            bild(tt["zuschauer_habicht"], "lobby-gleichzeitig")

        # ---------------------------------------------------------------- Spielleitung in der Lobby
        def s1():
            zeile("Condor").get_by_title("Umbenennen").click()
            feld = sl.locator("input.team-umbenennen")
            feld.fill("Condor Süd")
            feld.press("Enter")
            warte(lambda: im_team(tt["Lt Claus"], "Condor Süd", True), 10, "neuer Name beim Team-Laptop")

        def s2():
            # Lt Dorn (schaut bei Adler 1 zu) nach Condor Süd verschieben
            zeile("Adler 1").get_by_role("button", name="Lt Dorn").click()
            sl.locator(".menue").get_by_role("button", name="Condor Süd").click()
            warte(lambda: im_team(tt["Lt Dorn"], "Condor Süd", False), 10, "Lt Dorn schaut bei Condor Süd zu")

        def s4():
            h = tt["Lt Hahn"]
            anlegen(h, "Weg damit")
            warte(lambda: zeile("Weg damit").count() == 1, 10, "Team in der Übersicht")
            bild(plenum, "plenum-vor-start")
            zeile("Weg damit").get_by_title("Team Weg damit löschen").click()
            zeile("Weg damit").get_by_role("button", name="löschen?").click()
            warte(lambda: h.get_by_text(OHNE_TEAM).count() == 1, 10, "Lt Hahn wieder ohne Team")
            assert zeile("Weg damit").count() == 0
            bild(sl, "sl-uebersicht-lobby")

        def p1():
            assert plenum.get_by_text(code).count() >= 1, "Code fehlt am Smartboard"
            assert plenum.get_by_text("Adler 1").count() == 1, "Teams fehlen am Smartboard"

        # ---------------------------------------------------------------- Spiel
        rechner = lambda: [tt["Lt Anders, Lt Bauer"], tt["Lt Brandt"], tt["Lt Claus"], tt["Lt Ernst"]]  # noqa: E731

        def s5():
            sl.get_by_role("button", name=re.compile("Spiel öffnen – alle Teams")).click()
            for pg in rechner():
                warte(lambda: pg.get_by_role("button", name="Übersicht überspringen").count() == 1, 15, "Übersicht auf der Oberfläche")
                pg.get_by_role("button", name="Übersicht überspringen").click()
                warte(lambda: pg.get_by_role("button", name="Überspringen").count() == 1, 10, "Folien der Einweisung")
                pg.get_by_role("button", name="Überspringen").click()
            # Habicht: der Laptop, der rechnet, ebenso
            hab = tt["Lt Falk"] if tt["zuschauer_habicht"] is tt["Lt Gerd"] else tt["Lt Gerd"]
            warte(lambda: hab.get_by_role("button", name="Übersicht überspringen").count() == 1, 15, "Übersicht Habicht")
            hab.get_by_role("button", name="Übersicht überspringen").click()
            hab.get_by_role("button", name="Überspringen").click()
            # Zuschauende Fenster sehen keine Einweisung von selbst
            assert tt["Lt Dorn"].get_by_role("button", name="Übersicht überspringen").count() == 0, "Einweisung beim Zuschauen"
            sl.get_by_role("button", name="▶ Start für alle").click()
            warte(lambda: zeile("Adler 1").get_by_text("läuft").count() == 1, 15, "Uhr Adler 1 läuft")

        def t1():
            # zweites Fenster von Condor Süd: sieht zu, Eingaben gesperrt, dieselbe Uhr wie der Team-Laptop
            d, c = tt["Lt Dorn"], tt["Lt Claus"]
            warte(lambda: d.get_by_test_id("nur-lesen").count() == 1 and d.get_by_test_id("zuschau-banner").count() == 1, 15, "Zuschauen bei Condor Süd")
            warte(lambda: d.get_by_test_id("uhr").first.inner_text() == c.get_by_test_id("uhr").first.inner_text(), 10, "gleiche Uhr")
            assert c.get_by_test_id("nur-lesen").count() == 0, "Team-Laptop nur lesend"
            bild(d, "tt-zuschauen")

        def s6():
            zeile("Adler 1").get_by_role("button", name="ansehen ›").click()
            sl.get_by_role("tab", name=re.compile("Zielbearbeitung")).click()
            warte(lambda: sl.get_by_test_id("nur-lesen").count() == 1, 10, "Zuschauen Zielbearbeitung")
            bild(sl, "sl-zuschauen-zb")
            sl.get_by_role("tab", name="Steuerung").click()
            warte(lambda: sl.get_by_role("button", name="❚❚ Anhalten").count() == 1, 10, "Steuerung Adler 1")
            time.sleep(2)
            bild(sl, "sl-team-steuerung")
            sl.get_by_role("button", name="◂ Übersicht").click()
            warte(lambda: sl.get_by_test_id("team-tabelle").count() == 1, 10, "zurück")

        def t2():
            pg = tt["Lt Claus"]
            pg.reload()
            warte(lambda: pg.locator(".rahmen[data-rolle=zb][data-rechnet='1']").count() == 1, 15, "nach Neuladen wieder Team-Laptop von Condor Süd")
            assert pg.get_by_text("Condor Süd").count() >= 1
            assert pg.get_by_role("button", name="Übersicht überspringen").count() == 0, "Einweisung nach Neuladen erneut"

        def t3():
            # später Beitritt: neues Team im laufenden Spiel, die Spielleitung öffnet sein Spiel einzeln
            j = teilnehmer("Lt Jung")
            anlegen(j, "Nachzügler")
            warte(lambda: zeile("Nachzügler").get_by_role("button", name="öffnen").count() == 1, 10, "„öffnen“ in der Übersicht")
            zeile("Nachzügler").get_by_role("button", name="öffnen").click()
            warte(lambda: j.get_by_test_id("tour").count() == 1, 15, "Übersicht beim späten Beitritt")
            # Übersicht Schritt für Schritt (Pfeile auf die echte Oberfläche)
            schritte = 1
            while j.get_by_role("button", name="weiter zur Einweisung ›").count() == 0:
                j.get_by_role("button", name="weiter ›").click()
                schritte += 1
                assert schritte <= 9, "mehr als acht Schritte in der Übersicht"
            bild(j, "tour-letzter-schritt")
            j.get_by_role("button", name="weiter zur Einweisung ›").click()
            # Folien durchblättern bis „Verstanden“ (drei bis fünf Folien)
            warte(lambda: j.get_by_test_id("einweisung-zb").count() == 1, 10, "Folien")
            folien = 1
            while j.get_by_role("button", name="Verstanden – zur Ansicht").count() == 0:
                j.get_by_role("button", name="weiter ›").click()
                folien += 1
                assert folien <= 6, "mehr als fünf Folien"
            assert 3 <= folien <= 5, f"{folien} Folien"
            assert 5 <= schritte <= 8, f"{schritte} Schritte in der Übersicht"
            bild(j, "einweisung-letzte-folie")
            j.get_by_role("button", name="Verstanden – zur Ansicht").click()
            warte(lambda: j.locator(".rahmen[data-rolle=zb][data-rechnet='1']").count() == 1, 10, "Ansicht Zielbearbeitung")
            # später wieder aufrufbar
            j.get_by_role("button", name="? Einweisung").click()
            warte(lambda: j.get_by_role("button", name="Übersicht überspringen").count() == 1, 10, "Übersicht wieder offen")
            j.get_by_role("button", name="Übersicht überspringen").click()
            j.get_by_role("button", name="Überspringen").click()
            warte(lambda: j.get_by_test_id("einweisung-zb").count() == 0 and j.get_by_test_id("tour").count() == 0, 10, "Einweisung zu")

        def s8():
            # J2.4: Die Übersicht zeigt je Team die Fenstergröße des Team-Laptops (aus der Anwesenheit, ohne neue Firebase-Regeln)
            zelle = zeile("Adler 1").locator("[data-fenster]")
            warte(lambda: zelle.count() == 1 and f"{W} × {H}" in zelle.inner_text(), 15, f"„Fenster {W} × {H}“ bei Adler 1")
            # zu kleines Fenster: rot mit F11; der Team-Laptop meldet die neue Größe nach einer Sekunde Ruhe
            pg = tt["Lt Anders, Lt Bauer"]
            pg.set_viewport_size({"width": 1180, "height": 560})
            warte(lambda: "1180 × 560" in zelle.inner_text() and "F11" in zelle.inner_text(), 15, "„Fenster 1180 × 560 – F11!“")
            assert "rot" in (zelle.get_attribute("class") or ""), "zu kleines Fenster nicht rot"
            bild(sl, "sl-fenster-zu-klein")
            # am Team-Laptop: verkleinert, nichts abgeschnitten, Hinweis auf Vollbild
            f, _ = pruefe_layout(pg, karte_ganz=True, schrift_min=0)
            assert not f, f"verkleinerte Ansicht: {f}"
            bild(pg, "tt-1180x560-verkleinert")
            pg.set_viewport_size({"width": W, "height": H})
            warte(lambda: f"{W} × {H}" in zelle.inner_text(), 15, "Fenstergröße wieder normal")

        def j23():
            # J2.3: Übersicht der SL, Team-Laptop und Plenum in allen vier Prüfgrößen
            fehler = []
            for pg, name in [(sl, "sl-uebersicht"), (tt["Lt Brandt"], "tt-zb"), (plenum, "plenum")]:
                for g in GROESSEN:
                    pg.set_viewport_size({"width": g[0], "height": g[1]})
                    pg.wait_for_timeout(700)
                    f, _ = pruefe_layout(pg)
                    fehler += [f"{name} {groesse_text(g)}: {x}" for x in f]
                    bild(pg, f"{name}_{groesse_text(g)}")
                pg.set_viewport_size({"width": W, "height": H})
            assert not fehler, "; ".join(fehler[:4])

        def p2():
            plenum.get_by_test_id("plenum-teamwahl").select_option(label="Condor Süd")
            warte(lambda: plenum.get_by_test_id("plenum-teamwahl").input_value() != "", 10, "Teamwahl")
            bild(plenum, "plenum-team")

        def s7():
            pg = ctx.new_page()
            pg.goto(start)
            pg.get_by_role("button", name="Spielleitung").click()
            warte(lambda: pg.get_by_test_id("letzte-sitzung").get_by_text(code).count() >= 1, 10, f"letzte Sitzung {code} angeboten")
            bild(pg, "start-fortsetzen")
            pg.get_by_role("button", name="Fortsetzen als Spielleitung").click()
            warte(lambda: pg.get_by_test_id("team-tabelle").count() == 1 and pg.get_by_test_id("code").inner_text().strip() == code, 20, "Übersicht der Sitzung")
            pg.close()

        for name, f in [
            ("L1 nur Codefeld; falscher Code → verständliche Meldung", l1),
            ("L2 Code klein/mit Leerzeichen, Team mit eigenem Namen anlegen (Laptop rechnet, ★)", l2),
            ("L3 Würfel schlägt Namen vor, Team anlegen", l3),
            ("L4 Team mit Laptop: zweites Fenster nur „zuschauen“", l4),
            ("L5 Team verlassen", l5),
            ("L6 Team ohne Laptop: „beitreten“, dieser Laptop rechnet", l6),
            ("L7 Team wechseln (von Falke direkt zu Adler 1)", l7),
            ("S3 SL setzt Fenster ohne Team an ein Team ohne Laptop", s3),
            ("L8 zwei Laptops gleichzeitig: genau einer rechnet", l8),
            ("S1 SL benennt Team um", s1),
            ("S2 SL verschiebt ein Fenster in ein anderes Team", s2),
            ("S4 SL löscht Team (zweistufig)", s4),
            ("P1 Plenum zeigt Code und Teams vor dem Start", p1),
            ("S5 Spiel öffnen, Übersicht/Einweisung überspringen, ▶ Start für alle", s5),
            ("T1 zweites Fenster sieht zu (gesperrt, gleiche Uhr)", t1),
            ("S6 SL schaut der Zielbearbeitung zu, Steuerung, zurück", s6),
            ("T2 Neuladen führt zurück an den Team-Laptop", t2),
            ("T3 später Beitritt: Übersicht mit Pfeilen, Folien, wieder aufrufen", t3),
            ("S8 Fenstergröße je Team-Laptop in der Übersicht, F11-Hinweis (J2.4)", s8),
            ("J2.3 Übersicht, Team-Laptop, Plenum in den vier Prüfgrößen", j23),
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
