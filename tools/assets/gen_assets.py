#!/usr/bin/env python3
"""Asset-Generator Planspiel ARGUS (Schritt 5).

Erzeugt aus den Spieldaten (public/daten) alle Bilder für das Spiel und legt sie mit einem
Manifest in public/assets/ ab:

  karte/      Luftbild in zwei Stufen + Kacheln, Topo-Karte, beschriftete Vorschau, Häuser
  drohne/     ein Drohnenbild je ARGUS-Meldung (M01 … M27) + Bilder ungemeldeter Ziele (SL)
  sprites/    Fahrzeug-Atlas (intakt, Wrack, Personen, Luftfahrzeuge) und Effekt-Atlas
  manifest.json   Verzeichnis mit Größen, Maßstäben, Rahmen der ARGUS-Markierung, Sichtstörungen

Aufruf (aus dem Repository):
  python3 tools/assets/gen_assets.py                    # alles
  python3 tools/assets/gen_assets.py --nur drohne       # nur Drohnenbilder (Manifest wird ergänzt)
  python3 tools/assets/gen_assets.py --vorschau OUT     # zusätzlich Kontaktbogen und Sprite-Bogen
Optionen: --daten DIR, --aus DIR, --cache DATEI (Gelände zwischenspeichern, spart ca. 1 min).
Benötigt Python 3.10+, numpy, scipy, Pillow (mit WebP).

Fertig-Kriterium Schritt 5 wird am Ende geprüft: Jedes Ziel im Drehbuch hat ein Bild und einen
Sprite (Exit-Code 1, wenn nicht). Alles fiktiv, alles prozedural, fester Seed.
"""
import argparse
import datetime
import io
import json
import os
import pickle
import sys
import time

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HIER)

from PIL import Image  # noqa: E402

import daten as D  # noqa: E402

MAX_DROHNE_BYTES = 150_000
BEREICHE = ("karte", "drohne", "sprites", "effekte")


def webp_begrenzt(img, pfad, q=82, max_bytes=MAX_DROHNE_BYTES):
    """Als WebP speichern; bei zu großer Datei Qualität senken (schnell ladbar am Dienst-PC)."""
    while True:
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=q, method=6)
        if buf.tell() <= max_bytes or q <= 50:
            break
        q -= 6
    os.makedirs(os.path.dirname(pfad), exist_ok=True)
    with open(pfad, "wb") as f:
        f.write(buf.getvalue())
    return buf.tell(), q


def lade_gelaende(d, cache, log):
    from gelaende import Gelaende
    if cache and os.path.exists(cache):
        with open(cache, "rb") as f:
            g = pickle.load(f)
        if getattr(g, "_quelle", None) == _datenstand(d):
            log(f"Gelände aus Zwischenspeicher {cache}")
            return g
    t = time.time()
    g = Gelaende(d, log=log)
    log(f"Gelände fertig ({time.time() - t:.0f} s, {len(g.haeuser)} Häuser)")
    if cache:
        g.d = None
        g.rng = None
        g._quelle = _datenstand(d)
        for k in ("n_mot", "n_fein", "kronenhoehe", "wald", "feldraster"):
            if hasattr(g, k):
                delattr(g, k)
        with open(cache, "wb") as f:
            pickle.dump(g, f)
    return g


def _datenstand(d):
    import zlib
    roh = json.dumps([d.karte, d.szenario["ziele"], [m["bild"] for m in d.szenario["meldungen"]]], sort_keys=True)
    return zlib.crc32(roh.encode()) ^ zlib.crc32(open(os.path.join(HIER, "gelaende.py"), "rb").read())


def drohnenbilder(d, g, aus, log):
    from drohne import Drohnenbilder
    db = Drohnenbilder(d, g, log=log)
    eintraege, ziel_eintraege = {}, {}
    for m in d.szenario["meldungen"]:
        img, meta = db.meldung(m)
        datei = m["bild"].get("datei") or f"drohne/{m['id']}.webp"
        n, q = webp_begrenzt(img, os.path.join(aus, datei))
        meta = {"datei": datei, **meta, "bytes": n}
        eintraege[m["id"]] = meta
        log(f"  {m['id']}  {n // 1024:3d} KB  q{q}  Ziel verdeckt " + "/".join(f"{z['verdeckt']:.0%}" for z in meta["ziele"])
            + "".join(f"  {s['art']} {s['lage']} {s['anteil']:.0%}→{s.get('anteil_ist', 0):.0%}" for s in meta["sicht"]))
    # Ziele, die ARGUS nie meldet: ein Bild für Spielleitung und Plenum (Lage zum Ende ihrer Route)
    ungemeldet = [z for z in d.szenario["ziele"] if z.get("ungemeldet")]
    gruppen = []
    for z in ungemeldet:
        r = (z.get("bewegung") or {}).get("route")
        t = r[-1][0] if r else (z.get("ab_s") or 0)
        p = D.position(z, t)
        for gr in gruppen:
            if D.dist(gr["p"], p) < 60:
                gr["ziele"].append(z["id"])
                gr["t"] = max(gr["t"], t)
                break
        else:
            gruppen.append({"ziele": [z["id"]], "t": t, "p": p})
    for gr in gruppen:
        name = "SL-" + "-".join(z.replace("Z-", "Z") for z in gr["ziele"])
        img, meta = db.zielbild(name, gr["ziele"], gr["t"])
        datei = f"drohne/{name}.webp"
        n, q = webp_begrenzt(img, os.path.join(aus, datei))
        ziel_eintraege[name] = {"datei": datei, **meta, "bytes": n}
        log(f"  {name}  {n // 1024:3d} KB  (nur Spielleitung)")
    return eintraege, ziel_eintraege


