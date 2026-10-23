#!/usr/bin/env python3
"""Bildschirmfotos der Schlüsselfälle und Belastungsprobe der Ansichten in 1530 × 800.

Ergänzt tools/ui_bilder.py (kurzer Ablauf bis S1). Hier:
  • volle Warteschlangen (Spielzeit erst 13:20, dann 20:50 gesetzt: viele Meldungen und Lagemeldungen auf einmal;
    seit Schritt 7 entfallen Meldungen, deren Fahrzeuge zerstört oder abgezogen sind),
  • längste erlaubte Texte (Vermerk, Begründung, Bemerkung, Lagehinweis),
  • die Schlüsselfälle im Drohnenbild von G1 mit Vergrößerung auf das entscheidende Detail
    (S2 Rotes Kreuz M12, S4 Kinder M18, S3 drei Panzer M20, N2 weißes Tuch M21),
  • G2 mit mehreren Warnungen (Mörser bei M12) und BEOBACHTEN, G3 mit Regelwarnung,
  • Wirkungen mit Fehltreffern auf Kontrollkarte und in der Auflösung, Kontrollkarte gezoomt (Sprites).
Prüft wie ui_bilder.py: kein Rollbalken, nichts abgeschnitten, keine Fehler in der Konsole.

Aufruf (nach `npm run build` und `npx vite preview --port 4173`):
  python3 tools/ui_faelle.py http://localhost:4173/ --bilder ui-faelle
"""
import argparse
import os
import sys
import time

from playwright.sync_api import sync_playwright

from ui_bilder import LAYOUT_JS, H, W, adresse, warte

