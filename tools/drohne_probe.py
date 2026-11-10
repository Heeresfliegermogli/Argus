#!/usr/bin/env python3
"""Probe des Live-Drohnenbilds (Schritt 6b) über die sichtbare Oberfläche der Zielbearbeitung (seit 2.6 eine Rolle).

Prüft im Browser (SL steuert die Uhr, die Zielbearbeitung öffnet die Meldungen in ihrem Eingang):

1. Zusammensetzen: Für jede Meldung setzt das Live-Bild zur Meldezeit die Ebenen so zusammen, dass es dem
   Standbild entspricht (mittlere Abweichung in Graustufen wie tools/assets/live.py `pruefe_ebenen`, Fahrzeuge
   und Figuren an ihrer Stelle im Manifest). M25 nur Lage – Rauschen und Zeilenversatz macht die Oberfläche.
2. Schlüsselfälle in der Vergrößerung mit Lupe: Rotes Kreuz (M12, S2), Kinder (M18, S4), weißes Tuch (M21, N2)
   – die Figuren sind im Bild, nicht verdeckt, und in der Lupe zählbar (rote bzw. weiße Bildpunkte, Fotos).
3. Kamera folgt dem Ziel (B9, 25.10.2026): Der Panzerzug in M13 fährt, die Kamera fährt mit – das verfolgte
   Fahrzeug bleibt an seiner Stelle im Bild, der Ausschnitt wandert. Wird das verfolgte Fahrzeug einer Gruppe
   zerstört, bleibt die Kamera ca. 0,5 s darauf, schwenkt dann mit kurzem Bildrauschen („◌ AUSRICHTUNG …“) zum
   nächsten Fahrzeug der Meldung und zeigt wieder „● LIVE“.
4. Effekte und Wracks: Eine LM auf Z-02 (M03, BEKÄMPFEN mit LM) schlägt im Bild von M12 ein –
   Flug, Einschlag, danach Wrack mit Feuer.
5. Bildrate bei laufender Uhr (×1 und ×10, M17 – das Ziel fährt im Bild): Fenster am Ort und Vergrößerung, dazu die Karte.
6. Seit Szenario 2.4 (E6.3): Merkmale im Bild statt Sensordaten – für jedes `bild.merkmale` der Meldungen eines Falls
   (und der übrigen Meldungen mit Merkmalen) Lupe auf das Ziel, Merkmal im Bild gezählt (Figuren, Schrift PRESS,
   Verbände, Holz des Rohrs, Fernglas und Funkgerät), Fotos merkmal_<Meldung>_<Art>.png zum Ansehen.
7. Seit Szenario 2.4 (E4): EloKa stört global – solange das EloKa-Fahrzeug steht, rauscht jedes Live-Bild (M09–M11, M25);
   bekämpft (BEKÄMPFEN mit Mörser), ist das nächste Bild (M11) klar und ARGUS meldet ungestört.

Aufruf (nach `npm run build` und `npx vite preview --port 4173`):
  python3 tools/drohne_probe.py http://localhost:4173/ --bilder drohne
"""
import argparse
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

from ui_bilder import H, LAYOUT_JS, W, adresse, warte

HIER = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HIER, "..", "public", "assets", "manifest.json")
FPS_MELDUNG = "M17"

LIVE = "document.querySelector('[data-testid=live-fenster] canvas.live-leinwand')"
GROSS = "document.querySelector('[data-testid=live-gross] canvas.live-leinwand')"

