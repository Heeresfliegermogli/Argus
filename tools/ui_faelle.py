#!/usr/bin/env python3
"""Bildschirmfotos der Schlüsselfälle und Belastungsprobe der Ansicht in 1530 × 800 (seit 2.6: eine Rolle, Zielbearbeitung).

Ergänzt tools/ui_bilder.py (kurzer Ablauf bis S1). Hier:
  • volle Warteschlangen (Spielzeit erst 13:20, dann 20:50 gesetzt: viele Meldungen und Lagemeldungen auf einmal;
    Meldungen, deren Fahrzeuge zerstört oder abgezogen sind, entfallen),
  • die Schlüsselfälle im Drohnenbild mit Vergrößerung auf das entscheidende Detail
    (S2 Rotes Kreuz M12, S4 Kinder M18, S3 drei Panzer M20, N2 weißes Tuch M21),
  • Mörser bei M12 mit mehreren Warnungen am vorausberechneten Einschlagort, BEKÄMPFEN trotz Warnung, ZURÜCKSTELLEN (M18),
  • viele bekämpfte Ziele mit Countdown im Eingang, Feed mit vielen früheren Lagemeldungen, längste Notiz der Spielleitung,
  • Wirkungen mit Fehltreffern auf Kontrollkarte, in der Auswertung und in der Auflösung, Kontrollkarte gezoomt (Sprites).
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

ROLLEN = ["sl", "zb", "plenum"]
NOTIZ_500 = ("Team hat das Rote Kreuz in der Lupe gesehen, aber nicht angesprochen; nach 20 s BEKÄMPFEN mit Mörser trotz Warnung. "
             "Auf Nachfrage: „ARGUS sagt 88 %, das reicht.“ Danach drei Meldungen in 40 s ohne Blick ins Drohnenbild. ") * 3
NOTIZ_500 = NOTIZ_500[:500]


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
            elif r == "zb":
                warte(lambda: pg.get_by_test_id("tour").count() == 1, 15, "Übersicht der Zielbearbeitung")
                pg.get_by_test_id("tour-ueberspringen").click()
                warte(lambda: pg.get_by_test_id("einweisung-zb").count() == 1, 10, "Einweisung der Zielbearbeitung")
                pg.get_by_test_id("einweisung-ueberspringen").click()
        sl, zb, pl = (s[r] for r in ROLLEN)

        def offen():
            return zb.evaluate("() => { const z = window.argus.stand.zustand; return z.reihenfolge.filter((id) => z.meldungen[id].stufe === 'offen' && !z.meldungen[id].zurueckgestellt) }")

        def oeffne(mid):
            zb.locator(f"[data-testid=eingang] [data-meldung={mid}]").click()
            warte(lambda: zb.get_by_test_id("offene-meldung").get_attribute("data-meldung") == mid, 10, f"{mid} offen")

        def lupe(mid, name):
            # Meldung im Eingang öffnen: Drohnenbild live, dann groß mit Lupe auf der ARGUS-Markierung
            oeffne(mid)
            warte(lambda: zb.locator(f"[data-testid=live-fenster][data-meldung={mid}]").count() == 1, 15, f"Live-Bild {mid}")
            zb.wait_for_timeout(700)
            foto(zb, f"zb_{mid}_{name}")
            zb.locator("[data-testid=drohnenbild]").click()
            warte(lambda: zb.evaluate("() => !!document.querySelector('[data-testid=live-gross] canvas.live-leinwand')?.argusLive") is True, 15, f"Vergrößerung {mid}")
            zb.wait_for_timeout(300)
            # Live-Bild: Fahrzeuge können inzwischen weitergefahren sein – erste sichtbare Markierung, sonst Bildmitte
            sichtbar = [r for r in zb.locator("[data-testid=vergroesserung] .argus-rahmen").all() if r.is_visible()]
            box = sichtbar[0].bounding_box() if sichtbar else zb.locator("[data-testid=live-gross]").bounding_box()
            if not sichtbar:
                print(f"  {mid}: Ziel nicht mehr im Bild (live) – Lupe auf die Bildmitte")
            zb.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            zb.wait_for_timeout(250)
            foto(zb, f"zb_{mid}_lupe")
            zb.keyboard.press("Escape")

        # 1) Spielzeit 13:20 bei stehender Uhr: M01–M12 auf einmal, S2 (Sanitätsfahrzeug M12) steht noch
        sl.fill("[data-testid=sl-zeit]", "13:20")
        sl.get_by_text("Spielzeit setzen").click()
        warte(lambda: zb.locator("[data-testid=eingang] [data-meldung=M12]").count() == 1, 20, "M12 im Eingang")
        warte(lambda: zb.locator("[data-testid=lagekarte][data-bereit='1']").count() == 1, 15, "Karte bereit")
        zb.wait_for_timeout(500)
        foto(zb, "zb_eingang_voll")
        lupe("M12", "S2_rotes_kreuz")
        # Mörser bei M12: mehrere Warnungen am vorausberechneten Einschlagort, BEKÄMPFEN trotz Warnung
        zb.locator("label[data-wm=MRS]").click()
        zb.wait_for_timeout(600)
        foto(zb, "zb_M12_moerser_warnungen")
        if "trotz Warnung" not in zb.get_by_test_id("zb-bekaempfen").inner_text():
            fehler.append("M12 mit Mörser: Knopf ohne „trotz Warnung“")
        zb.get_by_test_id("zb-bekaempfen").click()
        warte(lambda: zb.locator("[data-unterwegs=M12]").count() == 1, 10, "M12 bekämpft (Countdown im Eingang)")
        for mid in offen():
            senden(zb, "entscheid", {"meldung": mid, "entscheid": "ablehnen"})
        warte(lambda: zb.get_by_test_id("eingang-zahl").inner_text() == "0", 15, "Eingang leer")

        # 2) Spielzeit 20:50: M13–M21 und die Lagemeldungen bis I-06 kommen dazu (S4 Kinder M18, S3 PT-91 M20, N2 weißes Tuch M21)
        sl.fill("[data-testid=sl-zeit]", "20:50")
        sl.get_by_text("Spielzeit setzen").click()
        warte(lambda: zb.locator("[data-testid=eingang] [data-meldung=M21]").count() == 1, 20, "M21 im Eingang")
        zb.wait_for_timeout(500)
        for mid, name in [("M18", "S4_kinder"), ("M20", "S3_pt91"), ("M21", "N2_weisses_tuch")]:
            lupe(mid, name)
        # M18 zurückstellen (Zivilpersonen), M20 mit Mörser, M21 und die übrigen mit LM bekämpfen
        oeffne("M18")
        zb.get_by_test_id("zb-zurueckstellen").click()
        warte(lambda: zb.get_by_test_id("zurueck-zahl").count() == 1, 10, "M18 zurückgestellt")
        senden(zb, "entscheid", {"meldung": "M20", "entscheid": "bekaempfen", "wirkmittel": "MRS"})
        senden(zb, "entscheid", {"meldung": "M21", "entscheid": "bekaempfen", "wirkmittel": "LM"})
        weitere = [m for m in offen() if m not in ("M18", "M20", "M21")]
        for mid in weitere[:4]:
            senden(zb, "entscheid", {"meldung": mid, "entscheid": "bekaempfen", "wirkmittel": "LM"})
        zb.wait_for_timeout(600)
        foto(zb, "zb_einschlaege_countdown")
        # frühere Lagemeldungen aufklappen (viele auf einmal)
        warte(lambda: zb.get_by_test_id("feed-frueher").is_enabled(), 20, "frühere Lagemeldungen")
        zb.get_by_test_id("feed-frueher").click()
        zb.locator(".feed-liste .feed-meldung").first.click()
        zb.wait_for_timeout(400)
        foto(zb, "zb_feed_frueher")
        oeffne("M18")
        zb.wait_for_timeout(500)
        foto(zb, "zb_M18_zurueckgestellt")

        # Längste Notiz der Spielleitung (500 Zeichen) zu S2 – erscheint in der Auswertung beim Fall
        sl.get_by_test_id("notiz-knopf").click()
        sl.locator("[data-notiz-fall='S2']").click()
        sl.get_by_test_id("notiz-text").fill(NOTIZ_500)
        foto(sl, "sl_notiz_lang")
        sl.get_by_test_id("notiz-text").press("Enter")

        # Wirkungen abwarten (Mörser ca. 35 s, LM ca. 40 s) mit Tempo ×20, dann I-08a
        sl.get_by_role("button", name="×20").click()
        sl.get_by_role("button", name="▶ Start").click()
        warte(lambda: sum(1 for e in protokoll(sl) if e["typ"] == "wirkung") >= 4, 40, "vier Wirkungen")
        warte(lambda: any(e["typ"] == "inject" and e["daten"].get("inject") == "I-08a" for e in protokoll(sl)), 30, "I-08a")
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
        foto(zb, "zb_karte_bekaempft")

        # Spielende → Auswertung im Plenum, dann von Hand zur Auflösung des Teams
        sl.fill("[data-testid=sl-zeit]", "24:59")
        sl.get_by_text("Spielzeit setzen").click()
        sl.get_by_role("button", name="▶ Start").click()
        warte(lambda: pl.locator("[data-ansicht=auswertung] [data-testid=teamvergleich]").count() == 1, 30, "Auswertung im Plenum")
        pl.wait_for_timeout(1200)
        foto(pl, "plenum_auswertung_teamvergleich")
        # S2 mit der langen Notiz
        pl.locator("[data-kapitel='S2']").first.click()
        warte(lambda: pl.locator("section.replay[data-fall='S2']").count() == 1, 10, "Replay S2")
        pl.wait_for_timeout(800)
        if NOTIZ_500[:60] not in pl.get_by_test_id("notizen-sl").inner_text():
            fehler.append("Auswertung S2: lange Notiz der Spielleitung fehlt")
        foto(pl, "plenum_auswertung_S2_notiz")
        pl.get_by_test_id("auswertung-zurueck").click()
        warte(lambda: pl.locator("main[data-modus=aufloesung]").count() == 1, 30, "Auflösung im Plenum")
        pl.wait_for_timeout(1800)
        foto(pl, "plenum_aufloesung_fehltreffer")
        foto(zb, "zb_spielende")
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
