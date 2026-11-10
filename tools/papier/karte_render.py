#!/usr/bin/env python3
"""Schematische Karten Raum KRÄHE aus den Szenariodaten (matplotlib, maßstäblich 1:4.000 auf A4 quer).

Varianten:
  kontrolle  – Kontrollkarte der Spielleitung: alle Ziele mit Ground Truth, Routen, Schlüsselfälle
  lage       – leere Lagekarte für das Team (Zielbearbeitung) auf Papier: Raster, Zonen, eigene Kräfte, Wirkradius-Schablone

Seit Szenario 2.0: Ziele stehen an ihrer Position zur ersten Meldung (bzw. in ihrer Stellung), Routen dünn mit Pfeil,
Fahrzeuge, die das Hintergrundgefecht zerstört, sind mit „H“ und Uhrzeit beschriftet.
Seit Szenario 2.1: Zonen mit sichtbarem Namen („Schule“, „Ortschaft“ statt NS-01/EZ-01); auf der Kontrollkarte die
Durchbruch-Routen (D-01–D-08) grau gepunktet mit Nummer und Zeitpunkt.
Seit 26.10.2026: Spieluhr 00:00–25:00 (argus_lib.uhrzeit liefert mm:ss), Rollennamen statt G2/G3.
Seit Szenario 2.2 (28.10.2026): neuer Spähpanzer Z-37 (M30) beschriftet; Fahrzeuge fahren vom Kartenrand ein, die Marke steht
weiter an der Position zur ersten Meldung.
Seit Szenario 2.3 (01.11.2026, D1): die drei Züge der 2. Kompanie in ihren Stellungen am Westrand (blau, je drei SPz) auf
beiden Karten.
Seit Szenario 2.5 (02.11.2026, F1): statt der Züge die vier Kampfpanzer der eigenen Truppe einzeln (Zeichen Kampfpanzer blau,
Kennung 1/1–1/4) mit dem Namen der Einheit (seit dem Folgeauftrag F5 „1./PzBtl 613“); Zone „Schule“; „(H mm:ss)“ = von der
Kanone der eigenen Kp zerstört.
Seit Szenario 2.6 (09.11.2026, H): eine Rolle je Team – die Lagekarte heißt „Lagekarte Zielbearbeitung“ (Datei Lagekarte_Team).

Aufruf: python3 karte_render.py OUTDIR
"""
import math
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MPoly, Rectangle, Circle, FancyArrowPatch
from matplotlib.lines import Line2D

import argus_lib as L

MM = 1 / 25.4
MASSSTAB = 4000                     # 1 mm Papier = 4 m Gelände
FARBEN = {
    "feind": "#c62828", "verbuendet": "#1565c0", "zivil": "#2e7d32", "geschuetzt": "#2e7d32",
    "attrappe": "#757575", "ausser_gefecht": "#ef6c00",
}
NAMEN_GT = {
    "feind": "Feind (legitimes Ziel)", "verbuendet": "verbündet (PL)", "zivil": "zivil",
    "geschuetzt": "geschützt (Sanität)", "attrappe": "Attrappe", "ausser_gefecht": "außer Gefecht",
}
MARKER = {"feind": "D", "verbuendet": "s", "zivil": "o", "geschuetzt": "P", "attrappe": "D", "ausser_gefecht": "D"}
# Beschriftung: Versatz (dx, dy) in Metern je Ziel bzw. Gruppe, damit sich nichts überdeckt
VERSATZ = {
    "Z-01–02": (8, -12), "Z-02": (-8, -14), "Z-03–04": (-10, 6), "Z-05": (10, -8), "Z-06": (-8, 12), "Z-07": (10, -8),
    "Z-08": (10, -10), "Z-09–11": (10, 10), "Z-29": (10, -6), "Z-13": (-6, -14), "Z-12": (-6, 22), "Z-30–32": (-6, -16),
    "Z-14": (12, 14), "Z-33–35": (12, 14), "Z-18": (-10, 18), "Z-36": (10, 6), "Z-19": (12, -10), "Z-20": (10, 12),
    "Z-21": (-8, 10), "Z-15–17": (10, 0), "Z-24": (-8, -12), "Z-22": (-8, 12), "Z-23": (-8, 12), "Z-25": (-6, 18),
    "Z-26": (10, 0), "Z-27": (-6, 34), "Z-28": (12, 34), "Z-37": (10, 10),
}


