#!/usr/bin/env python3
"""Probe Schritt 7 „Live-Lage“: Effekte, Bewegung, Tracking, Verstärkung – nur über sichtbare Bedienelemente.

Teil A – ein Team im Direktaufruf (SL, G1, G2, G3, Plenum; lokaler Sync), Uhr über die Steuerung der SL:
  A1  Verstärkung V-1 um 10:04:00 über „einspielen“ in der Teamansicht der SL → im Protokoll, V1-M1 kommt bei G1.
  A2  Feindartillerie H-01 (10:05:04, angehalten): Einschläge am Westrand auf Kontrollkarte und Plenum.
  A3  Eine Meldung durch die Kette (G1 annehmen, G2 LM, G3 Freigabe) – über die Knöpfe; LM fliegt sichtbar vom
      Westrand zum vorausberechneten Einschlagort (G2, G3, SL), Warnung „Freigabe jetzt: Einschlag …“ bei G3.
  A4  V-2 um 10:08:00 gesperrt (käme Schule/Sanität zu nahe): Knopf gesperrt, Grund im Text.
  A5  Leuchtspur der eigenen PzAbw auf Z-11 (H-02, 10:09:15,8, angehalten), danach Nebel H-03 und brennendes Wrack
      an der Brücke (10:10:00, Kontrollkarte gezoomt mit Sprites).
  A6  Bildrate: 10:13:30–10:14:20 bei Tempo ×1 (Feindartillerie H-04, Bewegung, Flug) in SL, G2, G3 und Plenum.
  A7  Z-24 außer Gefecht (10:19:35): Zustands-Sprite „Kette ab“, kein Brand.
  A8  E-01 (10:23:30,3, angehalten): Mündungsblitz am PT-91, Treffer auf Z-27; Auflösung im Plenum.
Teil B – Sitzung mit zwei Teams, Übersicht der Spielleitung:
  B1  Menü „Verstärkung ▾“: V-1 „an alle“ → in beiden Protokollen; V-3 nur an Team B; Zeile zeigt „+n V“.
  B2  V-2 um 10:08:00 für alle gesperrt.
Teil C – Bildrate der Kontrollkarte allein (wie am Rechner der Spielleitung), Tempo ×1 und ×10, gezoomt mit Sprites.
Jede Ansicht in 1530 × 800 ohne Rollbalken, keine Konsolenfehler. Fotos in --bilder.
Karten mit WebGL über SwiftShader (Standard) oder im Rückfall Canvas (--renderer canvas).

Aufruf (nach `npm run build` und `npx vite preview --port 4173`):
  python3 tools/livelage_probe.py http://localhost:4173/ --bilder livelage-bilder
"""
import argparse
import json
import os
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