def sprite_atlas(d, aus):
    import sprites as SP
    atlas, lage, info = SP.fahrzeug_atlas(d)
    pfad = os.path.join(aus, "sprites", "fahrzeuge.png")
    os.makedirs(os.path.dirname(pfad), exist_ok=True)
    atlas.save(pfad, optimize=True)
    j = SP.spritesheet_json("fahrzeuge.png", atlas, lage)
    with open(os.path.join(aus, "sprites", "fahrzeuge.json"), "w", encoding="utf-8") as f:
        json.dump(j, f, ensure_ascii=False, separators=(",", ":"))
    return {"bild": "sprites/fahrzeuge.png", "json": "sprites/fahrzeuge.json", "breite": atlas.width, "hoehe": atlas.height,
            "bytes": os.path.getsize(pfad) + os.path.getsize(os.path.join(aus, "sprites", "fahrzeuge.json")),
            "px_pro_m": SP.PX_PRO_M, "ausrichtung": "Blick nach Osten (hdg 0), Anker Bildmitte = Fahrzeugmitte; um hdg im Uhrzeigersinn drehen",
            "schatten": "nicht eingebrannt: denselben Rahmen schwarz (Alpha ca. 0,45) um 1,2 m nach Südost versetzt darunter zeichnen",
            "rahmen": info}


def effekt_atlas(aus):
    import effekte as E
    import sprites as SP
    bilder, anim, info = {}, {}, {}
    for name, frames in E.alle().items():
        nb, px, gm, fps, schleife = E.EFFEKTE[name]
        namen = []
        for k, img in enumerate(frames):
            fn = f"{name}_{k:02d}"
            bilder[fn] = img
            namen.append(fn)
        anim[name] = namen
        info[name] = {"bilder": len(frames), "px": px, "groesse_m": gm, "fps": fps, "schleife": schleife,
                      "px_pro_m": round(px / gm, 3)}
    atlas, lage = SP.packe(bilder, breite=2048)
    pfad = os.path.join(aus, "sprites", "effekte.png")
    os.makedirs(os.path.dirname(pfad), exist_ok=True)
    atlas.save(pfad, optimize=True)
    j = SP.spritesheet_json("effekte.png", atlas, lage, animationen=anim)
    with open(os.path.join(aus, "sprites", "effekte.json"), "w", encoding="utf-8") as f:
        json.dump(j, f, ensure_ascii=False, separators=(",", ":"))
    return {"bild": "sprites/effekte.png", "json": "sprites/effekte.json", "breite": atlas.width, "hoehe": atlas.height,
            "bytes": os.path.getsize(pfad) + os.path.getsize(os.path.join(aus, "sprites", "effekte.json")),
            "animationen": info,
            "hinweis": "Wirkungseffekt je Wirkmittel steht in katalog_wirkmittel.json (effekt). krater: drei Varianten als Einzelbilder."}


def ziel_index(d, man):
    """Je Ziel: Sprite, Wrack und alle Bilder, in denen es vorkommt (Fertig-Kriterium)."""
    idx = {}
    for z in d.szenario["ziele"]:
        f = d.fahrzeuge[z["typ"]]
        bilder = [mid for mid, e in man.get("drohne", {}).items() if any(x["id"] == z["id"] for x in e["ziele"])]
        sl = [k for k, e in man.get("zielbilder", {}).items() if any(x["id"] == z["id"] for x in e["ziele"])]
        sonst = [mid for mid, e in list(man.get("drohne", {}).items()) + list(man.get("zielbilder", {}).items())
                 if any(x["id"] == z["id"] for x in e.get("objekte", []))]
        idx[z["id"]] = {"typ": z["typ"], "sprite": f.get("sprite"), "sprite_wrack": f.get("sprite_wrack"),
                        "bilder": bilder + sl, "auch_in": sonst}
        if z.get("ungemeldet"):
            idx[z["id"]]["nur_spielleitung"] = True
    return idx