def gelaende(ax, d, raster_aussen=True, nur_gelaende=False):
    """Gelände, Raster, Zonen, Namen und eigene Kräfte in ein vorbereitetes Achsenobjekt zeichnen."""
    k = d["karte"]
    for f in k["flaechen"]:
        if f["art"] == "wald":
            ax.add_patch(MPoly(f["punkte"], closed=True, fc="#b9d3a5", ec="#7fa36a", lw=0.6, zorder=1))
        elif f["art"] == "hof":
            ax.add_patch(MPoly(f["punkte"], closed=True, fc="#e3dccb", ec="#b5a98c", lw=0.4, zorder=1))
        elif f["art"] == "schule":
            ax.add_patch(MPoly(f["punkte"], closed=True, fc="#e8eedf", ec="none", zorder=1))
    for l in k["linien"]:
        pts = L.glatt(l["punkte"]) if l.get("glatt") else l["punkte"]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        if l["art"] == "strasse":
            ax.plot(xs, ys, color="#8d8d8d", lw=2.4, solid_capstyle="round", zorder=2)
            ax.plot(xs, ys, color="#fafafa", lw=1.2, solid_capstyle="round", zorder=2)
        elif l["art"] == "feldweg":
            ax.plot(xs, ys, color="#a1887f", lw=0.9, ls=(0, (4, 2)), zorder=2)
        elif l["art"] == "gewaesser":
            ax.plot(xs, ys, color="#4a90c8", lw=1.8, zorder=2)
    for g in k["gebaeude"]:
        cx, cy = g["mitte"]
        a = math.radians(g["winkel"])
        ca, sa = math.cos(a), math.sin(a)
        hl, hb = g["laenge"] / 2, g["breite"] / 2
        pts = [(cx + x * ca - y * sa, cy + x * sa + y * ca) for x, y in ((-hl, -hb), (hl, -hb), (hl, hb), (-hl, hb))]
        fc = "#9e9e9e" if g["art"] != "sportplatz" else "#c5dbb0"
        ax.add_patch(MPoly(pts, closed=True, fc=fc, ec="#616161", lw=0.4, zorder=3))
    # Bebauung andeuten
    for seg, rng in (("hauptstrasse", (500, 800)), ("nordstrasse", None)):
        for i, p in enumerate(L.linie(k, seg)):
            if i % 3:
                continue
            if rng and not rng[0] <= p[0] <= rng[1]:
                continue
            if seg == "nordstrasse" and p[1] > 340:
                continue
            for off in (-17, 17):
                q = (p[0], p[1] + off) if seg == "hauptstrasse" else (p[0] + off, p[1])
                ax.add_patch(Rectangle((q[0] - 5, q[1] - 4), 10, 8, fc="#bcaaa4", ec="#8d6e63", lw=0.3, zorder=3))

    if nur_gelaende:          # Luftbild-Grundlage: kein Raster, keine Zonen, keine Schrift
        return
    # Raster und PQ
    sp = k["raster"]["spalten"]
    for i in range(1, 10):
        ax.axvline(i * 100, color="#000", lw=0.3, alpha=0.35, zorder=4)
    for j in range(1, 7):
        ax.axhline(j * 100, color="#000", lw=0.3, alpha=0.35, zorder=4)
    for i in range(10):
        for j in range(7):
            ax.text(i * 100 + 4, j * 100 + 4, f"{sp[i]}{j + 1}", fontsize=5.5, color="#555", va="top", ha="left", zorder=4)
    for i in range(10 if raster_aussen else 0):
        ax.text(i * 100 + 50, -8, sp[i], fontsize=7, ha="center", va="bottom", weight="bold", clip_on=False)
    for j in range(7 if raster_aussen else 0):
        ax.text(-8, j * 100 + 50, str(j + 1), fontsize=7, ha="right", va="center", weight="bold", clip_on=False)

    # Zonen (sichtbarer Name seit 2.1, die ID bleibt intern)
    for z in d["szenario"]["zonen"]:
        pts = z["geometrie"]["punkte"]
        if z["typ"] == "no_strike":
            ax.add_patch(MPoly(pts, closed=True, fc="#e53935", alpha=0.18, ec="none", zorder=5))
            ax.add_patch(MPoly(pts, closed=True, fill=False, ec="#c62828", lw=1.4, hatch="////", zorder=5))
            ax.text(pts[3][0] + 4, pts[3][1] - 6, L.zonen_name(z).upper(), color="#b71c1c", fontsize=7, weight="bold", zorder=9)
        else:
            ax.add_patch(MPoly(pts, closed=True, fc="#ff9800", alpha=0.10, ec="none", zorder=5))
            ax.add_patch(MPoly(pts, closed=True, fill=False, ec="#ef6c00", lw=1.0, ls=(0, (5, 2)), zorder=5))
            ax.text(500, 438, f"{L.zonen_name(z)} ≤ {z['max_wirkradius_m']} m", color="#e65100", fontsize=6.5, weight="bold", zorder=9)

    # Namen
    for n in k["namen"]:
        if n["text"] in ("Brücke ELSTER",):
            continue
        ax.text(n["pos"][0], n["pos"][1], n["text"], fontsize=7.5, style="italic", color="#333", ha="center", zorder=6,
                bbox=dict(fc="white", ec="none", alpha=0.6, pad=0.6))
    for p in k.get("punkte", []):
        ax.plot(*p["pos"], marker="s" if p["art"] == "bruecke" else "o", ms=4, mfc="white", mec="#1f4e79", zorder=7)
        ax.text(p["pos"][0] - 10, p["pos"][1] - 6, p["name"], fontsize=6.5, ha="right", color="#1f4e79", weight="bold", zorder=7)

    # Eigene Kräfte: außerhalb nur als Pfeil am Westrand
    aussen = [kr for kr in d["szenario"]["kraefte"] if kr.get("ausserhalb")]
    if aussen:
        ys = [kr["pfeil_y"] for kr in aussen]
        ym = sum(ys) / len(ys)
        ax.add_patch(FancyArrowPatch((95, ym), (6, ym), arrowstyle="simple,head_length=14,head_width=16,tail_width=7",
                                     mutation_scale=1, fc="#1565c0", ec="#0d47a1", lw=0.8, alpha=0.9, zorder=8))
        ds = sorted(-kr["pos"][0] for kr in aussen)
        ent = f"ca. {ds[0]} m" if ds[0] == ds[-1] else f"ca. {ds[0]}–{ds[-1]} m"
        ax.text(12, ym + 22, "eigene Kräfte\n" + " · ".join(kr["name"] for kr in aussen) + "\n" + ent + " westlich",
                fontsize=6.3, color="#0d47a1", weight="bold", va="top", zorder=8)
    hat_panzer = bool((d["szenario"].get("eigene_truppe") or {}).get("panzer"))
    for kr in d["szenario"]["kraefte"]:
        if kr.get("ausserhalb") or hat_panzer:          # seit 2.5 stehen die Panzer einzeln (unten)
            continue
        x, y = kr["pos"]
        ax.add_patch(Rectangle((x - 22, y - 14), 44, 28, fc="#90caf9", ec="#0d47a1", lw=1.0, zorder=8))
        ax.plot([x - 22, x + 22], [y - 14, y + 14], color="#0d47a1", lw=0.8, zorder=8)
        ax.plot([x - 22, x + 22], [y + 14, y - 14], color="#0d47a1", lw=0.8, zorder=8)
        ax.add_patch(matplotlib.patches.Ellipse((x, y), 30, 12, fill=False, ec="#0d47a1", lw=0.8, zorder=8))
        ax.text(x, y + 26, kr["name"], fontsize=6.5, ha="center", va="top", color="#0d47a1", weight="bold", zorder=8)

    # Eigene Truppe (seit 2.5): vier Kampfpanzer einzeln – Rahmen blau mit Ellipse (APP-6 Kampfpanzer), Kennung daneben, Einheit darüber
    et = d["szenario"].get("eigene_truppe") or {}
    pl = et.get("panzer", [])
    for p in pl:
        x, y = p["pos"]
        ax.add_patch(Rectangle((x - 10, y - 6.5), 20, 13, fc="#90caf9", ec="#0d47a1", lw=0.8, zorder=8))
        ax.add_patch(matplotlib.patches.Ellipse((x, y), 13, 6, fill=False, ec="#0d47a1", lw=0.7, zorder=8))
        ax.text(x + 13, y, p["name"], fontsize=6.0, ha="left", va="center", color="#0d47a1", weight="bold", zorder=8,
                bbox=dict(fc="white", ec="none", alpha=0.7, pad=0.3))
    if pl:
        kp = next((k for k in d["szenario"]["kraefte"] if k.get("zugehoerigkeit") == "eigen" and not k.get("ausserhalb")), None)
        top = min(p["pos"][1] for p in pl)
        ax.text(min(p["pos"][0] for p in pl) - 12, top - 12, (kp or {}).get("name", et.get("einheit", "")), fontsize=6.0, ha="left",
                va="bottom", color="#0d47a1", weight="bold", zorder=8, bbox=dict(fc="white", ec="none", alpha=0.7, pad=0.3))
    for zug in et.get("zuege", []):           # bis 2.4: Züge mit Fahrzeugen in Stellung
        a = math.radians(zug.get("hdg", 0))
        ca, sa = math.cos(a), math.sin(a)
        for x, y in zug["fahrzeuge"]:
            pts = [(x + u * ca - v * sa, y + u * sa + v * ca) for u, v in ((-4, -2.2), (4, -2.2), (4, 2.2), (-4, 2.2))]
            ax.add_patch(MPoly(pts, closed=True, fc="#1565c0", ec="#0d47a1", lw=0.5, zorder=8))
        xs, ys = [p[0] for p in zug["fahrzeuge"]], [p[1] for p in zug["fahrzeuge"]]
        ax.text(min(xs) - 6, max(ys) + 8, f"{zug['name']} ({zug['ort']})", fontsize=5.8, ha="left", va="top", color="#0d47a1",
                weight="bold", zorder=8, bbox=dict(fc="white", ec="none", alpha=0.7, pad=0.3))

    # Nordpfeil, Maßstab
    ax.annotate("", xy=(975, 590), xytext=(975, 640), arrowprops=dict(arrowstyle="-|>", color="k", lw=1.2), zorder=9)
    ax.text(975, 655, "N", ha="center", va="top", fontsize=8, weight="bold", zorder=9)


