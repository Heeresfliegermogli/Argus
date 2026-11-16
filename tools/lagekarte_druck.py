#!/usr/bin/env python3
"""Saubere Lagekarte für Folien und Handzettel (seit Liste P, P5): ganze Karte 10 : 7 als PNG.

Inhalt: Luftbild des Raums KRÄHE, Raster 100 m mit Planquadraten, Schule (No-Strike-Zone) und Ortschaft KRÄHE (Einschränkungsgebiet),
Brücke ELSTER und Furt Nord, Bach und Wälder, die vier eigenen Panzer 1/1–1/4 mit dem Zeichen „Kampfpanzer, schwer“ (APP-6/2525C
SFGPEVATH, gezeichnet mit milsymbol wie im Spiel) und darüber die Kompanie „2./PzBtl 613“ (Panzerkompanie, eigen). Keine Feindzeichen,
keine Ziele, keine Personen. Alles aus den Daten (public/daten) – Gelände, Einheiten und Namen sind frei erfunden.

Aufruf (im Repo-Wurzelordner, nach npm ci):
  python3 tools/lagekarte_druck.py docs/bilder/liste-p/lagekarte_druck_1500x1050.png [--breite 1500]
"""
import argparse
import base64
import json
import os
import sys

from playwright.sync_api import sync_playwright

WURZEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATEN = os.path.join(WURZEL, "public", "daten")
ASSETS = os.path.join(WURZEL, "public", "assets")
MILSYMBOL = os.path.join(WURZEL, "node_modules", "milsymbol", "dist", "milsymbol.js")

ZEICHEN_PANZER = "SFGPEVATH------"      # wie src/kern/lagebild.ts (ZEICHEN_EIGENER_PANZER)
ZEICHEN_KOMPANIE = "SFGPUCA----E---"    # Panzertruppe, Größe Kompanie, eigen (wie zeichenKraft in src/karte/zeichen.ts)


def lade(name):
    with open(os.path.join(DATEN, name), encoding="utf-8") as f:
        return json.load(f)