def pruefe_fertig(d, man):
    fehler = []
    rahmen = set(man.get("fahrzeuge", {}).get("rahmen", {}))
    for zid, e in man["ziele"].items():
        if not e["bilder"]:
            fehler.append(f"{zid}: kein Bild")
        for k in ("sprite", "sprite_wrack"):
            if not e[k] or e[k] not in rahmen:
                fehler.append(f"{zid}: {k} {e[k]} fehlt im Atlas")
    for m in d.szenario["meldungen"]:
        if m["id"] not in man.get("drohne", {}):
            fehler.append(f"{m['id']}: kein Drohnenbild")
    anims = set(man.get("effekte", {}).get("animationen", {}))
    for w in d.wirkmittel.values():
        if w["effekt"] not in anims:
            fehler.append(f"Wirkmittel {w['id']}: Effekt {w['effekt']} fehlt")
    return fehler


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--daten", default=D.DATEN)
    ap.add_argument("--aus", default=D.ASSETS)
    ap.add_argument("--nur", default=",".join(BEREICHE), help="Bereiche, kommagetrennt: " + ",".join(BEREICHE))
    ap.add_argument("--cache", default=None, help="Gelände zwischenspeichern (Pickle)")
    ap.add_argument("--vorschau", default=None, help="Ordner für Kontaktbogen und Sprite-Bogen")
    a = ap.parse_args()
    nur = [b.strip() for b in a.nur.split(",") if b.strip()]
    log = print
    d = D.Daten(a.daten)
    os.makedirs(a.aus, exist_ok=True)
    mpfad = os.path.join(a.aus, "manifest.json")
    man = {}
    if os.path.exists(mpfad):
        with open(mpfad, encoding="utf-8") as f:
            man = json.load(f)
    g = lade_gelaende(d, a.cache, log) if ("karte" in nur or "drohne" in nur) else None
    if "karte" in nur:
        from karte import kartenpaket
        man["karte"] = kartenpaket(d, g, a.aus, log)
    if "drohne" in nur:
        log("Drohnenbilder …")
        man["drohne"], man["zielbilder"] = drohnenbilder(d, g, a.aus, log)
    if "sprites" in nur:
        log("Sprite-Atlas …")
        man["fahrzeuge"] = sprite_atlas(d, a.aus)
    if "effekte" in nur:
        log("Effekte …")
        man["effekte"] = effekt_atlas(a.aus)
    sz = d.szenario
    kopf = {
        "version": 1,
        "erzeugt": datetime.date.today().isoformat(),
        "generator": "tools/assets/gen_assets.py",
        "hinweis": "Alle Pfade relativ zu assets/. Übungslage, alles fiktiv und prozedural erzeugt. "
                   "Drohnenbilder ohne HUD und ohne ARGUS-Markierung: Die Oberfläche zeichnet Rahmen (ziele[].box, Pixel im Bild), "
                   "Klasse, Konfidenz und Uhrzeit aus Szenario und Manifest.",
        "szenario": {"id": sz["id"], "version": sz["version"], "datei": "szenario_kraehe_01.json"},
        "koordinaten": "Meter, x nach Osten, y nach Süden, Ursprung oben links; hdg in Grad, 0 = Osten, im Uhrzeigersinn",
    }
    man = {**kopf, **{k: v for k, v in man.items() if k not in kopf}}
    man["ziele"] = ziel_index(d, man)
    groesse = {k: sum(e["bytes"] for e in man.get(k, {}).values()) for k in ("drohne", "zielbilder")}
    if "karte" in man:
        k = man["karte"]
        groesse["karte_start"] = k["luftbild"]["stufen"][0]["bytes"] + k["luftbild"]["stufen"][1]["bytes"]
        groesse["karte_kacheln"] = k["luftbild"]["kacheln"]["bytes"]
        groesse["karte_sonst"] = k["topo"]["bytes"] + k["lagekarte"]["bytes"] + k["gelaende"]["bytes"]
    for k in ("fahrzeuge", "effekte"):
        if k in man:
            groesse[k] = man[k]["bytes"]
    man["groessen_bytes"] = groesse
    reihenfolge = ["version", "erzeugt", "generator", "hinweis", "szenario", "koordinaten", "groessen_bytes", "karte",
                   "fahrzeuge", "effekte", "ziele", "drohne", "zielbilder"]
    man = {k: man[k] for k in reihenfolge if k in man}
    with open(mpfad, "w", encoding="utf-8") as f:
        json.dump(man, f, ensure_ascii=False, indent=1)
        f.write("\n")
    log(f"Manifest: {mpfad}")
    for k, v in groesse.items():
        log(f"  {k:14s} {v / 1024:8.0f} KB")
    if a.vorschau:
        import vorschau as V
        os.makedirs(a.vorschau, exist_ok=True)
        if "drohne" in man:
            V.kontaktbogen(a.aus, man, sz, os.path.join(a.vorschau, "Kontaktbogen_Drohnenbilder.jpg"))
        if "fahrzeuge" in man and "effekte" in man:
            V.spritebogen(a.aus, man, os.path.join(a.vorschau, "Sprites_und_Effekte.png"))
        log(f"Vorschau in {a.vorschau}")
    fehler = pruefe_fertig(d, man)
    if fehler:
        for f in fehler:
            log("FEHLT: " + f)
        sys.exit(1)
    log(f"Fertig-Kriterium erfüllt: {len(man['ziele'])} Ziele mit Bild und Sprite, {len(man.get('drohne', {}))} Meldungen mit Drohnenbild.")


if __name__ == "__main__":
    main()