def basis(d, titel):
    k = d["karte"]
    W, H = k["ausdehnung_m"]["breite"], k["ausdehnung_m"]["hoehe"]
    fig = plt.figure(figsize=(297 * MM, 210 * MM))
    # Kartenfeld exakt im Maßstab: 1000 m → 250 mm, 700 m → 175 mm
    left, bottom = 12 * MM / (297 * MM), 18 * MM / (210 * MM)
    ax = fig.add_axes([left, bottom, (W / MASSSTAB * 1000) / 297, (H / MASSSTAB * 1000) / 210])
    ax.set_xlim(0, W)
    ax.set_ylim(H, 0)
    ax.set_aspect("equal")
    ax.set_facecolor("#f4f1e6")
    ax.tick_params(left=False, bottom=False, labelleft=False, labelbottom=False)
    for s in ax.spines.values():
        s.set_linewidth(0.8)

    gelaende(ax, d)
    fig.text(left, 10 * MM / (210 * MM), f"Maßstab 1:{MASSSTAB:,}".replace(",", ".") + "  (1 cm = 40 m) · Raster 100 m · "
             "ÜBUNG · FIKTIVES GELÄNDE", fontsize=7)
    fig.text(left, 1 - 8 * MM / (210 * MM), titel, fontsize=11, weight="bold", va="top")
    return fig, ax