def seite(breite):
    sz = lade("szenario_kraehe_01.json")
    karte = lade(sz["kataloge"]["karte"])
    W, H = karte["ausdehnung_m"]["breite"], karte["ausdehnung_m"]["hoehe"]
    hoehe = round(breite * H / W)
    s = breite / W
    with open(os.path.join(ASSETS, karte["bilder"]["luftbild"]), "rb") as f:
        luftbild = "data:image/webp;base64," + base64.b64encode(f.read()).decode()
    et = sz["eigene_truppe"]
    zonen = []
    for z in sz["zonen"]:
        pts = " ".join(f"{x * s:.1f},{y * s:.1f}" for x, y in z["geometrie"]["punkte"])
        if z["typ"] == "no_strike":
            zonen.append(f'<polygon points="{pts}" fill="rgba(216,68,58,.28)" stroke="#e0463b" stroke-width="3"/>')
        else:
            zonen.append(f'<polygon points="{pts}" fill="rgba(229,138,36,.10)" stroke="#f0a032" stroke-width="2.5" stroke-dasharray="10 6"/>')
    raster = []
    zelle = karte["raster"]["zelle_m"]
    for i in range(1, W // zelle):
        raster.append(f'<line x1="{i * zelle * s}" y1="0" x2="{i * zelle * s}" y2="{hoehe}" />')
    for j in range(1, H // zelle):
        raster.append(f'<line x1="0" y1="{j * zelle * s}" x2="{breite}" y2="{j * zelle * s}" />')
    pq = []
    for i, sp in enumerate(karte["raster"]["spalten"]):
        for j in range(H // zelle):
            pq.append(f'<text x="{i * zelle * s + 5}" y="{j * zelle * s + 14}">{sp}{j + karte["raster"]["zeilen_ab"]}</text>')
    namen = []
    for n in karte["namen"]:
        if n["text"] in {p["name"] for p in karte.get("punkte", [])}:
            continue
        x, y = n["pos"][0] * s, n["pos"][1] * s
        groesse = 22 if n["text"].startswith(("Wald", "Ortschaft")) else 19
        namen.append(f'<text class="name" x="{x:.0f}" y="{y:.0f}" font-size="{groesse}">{n["text"]}</text>')
    for z in sz["zonen"]:
        if z["typ"] == "no_strike":
            xs = [p[0] for p in z["geometrie"]["punkte"]]
            ys = [p[1] for p in z["geometrie"]["punkte"]]
            namen.append(f'<text class="name schule" x="{(min(xs) + max(xs)) / 2 * s:.0f}" y="{max(ys) * s + 26:.0f}" font-size="22">SCHULE</text>')
    punkte = []
    for p in karte.get("punkte", []):
        x, y = p["pos"][0] * s, p["pos"][1] * s
        form = (f'<rect x="{x - 7}" y="{y - 7}" width="14" height="14" fill="#fff" stroke="#14407a" stroke-width="3"/>' if p["art"] == "bruecke"
                else f'<circle cx="{x}" cy="{y}" r="7" fill="#fff" stroke="#14407a" stroke-width="3"/>')
        punkte.append(form + f'<text class="punkt" x="{x - 14:.0f}" y="{y - 12:.0f}" text-anchor="end">{p["name"]}</text>')
    panzer = [{"name": p["name"], "x": p["pos"][0] * s, "y": p["pos"][1] * s} for p in et["panzer"]]
    oben = min(p["y"] for p in panzer)
    kp = {"text": et["einheit"], "x": panzer[0]["x"], "y": oben - 58}
    return breite, hoehe, f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html, body {{ margin: 0; padding: 0; }}
body {{ width: {breite}px; height: {hoehe}px; position: relative; overflow: hidden; font-family: "DejaVu Sans", "Barlow Semi Condensed", sans-serif; }}
#bild {{ position: absolute; inset: 0; width: {breite}px; height: {hoehe}px; }}
svg {{ position: absolute; inset: 0; }}
.raster line {{ stroke: rgba(255,255,255,.28); stroke-width: 1; }}
.pq text {{ fill: rgba(255,255,255,.7); font-size: 12px; font-family: "DejaVu Sans Mono", monospace; }}
.name {{ fill: #fff; font-weight: 700; text-anchor: middle; paint-order: stroke; stroke: rgba(0,0,0,.75); stroke-width: 4px; }}
.schule {{ fill: #ff6a5e; }}
.punkt {{ fill: #fff; font-size: 16px; font-weight: 700; paint-order: stroke; stroke: rgba(0,0,0,.8); stroke-width: 4px; }}
.zeichen {{ position: absolute; line-height: 0; }}
.pzname {{ position: absolute; color: #fff; font-weight: 700; font-size: 20px; transform: translateY(-50%); text-shadow: 0 0 3px #000, 0 0 3px #000, 0 0 5px #000; }}
.kp {{ position: absolute; color: #fff; font-weight: 700; font-size: 22px; transform: translateY(-50%); text-shadow: 0 0 3px #000, 0 0 3px #000, 0 0 6px #000; white-space: nowrap; }}
.fuss {{ position: absolute; left: 12px; bottom: 10px; color: #fff; font-size: 13px; letter-spacing: .04em; text-shadow: 0 0 3px #000, 0 0 3px #000; }}
.nord {{ position: absolute; right: 30px; bottom: 74px; color: #fff; font-weight: 700; font-size: 18px; text-align: center; text-shadow: 0 0 3px #000; }}
.massstab {{ position: absolute; right: 30px; bottom: 24px; color: #fff; font-size: 13px; text-shadow: 0 0 3px #000; }}
.massstab i {{ display: inline-block; height: 7px; width: {100 * s:.0f}px; background: #fff; border: 1px solid #000; }}
.massstab i + i {{ background: #222; }}
</style><script>{open(MILSYMBOL, encoding="utf-8").read()}</script></head><body>
<img id="bild" src="{luftbild}">
<svg width="{breite}" height="{hoehe}"><g class="raster">{''.join(raster)}</g><g class="pq">{''.join(pq)}</g>{''.join(zonen)}{''.join(namen)}{''.join(punkte)}</svg>
<div class="fuss">ÜBUNG · FIKTIVES GELÄNDE · Raum KRÄHE · Raster {zelle} m</div>
<div class="nord">▲<br>N</div>
<div class="massstab">0 <i></i><i></i> 200 m</div>
<script>
const panzer = {json.dumps(panzer)};
const kp = {json.dumps(kp)};
for (const p of panzer) {{
  const sym = new ms.Symbol("{ZEICHEN_PANZER}", {{ size: 34, outlineWidth: 3, outlineColor: "rgba(255,255,255,0.85)" }});
  const d = document.createElement("div");
  const a = sym.getAnchor();   // Mitte des Rahmens (milsymbol), nicht die Mitte des Bildes
  d.className = "zeichen"; d.style.left = p.x + 8 - a.x + "px"; d.style.top = p.y - a.y + "px";
  d.innerHTML = sym.asSVG();
  document.body.appendChild(d);
  const n = document.createElement("div");
  n.className = "pzname"; n.textContent = p.name; n.style.left = p.x + 34 + "px"; n.style.top = p.y + "px";
  document.body.appendChild(n);
}}
const k = new ms.Symbol("{ZEICHEN_KOMPANIE}", {{ size: 34, outlineWidth: 3, outlineColor: "rgba(255,255,255,0.85)" }});
const kd = document.createElement("div");
const ka = k.getAnchor();
kd.className = "zeichen"; kd.style.left = kp.x + 8 - ka.x + "px"; kd.style.top = kp.y - ka.y + "px"; kd.innerHTML = k.asSVG();
document.body.appendChild(kd);
const kt = document.createElement("div");
kt.className = "kp"; kt.textContent = kp.text; kt.style.left = kp.x + 44 + "px"; kt.style.top = kp.y + "px";
document.body.appendChild(kt);
window.fertig = true;
</script></body></html>"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ziel")
    ap.add_argument("--breite", type=int, default=1500)
    a = ap.parse_args()
    breite, hoehe, html = seite(a.breite)
    os.makedirs(os.path.dirname(os.path.abspath(a.ziel)), exist_ok=True)
    tmp = os.path.abspath(a.ziel) + ".html"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(html)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={"width": breite, "height": hoehe}, device_scale_factor=1)
            pg.goto("file://" + tmp)
            pg.wait_for_function("() => window.fertig === true && document.getElementById('bild').complete")
            pg.wait_for_timeout(300)
            pg.screenshot(path=a.ziel)
            b.close()
    finally:
        os.remove(tmp)
    print(f"Lagekarte {breite} × {hoehe} → {a.ziel}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
