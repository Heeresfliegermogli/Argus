#!/usr/bin/env python3
"""Probelauf des Bedientests (docs/BEDIENTEST.md, Teil B, seit 2.6: eine Rolle „Zielbearbeitung“): löst jede Aufgabe nur über
sichtbare Beschriftungen (Knopftexte, Zeilen im Eingang, Zahlen in der Kopfzeile), so wie eine Testperson es täte. Ersetzt den
Test mit Menschen nicht, zeigt aber, dass jede Aufgabe mit dem, was auf dem Bildschirm steht, lösbar ist.

Aufbau wie im Test: „Test ohne Lobby“ mit zwei Fenstern – Spielleitung (Testleiter, steuert die Uhr) und Zielbearbeitung
(Testperson). Die Einweisung (Übersicht mit Pfeilen, dann Folien) öffnet sich bei der Zielbearbeitung von selbst. Teil S:
„Allein testen (ein Fenster)“ – das Team steuert die Uhr selbst.

Aufruf (nach `npm run build` und `npx vite preview --port 4173`):
  python3 tools/bedientest_probe.py http://localhost:4173/
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

from ui_bilder import H, W, adresse, warte

HIER = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("basis")
    ap.add_argument("--raum", default=f"bedien-{int(time.time()) % 100000}")
    a = ap.parse_args()
    ergebnis = []
    kat = json.load(open(os.path.join(HIER, "..", "public", "daten", "katalog_wirkmittel.json"), encoding="utf-8"))
    lm_voll = next(w["bestand"] for w in kat["wirkmittel"] if w["id"] == "LM")

    def aufgabe(name, f):
        t0 = time.time()
        try:
            f()
            ergebnis.append((name, True, time.time() - t0, ""))
        except Exception as e:  # noqa: BLE001 – jede Ausnahme ist ein nicht gelöster Schritt
            ergebnis.append((name, False, time.time() - t0, (str(e).splitlines() or [type(e).__name__])[0][:120]))

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = browser.new_context(viewport={"width": W, "height": H})
        sl = ctx.new_page()
        sl.goto(adresse(a.basis, "sl", a.raum))
        warte(lambda: sl.locator(".rahmen[data-host='1']").count() == 1, 20, "SL steuert")
        zb = ctx.new_page()
        zb.goto(adresse(a.basis, "zb", a.raum))

        def offen():
            return zb.get_by_test_id("offene-meldung").get_attribute("data-meldung")

        def eingang():
            """Zahl neben „Eingang“."""
            return int(zb.get_by_test_id("eingang-zahl").inner_text())

        def zeile(ziel):
            """Zeile im Eingang mit dem sichtbaren Zielnamen („Ziel 3“)."""
            return zb.get_by_test_id("eingang").locator("button.eingang-zeile", has=zb.get_by_text(ziel, exact=True))

        # Einweisung: Übersicht auf der Oberfläche Schritt für Schritt, dann Folien bis „Verstanden“
        def e0():
            warte(lambda: zb.get_by_test_id("tour").count() == 1, 15, "Übersicht")
            schritte = 1
            ziele = [zb.get_by_test_id("tour").get_attribute("data-schritt")]
            while zb.get_by_role("button", name="weiter zur Einweisung ›").count() == 0:
                zb.get_by_role("button", name="weiter ›").click()
                schritte += 1
                ziele.append(zb.get_by_test_id("tour").get_attribute("data-schritt"))
                assert schritte <= 9, "mehr als acht Schritte"
            for z in ["eingang", "entscheiden", "panzer", "feed", "bestand"]:
                assert z in ziele, f"Übersicht ohne „{z}“"
            zb.get_by_role("button", name="weiter zur Einweisung ›").click()
            folien = 1
            while zb.get_by_role("button", name="Verstanden – zur Ansicht").count() == 0:
                zb.get_by_role("button", name="weiter ›").click()
                folien += 1
                assert folien <= 6, "mehr als fünf Folien"
            assert 3 <= folien <= 5, f"{folien} Folien"
            text = zb.get_by_test_id("einweisung-zb").inner_text()
            for verboten in ["Kleingedruckt", "Regelungen", "Gegenangriff"]:
                assert verboten not in text, f"„{verboten}“ in der Einweisung"
            zb.get_by_role("button", name="Verstanden – zur Ansicht").click()
            warte(lambda: zb.get_by_test_id("einweisung-zb").count() == 0, 5, "Einweisung zu")

        aufgabe("E-0 Einweisung: Übersicht mit Pfeilen, dann Folien", e0)

        # Uhr bis kurz nach Ziel 3 vorstellen (der echte Test läuft in Echtzeit; Ziel 3 ist M28 um 02:10)
        sl.get_by_test_id("sl-zeit").fill("02:05")
        sl.get_by_role("button", name="Spielzeit setzen").click()
        sl.get_by_role("button", name="×10").click()
        sl.get_by_role("button", name="▶ Start").click()
        warte(lambda: zeile("Ziel 3").count() == 1, 30, "Ziel 3 im Eingang")
        sl.get_by_role("button", name="❚❚ Anhalten").click()
        warte(lambda: zb.locator("[data-testid=lagekarte][data-bereit='1']").count() == 1, 15, "Karte bereit")

        def z_1():
            # Eingang ablesen: Zahl und Wartezeit der ältesten Meldung (m:ss)
            assert eingang() == 3, f"Eingang {eingang()}"
            zeit = zeile("Ziel 1").locator(".ez-zeit").inner_text()
            assert re.fullmatch(r"\d+:\d\d", zeit), zeit

        def z_2():
            zeile("Ziel 3").click()
            warte(lambda: offen() == "M28", 10, "Ziel 3 offen")
            argus = zb.get_by_test_id("argus-klasse").inner_text()
            assert "%" in argus, argus

        def z_3():
            klick = zb.get_by_text("Klick: groß mit Lupe")
            warte(lambda: klick.is_visible(), 10, "Hinweis „Klick: groß mit Lupe“")
            klick.click()
            r = zb.locator("[data-testid=vergroesserung] .argus-rahmen").first
            warte(lambda: r.is_visible(), 10, "ARGUS-Markierung")
            bb = r.bounding_box()
            zb.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2)
            warte(lambda: zb.get_by_test_id("lupe").count() == 1, 5, "Lupe")
            zb.get_by_role("button", name="Schließen (Esc)").click()
            warte(lambda: zb.get_by_test_id("vergroesserung").count() == 0, 5, "Vergrößerung zu")

        def z_4():
            zb.locator("label[data-wm=MRS]").click()
            assert "R3" in zb.get_by_test_id("karte-banner").inner_text(), zb.get_by_test_id("karte-banner").inner_text()
            assert zb.locator("label[data-wm=MRS]").get_by_text(re.compile("R3")).count() >= 1, "Warnung R3 nicht am Wirkmittel"

        def z_5():
            zb.get_by_role("button", name=re.compile("^ZURÜCKSTELLEN")).click()
            warte(lambda: zb.get_by_test_id("zurueck-zahl").count() == 1, 10, "„+ 1 zurückgestellt“")
            zeile("Ziel 3").click()
            warte(lambda: offen() == "M28" and "zurückgestellt" in zb.get_by_test_id("offene-meldung").inner_text(), 10, "Ziel 3 wieder offen")

        def z_6():
            zeile("Ziel 1").click()
            warte(lambda: offen() == "M01", 10, "Ziel 1 offen")
            lm = zb.locator("label[data-wm=LM]")
            assert lm.get_by_text("keine Warnung").count() == 1, lm.inner_text()
            lm.click()
            knopf = zb.get_by_test_id("zb-bekaempfen")
            assert re.search(r"BEKÄMPFEN mit LM", knopf.inner_text()) and "Bestand" in knopf.inner_text(), knopf.inner_text()
            knopf.click()
            ein = zb.locator("[data-unterwegs=M01]")
            warte(lambda: ein.count() == 1 and re.search(r"Einschlag in \d+:\d\d", ein.inner_text()) is not None, 10, "Countdown „Einschlag in m:ss“")

        def z_7():
            lm = zb.get_by_test_id("bestand").locator("[data-wm=LM]")
            zahl = int(lm.locator("b").inner_text())
            verbraucht = zb.evaluate("() => (window.argus.stand.zustand.meldungen.M01.freigabe?.einschlaege?.length) ?? 1")
            assert zahl == lm_voll - verbraucht, f"Kopfzeile LM {zahl}, erwartet {lm_voll - verbraucht}"

        def z_8():
            zeile("Ziel 2").click()
            warte(lambda: offen() == "M02", 10, "Ziel 2 offen")
            vorher = eingang()
            zb.get_by_role("button", name=re.compile("^ABLEHNEN")).click()
            warte(lambda: eingang() == vorher - 1, 10, "Eingang eins weniger")

        def z_9():
            # Lagemeldungen: die neue steht oben und rutscht nach ca. 8 s in „frühere Meldungen“; dort noch einmal lesen
            knopf = zb.get_by_test_id("feed-frueher")
            warte(lambda: knopf.is_enabled(), 20, "frühere Meldungen")
            knopf.click()
            m = zb.locator(".feed-liste .feed-meldung").first
            m.click()
            warte(lambda: "ganz" in (m.get_attribute("class") or ""), 5, "Lagemeldung ganz zu lesen")

        def z_10():
            leiste = zb.get_by_test_id("panzer-leiste")
            text = leiste.inner_text()
            for pz in ["1/1", "1/2", "1/3", "1/4"]:
                assert pz in text, f"{pz} fehlt in der Kopfzeile: {text}"

        for n, f in [("Z-1 Eingang und Wartezeit ablesen", z_1), ("Z-2 Ziel 3 öffnen, was meldet ARGUS", z_2),
                     ("Z-3 Lupe im Drohnenbild", z_3), ("Z-4 Mörser: Warnung R3", z_4), ("Z-5 zurückstellen, wieder öffnen", z_5),
                     ("Z-6 bekämpfen ohne Warnung, Countdown", z_6), ("Z-7 Bestand LM in der Kopfzeile", z_7),
                     ("Z-8 ablehnen", z_8), ("Z-9 frühere Lagemeldung lesen", z_9), ("Z-10 die vier Panzer", z_10)]:
            aufgabe(n, f)

        def z_11():
            # „? Einweisung“ oben rechts öffnet die Übersicht wieder
            zb.get_by_role("button", name="? Einweisung").click()
            warte(lambda: zb.get_by_test_id("tour").count() == 1, 10, "Übersicht wieder offen")
            zb.keyboard.press("Escape")
            zb.get_by_role("button", name="Überspringen").click()
            warte(lambda: zb.get_by_test_id("tour").count() == 0 and zb.get_by_test_id("einweisung-zb").count() == 0, 5, "zu")

        aufgabe("Z-11 Einweisung wieder aufrufen", z_11)

        # Teil S: allein in einem Fenster (Startseite → Spielleitung → Test ohne Lobby → Allein testen)
        for pg in (zb, sl):
            pg.close()
        solo = ctx.new_page()

        def s_1():
            solo.goto(f"{a.basis}{'&' if '?' in a.basis else '?'}{urllib.parse.urlencode({'sync': 'lokal'})}")
            solo.get_by_role("button", name="Spielleitung").click()
            solo.get_by_text("Test ohne Lobby").click()
            solo.get_by_label("Raum").fill(f"{a.raum}-solo")
            solo.get_by_role("link", name="Allein testen (ein Fenster)").click()
            warte(lambda: solo.get_by_role("button", name="Übersicht überspringen").count() == 1, 20, "Übersicht im Solo-Fenster")
            solo.get_by_role("button", name="Übersicht überspringen").click()
            solo.get_by_role("button", name="Überspringen").click()
            assert solo.get_by_test_id("nur-lesen").count() == 0, "Solo-Fenster ist Zuschauen"
            solo.get_by_role("button", name="×20").click()
            solo.get_by_role("button", name="▶ Start").click()
            warte(lambda: solo.get_by_test_id("offene-meldung").get_attribute("data-meldung") == "M01", 20, "Ziel 1 offen")
            solo.get_by_role("button", name="❚❚").click()
            solo.locator("label[data-wm=MRS]").click()
            solo.get_by_test_id("zb-bekaempfen").click()
            warte(lambda: solo.locator("[data-unterwegs=M01]").count() == 1, 10, "Ziel 1 bekämpft")

        aufgabe("S-1 allein testen: Uhr oben rechts, Ziel 1 bekämpfen", s_1)
        if not ergebnis[-1][1]:
            solo.screenshot(path="bedientest-solo-fehler.png")
        browser.close()

    for n, ok, dt, fehler in ergebnis:
        print(f"{'OK  ' if ok else 'FEHL'} {n:44s} {dt:4.1f} s {fehler}")
    if not all(ok for _, ok, _, _ in ergebnis):
        sys.exit(1)
    print(f"OK – alle {len(ergebnis)} Aufgaben des Bedientests über die sichtbare Oberfläche lösbar")


if __name__ == "__main__":
    main()
