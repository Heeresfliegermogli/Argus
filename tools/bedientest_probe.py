#!/usr/bin/env python3
"""Probelauf des Bedientests (docs/BEDIENTEST.md): löst jede Aufgabe nur über sichtbare Beschriftungen
(Knopftexte, Feldhinweise), so wie eine Testperson es täte. Ersetzt den Test mit Menschen nicht, zeigt
aber, dass jede Aufgabe mit dem, was auf dem Bildschirm steht, lösbar ist.

Aufruf (nach `npm run build` und `npx vite preview --port 4173`):
  python3 tools/bedientest_probe.py http://localhost:4173/
"""
import argparse
import sys
import json
import os
import time

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
        for r in ["g1", "g2", "g3"]:
            s[r].get_by_role("button", name="Verstanden – zur Ansicht").click()
        # Uhr bis kurz vor M03 vorstellen (der echte Test läuft in Echtzeit)
        sl.get_by_placeholder("00:00").fill("03:55")
        sl.get_by_role("button", name="Spielzeit setzen").click()
        sl.get_by_role("button", name="▶ Start").click()
        sl.get_by_role("button", name="×10").click()
        warte(lambda: g1.get_by_text("M03").count() > 0, 30, "M03 bei G1")
        sl.get_by_role("button", name="❚❚ Anhalten").click()

        # G1
        def g1_1():
            g1.get_by_placeholder("Vermerk an G2").fill("fährt auf die Ortschaft zu")
            g1.get_by_role("button", name="ANNEHMEN").click()
            warte(lambda: g1.locator(".eintrag.aktiv .nr").inner_text() == "M02", 10, "nächste Meldung gewählt")

        def g1_2():
            box = g1.locator("[data-testid=argus-box]").inner_text()
            assert "%" in box, box
            assert g1.get_by_role("cell", name="Bewegung").count() == 1

        def g1_3():
            g1.get_by_role("button", name="Drohnenbild vergrößern").click()
            r = g1.locator("[data-testid=vergroesserung] .argus-rahmen").first.bounding_box()
            g1.mouse.move(r["x"] + r["width"] / 2, r["y"] + r["height"] / 2)
            assert g1.locator(".lupe-glas").count() == 1
            g1.keyboard.press("Escape")

        def g1_4():
            g1.get_by_role("button", name="ABLEHNEN").click()
            warte(lambda: g1.locator(".eintrag.aktiv .nr").inner_text() == "M03", 10, "M03 gewählt")
            g1.get_by_role("button", name="ANNEHMEN").click()

        def g1_5():
            assert g1.get_by_role("heading", name="Lagehinweise").count() == 1

        for n, f in [("G1-1 annehmen mit Vermerk", g1_1), ("G1-2 Konfidenz/Bewegung", g1_2), ("G1-3 Lupe", g1_3),
                     ("G1-4 ablehnen", g1_4), ("G1-5 Lagehinweise finden", g1_5)]:
            aufgabe(n, f)

        # G2
        warte(lambda: g2.locator("[data-testid=lagekarte][data-bereit='1']").count() == 1, 15, "G2-Karte")

        def g2_1():
            g2.locator(".eintrag", has_text="M01").click()
            g2.get_by_text("Loitering Munition (Präzision)").click()
            assert g2.get_by_text("keine Warnung").count() > 0
            g2.get_by_role("button", name="BEKÄMPFEN mit LM").click()
            warte(lambda: g2.locator(".eintrag:not(.gedimmt)", has_text="M01").count() == 0, 10, "M01 weg")

        def g2_2():
            g2.locator(".eintrag", has_text="M03").click()
            g2.get_by_text("Mörser 120 mm (Steilfeuer)").click()
            assert "R3" in g2.locator("[data-testid=karte-banner]").inner_text()

        def g2_3():
            g2.get_by_role("button", name="BEOBACHTEN").click()
            warte(lambda: g2.locator(".eintrag", has_text="zurückgestellt").count() == 1, 10, "zurückgestellt sichtbar")

        def g2_4():
            kat = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "daten", "katalog_wirkmittel.json"),
                                 encoding="utf-8"))
            lm = next(w["bestand"] for w in kat["wirkmittel"] if w["id"] == "LM")      # vor der Freigabe noch voller Bestand
            text = g2.locator("label[data-wm=LM]").get_by_text("übrig").inner_text().strip()
            assert text.startswith(str(lm)), text

        for n, f in [("G2-1 bekämpfen ohne Warnung", g2_1), ("G2-2 Warnung R3", g2_2), ("G2-3 zurückstellen", g2_3),
                     ("G2-4 Bestand LM", g2_4)]:
            aufgabe(n, f)

        # G3 (M01 liegt vor; für ZURÜCK braucht G3 eine zweite Empfehlung)
        g2.locator(".eintrag", has_text="M03").click()
        g2.get_by_text("Loitering Munition (Präzision)").click()
        g2.get_by_role("button", name="BEKÄMPFEN mit LM").click()

        def g3_1():
            g3.get_by_role("button", name="Gelesen").first.click()
            warte(lambda: g3.get_by_text("gelesen ✓").count() >= 1, 10, "quittiert")

        def g3_2():
            g3.locator(".eintrag", has_text="M01").click()
            g3.get_by_role("button", name="FREIGABE").click()
            warte(lambda: g3.locator(".eintrag.gedimmt", has_text="M01").count() == 1, 10, "M01 im Verlauf")
            assert "Wirkung läuft" in g3.locator(".eintrag.gedimmt", has_text="M01").inner_text()

        def g3_3():
            g3.get_by_placeholder("Hinweis an G1 und G2").fill("Schule NS-01 ist belegt")
            g3.get_by_label("G1", exact=True).uncheck()
            g3.get_by_role("button", name="Senden").click()
            warte(lambda: g2.get_by_text("Schule NS-01 ist belegt").count() == 1, 10, "Hinweis bei G2")
            assert g1.get_by_text("Schule NS-01 ist belegt").count() == 0

        def g3_4():
            warte(lambda: g3.locator(".eintrag:not(.gedimmt)", has_text="M03").count() == 1, 10, "M03 bei G3")
            g3.locator(".eintrag", has_text="M03").first.click()
            g3.get_by_role("button", name="ZURÜCK AN G2").click()
            warte(lambda: g2.locator(".eintrag:not(.gedimmt)", has_text="M03").count() == 1, 10, "M03 wieder bei G2")

        def g3_5():
            g3.get_by_role("button", name="einschalten").click()
            warte(lambda: g3.get_by_test_id("fasttrack-status").inner_text() == "EIN", 10, "EIN")
            g3.get_by_role("button", name="ausschalten").click()
            warte(lambda: g3.get_by_test_id("fasttrack-status").inner_text() == "AUS", 10, "AUS")

        for n, f in [("G3-1 Lagemeldung gelesen", g3_1), ("G3-2 Freigabe", g3_2), ("G3-3 Hinweis nur an G2", g3_3),
                     ("G3-4 zurück an G2", g3_4), ("G3-5 Fast-Track ein/aus", g3_5)]:
            aufgabe(n, f)
        browser.close()

    for n, ok, dt, fehler in ergebnis:
        print(f"{'OK  ' if ok else 'FEHL'} {n:32s} {dt:4.1f} s {fehler}")
    if not all(ok for _, ok, _, _ in ergebnis):
        sys.exit(1)
    print(f"OK – alle {len(ergebnis)} Aufgaben des Bedientests über die sichtbare Oberfläche lösbar")


if __name__ == "__main__":
    main()
