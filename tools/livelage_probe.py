#!/usr/bin/env python3
"""Probe Schritt 7 „Live-Lage“: Effekte, Bewegung, Tracking, Verstärkung – über die sichtbare Oberfläche (seit 2.6 eine Rolle).

Teil A – ein Team im Direktaufruf (SL, Zielbearbeitung, Plenum; lokaler Sync), Uhr über die Steuerung der SL:
  A1  Verstärkung V-1 um 04:00 (das Menü der SL ist seit 2.6 ausgeblendet, H6/E1.1 – eingespielt über die Sitzung) → im
      Protokoll, V1-M1 kommt in den Eingang der Zielbearbeitung.
  A2  Feindartillerie H-01 (05:04, angehalten): Einschläge am Westrand auf Kontrollkarte und Plenum.
  A3  Eine Meldung mit LM bekämpfen – über die Knöpfe; die Vorschau rechnet den Einschlag voraus („Einschlag in m:ss“),
      die LM fliegt sichtbar vom Westrand zum vorausberechneten Einschlagort (Zielbearbeitung, SL) und trifft dort.
  A4  V-2 um 07:00 gesperrt (käme Schule/Sanität zu nahe, Szenario 2.1): die Aktion wird mit Grund abgelehnt.
  A4b Mörser Z-06 feuert nach Schussrhythmus (seit 2.5 Feuerstöße; Mündungsblitz, Abschussrauch), fahrende Fahrzeuge wirbeln Staub auf.
  A5  Leuchtspur der eigenen PzAbw auf Z-11 (H-02, 09:15,8, angehalten), danach Nebel H-03 und brennendes Wrack
      an der Brücke (10:00, Kontrollkarte gezoomt mit Sprites).
  A6  Bildrate: 13:30–14:15 bei Tempo ×1 (Feindartillerie, Bewegung, Flug) in SL, Zielbearbeitung und Plenum.
  A7  Z-24 außer Gefecht (19:35): Zustands-Sprite „Kette ab“, kein Brand.
  A8  seit 2.7 (I3): die PT-91 kämpfen mit – E-01 ab 20:45 alle 20 s (Mündungsfeuer, Leuchtspur nach Norden, Treffer) auf der Karte
      des Teams; ohne Freigabe um 21:45 als verbündet erkannt: Zeichen blau „PL-PzKp (verbündet)“, Vermerk im Eingang, I-17 im Feed.
  A9  seit 2.7 (I1): D-03 bricht durch, Ziel 15 (BTR-80) fährt über die Brücke und westlich aus dem Bild – das Zeichen bleibt am
      Westrand „Ziel 15 durchgebrochen“, Vermerk im Eingang, I-13; Auflösung im Plenum.
Teil B – Sitzung mit zwei Teams, Übersicht der Spielleitung (ohne Verstärkungsmenü):
  B1  V-1 an beide Teams, V-3 nur an Team B (über die Sitzung) → in den Protokollen; die Zeile zeigt „+n V“.
  B2  V-2 um 12:00 für alle gesperrt (Szenario 2.1: 11:15–17:15) – abgelehnt mit Grund.
Teil C – Bildrate der Kontrollkarte allein (wie am Rechner der Spielleitung), Tempo ×1 und ×10, gezoomt mit Sprites; seit 2.6
  läuft der Team-Laptop (rechnet das Spiel) in einem kleinen Fenster daneben.
Jede Ansicht in 1536 × 730 ohne Rollbalken, keine Konsolenfehler. Fotos in --bilder.
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

from pruefgroessen import STANDARD  # noqa: E402

W, H = STANDARD  # seit Liste J: Dienst-Laptop 1536 × 730 (tools/pruefgroessen.py)
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


SZENARIO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "daten", "szenario_kraehe_01.json")


def schusszeiten(ziel_id):
    """Schusszeiten eines feuernden Ziels aus den Szenariodaten (wie src/kern/effekte.ts schuesse)."""
    with open(SZENARIO, encoding="utf-8") as f:
        ziel = next(z for z in json.load(f)["ziele"] if z["id"] == ziel_id)
    zeiten = []
    for fe in ziel.get("feuert", []):
        t = fe["von_s"]
        while t < fe["bis_s"]:
            for i in range(fe.get("salve", 1)):
                ts = t + i * fe["takt_s"]
                if ts < fe["bis_s"]:
                    zeiten.append(ts)
            t += fe.get("salve", 1) * fe["takt_s"] + fe.get("pause_s", 0)
    return sorted(zeiten)


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
        zb, pl = (seite(n, url(rolle=r, raum=a.raum)) for n, r in [("ZB", "zb"), ("Plenum", "plenum")])
        warte(lambda: zb.get_by_test_id("tour").count() == 1, 20, "Übersicht")
        zb.get_by_test_id("tour-ueberspringen").click()
        zb.get_by_test_id("einweisung-ueberspringen").click()
        for s, k in [(sl, "kontrollkarte"), (zb, "lagekarte")]:
            warte(lambda: s.locator(f"[data-testid={k}][data-bereit='1']").count() == 1, 20, f"Karte {k} bereit")

        def zustand():
            return sl.evaluate("() => { const z = window.argus.stand.zustand; return { t: window.argus.spielzeit(), laeuft: z.uhr.laeuft, v: z.verstaerkungen, h: z.hintergrund, zerstoert: z.zerstoert, ereignisse: z.ereignisse, meldungen: Object.fromEntries(Object.entries(z.meldungen).map(([k, m]) => [k, m.stufe])), ende: z.ende } }")

        def zeit(mmss, tempo=None):
            # Seit 2.6 rechnet der Team-Laptop: Ein „Anhalten“ kommt mit kurzem Verzug zurück – nur klicken, wenn der Knopf da ist
            if zustand()["laeuft"]:
                knopf = sl.get_by_role("button", name="❚❚ Anhalten")
                if knopf.count():
                    knopf.click()
                warte(lambda: not zustand()["laeuft"], 10, "Uhr steht")
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

        def abgelehnt():
            return sl.evaluate("() => window.argus.stand.zustand.abgelehnt.map((x) => x.grund)")

        # A1 Verstärkung (Menü ausgeblendet, H6/E1.1 – über die Sitzung wie tools/e2e_drehbuch.py)
        zeit("04:00", tempo=1)
        pruefe(sl.locator("[data-verstaerkung-sl]").count() == 0, "A1 kein Verstärkungsmenü in der Teamansicht der SL (verstaerkung_menue: false)")
        sl.evaluate("() => window.argus.senden('verstaerkung_einspielen', { gruppe: 'V-1' })")
        warte(lambda: any(v["gruppe"] == "V-1" for v in zustand()["v"]), 5, "V-1 im Protokoll")
        v1 = next(v for v in zustand()["v"] if v["gruppe"] == "V-1")
        pruefe(abs(v1["t0"] - 240) < 1, f"A1 V-1 eingespielt um t0 = {v1['t0']} s (04:00)")
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

        # A3 eine Meldung mit LM bekämpfen, LM im Flug
        warte(lambda: zb.get_by_test_id("eingang-zahl").inner_text() != "0", 10, "Meldung im Eingang")
        offen = zb.evaluate("() => { const z = window.argus.stand.zustand; return z.reihenfolge.filter((id) => z.meldungen[id].stufe === 'offen' && !z.meldungen[id].zurueckgestellt) }")
        mid = offen[-1]
        zb.locator(f"[data-testid=eingang] button[data-meldung={mid}]").click()
        zb.locator("label[data-wm=LM]").click()
        zb.wait_for_timeout(400)
        banner = zb.get_by_test_id("karte-banner").inner_text()
        pruefe("Einschlag in" in banner, f"A3 Vorschau rechnet den Einschlag voraus (Countdown): „{banner}“")
        foto(zb, "A3_zb_vorschau_lm")
        zb.get_by_test_id("zb-bekaempfen").click()
        warte(lambda: zustand()["meldungen"].get(mid) == "wirkung", 10, f"{mid} bekämpft")
        einschlag = sl.evaluate(f"() => {{ const f = window.argus.stand.zustand.meldungen['{mid}'].freigabe; return f.einschlaege?.[0] ?? f.einschlag }}")
        t_frei = zustand()["t"]
        laufen_bis(t_frei + 18)
        for s, n in [(sl, "sl"), (zb, "zb")]:
            s.wait_for_timeout(400)
            foto(s, f"A3_{n}_lm_im_flug")
        pruefe(einschlag["t"] > t_frei + 25, f"A3 LM: Freigabe {t_frei:.1f} s, Einschlag {einschlag['t']:.1f} s am vorausberechneten Ort {einschlag['pos']}")
        laufen_bis(einschlag["t"] + 0.4)
        sl.wait_for_timeout(300)
        foto(sl, "A3_sl_einschlag_lm")
        laufen_bis(einschlag["t"] + 2)
        w = sl.evaluate(f"() => window.argus.stand.zustand.meldungen['{mid}'].wirkung")
        pruefe(w and abs(w["t_einschlag"] - einschlag["t"]) < 0.05 and w["pos"] == einschlag["pos"], f"A3 Einschlag wie vorausberechnet: {w and w['getroffen']}")

        # A4 V-2 gesperrt (Szenario 2.1: 06:30–07:15 und 11:15–17:15)
        zeit("07:00", tempo=1)
        sl.evaluate("() => window.argus.senden('verstaerkung_einspielen', { gruppe: 'V-2' })")
        warte(lambda: any("V-2" in g for g in abgelehnt()), 5, "V-2 abgelehnt")
        grund = next(g for g in abgelehnt() if "V-2" in g)
        pruefe("jetzt nicht" in grund and not any(v["gruppe"] == "V-2" for v in zustand()["v"]), f"A4 V-2 um 07:00 gesperrt: „{grund}“")

        # A4b Feuer und Staub: Mörser Z-06 schießt seit 2.5 (F2.8) in Feuerstößen – 2 Schuss im Takt 2 s, dann 28 s Pause
        # (2.7: ab 05:52, also 05:52, 05:54, 06:24, 06:26 …). Die Schusszeiten kommen aus den Szenariodaten (wie effekte.schuesse);
        # Uhr direkt 0,2 s nach den ersten Schuss ab 07:00 stellen (der Blitz dauert 0,44 s Echtzeit, beim Anhalten wäre er vorbei).
        t_schuss = next(t for t in schusszeiten("Z-06") if t >= 420) + 0.2
        sl.evaluate("(t) => window.argus.senden('uhr', { befehl: 'setzen', t_s: t })", t_schuss)
        warte(lambda: abs(zustand()["t"] - t_schuss) < 0.05, 5, f"Spielzeit {t_schuss:.1f} s")
        # Die Uhr steht: Blitz und Rauch bleiben im Bild. Auf das nächste gezeichnete Bild warten (ohne Grafikkarte zeichnet die
        # Karte hier mitunter nur 0–1 Bild/s; das Diagnosefeld gilt für das zuletzt gezeichnete Bild).
        try:
            warte(lambda: "muendungsblitz_steil" in ((sl.evaluate(KARTE_JS, "kontrollkarte") or {}).get("gezeigt") or []), 10, "Mündungsblitz gezeichnet")
        except AssertionError:
            pass
        d = sl.evaluate(KARTE_JS, "kontrollkarte")
        foto(sl, "A4b_sl_moerser_feuert")
        pruefe(d and "muendungsblitz_steil" in d["gezeigt"] and "abschussrauch" in d["gezeigt"],
               f"A4b Mörser Z-06 feuert: Mündungsblitz und Abschussrauch auf der Kontrollkarte ({d and d['gezeigt']})")
        pruefe(d and d["staub"] > 0 and "staub" in d["gezeigt"], f"A4b fahrende Fahrzeuge wirbeln Staub auf ({d and d['staub']} Wolken)")
        sl.evaluate("() => document.querySelector('[data-testid=kontrollkarte] .karte-leinwand').argusKarte.zeigeAuf([860, 160], 3)")
        sl.wait_for_timeout(1200)
        foto(sl, "A4b_sl_feuer_staub_gezoomt")
        sl.evaluate("() => document.querySelector('[data-testid=kontrollkarte] .karte-leinwand').argusKarte.ganzeKarte()")

        # A5 Leuchtspur H-02, Nebel H-03, Wrack Z-11
        zeit("09:12", tempo=1)
        laufen_bis(555.75)
        sl.wait_for_timeout(300)
        foto(sl, "A5_sl_leuchtspur_h02")
        zeit("10:00", tempo=1)
        sl.wait_for_timeout(500)
        foto(sl, "A5_sl_nebel_wrack")
        foto(pl, "A5_plenum_nebel")
        foto(zb, "A5_zb_tracking")
        sl.evaluate("() => document.querySelector('[data-testid=kontrollkarte] .karte-leinwand').argusKarte.zeigeAuf([520, 330], 4)")
        sl.wait_for_timeout(1500)
        foto(sl, "A5_sl_bruecke_gezoomt")
        sl.evaluate("() => document.querySelector('[data-testid=kontrollkarte] .karte-leinwand').argusKarte.ganzeKarte()")
        pruefe(zustand()["h"].get("H-02", {}).get("wirkt") is True and "Z-11" in zustand()["zerstoert"], "A5 H-02 wirkt, Z-11 zerstört (Wrack brennt)")

        # A6 Bildrate bei laufender Uhr
        zeit("13:30", tempo=1)
        sl.get_by_role("button", name="▶ Start").click()
        proben = {n: [] for n in ["SL", "ZB", "Plenum"]}
        ende = time.time() + 45
        while time.time() < ende:
            time.sleep(5)
            for n, s, k in [("SL", sl, "kontrollkarte"), ("ZB", zb, "lagekarte"), ("Plenum", pl, "lagekarte")]:
                d = s.evaluate(KARTE_JS, k)
                if d:
                    proben[n].append({"fps": d["fps"], "ms": d["bildMs"]})
        foto(sl, "A6_sl_laufend")
        foto(zb, "A6_zb_laufend")
        sl.get_by_role("button", name="❚❚ Anhalten").click()
        warte(lambda: not zustand()["laeuft"], 10, "Uhr steht")
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

        # A8 E-01 (seit 2.7, I3.1): die PT-91 schießen ab 20:45 auf die Feindkräfte an der Brücke Ost – sichtbar für das Team
        objekte = "(m) => document.querySelector('[data-testid=lagekarte] .karte-leinwand').argusKarte.lb.objekte.filter((o) => (o.meldungen ?? []).includes(m)).map((o) => ({ text: o.text, sidc: o.sidc, weg: o.weg ?? null, pos: o.pos }))"
        zeit("20:43", tempo=1)
        laufen_bis(1245.3)
        sl.wait_for_timeout(300)
        zb.wait_for_timeout(300)
        foto(sl, "A8_sl_e01")
        foto(zb, "A8_zb_e01_mitkaempfen")
        e01 = zustand()["ereignisse"].get("E-01", {})
        w0 = e01.get("wirkungen", {}).get("0", {})
        pruefe(w0.get("wirkt") is True and w0.get("ziel"), f"A8 E-01 20:45: PT-91 trifft {w0.get('ziel')} an der Brücke Ost")
        fx = zb.evaluate("() => { const k = document.querySelector('[data-testid=lagekarte] .karte-leinwand').argusKarte; return k.diagnose.effektIds ?? null }")
        if fx is not None:
            pruefe(any(x.startswith("E-01-0-s") for x in fx), "A8 Leuchtspur der PT-91 auf der Karte des Teams")
        # A8b Auflösung 21:45 ohne Freigabe
        laufen_bis(1306)
        zb.wait_for_timeout(500)
        st20 = zb.evaluate("() => window.argus.stand.zustand.meldungen.M20")
        pruefe(st20["stufe"] == "erledigt" and (st20.get("aufgeloest") or {}).get("als") == "verbuendet", f"A8 M20 21:45 aufgelöst ({st20['stufe']}, {st20.get('aufgeloest')})")
        vm = zb.locator(".eingang-zeile.vermerk[data-vermerk=M20]")
        pruefe(vm.count() == 1 and "verbündet – nicht bekämpfen" in vm.inner_text(), f"A8 Vermerk im Eingang: „{vm.inner_text() if vm.count() else '–'}“")
        o20 = zb.evaluate(objekte, "M20")
        pruefe(o20 and o20[0]["text"] == "PL-PzKp (verbündet)" and o20[0]["sidc"][1] == "F", f"A8 Zeichen der PT-91 blau: {o20}")
        feed = zb.get_by_test_id("feed").inner_text()
        pruefe("Feuerstellung Feldweg Süd bezogen" in feed, "A8 I-17 im Feed")
        foto(zb, "A8_zb_verbuendet")
        abgelehnt_vorher = len(abgelehnt())
        zb.evaluate("() => window.argus.senden('entscheid', { meldung: 'M20', entscheid: 'bekaempfen', wirkmittel: 'PZA' })")
        warte(lambda: len(abgelehnt()) > abgelehnt_vorher, 5, "BEKÄMPFEN nach der Auflösung abgelehnt")
        pruefe("nicht (mehr) offen" in abgelehnt()[-1], f"A8 nach 21:45 keine Freigabe mehr: „{abgelehnt()[-1]}“")
        # A9 Durchbruch D-03 (seit 2.7, I1): Ziel 15 verschwindet nicht ohne Erklärung
        aus = sl.evaluate("() => { const z = window.argus.stand.zustand; return z.durchbrueche['D-03'] ?? null }")
        pruefe(aus and aus.get("durch") is True, f"A9 D-03 bricht durch ({aus})")
        zeit("23:30", tempo=1)
        laufen_bis(1425)
        zb.wait_for_timeout(500)
        st11 = zb.evaluate("() => window.argus.stand.zustand.meldungen.M11")
        o11 = zb.evaluate(objekte, "M11")
        vm11 = zb.locator(".eingang-zeile.vermerk[data-vermerk=M11]")
        print(f"  A9 M11: {st11['stufe']} {st11.get('entfallen')} · Zeichen {o11} · Vermerk {vm11.inner_text() if vm11.count() else '–'}")
        pruefe(o11 and o11[0]["weg"] == "durchgebrochen" and o11[0]["text"] == "Ziel 15 durchgebrochen" and o11[0]["pos"][0] < 20,
               f"A9 Zeichen „Ziel 15 durchgebrochen“ am Westrand ({o11})")
        pruefe(vm11.count() == 1 and "über die Brücke ELSTER durchgebrochen" in vm11.inner_text(), "A9 Vermerk im Eingang „über die Brücke ELSTER durchgebrochen“")
        pruefe(zb.evaluate("() => !!window.argus.stand.zustand.injects['I-13']"), "A9 Lagemeldung I-13")
        foto(zb, "A9_zb_durchgebrochen")
        zeit("24:58", tempo=1)
        sl.get_by_role("button", name="▶ Start").click()
        warte(lambda: zustand()["ende"], 20, "Spielende")
        pl.wait_for_timeout(1500)
        foto(pl, "A8_plenum_aufloesung")
        v1m1 = zb.evaluate("() => window.argus.stand.zustand.meldungen['V1-M1']")
        pruefe(v1m1 is not None, f"A1 V1-M1 ist bei der Zielbearbeitung angekommen ({v1m1 and v1m1['stufe']})")
        for s in [sl, zb, pl]:
            s.close()

        # ---------------------------------------------------------------- Teil B
        print("Teil B – zwei Teams, Übersicht der Spielleitung")
        sl = seite("SL-B", url())
        sl.get_by_role("button", name="Spielleitung").click()
        sl.get_by_placeholder("Name, z. B. SL 1").fill("SL 1")
        sl.get_by_role("button", name="Neue Sitzung anlegen").click()
        warte(lambda: sl.locator(".rahmen[data-host='1'][data-ansicht=uebersicht]").count() == 1, 30, "SL steuert")
        code = sl.get_by_test_id("code").inner_text().strip()
        tt = []
        for name in ["Team A", "Team B"]:
            s = seite(name, url())
            s.get_by_role("button", name="Ich spiele mit").click()
            s.get_by_label("Code der Sitzung").fill(code)
            s.get_by_role("button", name="Beitreten").click()
            warte(lambda: s.locator("[data-rolle=lobby]").count() == 1, 20, "Lobby")
            s.get_by_placeholder("Teamname").fill(name)
            s.get_by_role("button", name="Team anlegen").click()
            warte(lambda: s.get_by_test_id("lobby-ich").count() == 1, 15, f"{name} erstellt")
            tt.append(s)
        warte(lambda: len(sl.evaluate("() => window.argusTeams()")) == 2, 20, "zwei Teams")
        sl.get_by_test_id("alle-oeffnen").click()
        for s in tt:
            warte(lambda: s.get_by_test_id("tour").count() == 1, 20, "Übersicht")
            s.get_by_test_id("tour-ueberspringen").click()
            s.get_by_test_id("einweisung-ueberspringen").click()
        warte(lambda: all(x["seq"] >= 2 for x in sl.evaluate("() => window.argusTeams()")), 20, "Spiele offen")
        sl.get_by_test_id("alle-zeit").fill("04:00")
        sl.get_by_role("button", name="Spielzeit setzen").click()
        warte(lambda: all(x["uhr"]["t_s"] >= 240 for x in sl.evaluate("() => window.argusTeams()")), 10, "Spielzeit 04:00")
        ids = {x["name"]: x["id"] for x in sl.evaluate("() => window.argusTeams()")}

        def verst(team):
            return [e["daten"]["gruppe"] for e in sl.evaluate("(id) => window.argusSitzung.spiel(id).stand.protokoll", ids[team]) if e["typ"] == "verstaerkung"]

        pruefe(sl.get_by_test_id("verstaerkung-menue").count() == 0, "B1 Übersicht ohne Verstärkungsmenü (verstaerkung_menue: false)")
        sl.evaluate("(ids) => window.argusSitzung.sendenAn(ids, 'verstaerkung_einspielen', { gruppe: 'V-1' })", list(ids.values()))
        warte(lambda: verst("Team A") == ["V-1"] and verst("Team B") == ["V-1"], 10, "V-1 an alle")
        pruefe(True, "B1 V-1 an beide Teams: in beiden Protokollen")
        sl.evaluate("(id) => window.argusSitzung.sendenAn([id], 'verstaerkung_einspielen', { gruppe: 'V-3' })", ids["Team B"])
        warte(lambda: verst("Team B") == ["V-1", "V-3"], 10, "V-3 an Team B")
        pruefe(verst("Team A") == ["V-1"], "B1 V-3 nur an Team B")
        sl.wait_for_timeout(500)
        za = sl.locator("[data-team-zeile='Team A'] [data-verstaerkungen]").inner_text()
        zb_ = sl.locator("[data-team-zeile='Team B'] [data-verstaerkungen]").inner_text()
        pruefe("+1 V" in za and "+2 V" in zb_, f"B1 Übersicht zeigt eingespielte Verstärkungen ({za.strip()} / {zb_.strip()})")
        sl.get_by_test_id("alle-zeit").fill("12:00")
        sl.get_by_role("button", name="Spielzeit setzen").click()
        warte(lambda: all(x["uhr"]["t_s"] >= 720 for x in sl.evaluate("() => window.argusTeams()")), 10, "Spielzeit 12:00")
        sl.evaluate("(ids) => window.argusSitzung.sendenAn(ids, 'verstaerkung_einspielen', { gruppe: 'V-2' })", list(ids.values()))

        def abgelehnt_b(team):
            return [e["daten"]["grund"] for e in sl.evaluate("(id) => window.argusSitzung.spiel(id).stand.protokoll", ids[team]) if e["typ"] == "aktion_abgelehnt"]
        warte(lambda: all(any("V-2" in g for g in abgelehnt_b(t)) for t in ids), 10, "V-2 abgelehnt")
        pruefe(all("V-2" not in verst(t) for t in ids), f"B2 V-2 um 12:00 für alle gesperrt: „{abgelehnt_b('Team A')[-1]}“")
        foto(sl, "B2_uebersicht")
        for x in [sl] + tt:
            x.close()

        # ---------------------------------------------------------------- Teil C
        # Bildrate wie am Rechner der Spielleitung: ein Fenster allein (Kontrollkarte, Gesamtansicht und gezoomt)
        # Seit 2.6 (H1) rechnet der Team-Laptop das Spiel, die Spielleitung nicht: Ein Team-Fenster läuft mit – klein (480 × 320) und
        # mit höchstens 1 Bild/s (fps=1), damit es die gemeinsame Software-Grafik (SwiftShader) kaum belastet.
        print(f"Teil C – Bildrate der Kontrollkarte allein ({a.renderer}, Team-Laptop klein daneben, 1 Bild/s)")
        sl = seite("SL-C", url(rolle="sl", raum=f"{a.raum}-c", name="SL 1"))
        warte(lambda: sl.locator(".rahmen[data-host='1']").count() == 1, 30, "SL steuert")
        zbc = seite("ZB-C", url(rolle="zb", raum=f"{a.raum}-c", fps=1))
        warte(lambda: zbc.get_by_test_id("tour").count() == 1, 20, "Übersicht")
        zbc.get_by_test_id("tour-ueberspringen").click()
        zbc.get_by_test_id("einweisung-ueberspringen").click()
        zbc.set_viewport_size({"width": 480, "height": 320})
        warte(lambda: sl.locator("[data-testid=kontrollkarte][data-bereit='1']").count() == 1, 20, "Kontrollkarte bereit")
        warte(lambda: zustand()["t"] == 0 and sl.evaluate("() => window.argus.stand.protokoll.length") > 0, 20, "Spiel des Teams offen")
        # Uhr direkt über die Sitzung (wie die Knöpfe): Unter SwiftShader ist die Seite mit zwei Fenstern so träge, dass Klicks
        # über 30 s brauchen können (Grenze der Software-Grafik, siehe ENGINE.md „Bildrate“).
        def uhr(befehl, **d):
            sl.evaluate("(a) => window.argus.senden('uhr', a)", {"befehl": befehl, **d})

        for tempo, zoom, name in [(1, None, "SL allein ×1"), (10, None, "SL allein ×10"), (1, ([520, 330], 4), "SL allein ×1 gezoomt")]:
            if zustand()["laeuft"]:
                uhr("pause")
                warte(lambda: not zustand()["laeuft"], 30, "Uhr steht")
            uhr("setzen", t_s=810)
            warte(lambda: abs(zustand()["t"] - 810) < 0.5, 30, "Spielzeit 13:30")
            uhr("tempo", tempo=tempo)
            if zoom:
                sl.evaluate("(z) => document.querySelector('[data-testid=kontrollkarte] .karte-leinwand').argusKarte.zeigeAuf(z[0], z[1])", list(zoom))
            uhr("start")
            warte(lambda: zustand()["laeuft"], 30, "Uhr läuft")
            l = []
            for _ in range(5):
                time.sleep(4)
                d = sl.evaluate(KARTE_JS, "kontrollkarte")
                if d:
                    l.append({"fps": d["fps"], "ms": d["bildMs"]})
            uhr("pause")
            l = l[1:]
            messung[name] = {"fps_min": min(x["fps"] for x in l), "fps_mittel": round(sum(x["fps"] for x in l) / len(l), 1),
                             "ms_mittel": round(sum(x["ms"]["mittel"] for x in l) / len(l), 1), "ms_max": max(x["ms"]["max"] for x in l)}
            print(f"  C {name:<22} {messung[name]['fps_min']}–{max(x['fps'] for x in l)} Bilder/s (Ziel je nach Lage 12–30), Zeichenzeit Ø {messung[name]['ms_mittel']} ms, max {messung[name]['ms_max']} ms")
            if zoom:
                try:
                    foto(sl, "C_sl_gezoomt_laufend")
                except Exception as ex:  # noqa: BLE001 – Foto unter SwiftShader zu langsam: kein Prüfpunkt
                    print("  (Foto C ausgelassen:", str(ex).splitlines()[0], ")")
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