# Lupe: rote Bildpunkte (Rotes Kreuz), weiße (Tuch); Zählung im Kreis der Lupe
LUPE_ZAEHLEN = """
() => {
  const c = document.querySelector('[data-testid=lupe]');
  if (!c) return null;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const r = c.width / 2;
  let rot = 0, weiss = 0, hell = 0, blau = 0, holz = 0, dunkel = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if ((x - r) ** 2 + (y - r) ** 2 > (r - 2) ** 2) continue;
    const i = (y * c.width + x) * 4;
    const [R, G, B] = [d[i], d[i + 1], d[i + 2]];
    if (R > 150 && G < 90 && B < 90) rot++;
    if (R > 205 && G > 205 && B > 205) weiss++;
    if (R > 170 && G > 170 && B > 170 && Math.max(R, G, B) - Math.min(R, G, B) < 45) hell++;
    if (B > 70 && B > R + 35 && B > G + 15) blau++;
    if (R > 150 && G > 115 && B < 120 && R - B > 50) holz++;
    if (R < 38 && G < 38 && B < 38) dunkel++;
  }
  return { rot, weiss, hell, blau, holz, dunkel, px: c.width * c.height };
}
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("basis")
    ap.add_argument("--bilder", default="drohne-probe")
    ap.add_argument("--raum", default=f"drohne-{int(time.time()) % 100000}")
    ap.add_argument("--max-abweichung", type=float, default=6.0)
    ap.add_argument("--ohne-ebenen", action="store_true", help="Vergleich mit den Standbildern überspringen (schneller)")
    ap.add_argument("--nur-bildrate", action="store_true", help="nur Teil 5 (Bildrate)")
    ap.add_argument("--nur-merkmale", action="store_true", help="nur Teil 6 und 7 (Merkmale im Bild, EloKa; seit 2.4)")
    a = ap.parse_args()
    os.makedirs(a.bilder, exist_ok=True)
    man = json.load(open(MANIFEST, encoding="utf-8"))
    fehler, konsole, zeilen = [], [], []

    def pruefe(ok, text):
        zeilen.append(("OK  " if ok else "FEHL") + " " + text)
        print(zeilen[-1])
        if not ok:
            fehler.append(text)

    def foto(s, name):
        lay = s.evaluate(LAYOUT_JS)
        if lay["seite"][0] > W or lay["seite"][1] > H or lay["zuGross"]:
            fehler.append(f"{name}: Layout {lay}")
        s.screenshot(path=os.path.join(a.bilder, f"{name}.png"))

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])

        def raum(name):
            """Spielleitung und Zielbearbeitung in einem neuen Raum; die Uhr steht bei 00:00."""
            ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
            s = {}
            for r in ["sl", "zb"]:
                pg = ctx.new_page()
                pg.on("console", lambda m, r=r: konsole.append(f"{r}: {m.type}: {m.text}") if m.type in ("error", "warning") else None)
                pg.on("pageerror", lambda e, r=r: konsole.append(f"{r}: pageerror: {e}"))
                pg.goto(adresse(a.basis, r, f"{a.raum}-{name}"))
                s[r] = pg
                if r == "sl":
                    warte(lambda: pg.locator(".rahmen[data-host='1']").count() == 1, 20, "SL steuert")
            s["zb"].get_by_role("button", name="Übersicht überspringen").click()
            s["zb"].get_by_role("button", name="Überspringen").click()
            return ctx, s["sl"], s["zb"]

        def zeit(sl, t):
            sl.get_by_test_id("sl-zeit").fill(f"{int(t) // 60:02d}:{int(t) % 60:02d}")
            sl.get_by_role("button", name="Spielzeit setzen").click()

        def oeffne(zb, mid):
            zeile = zb.locator(f"[data-testid=eingang] button[data-meldung={mid}]")
            warte(lambda: zeile.count() == 1, 20, f"{mid} im Eingang")
            zeile.click()
            warte(lambda: zb.evaluate(f"() => {LIVE}?.argusLive?.meldung") == mid, 20, f"Live-Bild {mid}")

        def bekaempfen(zb, mid, wm):
            """Meldung öffnen und mit dem Wirkmittel bekämpfen; Spielzeit des Einschlags auf das erste Fahrzeug."""
            oeffne(zb, mid)
            zb.locator(f"label[data-wm={wm}]").click()
            zb.get_by_test_id("zb-bekaempfen").click()
            warte(lambda: zb.evaluate(f"() => window.argus.stand.zustand.meldungen.{mid}.freigabe?.einschlag?.t ?? null") is not None, 15, f"Einschlag {mid} geplant")
            return zb.evaluate(f"() => {{ const f = window.argus.stand.zustand.meldungen.{mid}.freigabe; return (f.einschlaege?.[0] ?? f.einschlag).t }}")

        # Merkmal → (Farbklasse in der Lupe, Mindestzahl Bildpunkte); Figuren-Merkmale zählen die Figuren am Ziel
        # Schrift und Verbände: „hell“ (fast weiß, Kamerafarbe und Dunst dämpfen das Weiß), Tuch und Kreuz wie in Teil 3
        MERKMAL_PIXEL = {"rotes_kreuz": ("rot", 40), "weisses_tuch": ("weiss", 40), "press": ("hell", 60), "verwundete": ("hell", 12),
                         "attrappe": ("holz", 15), "beobachter": ("dunkel", 6)}
        MERKMAL_FIGUR = {"zivilpersonen": "zivil", "sanitaeter": "sanitaet"}

        def merkmal(sl, zb, m, mk):
            """Lupe auf das Ziel des Merkmals; zählt Figuren bzw. Bildpunkte der Merkmalsfarbe."""
            mid, art, zid = m["id"], mk["art"], mk.get("ziel")
            zeit(sl, man["drohne"][mid]["t_s"] + 1)
            oeffne(zb, mid)
            zb.wait_for_timeout(500)
            zb.get_by_role("button", name="Drohnenbild vergrößern").click()
            warte(lambda: zb.evaluate(f"() => !!{GROSS}?.argusLive") is True, 10, "Vergrößerung")
            zb.wait_for_timeout(400)
            info = live(zb, GROSS)
            cv = zb.locator("[data-testid=live-gross] canvas.live-leinwand").bounding_box()
            k = cv["width"] / man["drohne"][mid]["breite"]
            fz = next((f for f in info["fahrzeuge"] if f["id"] == zid), None)
            figs = [f for f in info["figuren"] if f["bei"] == zid]
            text, ok = "", fz is not None
            if art in MERKMAL_FIGUR:
                passend = [f for f in figs if MERKMAL_FIGUR[art] in f["sprite"]]
                ziel = [sum(f["px"][0] for f in passend) / len(passend), sum(f["px"][1] for f in passend) / len(passend)] if passend else (fz or {"px": [512, 320]})["px"]
                kinder = len([f for f in passend if "_kind" in f["sprite"]])
                # aufgesessen (Traktor N1): ein Teil sitzt verdeckt – Soll ist, was das Standbild zeigt (Manifest)
                im_bild = len([f for f in man["drohne"][mid]["ebenen"]["figuren"] if f["bei"] == zid and MERKMAL_FIGUR[art] in f["sprite"]])
                soll = min(mk.get("anzahl", 1), im_bild) if im_bild else mk.get("anzahl", 1)
                ok = len(passend) >= soll and kinder >= mk.get("klein", 0)
                text = (f"{len(passend)}/{soll} Figuren „{MERKMAL_FIGUR[art]}“{' (von ' + str(mk.get('anzahl', 1)) + ', Rest verdeckt)' if soll < mk.get('anzahl', 1) else ''}"
                        + (f", davon {kinder} Kinder (Soll {mk['klein']})" if mk.get("klein") else ""))
            elif art == "weisses_tuch":
                tuch = [f for f in figs if "_tuch" in f["sprite"]]
                ziel = tuch[0]["px"] if tuch else (fz or {"px": [512, 320]})["px"]
                ok = ok and len(tuch) == 1
                text = f"{len(tuch)} Figur mit weißem Tuch"
            else:
                ziel = fz["px"] if fz else [512, 320]
                if art == "kette_ab":
                    ok = ok and "kette_ab" in fz["sprite"]
                    text = f"Sprite {fz['sprite'] if fz else '–'}"
                else:
                    text = f"{zid} im Bild{' (' + fz['sprite'] + ')' if fz else ' FEHLT'}"
            zb.mouse.move(cv["x"] + ziel[0] * k, cv["y"] + ziel[1] * k)
            for _ in range(4):
                zb.mouse.wheel(0, -100)
                zb.wait_for_timeout(100)
            zb.wait_for_timeout(500)
            z = zb.evaluate(LUPE_ZAEHLEN)
            if art in MERKMAL_PIXEL:
                farbe, mindest = MERKMAL_PIXEL[art]
                n = z[farbe] if z else 0
                ok = ok and n >= mindest
                text += f", Lupe: {n} Bildpunkte „{farbe}“ (≥ {mindest})"
                if art == "press":
                    ok = ok and z["blau"] >= 150
                    text += f", {z['blau']} blaue"
            verdeckt = man["drohne"][mid]["ebenen"]["verdeckt"].get(zid)
            if verdeckt is not None:
                text += f", verdeckt {round(verdeckt * 100)} %"
            pruefe(ok, f"{mid} Merkmal „{art}“ ({mk['text']}): {text}")
            zb.screenshot(path=os.path.join(a.bilder, f"merkmal_{mid}_{art}.png"),
                          clip={"x": max(0, cv["x"] + ziel[0] * k - 260), "y": max(0, cv["y"] + ziel[1] * k - 260), "width": 520, "height": 520})
            zb.keyboard.press("Escape")

        def live(zb, sel=LIVE):
            return zb.evaluate(f"() => {{ const x = {sel}?.argusLive; return x && {{ ...x, vergleich: undefined }}; }}")

        if not a.nur_bildrate and not a.nur_merkmale:
            # ---------------------------------------------------------------- 1. Zusammensetzen je Meldung
            ctx, sl, zb = raum("ebenen")
            meldungen = [] if a.ohne_ebenen else sorted([k for k, d in man["drohne"].items() if not d.get("relativ") and d.get("ebenen")], key=lambda k: man["drohne"][k]["t_s"])
            werte = {}
            for mid in meldungen:
                zeit(sl, man["drohne"][mid]["t_s"])
                # seit 2.7 (I3.1): Im passiven Lauf zerschlägt E-01 ab 20:45 die Feindkräfte an der Brücke Ost. Eine Meldung, deren
                # Fahrzeuge dann schon zerstört sind (M19, Folgemeldung zu M37), erscheint gleich als entfallen und steht nicht im Eingang.
                stufe, ende = None, time.time() + 20
                while time.time() < ende and not stufe:
                    stufe = zb.evaluate(f"() => window.argus?.stand?.zustand?.meldungen?.['{mid}']?.stufe ?? null")
                    time.sleep(0.2)
                if stufe == "entfallen":
                    grund = zb.evaluate(f"() => window.argus.stand.zustand.meldungen['{mid}'].entfallen?.grund ?? ''")
                    print(f"–    {mid}: im passiven Lauf entfallen ({grund}) – nicht im Eingang, nicht zusammengesetzt")
                    continue
                oeffne(zb, mid)
                v = zb.evaluate(f"() => {LIVE}.argusLive.vergleich()")
                lage = max([0.0] + [abs(f["soll"][0] - f["ist"][0]) + abs(f["soll"][1] - f["ist"][1]) for f in v["fahrzeuge"] + v["figuren"]])
                soll_n = len(man["drohne"][mid]["ebenen"]["figuren"])
                werte[mid] = v["abweichung"]
                # Rauschen (M25 bis 2.3; seit 2.4 alle Bilder, solange EloKa steht: Manifest „eloka“) – dort zählt nur die Lage
                rauscht = bool(man["drohne"][mid].get("eloka") or man["drohne"][mid]["ebenen"].get("bildstoerung"))
                el = live(zb)["eloka"]
                ok = lage <= 1.5 and (rauscht or v["abweichung"] <= a.max_abweichung) and len(v["figuren"]) == soll_n
                ok = ok and (el > 0) == bool(man["drohne"][mid].get("eloka"))
                pruefe(ok, f"{mid}: Abweichung zum Standbild {v['abweichung']} Graustufen{' (Rauschen live)' if rauscht else ''}, "
                           f"Lage ±{lage:.1f} px, {len(v['fahrzeuge'])} Fahrzeuge, {len(v['figuren'])}/{soll_n} Figuren"
                           f"{f', EloKa-Störung live {el}' if el else ''}")
            ohne25 = [v for k, v in werte.items() if not man["drohne"][k].get("eloka") and not man["drohne"][k]["ebenen"].get("bildstoerung")] or [0]
            if werte:
                pruefe(True, f"Abweichung ohne gestörte Bilder: {min(ohne25)}–{max(ohne25)} Graustufen (Referenz tools/assets/live.py: 2,5–4,2)")
            ctx.close()

            ctx, sl, zb = raum("lage")

            # ---------------------------------------------------------------- 2. Effekte und Wrack (LM auf Z-02, im Bild von M12)
            zeit(sl, man["drohne"]["M12"]["t_s"] + 2)
            # Einschlag aus dem Spielstand; die Uhr wird genau davor, kurz danach und später gestellt (Spielzeit mit
            # Bruchteil über die Sicht der Spielleitung), damit die kurze Explosion sicher in einem Bild liegt
            te = bekaempfen(zb, "M03", "LM")
            oeffne(zb, "M12")
            zb.bring_to_front()

            def setze(t):
                sl.evaluate("(t) => window.argus.senden('uhr', { befehl: 'setzen', t_s: t })", t)
                warte(lambda: abs(zb.evaluate(f"() => {LIVE}?.argusLive?.t ?? -1") - t) < 0.05, 20, f"Live-Bild zur Spielzeit {t:.1f}")
                zb.wait_for_timeout(300)
                return live(zb)

            gesehen = {}
            for name, t in [("flug", te - 0.15), ("einschlag", te + 0.15), ("wrack", te + 6)]:
                x = setze(t)
                gesehen[name] = (x["effekte"], any(f["id"] == "Z-02" and f["wrack"] for f in x["fahrzeuge"]))
                foto(zb, f"M12_{name}")
            flug_ok = "lm_flug" in gesehen["flug"][0] and not gesehen["flug"][1]
            schlag_ok = "explosion_klein" in gesehen["einschlag"][0]
            wrack_ok = gesehen["wrack"][1] and "feuer" in gesehen["wrack"][0]
            pruefe(flug_ok and schlag_ok and wrack_ok,
                   f"LM auf Z-02 im Bild von M12 (Einschlag {te:.1f} s): kurz vorher {sorted(gesehen['flug'][0])}, "
                   f"beim Einschlag {sorted(gesehen['einschlag'][0])}, 6 s danach {sorted(gesehen['wrack'][0])} – Z-02 Wrack: {gesehen['wrack'][1]}")

            # ---------------------------------------------------------------- 2b. Feuer und Staub (Szenario 2.1, A8)
            # Mörser Z-06 (M05) feuert nach Schussrhythmus ab 13:38 (818 s): kurz nach dem Schuss Mündungsblitz und
            # Abschussrauch; M13: der Panzerzug fährt und wirbelt Staub auf.
            oeffne(zb, "M05")
            x = setze(818.3)
            foto(zb, "M05_schuss")
            pruefe("muendungsblitz_steil" in x["effekte"] and "abschussrauch" in x["effekte"],
                   f"M05 Mörser Z-06 feuert (818,3 s, 0,3 s nach dem Schuss): {sorted(x['effekte'])}")
            x = setze(830 + 4)
            pruefe("muendungsblitz_steil" not in x["effekte"], f"M05 zwischen den Feuerstößen kein Blitz (834 s): {sorted(x['effekte'])}")
            setze(880)
            oeffne(zb, "M13")
            x = setze(882)
            foto(zb, "M13_staub")
            pruefe("staub" in x["effekte"], f"M13 Panzerzug fährt und wirbelt Staub auf (882 s): {sorted(x['effekte'])}")

            # ---------------------------------------------------------------- 3. Schlüsselfälle mit Lupe
            def fall(mid, name, art, zid, farbe, mindest, t=None):
                if t is not None:
                    zeit(sl, t)
                oeffne(zb, mid)
                zb.wait_for_timeout(600)
                foto(zb, f"{mid}_fenster")
                zb.get_by_role("button", name="Drohnenbild vergrößern").click()
                warte(lambda: zb.evaluate(f"() => !!{GROSS}?.argusLive") is True, 10, "Vergrößerung")
                info = live(zb, GROSS)
                cv = zb.locator("[data-testid=live-gross] canvas.live-leinwand").bounding_box()
                k = cv["width"] / man["drohne"][mid]["breite"]
                if art == "fahrzeug":
                    ziel = next(f["px"] for f in info["fahrzeuge"] if f["id"] == zid)
                    anzahl = len([f for f in info["figuren"] if f["art"] == "sanitaet"])
                    text = f"Sanitätsfahrzeug {zid} im Bild, {anzahl} Sanitäter"
                    ok = anzahl == 2
                else:
                    figs = [f for f in info["figuren"] if art in f["sprite"]]
                    ziel = figs[0]["px"] if figs else [512, 320]
                    anzahl = len(figs)
                    text = f"{anzahl} Figur(en) „{art}“ im Bild"
                    ok = anzahl == (2 if art == "kind" else 1)
                zb.mouse.move(cv["x"] + ziel[0] * k, cv["y"] + ziel[1] * k)
                if art != "fahrzeug":
                    for _ in range(3):
                        zb.mouse.wheel(0, -100)
                        zb.wait_for_timeout(120)
                zb.wait_for_timeout(500)
                z = zb.evaluate(LUPE_ZAEHLEN)
                if farbe:
                    ok = ok and z is not None and z[farbe] >= mindest
                    text += f", Lupe: {z[farbe] if z else '–'} {'rote' if farbe == 'rot' else 'weiße'} Bildpunkte"
                verdeckt = man["drohne"][mid]["ebenen"]["figuren_verdeckt"]
                text += f", verdeckt (Ebenen): {', '.join(f'{kk} {round(v * 100)} %' for kk, v in verdeckt.items()) or '–'}"
                pruefe(ok and all(v < 0.1 for kk, v in verdeckt.items() if "soldat" not in kk), f"{mid} {name}: {text}")
                foto(zb, f"{mid}_lupe")
                zb.keyboard.press("Escape")

            fall("M12", "S2 Rotes Kreuz", "fahrzeug", "Z-12", "rot", 40)

            # ---------------------------------------------------------------- 4. Kamera folgt dem Ziel (M13 Panzerzug, B9)
            t13 = man["drohne"]["M13"]["t_s"]
            zeit(sl, t13)
            oeffne(zb, "M13")
            x0 = live(zb)
            sl.get_by_role("button", name="×5", exact=True).click()
            sl.get_by_role("button", name="▶ Start").click()
            zb.wait_for_timeout(1500)
            foto(zb, "M13_faehrt")
            zb.wait_for_timeout(1500)
            sl.get_by_role("button", name="❚❚ Anhalten").click()
            sl.get_by_role("button", name="×1", exact=True).click()
            x1 = live(zb)
            zid = x1["kamera"]["ziel"]
            lage0 = {f["id"]: f["px"] for f in x0["fahrzeuge"]}
            lage1 = {f["id"]: f["px"] for f in x1["fahrzeuge"]}
            ruck = round(((lage1[zid][0] - lage0[zid][0]) ** 2 + (lage1[zid][1] - lage0[zid][1]) ** 2) ** 0.5, 1) if zid in lage0 and zid in lage1 else None
            fahrt = round(((x1["kamera"]["dx"] - x0["kamera"]["dx"]) ** 2 + (x1["kamera"]["dy"] - x0["kamera"]["dy"]) ** 2) ** 0.5, 1)
            pruefe(zid == man["drohne"]["M13"]["ziele"][0]["id"] and ruck is not None and ruck <= 3 and fahrt >= 3 and x1["zielImBild"],
                   f"M13 Kamera folgt {zid}: nach {x1['t'] - x0['t']:.0f} s Spielzeit Ausschnitt {fahrt} m weiter, {zid} im Bild um {ruck} px versetzt (soll ≤ 3)")

            # Schwenk nach der Zerstörung: erste Meldung mit mehreren Fahrzeugen, deren erstes vor den anderen zerstört wird
            sz = json.load(open(os.path.join(HIER, "..", "public", "daten", "szenario_kraehe_01.json"), encoding="utf-8"))
            tz = {h["ziel"]: h["t_s"] for h in (sz.get("hintergrund") or {}).get("ereignisse", []) if h.get("art") == "panzerabwehr" and h.get("folge") == "zerstoert"}
            kand = [m for m in sorted(sz["meldungen"], key=lambda m: m["t_s"]) if len(m["ziele"]) > 1 and m["id"] in man["drohne"]
                    and tz.get(m["ziele"][0], 0) > m["t_s"] and any(tz.get(o, 1e9) > tz[m["ziele"][0]] for o in m["ziele"][1:])]
            if not kand:
                pruefe(False, "Schwenk: keine Meldung mit mehreren Fahrzeugen, deren erstes zuerst zerstört wird")
            else:
                m = kand[0]
                erst = m["ziele"][0]
                zeit(sl, m["t_s"])
                oeffne(zb, m["id"])
                zeit(sl, tz[erst] + 5)
                warte(lambda: sl.evaluate(f"() => window.argus.stand.zustand.zerstoert['{erst}'] ?? null") is not None, 15, f"{erst} zerstört")
                te = sl.evaluate(f"() => window.argus.stand.zustand.zerstoert['{erst}']")
                status = lambda: zb.locator("[data-testid=live-fenster] .live-status").inner_text()  # noqa: E731
                a0 = setze(te + 0.25)
                k0 = (a0["kamera"]["ziel"], a0["kamera"]["rauschen"], status())
                a1 = setze(te + 0.5 + 0.22)
                k1 = (a1["kamera"]["ziel"], a1["kamera"]["rauschen"], status())
                foto(zb, f"{m['id']}_schwenk")
                a2 = setze(te + 2)
                k2 = (a2["kamera"]["ziel"], a2["kamera"]["rauschen"], status())
                foto(zb, f"{m['id']}_naechstes")
                mitte = next((mk for mk in a2["marken"] if mk == k2[0]), None)
                pruefe(k0[0] == erst and k0[1] == 0 and k1[1] > 0.5 and "AUSRICHTUNG" in k1[2] and k2[0] != erst and k2[0] in m["ziele"]
                       and k2[1] == 0 and "LIVE" in k2[2] and mitte is not None,
                       f"{m['id']} Schwenk: {erst} zerstört {te:.1f} s; +0,25 s {k0}; +0,72 s {k1[0]} Rauschen {k1[1]:.2f} „{k1[2]}“; "
                       f"+2 s {k2[0]} „{k2[2]}“, ARGUS-Rahmen am neuen Ziel: {mitte is not None}")

            fall("M18", "S4 Kinder", "kind", None, None, 0, man["drohne"]["M18"]["t_s"] + 5)
            fall("M21", "N2 weißes Tuch", "tuch", None, "weiss", 40, man["drohne"]["M21"]["t_s"] + 5)
            ctx.close()

        if not a.nur_bildrate:
            # ---------------------------------------------------------------- 6. Merkmale im Bild (2.4, E6.3)
            sz = json.load(open(os.path.join(HIER, "..", "public", "daten", "szenario_kraehe_01.json"), encoding="utf-8"))
            ctx, sl, zb = raum("merkmale")
            for m in sorted(sz["meldungen"], key=lambda m: m["t_s"]):
                for mk in m["bild"].get("merkmale") or []:
                    merkmal(sl, zb, m, mk)
            ctx.close()

            # ---------------------------------------------------------------- 7. EloKa global (2.4, E4)
            ctx, sl, zb = raum("eloka")
            t25 = man["drohne"]["M25"]["t_s"]
            zeit(sl, t25 + 2)
            oeffne(zb, "M25")
            foto(zb, "eloka_M25_gestoert")
            vorher = live(zb)["eloka"]
            te = bekaempfen(zb, "M25", "MRS")
            sl.evaluate("(t) => window.argus.senden('uhr', { befehl: 'setzen', t_s: t })", te + 3)
            warte(lambda: sl.evaluate("() => window.argus.stand.zustand.zerstoert['Z-23'] ?? null") is not None, 20, "EloKa zerstört")
            nachher = live(zb)["eloka"] if zb.evaluate(f"() => {LIVE}?.argusLive?.meldung") == "M25" else None
            t11 = man["drohne"]["M11"]["t_s"]
            zeit(sl, t11 + 2)
            oeffne(zb, "M11")
            zb.wait_for_timeout(400)
            foto(zb, "eloka_M11_klar")
            m11 = live(zb)["eloka"]
            gestoert = sl.evaluate("() => window.argus.stand.zustand.meldungen.M11?.gestoert ?? false")
            pruefe(vorher > 0 and m11 == 0 and not gestoert and (nachher in (None, 0)),
                   f"EloKa: M25 live gestört ({vorher}); Mörser-Einschlag {te:.0f} s, Z-23 zerstört; M11 ({t11} s) danach klar "
                   f"(EloKa {m11}), ARGUS ungestört (gestoert={gestoert})")
            ctx.close()
        browser.close()

        # ---------------------------------------------------------------- 5. Bildrate bei laufender Uhr
        # M17: der BMP-2 fährt ca. 3 min durchs Bild zur Schule (bei ×10 reicht das für die Messung); beim Panzerzug
        # (M13) stünde nach 20 s Spielzeit die Aufnahme da, und die wird nicht neu gezeichnet.
        # Wie am Team-Laptop: die Zielbearbeitung allein (die Spielleitung startet die Uhr und schließt dann ihr Fenster; die
        # Uhr läuft am Team-Laptop weiter – er rechnet das Spiel). Ohne Grafikkarte in der Testumgebung: Rückfall Canvas für Karte und Seite – so misst
        # auch docs/ENGINE.md die Karte. Mit WebGL über SwiftShader schafft hier schon eine leere Seite nur ca. 9 Bilder/s.
        browser = p.chromium.launch(args=["--disable-gpu", "--disable-software-rasterizer"])
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
        proben = []
        for nr, (tempo, gross) in enumerate([] if a.nur_merkmale else [(1, False), (10, False), (1, True)]):
            raumname = f"{a.raum}-fps{nr}"
            sl = ctx.new_page()
            sl.goto(adresse(a.basis, "sl", raumname))
            warte(lambda: sl.locator(".rahmen[data-host='1']").count() == 1, 20, "SL steuert")
            zb = ctx.new_page()
            zb.on("pageerror", lambda e: konsole.append(f"zb: pageerror: {e}"))
            zb.goto(adresse(a.basis, "zb", raumname))
            zb.get_by_role("button", name="Übersicht überspringen").click()
            zb.get_by_role("button", name="Überspringen").click()
            zeit(sl, man["drohne"][FPS_MELDUNG]["t_s"])
            sl.get_by_role("button", name=f"×{tempo}", exact=True).click()
            zeile = zb.locator(f"[data-testid=eingang] button[data-meldung={FPS_MELDUNG}]")
            warte(lambda: zeile.count() == 1, 20, FPS_MELDUNG)
            sl.get_by_role("button", name="▶ Start").click()
            zb.wait_for_timeout(400)
            sl.close()
            zeile.click()
            if gross:
                zb.get_by_role("button", name="Drohnenbild vergrößern").click()
            sel = GROSS if gross else LIVE
            zb.evaluate("() => { window.__argusLiveMessen = true; }")
            # Einschwingen abwarten: Das erste Bild nach dem Öffnen setzt den Grund im Maßstab der Anzeige zusammen (einmalig
            # 100–200 ms, auch auf dem Stand vor 2.1); das gleitende Maximum (×0,98 je Bild) klingt erst nach ca. 4 s ab.
            zb.wait_for_timeout(4000)
            werte_fps, werte_ms, karte = [], [], []
            for _ in range(5):
                zb.wait_for_timeout(1100)
                x = zb.evaluate(f"() => {{ const c = {sel}; return c && {{ fps: Number(c.dataset.fps || 0), ms: c.argusLive?.bildMs }}; }}")
                k = zb.evaluate("() => document.querySelector('[data-testid=lagekarte] .karte-leinwand')?.argusKarte?.diagnose")
                if x:
                    werte_fps.append(x["fps"])
                    werte_ms.append(x["ms"]["max"])
                if k:
                    karte.append((k["fps"], k["bildMs"]["max"], k["renderer"]))
            name = "Vergrößerung" if gross else "Drohnenbild an der Meldung"
            fps = werte_fps[1:] or [0]
            ms = max(werte_ms[1:] or [99])
            proben.append({"wo": name, "tempo": tempo, "fps": werte_fps, "ms_max": round(ms, 1), "karte": karte})
            pruefe(min(fps) >= 24 and ms <= 33, f"Bildrate {name} ×{tempo} (Zielbearbeitung allein, Canvas): {min(fps)}–{max(fps)} Bilder/s (Ziel 30), "
                                              f"Zeichnen höchstens {ms:.1f} ms je Bild (Budget 33 ms); Karte daneben {karte[-1][0] if karte else '–'} Bilder/s, "
                                              f"höchstens {max([x[1] for x in karte] or [0])} ms ({karte[-1][2] if karte else '–'})")
            zb.close()
        with open(os.path.join(a.bilder, "bildrate.json"), "w", encoding="utf-8") as f:
            json.dump(proben, f, ensure_ascii=False, indent=1)
        browser.close()

    fehler += [k for k in konsole if "pageerror" in k or ": error:" in k]
    with open(os.path.join(a.bilder, "ergebnis.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(zeilen) + "\n")
    if fehler:
        print("\n".join(["FEHLER:"] + fehler[:30]))
        sys.exit(1)
    print(f"OK – Live-Drohnenbild: {len(zeilen)} Prüfpunkte erfüllt, Fotos in {a.bilder}")


if __name__ == "__main__":
    main()