def schablone(fig, d):
    """Wirkradius-Schablone im Kartenmaßstab (1 Einheit = 1 m = 0,25 mm) am rechten Rand.

    Große Radien passen nicht als Kreis in die Randspalte; sie stehen als maßstäbliche
    Radiuslinie zum Abgreifen mit dem Zirkel da.
    """
    x0 = (12 + 250 + 8) * MM / (297 * MM)
    ax = fig.add_axes([x0, 18 * MM / (210 * MM), 25 / 297, 175 / 210])
    ax.set_xlim(0, 100)
    ax.set_ylim(700, 0)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.text(50, 4, "Wirkradius\nmaßstäblich\n(Zirkel)", ha="center", va="top", fontsize=6.5, weight="bold")
    y = 80
    for w in sorted(d["wirkmittel"].values(), key=lambda w: -w["wirkradius_m"]):
        r = w["wirkradius_m"]
        mm = r / MASSSTAB * 1000
        lab = f"{w['kurz']} {r} m = {mm:.1f} mm".replace(".", ",")
        if r > 50:
            ax.plot([30, 30], [y, y + r], color="#333", lw=1.2)
            for yy in (y, y + r):
                ax.plot([24, 36], [yy, yy], color="#333", lw=1.0)
            ax.text(40, y + r / 2, lab, rotation=90, ha="left", va="center", fontsize=5.8)
            y += r + 22
        else:
            ax.add_patch(Circle((50, y + r), r, fill=False, ec="#333", lw=0.8))
            ax.plot(50, y + r, marker="+", color="#333", ms=3)
            ax.text(50, y + 2 * r + 5, lab, ha="center", va="top", fontsize=5.8)
            y += 2 * r + 30