ROLLEN = ["sl", "g1", "g2", "g3", "plenum"]
LANG_120 = ("Rotes Kreuz auf dem Dach, zwei Personen am Heck – vermutlich Sanitätsfahrzeug, bitte Rückfrage vor jeder Bekämpfung!!")[:120]
LANG_240 = ("Feuerverbot entlang Feldweg Süd und Brücke Ost ab sofort: polnische PT-91 treten um 10:19 von Süden zum Gegenangriff an. "
            "Jede Meldung aus diesem Raum vor der Empfehlung mit G3 abstimmen, auch bei hoher Konfidenz von ARGUS. Rückfragen an G3.")[:240]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("basis")
    ap.add_argument("--bilder", default="ui-faelle")
    ap.add_argument("--raum", default=f"faelle-{int(time.time()) % 100000}")
    a = ap.parse_args()
    os.makedirs(a.bilder, exist_ok=True)
    fehler, konsole = [], []

    def foto(s, name):
        lay = s.evaluate(LAYOUT_JS)
        if lay["seite"][0] > W or lay["seite"][1] > H:
            fehler.append(f"{name}: Seite {lay['seite']} größer als {W}×{H}")
        for z in lay["zuGross"]:
            fehler.append(f"{name}: abgeschnitten – {z}")
        s.screenshot(path=os.path.join(a.bilder, f"{name}.png"))
        print("Foto", name, "OK" if not lay["zuGross"] else lay["zuGross"])

    def senden(s, typ, daten):
        s.evaluate("([t, d]) => window.argus.senden(t, d)", [typ, daten])

    def protokoll(s):
        return s.evaluate("() => window.argus.stand.protokoll")

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
        s = {}
        for r in ROLLEN:
            pg = ctx.new_page()
            pg.on("console", lambda m, r=r: konsole.append(f"{r}: {m.type}: {m.text}") if m.type in ("error", "warning") else None)
            pg.on("pageerror", lambda e, r=r: konsole.append(f"{r}: pageerror: {e}"))
            pg.goto(adresse(a.basis, r, a.raum))
            s[r] = pg
            if r == "sl":
                warte(lambda: pg.locator(".rahmen[data-host='1']").count() == 1, 20, "SL steuert")
            elif r != "plenum":
                warte(lambda: pg.locator(f"[data-testid=einweisung-{r}]").count() == 1, 10, f"Einweisung {r}")
                pg.get_by_test_id("einweisung-schliessen").click()
        sl, g1, g2, g3, pl = (s[r] for r in ROLLEN)

        def offen(stufe):
            return g1.evaluate("(st) => window.argus.stand.zustand.reihenfolge.filter((id) => window.argus.stand.zustand.meldungen[id].stufe === st)", stufe)

        def lupe(mid, name):
            # Marke öffnen: Drohnenbild live am Ort, dann groß mit Lupe auf der ARGUS-Markierung
            g1.locator(f".kmarke[data-meldung={mid}]").first.click()
            warte(lambda: g1.locator(f"[data-testid=live-fenster][data-meldung={mid}]").count() == 1, 15, f"Live-Bild {mid}")
            g1.wait_for_timeout(700)
            foto(g1, f"g1_{mid}_{name}")
            g1.locator("[data-testid=drohnenbild]").click()
            warte(lambda: g1.evaluate("() => !!document.querySelector('[data-testid=live-gross] canvas.live-leinwand')?.argusLive") is True, 15, f"Vergrößerung {mid}")
            g1.wait_for_timeout(300)
            # Live-Bild: Fahrzeuge können inzwischen weitergefahren sein – erste sichtbare Markierung, sonst Bildmitte
            sichtbar = [r for r in g1.locator("[data-testid=vergroesserung] .argus-rahmen").all() if r.is_visible()]
            box = sichtbar[0].bounding_box() if sichtbar else g1.locator("[data-testid=live-gross]").bounding_box()
            if not sichtbar:
                print(f"  {mid}: Ziel nicht mehr im Bild (live) – Lupe auf die Bildmitte")
            g1.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            g1.wait_for_timeout(250)
            foto(g1, f"g1_{mid}_lupe")
            g1.keyboard.press("Escape")

        # Seit Schritt 7 entfallen Meldungen, deren Fahrzeuge zerstört oder abgezogen sind. Deshalb zwei Sprünge:
        # 1) Spielzeit 13:20 bei stehender Uhr: M01–M12 auf einmal, S2 (Sanitätsfahrzeug M12) steht noch
        sl.fill("[data-testid=sl-zeit]", "13:20")
        sl.get_by_text("Spielzeit setzen").click()
        warte(lambda: g1.locator(".kmarke[data-meldung=M12]").count() > 0, 20, "M12 bei G1")
        g1.wait_for_timeout(500)
        lupe("M12", "S2_rotes_kreuz")
        for mid in offen("g1"):
            daten = {"meldung": mid, "entscheid": "annehmen"}
            if mid == "M12":
                daten["vermerk"] = LANG_120
            senden(g1, "g1_entscheid", daten)
        warte(lambda: g1.locator("[data-testid=g1-offen]").inner_text() == "0", 15, "G1 leer")

        # G2: viele Marken auf der Karte, M12 mit Mörser (mehrere Warnungen, am vorausberechneten Einschlagort) und längster Begründung
        warte(lambda: g2.locator("[data-testid=lagekarte][data-bereit='1']").count() == 1, 15, "G2-Karte bereit")
        g2.locator(".kmarke[data-meldung=M12]").first.click()
        g2.locator("label[data-wm=MRS]").click()
        g2.fill("[data-testid=g2-begruendung]", LANG_120)
        g2.wait_for_timeout(600)
        foto(g2, "g2_M12_moerser_warnungen")
        g2.get_by_test_id("g2-bekaempfen").click()
        warte(lambda: g2.locator(".kmarke[data-meldung=M12]").count() == 0, 10, "M12 empfohlen")

        # G3: M12 mit Regelwarnung und „Freigabe jetzt: Einschlag …“, längster Lagehinweis, Freigabe (Fehltreffer)
        warte(lambda: g3.locator(".kmarke[data-meldung=M12]").count() > 0, 15, "M12 bei G3")
        g3.locator(".kmarke[data-meldung=M12]").first.click()
        g3.fill("[data-testid=g3-lagehinweis]", LANG_240)
        g3.wait_for_timeout(600)
        foto(g3, "g3_M12_warnung")
        g3.get_by_role("button", name="Senden").click()
        g3.locator("input.feld").first.fill(LANG_120)
        g3.get_by_test_id("g3-freigabe").click()
        warte(lambda: g3.locator(".kmarke[data-meldung=M12]").count() == 0, 10, "M12 freigegeben")

        # 2) Spielzeit 20:50: M13–M21 und die Injects bis I-06 kommen dazu (S4 Kinder M18, S3 PT-91 M20, N2 weißes Tuch M21)
        sl.fill("[data-testid=sl-zeit]", "20:50")
        sl.get_by_text("Spielzeit setzen").click()
        warte(lambda: g1.locator(".kmarke[data-meldung=M21]").count() > 0, 20, "M21 bei G1")
        g1.wait_for_timeout(500)
        for mid, name in [("M18", "S4_kinder"), ("M20", "S3_pt91"), ("M21", "N2_weisses_tuch")]:
            lupe(mid, name)
        for mid in offen("g1"):
            senden(g1, "g1_entscheid", {"meldung": mid, "entscheid": "annehmen"})
        warte(lambda: g1.locator("[data-testid=g1-offen]").inner_text() == "0", 15, "G1 leer")
        g2.wait_for_timeout(500)
        foto(g2, "g2_viele_marken")
        senden(g2, "g2_empfehlung", {"meldung": "M18", "empfehlung": "beobachten", "begruendung": "Zivilpersonen am Mörser"})
        senden(g2, "g2_empfehlung", {"meldung": "M20", "empfehlung": "bekaempfen", "wirkmittel": "MRS"})
        senden(g2, "g2_empfehlung", {"meldung": "M21", "empfehlung": "bekaempfen", "wirkmittel": "LM"})
        weitere = [m for m in offen("g2") if m not in ("M18", "M20", "M21")]
        for mid in weitere:
            senden(g2, "g2_empfehlung", {"meldung": mid, "empfehlung": "bekaempfen", "wirkmittel": "LM"})
        warte(lambda: g3.locator(".kmarke[data-meldung=M21]").count() > 0, 15, "Empfehlungen bei G3")
        g2.locator(".kmarke[data-meldung=M18]").first.click()
        g2.wait_for_timeout(500)
        foto(g2, "g2_M18_zurueckgestellt")

        g3.wait_for_timeout(600)
        foto(g3, "g3_postfach_voll")
        for mid in ["M20", "M21"] + weitere[:2]:
            senden(g3, "g3_entscheid", {"meldung": mid, "entscheid": "freigabe"})
        for i in ["I-01", "I-02", "I-03"]:
            senden(g3, "inject_quittiert", {"inject": i})
        g3.wait_for_timeout(800)
        foto(g3, "g3_nach_freigaben")
        foto(g1, "g1_lagehinweis_lang")
        foto(g2, "g2_lagehinweis_lang")

        # Wirkungen abwarten (Mörser ca. 35 s, LM ca. 40 s) mit Tempo ×20, dann I-08a
        sl.get_by_role("button", name="×20").click()
        sl.get_by_role("button", name="▶ Start").click()
        warte(lambda: sum(1 for e in protokoll(sl) if e["typ"] == "wirkung") >= 4, 40, "vier Wirkungen")
        warte(lambda: any(e["typ"] == "inject" and e["daten"]["inject"] == "I-08a" for e in protokoll(sl)), 30, "I-08a")
        sl.get_by_role("button", name="❚❚ Anhalten").click()
        sl.wait_for_timeout(900)
        foto(sl, "sl_wirkungen")
        karte = sl.locator("[data-testid=kontrollkarte] canvas")
        kb = karte.bounding_box()
        # auf die Brücke ELSTER zoomen (Weltpunkt ca. 480/440 m), bis Sprites und Luftbild-Kacheln erscheinen
        karte.dblclick(position={"x": kb["width"] * 0.48, "y": kb["height"] * 0.6})
        for _ in range(2):
            sl.get_by_role("button", name="Hineinzoomen").click()
        sl.wait_for_timeout(2500)
        foto(sl, "sl_kontrollkarte_zoom")
        foto(g2, "g2_karte_bekaempft")

        # Spielende → Auswertung im Plenum (Schritt 8), dann von Hand zur Auflösung des Teams
        sl.fill("[data-testid=sl-zeit]", "24:59")
        sl.get_by_text("Spielzeit setzen").click()
        sl.get_by_role("button", name="▶ Start").click()
        warte(lambda: pl.locator("[data-ansicht=auswertung] [data-testid=teamvergleich]").count() == 1, 30, "Auswertung im Plenum")
        pl.wait_for_timeout(1200)
        foto(pl, "plenum_auswertung_teamvergleich")
        pl.get_by_test_id("auswertung-zurueck").click()
        warte(lambda: pl.locator("main[data-modus=aufloesung]").count() == 1, 30, "Auflösung im Plenum")
        pl.wait_for_timeout(1800)
        foto(pl, "plenum_aufloesung_fehltreffer")
        foto(g3, "g3_spielende")
        browser.close()

    relevante = [k for k in konsole if "favicon" not in k and "GPU stall" not in k and "WebGL" not in k]
    if relevante:
        print("Konsole:", *relevante[:15], sep="\n  ")
        if any("pageerror" in k or ": error:" in k for k in relevante):
            fehler.append("Fehler in der Browserkonsole")
    if fehler:
        print("FEHLER:", *fehler, sep="\n  ")
        sys.exit(1)
    print(f"OK – {len(os.listdir(a.bilder))} Bilder in {a.bilder}, kein Rollbalken, nichts abgeschnitten")


if __name__ == "__main__":
    main()
