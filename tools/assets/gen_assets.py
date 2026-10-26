#!/usr/bin/env python3
"""Asset-Generator Planspiel ARGUS (Schritt 5).

Erzeugt aus den Spieldaten (public/daten) alle Bilder für das Spiel und legt sie mit einem
Manifest in public/assets/ ab:

  karte/      Luftbild in zwei Stufen + Kacheln, Topo-Karte, beschriftete Vorschau, Häuser
  drohne/     ein Drohnenbild je ARGUS-Meldung (M01 … M27) und je Verstärkung (V1-M1 … V5-M1),
              Bilder ungemeldeter Ziele (SL); drohne/ebenen/ dieselben Bilder als Ebenen (Boden, Kronen,
              Störung) für das Live-Drohnenbild (Schritt 5b)
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
# Größenbudget der Ebenen (Schritt 5b): je Ebene höchstens so viel, je Meldung zusammen höchstens EBENEN_MAX
EBENE_MAX = {"boden": 110_000, "kronen": 60_000, "stoerung": 60_000}
EBENE_Q = {"boden": 72, "kronen": 74, "stoerung": 74}
EBENEN_MAX = 200_000
BEREICHE = ("karte", "drohne", "sprites", "effekte")


def webp_begrenzt(img, pfad, q=82, max_bytes=MAX_DROHNE_BYTES, alpha_q=None):
    """Als WebP speichern; bei zu großer Datei Qualität senken (schnell ladbar am Dienst-PC)."""
    while True:
        buf = io.BytesIO()
        extra = {"alpha_quality": alpha_q} if alpha_q is not None and img.mode == "RGBA" else {}
        img.save(buf, "WEBP", quality=q, method=6, **extra)
        if buf.tell() <= max_bytes or q <= 40:
            break
        q -= 6
        if alpha_q is not None:                      # weiche Alphakanäle (Wolken) brauchen weniger Genauigkeit
            alpha_q = max(30, alpha_q - 10)
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
    roh = json.dumps([d.karte, d.szenario["ziele"], [m["bild"] for m in d.szenario["meldungen"]], d.verstaerkungen], sort_keys=True)
    return zlib.crc32(roh.encode()) ^ zlib.crc32(open(os.path.join(HIER, "gelaende.py"), "rb").read())


def speichere_ebenen(mid, ebenen, aus):
    """Ebenen eines Drohnenbilds speichern (WebP, Kronen und Störung mit Alphakanal)."""
    out, gesamt = {}, 0
    for name in ("boden", "kronen", "stoerung"):
        img = ebenen.get(name)
        if img is None:
            out[name] = None
            continue
        datei = f"drohne/ebenen/{mid}-{name}.webp"
        n, _ = webp_begrenzt(img, os.path.join(aus, datei), q=EBENE_Q[name], max_bytes=EBENE_MAX[name], alpha_q=80)
        out[name] = datei
        gesamt += n
    out["bytes"] = gesamt
    return out


def drohnenbilder(d, g, aus, log):
    from drohne import Drohnenbilder, kamera_ebene
    db = Drohnenbilder(d, g, log=log)
    eintraege, ziel_eintraege = {}, {}
    alt = [f for f in os.listdir(os.path.join(aus, "drohne", "ebenen"))] if os.path.isdir(os.path.join(aus, "drohne", "ebenen")) else []
    for f in alt:                                          # verwaiste Ebenen nicht liegen lassen
        os.remove(os.path.join(aus, "drohne", "ebenen", f))
    auftraege = [(m, None) for m in d.szenario["meldungen"]] + [(m, gr) for gr in d.verstaerkungen for m in gr["meldungen"]]
    for m, gr in auftraege:
        img, meta, ebenen = db.meldung(m) if gr is None else db.verstaerkung(gr, m)
        datei = m["bild"].get("datei") or f"drohne/{m['id']}.webp"
        n, q = webp_begrenzt(img, os.path.join(aus, datei))
        eb = speichere_ebenen(m["id"], ebenen, aus)
        meta["ebenen"] = {**{k: eb[k] for k in ("boden", "kronen", "stoerung")}, "bytes": eb["bytes"], **meta["ebenen"]}
        meta = {"datei": datei, **meta, "bytes": n}
        eintraege[m["id"]] = meta
        wr = "".join(f"  Wrack {w['id']}" for w in meta.get("wracks", []))
        log(f"  {m['id']:6s} {n // 1024:3d} KB  q{q}  Ebenen {eb['bytes'] // 1024:3d} KB  Ziel verdeckt " + "/".join(f"{z['verdeckt']:.0%}" for z in meta["ziele"])
            + "".join(f"  {s['art']} {s['lage']} {s['anteil']:.0%}→{s.get('anteil_ist', 0):.0%}" for s in meta["sicht"]) + wr)
    kamera = "drohne/ebenen/kamera.webp"
    nk, _ = webp_begrenzt(kamera_ebene(), os.path.join(aus, kamera), q=80, alpha_q=60)
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
        img, meta, _ = db.zielbild(name, gr["ziele"], gr["t"])
        meta.pop("ebenen", None)
        datei = f"drohne/{name}.webp"
        n, q = webp_begrenzt(img, os.path.join(aus, datei))
        ziel_eintraege[name] = {"datei": datei, **meta, "bytes": n}
        log(f"  {name}  {n // 1024:3d} KB  (nur Spielleitung)")
    return eintraege, ziel_eintraege, {"datei": kamera, "bytes": nk}


def ebenen_info(kamera):
    from drohne import PERSON_UEBERHOEHUNG, farbmatrix
    return {
        "hinweis": "Live-Drohnenbild (Konzept v2, Abschnitt 6): je Meldung drohne[M].ebenen. Reihenfolge von unten: boden, "
                   "Schatten der Fahrzeuge und Figuren, Fahrzeuge (Sprite aus dem Fahrzeug-Atlas, Wrack bzw. Zustand nach Engine), "
                   "Effekte am Boden (Feuer, Mündungsblitz), Figuren, kronen, Rauch der Wracks, stoerung, kamera. Positionen aus der "
                   "Engine zur Spielzeit, ins Bild umgerechnet mit ausschnitt_m (Pixel = (x − ausschnitt.x) / m_pro_px). "
                   "Zur Meldezeit ergibt das Zusammensetzen das Standbild (datei).",
        "kamera": kamera["datei"],
        "kamera_bytes": kamera["bytes"],
        "farbmatrix": farbmatrix(),
        "farbmatrix_hinweis": "Kamerafarbe für Sprites und Effekte (PixiJS ColorMatrixFilter, 4 × 5, Werte 0…1); boden, kronen und stoerung sind schon gefärbt.",
        "person_ueberhoehung": PERSON_UEBERHOEHUNG,
        "schatten": {"fahrzeug_m": 1.25, "person_m": 0.8, "alpha": 0.5, "unschaerfe_m": 0.35,
                     "hinweis": "Sprite schwarz, um den Versatz nach Südost verschoben, weichgezeichnet; Figuren mit oben=true ohne Schatten"},
        "figuren": "bezug 'gruppe': Position der Personengruppe ziel.personen[gruppe] zur Spielzeit + versatz_m (x Ost, y Süd); "
                   "bezug 'fahrzeug': Fahrzeugmitte + versatz_m (vorwärts, rechts) um hdg des Fahrzeugs gedreht. Figur um ihr hdg drehen, "
                   "Maßstab Personen-px_pro_m × person_ueberhoehung. Sichtbar wie die Personengruppe (ab_s/bis_s) bzw. solange das Fahrzeug da ist.",
        "budget_bytes": {"je_ebene": EBENE_MAX, "je_meldung": EBENEN_MAX},
    }


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
    bilder, anim, info, anker = {}, {}, {}, {}
    for name, frames in E.alle().items():
        nb, px, gm, fps, schleife = E.EFFEKTE[name]
        form = E.FORM.get(name, {})
        namen = []
        for k, img in enumerate(frames):
            fn = f"{name}_{k:02d}"
            bilder[fn] = img
            namen.append(fn)
            if form.get("anker"):
                anker[fn] = form["anker"]
        anim[name] = namen
        info[name] = {"bilder": len(frames), "px": px, "groesse_m": gm, "fps": fps, "schleife": schleife,
                      "px_pro_m": round(px / gm, 3)}
        if form.get("hoehe_px"):
            info[name].update({"hoehe_px": form["hoehe_px"], "hoehe_m": form["hoehe_m"]})
        if form.get("anker"):
            info[name]["anker"] = list(form["anker"])
        if form.get("hinweis"):
            info[name]["hinweis"] = form["hinweis"]
    atlas, lage = SP.packe(bilder, breite=2048)
    for alt in ("effekte.png", "effekte.webp"):
        if os.path.exists(os.path.join(aus, "sprites", alt)):
            os.remove(os.path.join(aus, "sprites", alt))
    pfad = os.path.join(aus, "sprites", "effekte.webp")
    os.makedirs(os.path.dirname(pfad), exist_ok=True)
    atlas.save(pfad, "WEBP", quality=86, alpha_quality=90, method=6)       # weiche Effekte: verlustbehaftet reicht
    j = SP.spritesheet_json("effekte.webp", atlas, lage, animationen=anim, anker=anker)
    with open(os.path.join(aus, "sprites", "effekte.json"), "w", encoding="utf-8") as f:
        json.dump(j, f, ensure_ascii=False, separators=(",", ":"))
    return {"bild": "sprites/effekte.webp", "json": "sprites/effekte.json", "breite": atlas.width, "hoehe": atlas.height,
            "bytes": os.path.getsize(pfad) + os.path.getsize(os.path.join(aus, "sprites", "effekte.json")),
            "animationen": info, "zuordnung": E.ZUORDNUNG,
            "hinweis": "Wirkungseffekt je Wirkmittel steht in katalog_wirkmittel.json (effekt); zuordnung nennt zusätzlich Flug, "
                       "Hintergrundgefecht, Wracks und Mündungsblitz. krater: drei Varianten als Einzelbilder. Anker je Rahmen im JSON."}


def ziel_index(d, man):
    """Je Ziel (auch der Verstärkungen): Sprite, Wrack und alle Bilder, in denen es vorkommt (Fertig-Kriterium)."""
    idx = {}
    for z in list(d.szenario["ziele"]) + list(d.v_ziele.values()):
        f = d.fahrzeuge[z["typ"]]
        bilder = [mid for mid, e in man.get("drohne", {}).items() if any(x["id"] == z["id"] for x in e["ziele"])]
        sl = [k for k, e in man.get("zielbilder", {}).items() if any(x["id"] == z["id"] for x in e["ziele"])]
        sonst = [mid for mid, e in list(man.get("drohne", {}).items()) + list(man.get("zielbilder", {}).items())
                 if any(x["id"] == z["id"] for x in e.get("objekte", []))]
        idx[z["id"]] = {"typ": z["typ"], "sprite": f.get("sprite"), "sprite_wrack": f.get("sprite_wrack"),
                        "bilder": bilder + sl, "auch_in": sonst}
        if z.get("ungemeldet"):
            idx[z["id"]]["nur_spielleitung"] = True
        if z["id"] in d.v_gruppe:
            idx[z["id"]]["verstaerkung"] = d.v_gruppe[z["id"]]
        if z["id"] in d.schaden:
            t, folge = d.schaden[z["id"]]
            idx[z["id"]]["hintergrund"] = {"t_s": t, "folge": folge}
    return idx


def pruefe_routen(d, g):
    """Kein Fahrzeug fährt durch ein Gebäude (Live-Lage, Schritt 5b). Liefert (Fehler, Warnungen):
    Fehler bei erzeugten Häusern (Generator), Warnungen bei Gebäuden aus der Kartendatei (Daten)."""
    import math
    from daten import abstand_polygon, drehe, im_polygon, rechteck
    haeuser = [drehe(rechteck(-h[2] / 2, h[2] / 2, -h[3] / 2, h[3] / 2), (h[0], h[1]), h[4]) for h in g.haeuser]
    karte = [(gb["id"], drehe(rechteck(-gb["laenge"] / 2, gb["laenge"] / 2, -gb["breite"] / 2, gb["breite"] / 2), tuple(gb["mitte"]), gb["winkel"]))
             for gb in d.gebaeude() if gb.get("laenge") and gb["art"] != "sportplatz"]
    fehler, warnungen = [], []
    for name, z, r in d.alle_routen():           # seit 2.1 auch die Durchbruch-Routen
        _, b = d.groesse(z)
        gefunden = set()
        for (ta, xa, ya), (tb, xb, yb) in zip(r, r[1:]):
            n = max(1, int(math.hypot(xb - xa, yb - ya) / 2))
            for k in range(n + 1):
                f = k / n
                p, t = (xa + f * (xb - xa), ya + f * (yb - ya)), ta + f * (tb - ta)
                for i, poly in enumerate(haeuser):
                    if ("h", i) not in gefunden and (im_polygon(p, poly) or abstand_polygon(p, poly) < b / 2):
                        gefunden.add(("h", i))
                        fehler.append(f"{name} fährt bei t ≈ {t:.0f} s durch ein erzeugtes Haus")
                for gid, poly in karte:
                    if ("k", gid) not in gefunden and (im_polygon(p, poly) or abstand_polygon(p, poly) < b / 2):
                        gefunden.add(("k", gid))
                        warnungen.append(f"{name} fährt bei t ≈ {t:.0f} s durch Gebäude {gid} (Kartendatei)")
    return fehler, warnungen


def pruefe_fertig(d, man, aus):
    fehler = []
    rahmen = set(man.get("fahrzeuge", {}).get("rahmen", {}))
    for zid, e in man["ziele"].items():
        if not e["bilder"]:
            fehler.append(f"{zid}: kein Bild")
        for k in ("sprite", "sprite_wrack"):
            if not e[k] or e[k] not in rahmen:
                fehler.append(f"{zid}: {k} {e[k]} fehlt im Atlas")
    alle_m = list(d.szenario["meldungen"]) + [m for g in d.verstaerkungen for m in g["meldungen"]]
    for m in alle_m:
        e = man.get("drohne", {}).get(m["id"])
        if not e:
            fehler.append(f"{m['id']}: kein Drohnenbild")
            continue
        eb = e.get("ebenen") or {}
        if not eb.get("boden"):
            fehler.append(f"{m['id']}: keine Ebenen")
        if eb.get("bytes", 0) > EBENEN_MAX:
            fehler.append(f"{m['id']}: Ebenen {eb['bytes']} B > {EBENEN_MAX} B")
        for k, grenze in EBENE_MAX.items():
            if eb.get(k) and os.path.exists(os.path.join(aus, eb[k])) and os.path.getsize(os.path.join(aus, eb[k])) > grenze:
                fehler.append(f"{m['id']}: Ebene {k} > {grenze} B")
        for f in eb.get("fahrzeuge", []):
            if f["sprite"] not in rahmen:
                fehler.append(f"{m['id']}: Sprite {f['sprite']} fehlt im Atlas")
        for f in eb.get("figuren", []):
            if f["sprite"] not in rahmen:
                fehler.append(f"{m['id']}: Figur {f['sprite']} fehlt im Atlas")
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
        man["drohne"], man["zielbilder"], kamera = drohnenbilder(d, g, a.aus, log)
        man["drohne_ebenen"] = ebenen_info(kamera)
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
    groesse["drohne_ebenen"] = sum(e.get("ebenen", {}).get("bytes", 0) for e in man.get("drohne", {}).values()) \
        + man.get("drohne_ebenen", {}).get("kamera_bytes", 0)
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
                   "fahrzeuge", "effekte", "drohne_ebenen", "ziele", "drohne", "zielbilder"]
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
        if "drohne" in man and "drohne_ebenen" in man and "fahrzeuge" in man and "effekte" in man:
            from live import pruefe_ebenen
            ids = list(man["drohne"])
            for i in range(0, len(ids), 8):
                V.ebenen_bogen(a.aus, man, d, os.path.join(a.vorschau, f"Ebenen_{i // 8 + 1}.jpg"), ids[i:i + 8])
            for mid in ("M12", "M13", "M18", "M21", "V3-M1"):
                if mid in man["drohne"]:
                    V.live_animation(a.aus, man, d, mid, os.path.join(a.vorschau, f"Live_{mid}.webp"))
            abw = pruefe_ebenen(d, a.aus, man)
            log("Ebenen zusammengesetzt vs. Standbild (mittlere Abweichung, Graustufen): "
                + ", ".join(f"{k} {v}" for k, v in abw.items() if v is not None))
        log(f"Vorschau in {a.vorschau}")
    fehler = pruefe_fertig(d, man, a.aus)
    if g is not None:
        f_r, w_r = pruefe_routen(d, g)
        fehler += f_r
        for w in w_r:
            log("WARNUNG: " + w)
    if fehler:
        for f in fehler:
            log("FEHLT: " + f)
        sys.exit(1)
    nv = sum(len(g["meldungen"]) for g in d.verstaerkungen)
    log(f"Fertig-Kriterium erfüllt: {len(man['ziele'])} Ziele mit Bild und Sprite, {len(man.get('drohne', {})) - nv} Meldungen "
        f"und {nv} Verstärkungen mit Drohnenbild und Ebenen.")


if __name__ == "__main__":
    main()