def durchbrueche(ax, sz, start):
    """Durchbruch-Routen (nur Szenario-Gruppen, ohne Verstärkungen): grau gepunktet ab t_s, Nummer am Bachübergang."""
    beschriftet = set()
    for g in (sz.get("durchbruch") or {}).get("gruppen", []):
        for zid, r in g["routen"].items():
            ax.plot([q[1] for q in r], [q[2] for q in r], color="#424242", lw=0.6, ls=(0, (1, 1.6)), alpha=0.75, zorder=9)
        erst = min(g["ueber_s"], key=g["ueber_s"].get)
        r = g["routen"][erst]
        u = g["ueber_s"][erst]
        p = min(r, key=lambda q: abs(q[0] - u))
        schluessel = (round(p[1] / 25), round(p[2] / 25))
        if schluessel in beschriftet:
            continue
        beschriftet.add(schluessel)
        ids = [x["id"] for x in sz["durchbruch"]["gruppen"] if x["ueber"] == g["ueber"]]
        ax.text(p[1] - 6, p[2] + 10, f"{ids[0]}–{ids[-1][2:]}" if len(ids) > 1 else ids[0], fontsize=5.8, color="#424242",
                ha="right", va="top", zorder=13, bbox=dict(fc="white", ec="none", alpha=0.8, pad=0.3))