W, H = 1530, 800
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
  for (const el of document.querySelectorAll('.stapel, .inhalt, main')) {
    if (el.scrollHeight > el.clientHeight + 2) zuGross.push(`${el.className}: Höhe ${el.scrollHeight} > ${el.clientHeight}`);
  }
  return { seite: [de.scrollWidth, de.scrollHeight], zuGross };
}
"""
KARTE_JS = """
(id) => { const e = document.querySelector(`[data-testid=${id}] .karte-leinwand`); return e && e.argusKarte ? e.argusKarte.diagnose : null }
"""


def warte(bedingung, sek=15, text="Bedingung"):
    ende = time.time() + sek
    letzter = None
    while time.time() < ende:
        try:
            if bedingung():
                return
        except Exception as e:  # noqa: BLE001
            letzter = e
        time.sleep(0.05)
    raise AssertionError(f"{text} nicht erfüllt nach {sek} s" + (f" ({letzter})" if letzter else ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("basis")
    ap.add_argument("--bilder", default="livelage-bilder")
    ap.add_argument("--raum", default=f"live-{int(time.time()) % 100000}")
    ap.add_argument("--renderer", choices=["webgl", "canvas"], default="webgl",
                    help="WebGL (SwiftShader, Standard) oder Rückfall Canvas (ohne GPU-Prozess)")
    a = ap.parse_args()
    os.makedirs(a.bilder, exist_ok=True)
    fehler, konsole, messung = [], [], {}
    t0 = time.time()

    def url(**q):
        sep = "&" if "?" in a.basis else "?"
        return f"{a.basis}{sep}{urllib.parse.urlencode({'sync': 'lokal', **q})}"

    with sync_playwright() as p:
        grafik = (["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] if a.renderer == "webgl"
                  else ["--disable-gpu", "--disable-software-rasterizer"])
        browser = p.chromium.launch(args=[*grafik, "--disable-background-timer-throttling",
                                          "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"])
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)

        def seite(name, adresse):
            s = ctx.new_page()
            s.on("console", lambda m, n=name: konsole.append(f"{n}: {m.type}: {m.text}") if m.type in ("error", "warning") else None)
            s.on("pageerror", lambda e, n=name: konsole.append(f"{n}: pageerror: {e}"))
            s.goto(adresse)
            return s

        def foto(s, name):
            lay = s.evaluate(LAYOUT_JS)
            if lay["seite"][0] > W or lay["seite"][1] > H:
                fehler.append(f"{name}: Seite {lay['seite']} größer als {W}×{H}")
            for z in lay["zuGross"]:
                fehler.append(f"{name}: abgeschnitten – {z}")
            s.screenshot(path=os.path.join(a.bilder, f"{name}.png"))

        def pruefe(bed, text):
            if not bed:
                fehler.append(text)
                print("  ✗", text)
            else:
                print("  ✓", text)

        # ---------------------------------------------------------------- Teil A
        print(f"Teil A – ein Team, Direktaufruf ({a.renderer})")
        sl = seite("SL", url(rolle="sl", raum=a.raum, name="SL 1"))
        warte(lambda: sl.locator(".rahmen[data-host='1']").count() == 1, 30, "SL steuert")
        g1, g2, g3, pl = (seite(r.upper(), url(rolle=r, raum=a.raum)) for r in ["g1", "g2", "g3", "plenum"])
        for s, r in [(g1, "g1"), (g2, "g2"), (g3, "g3")]:
            warte(lambda: s.locator(f"[data-testid=einweisung-{r}]").count() == 1, 20, f"Einweisung {r}")
            s.get_by_test_id("einweisung-schliessen").click()
        for s, k in [(sl, "kontrollkarte"), (g2, "lagekarte"), (g3, "lagekarte")]:
            warte(lambda: s.locator(f"[data-testid={k}][data-bereit='1']").count() == 1, 20, f"Karte {k} bereit")

        def zustand():
            return sl.evaluate("() => { const z = window.argus.stand.zustand; return { t: window.argus.spielzeit(), laeuft: z.uhr.laeuft, v: z.verstaerkungen, h: z.hintergrund, zerstoert: z.zerstoert, ereignisse: z.ereignisse, meldungen: Object.fromEntries(Object.entries(z.meldungen).map(([k, m]) => [k, m.stufe])), ende: z.ende } }")

        def zeit(mmss, tempo=None):
            if zustand()["laeuft"]:
                sl.get_by_role("button", name="❚❚ Anhalten").click()
                warte(lambda: not zustand()["laeuft"], 5, "Uhr steht")
            sl.fill("[data-testid=sl-zeit]", mmss)
            sl.get_by_role("button", name="Spielzeit setzen").click()
            m, s_ = mmss.split(":")
            warte(lambda: abs(zustand()["t"] - (int(m) * 60 + float(s_))) < 0.3, 5, f"Spielzeit {mmss}")
            if tempo:
                sl.get_by_role("button", name=f"×{tempo}", exact=True).click()

        def laufen_bis(t_ziel, sek=60):
            sl.get_by_role("button", name="▶ Start").click()
            warte(lambda: zustand()["t"] >= t_ziel, sek, f"Spielzeit {t_ziel}")
            sl.get_by_role("button", name="❚❚ Anhalten").click()
            warte(lambda: not zustand()["laeuft"], 5, "Uhr steht")

        # A1 Verstärkung über die Teamansicht der SL
        zeit("04:00", tempo=1)
        knopf = sl.locator("[data-verstaerkung-sl=V-1] button", has_text="einspielen")
        knopf.click()
        warte(lambda: any(v["gruppe"] == "V-1" for v in zustand()["v"]), 5, "V-1 im Protokoll")
        v1 = next(v for v in zustand()["v"] if v["gruppe"] == "V-1")
        pruefe(abs(v1["t0"] - 240) < 1, f"A1 V-1 eingespielt um t0 = {v1['t0']} s (10:04:00)")
        foto(sl, "A1_sl_verstaerkung")

        # A2 Feindartillerie H-01
        zeit("04:58", tempo=1)
        laufen_bis(304.4)
        sl.wait_for_timeout(500)
        pl.wait_for_timeout(300)
        foto(sl, "A2_sl_feindartillerie")
        foto(pl, "A2_plenum_feindartillerie")
        d = sl.evaluate(KARTE_JS, "kontrollkarte")
        pruefe(d and d["effektAtlas"] and "einschlag_artillerie" in d["animationen"], f"A2 Effekt-Atlas geladen ({len(d['animationen']) if d else 0} Animationen)")
        dp = pl.evaluate(KARTE_JS, "lagekarte")
        pruefe(dp and dp["effekte"] >= 7, f"A2 Plenum zeigt das Gefecht ringsum ({dp['effekte'] if dp else 0} Effekte)")

        # A3 Kette über die Knöpfe, LM im Flug
        warte(lambda: g1.get_by_test_id("g1-offen").inner_text() != "0", 10, "Meldung bei G1")
        offen = g1.evaluate("() => window.argus.stand.zustand.reihenfolge.filter((id) => window.argus.stand.zustand.meldungen[id].stufe === 'g1')")
        mid = offen[-1]
        g1.locator(f".kmarke[data-meldung={mid}]").first.click()
        g1.get_by_test_id("g1-annehmen").click()
        warte(lambda: g2.locator(f".kmarke[data-meldung={mid}]").count() > 0, 10, f"{mid} bei G2")
        g2.locator(f".kmarke[data-meldung={mid}]").first.click()
        g2.locator("label[data-wm=LM]").click()
        g2.wait_for_timeout(400)
        banner = g2.get_by_test_id("karte-banner").inner_text()
        pruefe("Einschlag" in banner, f"A3 G2 rechnet den Einschlag voraus: „{banner}“")
        foto(g2, "A3_g2_vorschau_lm")
        g2.get_by_test_id("g2-bekaempfen").click()
        warte(lambda: g3.locator(f".kmarke[data-meldung={mid}]").count() > 0, 10, f"{mid} bei G3")
        g3.locator(f".kmarke[data-meldung={mid}]").first.click()
        g3.wait_for_timeout(300)
        jetzt = g3.get_by_test_id("g3-jetzt").inner_text()
        pruefe("Freigabe jetzt: Einschlag" in jetzt, f"A3 G3 sieht die Warnung zum Einschlag: „{jetzt.splitlines()[0]}“")
        g3.get_by_test_id("g3-freigabe").click()
        warte(lambda: zustand()["meldungen"].get(mid) == "wirkung", 10, f"{mid} freigegeben")
        einschlag = sl.evaluate(f"() => window.argus.stand.zustand.meldungen['{mid}'].g3.einschlag")
        t_frei = zustand()["t"]
        laufen_bis(t_frei + 18)
        for s, n in [(sl, "sl"), (g2, "g2"), (g3, "g3")]:
            s.wait_for_timeout(400)
            foto(s, f"A3_{n}_lm_im_flug")
        pruefe(einschlag["t"] > t_frei + 25, f"A3 LM: Freigabe {t_frei:.1f} s, Einschlag {einschlag['t']:.1f} s am vorausberechneten Ort {einschlag['pos']}")
        laufen_bis(einschlag["t"] + 0.4)
        sl.wait_for_timeout(300)
        foto(sl, "A3_sl_einschlag_lm")
        laufen_bis(einschlag["t"] + 2)
        w = sl.evaluate(f"() => window.argus.stand.zustand.meldungen['{mid}'].wirkung")
        pruefe(w and abs(w["t_einschlag"] - einschlag["t"]) < 0.05 and w["pos"] == einschlag["pos"], f"A3 Einschlag wie vorausberechnet: {w and w['getroffen']}")

        # A4 V-2 gesperrt
        zeit("08:00", tempo=1)
        sl.wait_for_timeout(600)
        knopf2 = sl.locator("[data-verstaerkung-sl=V-2] button", has_text="einspielen")
        text2 = sl.locator("[data-verstaerkung-sl=V-2]").inner_text()
        pruefe(knopf2.is_disabled() and "gesperrt" in text2, f"A4 V-2 um 10:08:00 gesperrt: „{text2.splitlines()[-2] if len(text2.splitlines()) > 1 else text2}“")

        # A5 Leuchtspur H-02, Nebel H-03, Wrack Z-11
        zeit("09:12", tempo=1)
        laufen_bis(555.75)
        sl.wait_for_timeout(300)
        foto(sl, "A5_sl_leuchtspur_h02")
        zeit("10:00", tempo=1)
        sl.wait_for_timeout(500)
        foto(sl, "A5_sl_nebel_wrack")
        foto(pl, "A5_plenum_nebel")
        foto(g2, "A5_g2_tracking")
        sl.evaluate("() => document.querySelector('[data-testid=kontrollkarte] .karte-leinwand').argusKarte.zeigeAuf([520, 330], 4)")
        sl.wait_for_timeout(1500)
        foto(sl, "A5_sl_bruecke_gezoomt")
        sl.evaluate("() => document.querySelector('[data-testid=kontrollkarte] .karte-leinwand').argusKarte.ganzeKarte()")
        pruefe(zustand()["h"].get("H-02", {}).get("wirkt") is True and "Z-11" in zustand()["zerstoert"], "A5 H-02 wirkt, Z-11 zerstört (Wrack brennt)")

        # A6 Bildrate bei laufender Uhr
        zeit("13:30", tempo=1)
        sl.get_by_role("button", name="▶ Start").click()
        proben = {n: [] for n in ["SL", "G2", "G3", "Plenum"]}
        ende = time.time() + 45
        while time.time() < ende:
            time.sleep(5)
            for n, s, k in [("SL", sl, "kontrollkarte"), ("G2", g2, "lagekarte"), ("G3", g3, "lagekarte"), ("Plenum", pl, "lagekarte")]:
                d = s.evaluate(KARTE_JS, k)
                if d:
                    proben[n].append({"fps": d["fps"], "ms": d["bildMs"]})
        foto(sl, "A6_sl_laufend")
        foto(g2, "A6_g2_laufend")
        sl.get_by_role("button", name="❚❚ Anhalten").click()
        for n, l in proben.items():
            l = l[1:]  # erste Messung enthält den Start
            if not l:
                fehler.append(f"A6 {n}: keine Messung")
                continue
            messung[n] = {"fps_min": min(x["fps"] for x in l), "fps_mittel": round(sum(x["fps"] for x in l) / len(l), 1),
                          "ms_mittel": round(sum(x["ms"]["mittel"] for x in l) / len(l), 1), "ms_max": max(x["ms"]["max"] for x in l)}
            print(f"  A6 {n:<7} {messung[n]['fps_min']}–{max(x['fps'] for x in l)} Bilder/s (Ziel je nach Lage 12–30), Zeichenzeit Ø {messung[n]['ms_mittel']} ms, max {messung[n]['ms_max']} ms")

        # A7 Z-24 außer Gefecht
        zeit("19:35", tempo=1)
        sl.evaluate("() => document.querySelector('[data-testid=kontrollkarte] .karte-leinwand').argusKarte.zeigeAuf([430, 300], 5)")
        sl.wait_for_timeout(1500)
        foto(sl, "A7_sl_z24_kette_ab")
        sl.evaluate("() => document.querySelector('[data-testid=kontrollkarte] .karte-leinwand').argusKarte.ganzeKarte()")
        pruefe(zustand()["h"].get("H-11", {}).get("wirkt") is True and "Z-24" not in zustand()["zerstoert"], "A7 H-11: Z-24 außer Gefecht, nicht zerstört")

        # A8 E-01
        zeit("23:28", tempo=1)
        laufen_bis(1410.25)
        sl.wait_for_timeout(300)
        foto(sl, "A8_sl_e01")
        foto(g3, "A8_g3_e01")
        e01 = zustand()["ereignisse"].get("E-01", {})
        pruefe(e01.get("wirkungen", {}).get("0", {}).get("wirkt") is True, f"A8 E-01: PT-91 trifft Z-27 ({e01.get('wirkungen', {}).get('0')})")
        zeit("24:58", tempo=1)
        sl.get_by_role("button", name="▶ Start").click()
        warte(lambda: zustand()["ende"], 20, "Spielende")
        pl.wait_for_timeout(1500)
        foto(pl, "A8_plenum_aufloesung")
        v1m1 = g1.evaluate("() => window.argus.stand.zustand.meldungen['V1-M1']")
        pruefe(v1m1 is not None, f"A1 V1-M1 ist bei G1 angekommen ({v1m1 and v1m1['stufe']})")
        for s in [sl, g1, g2, g3, pl]:
            s.close()

        # ---------------------------------------------------------------- Teil B
        print("Teil B – zwei Teams, Übersicht der Spielleitung")
        sl = seite("SL-B", url())
        sl.get_by_placeholder("Name, z. B. SL 1").fill("SL 1")
        sl.get_by_role("button", name="Neue Sitzung anlegen").click()
        warte(lambda: sl.locator(".rahmen[data-host='1'][data-ansicht=uebersicht]").count() == 1, 30, "SL steuert")
        code = sl.get_by_test_id("code").inner_text().strip()
        tt = []
        for name in ["Team A", "Team B"]:
            s = seite(name, url())
            s.get_by_label("Code der Sitzung").fill(code)
            s.get_by_role("button", name="Beitreten").click()
            warte(lambda: s.locator("[data-rolle=lobby]").count() == 1, 20, "Lobby")
            s.get_by_placeholder("Teamname").fill(name)
            s.get_by_role("button", name="G1 Aufklärung").click()
            warte(lambda: s.get_by_test_id("lobby-ich").count() == 1, 15, f"{name} erstellt")
            tt.append(s)
        warte(lambda: len(sl.evaluate("() => window.argusTeams()")) == 2, 20, "zwei Teams")
        sl.get_by_test_id("alle-oeffnen").click()
        warte(lambda: all(x["seq"] >= 2 for x in sl.evaluate("() => window.argusTeams()")), 20, "Spiele offen")
        sl.get_by_test_id("alle-zeit").fill("04:00")
        sl.get_by_role("button", name="Spielzeit setzen").click()
        warte(lambda: all(x["uhr"]["t_s"] >= 240 for x in sl.evaluate("() => window.argusTeams()")), 10, "Spielzeit 04:00")
        ids = {x["name"]: x["id"] for x in sl.evaluate("() => window.argusTeams()")}

        def verst(team):
            return [e["daten"]["gruppe"] for e in sl.evaluate("(id) => window.argusSitzung.spiel(id).stand.protokoll", ids[team]) if e["typ"] == "verstaerkung"]

        sl.get_by_test_id("verstaerkung-menue").click()
        sl.wait_for_timeout(300)
        foto(sl, "B1_uebersicht_menue")
        sl.locator("[data-alle=V-1]").click()
        warte(lambda: verst("Team A") == ["V-1"] and verst("Team B") == ["V-1"], 5, "V-1 an alle")
        pruefe(True, "B1 V-1 „an alle“: in beiden Protokollen")
        sl.get_by_test_id("verstaerkung-menue").click()
        sl.locator("[data-team-verstaerkung='Team B:V-3']").click()
        warte(lambda: verst("Team B") == ["V-1", "V-3"], 5, "V-3 an Team B")
        pruefe(verst("Team A") == ["V-1"], "B1 V-3 nur an Team B")
        sl.wait_for_timeout(500)
        za = sl.locator("[data-team-zeile='Team A'] [data-verstaerkungen]").inner_text()
        zb = sl.locator("[data-team-zeile='Team B'] [data-verstaerkungen]").inner_text()
        pruefe("+1 V" in za and "+2 V" in zb, f"B1 Übersicht zeigt eingespielte Verstärkungen ({za.strip()} / {zb.strip()})")
        sl.get_by_test_id("alle-zeit").fill("08:00")
        sl.get_by_role("button", name="Spielzeit setzen").click()
        warte(lambda: all(x["uhr"]["t_s"] >= 480 for x in sl.evaluate("() => window.argusTeams()")), 10, "Spielzeit 08:00")
        sl.get_by_test_id("verstaerkung-menue").click()
        sl.wait_for_timeout(300)
        alle2 = sl.locator("[data-alle=V-2]")
        pruefe(alle2.is_disabled() and "gesperrt" in (alle2.get_attribute("title") or ""), f"B2 V-2 um 10:08:00 gesperrt: „{alle2.get_attribute('title')}“")
        foto(sl, "B2_uebersicht_gesperrt")
        sl.keyboard.press("Escape")
        for x in [sl] + tt:
            x.close()

        # ---------------------------------------------------------------- Teil C
        # Bildrate wie am Rechner der Spielleitung: ein Fenster allein (Kontrollkarte, Gesamtansicht und gezoomt)
        print(f"Teil C – Bildrate der Kontrollkarte allein ({a.renderer})")
        sl = seite("SL-C", url(rolle="sl", raum=f"{a.raum}-c", name="SL 1"))
        warte(lambda: sl.locator(".rahmen[data-host='1']").count() == 1, 30, "SL steuert")
        warte(lambda: sl.locator("[data-testid=kontrollkarte][data-bereit='1']").count() == 1, 20, "Kontrollkarte bereit")
        for tempo, zoom, name in [(1, None, "SL allein ×1"), (10, None, "SL allein ×10"), (1, ([520, 330], 4), "SL allein ×1 gezoomt")]:
            zeit("13:30", tempo=tempo)
            if zoom:
                sl.evaluate("(z) => document.querySelector('[data-testid=kontrollkarte] .karte-leinwand').argusKarte.zeigeAuf(z[0], z[1])", list(zoom))
            sl.get_by_role("button", name="▶ Start").click()
            l = []
            for _ in range(5):
                time.sleep(4)
                d = sl.evaluate(KARTE_JS, "kontrollkarte")
                if d:
                    l.append({"fps": d["fps"], "ms": d["bildMs"]})
            sl.get_by_role("button", name="❚❚ Anhalten").click()
            l = l[1:]
            messung[name] = {"fps_min": min(x["fps"] for x in l), "fps_mittel": round(sum(x["fps"] for x in l) / len(l), 1),
                             "ms_mittel": round(sum(x["ms"]["mittel"] for x in l) / len(l), 1), "ms_max": max(x["ms"]["max"] for x in l)}
            print(f"  C {name:<22} {messung[name]['fps_min']}–{max(x['fps'] for x in l)} Bilder/s (Ziel je nach Lage 12–30), Zeichenzeit Ø {messung[name]['ms_mittel']} ms, max {messung[name]['ms_max']} ms")
            if zoom:
                foto(sl, "C_sl_gezoomt_laufend")
                sl.evaluate("() => document.querySelector('[data-testid=kontrollkarte] .karte-leinwand').argusKarte.ganzeKarte()")
        browser.close()

    with open(os.path.join(a.bilder, "bildrate.json"), "w", encoding="utf-8") as f:
        json.dump(messung, f, indent=1)
    relevante = [k for k in konsole if "favicon" not in k and "GPU stall" not in k and "WebGL" not in k]
    if relevante:
        print("Konsole:", *relevante[:15], sep="\n  ")
        if any("pageerror" in k or ": error:" in k for k in relevante):
            fehler.append("Fehler in der Browserkonsole")
    print(f"Laufzeit {time.time() - t0:.0f} s")
    if fehler:
        print("FEHLER:", *fehler, sep="\n  ")
        sys.exit(1)
    print(f"OK – Live-Lage: Effekte, Tracking, Vorausrechnung, Verstärkung (Teamansicht und Übersicht), alles in {W}×{H}")


if __name__ == "__main__":
    main()
