#!/usr/bin/env python3
"""Probelauf des Bedientests (docs/BEDIENTEST.md, Teil B): löst jede Aufgabe nur über sichtbare Beschriftungen
(Knopftexte, Feldhinweise, Marken auf der Karte), so wie eine Testperson es täte. Ersetzt den Test mit Menschen nicht, zeigt
aber, dass jede Aufgabe mit dem, was auf dem Bildschirm steht, lösbar ist.

Seit den Änderungen B1–B11 (25.10.2026): Rollen Aufklärung, Zielprüfung, Führung; Ziele heißen „Ziel 1, 2, 3 …“;
Spieluhr 00:00–25:00; kein Vermerk; Einweisung als Folien (überspringbar); Drohnenbild verschiebbar und schließbar;
im Test ohne Lobby bedient ein Fenster alle drei Rollen (Teil S).

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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("basis")
    ap.add_argument("--raum", default=f"bedien-{int(time.time()) % 100000}")
    a = ap.parse_args()
    ergebnis = []

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
        s = {}
        for r in ["sl", "g1", "g2", "g3"]:
            pg = ctx.new_page()
            pg.goto(adresse(a.basis, r, a.raum))
            s[r] = pg
            if r == "sl":
                warte(lambda: pg.locator(".rahmen[data-host='1']").count() == 1, 20, "SL steuert")
        sl, g1, g2, g3 = s["sl"], s["g1"], s["g2"], s["g3"]

        def offen(s):
            return s.get_by_test_id("offene-meldung").get_attribute("data-meldung")

        def eingang(s):
            """Zahl neben „Eingang“ (der Eingang steht nur als Zahl da)."""
            return int(re.search(r"Eingang\s*(\d+)", s.locator(".eingang-leiste").inner_text()).group(1))

        def marke(s, text):
            return s.get_by_role("button", name=text, exact=True)

        def klick(s, loc):
            """Mausklick auf die Mitte einer sichtbaren Beschriftung (auch wenn sie selbst nicht klickbar ist)."""
            warte(lambda: loc.is_visible(), 10, "Beschriftung sichtbar")
            bb = loc.bounding_box()
            s.mouse.click(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2)

        # Einweisung: Aufklärung blättert die Folien durch, Zielprüfung und Führung überspringen
        def e0():
            folien = 1
            while g1.get_by_role("button", name="Verstanden – zur Ansicht").count() == 0:
                g1.get_by_role("button", name="weiter ›").click()
                folien += 1
                assert folien <= 6, "mehr als fünf Folien"
            assert 3 <= folien <= 5, f"{folien} Folien"
            g1.get_by_role("button", name="Verstanden – zur Ansicht").click()
            for pg in (g2, g3):
                pg.get_by_role("button", name="Überspringen").click()
            for pg in (g1, g2, g3):
                warte(lambda: pg.get_by_role("button", name="Überspringen").count() == 0, 5, "Einweisung zu")

        aufgabe("E-0 Einweisung: Folien oder überspringen", e0)

        # Uhr bis kurz vor Ziel 3 vorstellen (der echte Test läuft in Echtzeit)
        sl.get_by_placeholder("00:00").fill("03:55")
        sl.get_by_role("button", name="Spielzeit setzen").click()
        sl.get_by_role("button", name="▶ Start").click()
        sl.get_by_role("button", name="×10").click()
        warte(lambda: marke(g1, "Ziel 3").count() > 0, 30, "Ziel 3 bei der Aufklärung")
        sl.get_by_role("button", name="❚❚ Anhalten").click()

        # Aufklärung (Karte als Arbeitsfläche – Meldungen als Marken, Drohnenbild am Ort, Eingang als Zahl)
        def a_1():
            warte(lambda: offen(g1) == "M01", 10, "Ziel 1 offen")
            assert g1.get_by_placeholder(re.compile("Vermerk")).count() == 0, "Vermerkfeld noch da (B6)"
            g1.get_by_role("button", name="ANNEHMEN").click()
            warte(lambda: offen(g1) == "M02", 10, "nächste Meldung offen")

        def a_2():
            warte(lambda: eingang(g1) == 2, 10, "Eingang 2")

        def a_3():
            marke(g1, "Ziel 3").click()
            warte(lambda: offen(g1) == "M03", 10, "Ziel 3 offen")
            box = g1.locator("[data-testid=argus-box]").inner_text()
            assert "%" in box and "Ziel 3" in box, box
            zeile = g1.get_by_role("row", name=re.compile("^Bewegung"))   # Sensordaten: Zeile „Bewegung“
            assert zeile.count() == 1 and zeile.inner_text().strip() != "Bewegung", zeile.all_inner_texts()

        def a_4():
            warte(lambda: g1.locator("[data-fenster=M03]").is_visible(), 10, "Drohnenbild am Ort")
            # Klick auf das Bild dort, wo der sichtbare Hinweis „Klick: groß mit Lupe“ steht
            klick(g1, g1.get_by_text("Klick: groß mit Lupe"))
            r = g1.locator("[data-testid=vergroesserung] .argus-rahmen").first
            warte(lambda: r.is_visible(), 10, "ARGUS-Markierung")
            bb = r.bounding_box()
            g1.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2)
            warte(lambda: g1.get_by_test_id("lupe").count() == 1, 5, "Lupe")
            g1.get_by_role("button", name="Schließen (Esc)").click()

        def a_5():
            fenster = g1.locator("[data-fenster=M03]")
            vorher = fenster.bounding_box()
            # an der Kopfleiste ziehen (Hinweis beim Zeigen: „Kopfleiste ziehen: verschieben“)
            kopf = fenster.get_by_text(re.compile("UAV-2"))
            kb = kopf.bounding_box()
            # Richtung nach dem freien Platz: Das Fenster öffnet neben dem Ziel (seit 2.1 liegt Ziel 3 weiter östlich)
            sx = -1 if vorher["x"] + vorher["width"] / 2 > g1.viewport_size["width"] / 2 else 1
            g1.mouse.move(kb["x"] + 40, kb["y"] + kb["height"] / 2)
            g1.mouse.down()
            for i in range(1, 11):
                g1.mouse.move(kb["x"] + 40 + sx * 18 * i, kb["y"] + kb["height"] / 2 + 12 * i)
            g1.mouse.up()
            nachher = fenster.bounding_box()
            assert sx * (nachher["x"] - vorher["x"]) > 150 and nachher["y"] - vorher["y"] > 100, f"nicht verschoben: {vorher} → {nachher}"
            assert g1.get_by_test_id("vergroesserung").count() == 0, "Ziehen hat die Vergrößerung geöffnet"
            g1.get_by_role("button", name="Drohnenbild schließen").click()
            warte(lambda: not fenster.is_visible() and g1.get_by_text("Drohnenbild geschlossen").count() == 1, 5, "geschlossen")
            marke(g1, "Ziel 3").click()
            warte(lambda: fenster.is_visible(), 5, "über die Marke wieder offen")

        def a_6():
            g1.get_by_role("button", name="ANNEHMEN").click()
            warte(lambda: offen(g1) == "M02", 10, "Ziel 2 offen")
            g1.get_by_role("button", name="ABLEHNEN").click()
            warte(lambda: eingang(g1) == 0, 10, "Eingang leer")

        def a_7():
            assert g1.get_by_role("heading", name="Lagehinweise der Führung").count() == 1

        for n, f in [("A-1 annehmen (ohne Vermerk)", a_1), ("A-2 Eingang ablesen", a_2), ("A-3 Ziel 3 öffnen, Konfidenz/Bewegung", a_3),
                     ("A-4 Lupe im Drohnenbild", a_4), ("A-5 Drohnenbild schieben, schließen, öffnen", a_5),
                     ("A-6 annehmen, ablehnen", a_6), ("A-7 Lagehinweise finden", a_7)]:
            aufgabe(n, f)

        # Zielprüfung
        warte(lambda: g2.locator("[data-testid=lagekarte][data-bereit='1']").count() == 1, 15, "Karte Zielprüfung")

        def z_1():
            marke(g2, "Ziel 1").click()
            warte(lambda: offen(g2) == "M01", 10, "Ziel 1 offen")
            assert "Vermerk" not in g2.get_by_test_id("offene-meldung").inner_text(), "Vermerk wird noch angezeigt (B6)"
            g2.get_by_text("Loitering Munition (Präzision)").click()
            assert g2.get_by_text("keine Warnung").count() > 0
            g2.get_by_role("button", name="BEKÄMPFEN mit LM").click()
            warte(lambda: marke(g2, "Ziel 1").count() == 0, 10, "Marke Ziel 1 weg")

        def z_2():
            marke(g2, "Ziel 3").click()
            warte(lambda: offen(g2) == "M03", 10, "Ziel 3 offen")
            g2.get_by_text("Mörser 120 mm (Steilfeuer)").click()
            assert "R3" in g2.locator("[data-testid=karte-banner]").inner_text()

        def z_3():
            g2.get_by_role("button", name="BEOBACHTEN").click()
            warte(lambda: marke(g2, "Ziel 3 · zurückgestellt").count() == 1, 10, "Marke „zurückgestellt“")
            marke(g2, "Ziel 3 · zurückgestellt").click()
            warte(lambda: offen(g2) == "M03" and "zurückgestellt" in g2.get_by_test_id("offene-meldung").inner_text(), 10, "Ziel 3 wieder offen")

        def z_4():
            kat = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "daten", "katalog_wirkmittel.json"),
                                 encoding="utf-8"))
            lm = next(w["bestand"] for w in kat["wirkmittel"] if w["id"] == "LM")      # vor der Freigabe noch voller Bestand
            text = g2.locator("label[data-wm=LM]").get_by_text("übrig").inner_text().strip()
            assert text.startswith(str(lm)), text

        for n, f in [("Z-1 bekämpfen ohne Warnung", z_1), ("Z-2 Warnung R3", z_2), ("Z-3 zurückstellen, wieder öffnen", z_3),
                     ("Z-4 Bestand LM", z_4)]:
            aufgabe(n, f)

        # Führung (Ziel 1 liegt vor; für ZURÜCK braucht die Führung eine zweite Empfehlung – Testleiter empfiehlt Ziel 3)
        g2.get_by_text("Loitering Munition (Präzision)").click()
        g2.get_by_role("button", name="BEKÄMPFEN mit LM").click()

        def offen_g3():
            return g3.get_by_test_id("g3-entscheiden").get_attribute("data-meldung")

        def f_1():
            g3.get_by_role("button", name="Gelesen").first.click()
            warte(lambda: g3.get_by_text("gelesen ✓").count() >= 1, 10, "quittiert")

        def f_2():
            marke(g3, "Ziel 1").click()
            warte(lambda: offen_g3() == "M01", 10, "Ziel 1 offen")
            g3.get_by_role("button", name="FREIGABE").click()
            ein = g3.get_by_text(re.compile(r"^Einschlag \d\d:\d\d$"))   # Spieluhr 00:00–25:00 (B4)
            warte(lambda: ein.count() == 1 and ein.is_visible(), 15, "Spielzeit des Einschlags auf der Karte")

        def f_3():
            g3.get_by_placeholder("Hinweis an Aufklärung und Zielprüfung").fill("Schule NS-01 ist belegt")
            g3.get_by_label("Aufklärung", exact=True).uncheck()
            g3.get_by_role("button", name="Senden").click()
            warte(lambda: g2.get_by_text("Schule NS-01 ist belegt").count() == 1, 10, "Hinweis bei der Zielprüfung")
            assert g1.get_by_text("Schule NS-01 ist belegt").count() == 0

        def f_4():
            warte(lambda: marke(g3, "Ziel 3").count() == 1, 10, "Marke Ziel 3 bei der Führung")
            marke(g3, "Ziel 3").click()
            warte(lambda: offen_g3() == "M03", 10, "Ziel 3 offen")
            g3.get_by_role("button", name="ZURÜCK").click()
            warte(lambda: marke(g2, "Ziel 3").count() == 1, 10, "Ziel 3 wieder bei der Zielprüfung")

        def f_5():
            g3.get_by_role("button", name="einschalten").click()
            warte(lambda: g3.get_by_test_id("fasttrack-status").inner_text() == "EIN", 10, "EIN")
            g3.get_by_role("button", name="ausschalten").click()
            warte(lambda: g3.get_by_test_id("fasttrack-status").inner_text() == "AUS", 10, "AUS")

        for n, f in [("F-1 Lagemeldung gelesen", f_1), ("F-2 Freigabe, Einschlag ablesen", f_2), ("F-3 Hinweis nur an Zielprüfung", f_3),
                     ("F-4 zurück an die Zielprüfung", f_4), ("F-5 Fast-Track ein/aus", f_5)]:
            aufgabe(n, f)

        # Teil S: Test ohne Lobby allein in einem Fenster (B11) – Startseite → Spielleitung → Allein testen
        for pg in (g1, g2, g3, sl):
            pg.close()
        solo = ctx.new_page()

        def weg_mit_einweisung(pg):
            """Die Einweisung kommt im neuen Fenster beim ersten Öffnen jeder Rolle."""
            warte(lambda: pg.get_by_role("button", name="Überspringen").count() == 1, 15, "Einweisung")
            pg.get_by_role("button", name="Überspringen").click()

        def s_1():
            solo.goto(f"{a.basis}{'&' if '?' in a.basis else '?'}{urllib.parse.urlencode({'sync': 'lokal'})}")
            solo.get_by_role("button", name="Spielleitung").click()
            solo.get_by_text("Test ohne Lobby").click()
            solo.get_by_label("Raum").fill(f"{a.raum}-solo")
            solo.get_by_role("link", name="Allein testen (ein Fenster)").click()
            warte(lambda: solo.locator(".rahmen[data-host='1']").count() == 1, 20, "Steuerung im Solo-Fenster")
            solo.get_by_placeholder("00:00").fill("00:25")
            solo.get_by_role("button", name="Spielzeit setzen").click()
            solo.get_by_role("button", name="▶ Start").click()
            solo.get_by_role("tab", name="Aufklärung").click()
            weg_mit_einweisung(solo)
            warte(lambda: marke(solo, "Ziel 1").count() == 1, 15, "Ziel 1 bei der Aufklärung")
            assert solo.get_by_text("Zuschauen – nur lesen").count() == 0, "Solo-Fenster ist Zuschauen"
            warte(lambda: offen(solo) == "M01", 10, "Ziel 1 offen")
            solo.get_by_role("button", name="ANNEHMEN").click()
            solo.get_by_role("tab", name="Zielprüfung").click()
            weg_mit_einweisung(solo)
            warte(lambda: marke(solo, "Ziel 1").count() == 1, 10, "Ziel 1 bei der Zielprüfung")

        aufgabe("S-1 allein testen: Aufklärung bedienbar, Ziel geht weiter", s_1)
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