def kontrolle(d, pfad):
    sz = d["szenario"]
    start = sz["spieluhr"]["start"]
    basis_nr = L.basis_nummern(sz)
    fig, ax = basis(d, f"Kontrollkarte Spielleitung · {sz['titel']} · Ground Truth (nicht an Spieler geben)")
    meld_t, fall = {}, {}
    for m in sz["meldungen"]:
        for z in m["ziele"]:
            meld_t.setdefault(z, m["t_s"])
            if m.get("fall"):
                fall.setdefault(z, m["fall"])
    hg = {h["ziel"]: h for h in (sz.get("hintergrund") or {}).get("ereignisse", []) if h["art"] == "panzerabwehr"}
    durchbrueche(ax, sz, start)
    for z in sz["ziele"]:
        kat = z["gt"]["kategorie"]
        c = FARBEN[kat]
        r = (z.get("bewegung") or {}).get("route")
        if r:
            xs, ys = [q[1] for q in r], [q[2] for q in r]
            ax.plot(xs, ys, color=c, lw=0.5, ls=(0, (2, 1.5)), alpha=0.55, zorder=10)
            i = max(i for i in range(1, len(r)) if (r[i][1], r[i][2]) != (r[i - 1][1], r[i - 1][2]))
            ax.add_patch(FancyArrowPatch((r[i - 1][1], r[i - 1][2]), (r[i][1], r[i][2]), arrowstyle="-|>", mutation_scale=6,
                                         color=c, lw=0.5, alpha=0.7, zorder=10))
        t0 = meld_t.get(z["id"], L.ab_s(z))
        x, y = L.position(z, t0) if not z.get("ungemeldet") else L.position(z, 1e9)
        ax.plot(x, y, marker=MARKER[kat], ms=6.0 if kat != "geschuetzt" else 8, mfc=c if kat != "attrappe" else "white",
                mec="k" if kat != "attrappe" else c, mew=0.6 if kat != "attrappe" else 1.4, zorder=12)
        for p in z.get("personen", []) or []:
            if p["art"] in ("zivil", "besatzung_ergibt_sich"):
                ax.plot(*L.position(p, t0 if p["art"] == "zivil" else max(t0, L.ab_s(p, z))), marker="o", ms=2.6,
                        mfc=FARBEN["zivil"] if p["art"] == "zivil" else FARBEN["ausser_gefecht"], mec="k", mew=0.3, zorder=12)
        if z.get("gruppe") and z["id"] != z["gruppe"].split("–")[0]:
            continue
        lab = z.get("gruppe") or z["id"]
        txt = f"{lab}  {L.uhrzeit(start, t0)}" + (f"  {fall[z['id']]}" if z["id"] in fall else "")
        if z.get("ungemeldet"):
            txt = f"{lab}  ungemeldet"
        if z["id"] in hg and hg[z["id"]].get("folge") == "zerstoert":
            txt += f"  (H {L.uhrzeit(start, hg[z['id']]['t_s'])})"
        dx, dy = VERSATZ.get(lab, (8, -6))
        ax.text(x + dx, y + dy, txt, fontsize=6.0, ha="left" if dx >= 0 else "right", va="center", zorder=13,
                weight="bold" if z["id"] in fall else "normal", color="#111",
                bbox=dict(fc="#fff59d" if z["id"] in fall and fall[z["id"]].startswith("S") else "white", ec="none", alpha=0.85, pad=0.4))
    hand = [Line2D([], [], marker=MARKER[k], ls="", mfc=c if k != "attrappe" else "white", mec="k" if k != "attrappe" else c, ms=6,
                   label=NAMEN_GT[k]) for k, c in FARBEN.items()]
    hand.append(Line2D([], [], marker="o", ls="", mfc=FARBEN["zivil"], mec="k", ms=3, label="Zivilpersonen"))
    hand.append(Line2D([], [], color="#555", ls=(0, (2, 1.5)), label="Route (Pfeil = letzte Fahrt)"))
    if (sz.get("durchbruch") or {}).get("gruppen"):
        hand.append(Line2D([], [], color="#424242", ls=(0, (1, 1.6)), label="Durchbruch, wenn nicht aufgehalten"))
    leg = ax.legend(handles=hand, loc="lower left", fontsize=6, framealpha=0.92, title="Ground Truth · Position zur 1. Meldung",
                    title_fontsize=6.3)
    leg.set_zorder(20)
    # Schlüssel- und Nebenfälle als Kasten im Wald FUCHS (dort liegt nichts)
    lines = ["Schlüsselfälle (Reihenfolge Auswertung)"]
    for f in sorted(sz["schluesselfaelle"], key=lambda f: f["reihenfolge"]):
        m = next(m for m in sz["meldungen"] if m["id"] == f["meldung"])
        lines.append(f"{f['id']}  {L.uhrzeit(start, m['t_s'])}  Ziel {basis_nr[m['id']]}  {L.anzeige_text(f['titel'], sz)}  · Info: "
                     f"{L.anzeige_text(f['info_kurz'], sz)}")
    lines.append("Nebenfälle")
    for f in sz.get("nebenfaelle", []):
        m = next(m for m in sz["meldungen"] if m["id"] == f["meldung"])
        lines.append(f"{f['id']}  {L.uhrzeit(start, m['t_s'])}  Ziel {basis_nr[m['id']]}  {L.anzeige_text(f['titel'], sz)}")
    etn = (sz.get("eigene_truppe") or {}).get("name", "eigenen Truppe")
    lines.append(f"Ziel n = Nummer bei den Spielern · (H mm:ss) = von der Kanone der {etn} zerstört")
    if (sz.get("durchbruch") or {}).get("gruppen"):
        lines.append("D-xx = Durchbruch über Brücke/Furt (Zeitpunkte im Drehbuch, Abschnitt 8)")
    ax.text(12, 8, "\n".join(lines), fontsize=5.8, va="top", ha="left", zorder=20, linespacing=1.45,
            bbox=dict(fc="white", ec="#999", lw=0.5, alpha=0.93, pad=3))
    fig.savefig(pfad + ".pdf")
    fig.savefig(pfad + ".png", dpi=200)
    plt.close(fig)


def lage(d, pfad):
    fig, ax = basis(d, "Lagekarte Zielbearbeitung · Raum KRÄHE · Ziele mit Bleistift eintragen")
    schablone(fig, d)
    fig.savefig(pfad + ".pdf")
    fig.savefig(pfad + ".png", dpi=200)
    plt.close(fig)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out, exist_ok=True)
    d = L.lade_alles()
    kontrolle(d, os.path.join(out, "Kontrollkarte_SL"))
    lage(d, os.path.join(out, "Lagekarte_Team"))
    print("ok")
