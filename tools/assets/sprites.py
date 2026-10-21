"""Sprite-Atlas für die Karte (PixiJS-Spritesheet-Format, eine PNG + eine JSON).

Rahmen heißen wie im Fahrzeugkatalog (sprite, sprite_wrack, Personen-sprite). Alle Fahrzeuge
blicken nach Osten (hdg 0); der Anker liegt in der Bildmitte = Fahrzeugmitte. Die Karte dreht
den Sprite um hdg (im Uhrzeigersinn) und skaliert ihn mit px_pro_m auf Meter.
Schatten sind nicht eingebrannt: die Karte zeichnet denselben Sprite dunkel und versetzt darunter.
"""
import numpy as np
from PIL import Image

import fahrzeuge as F

PX_PRO_M = 12                # Fahrzeuge
PX_PRO_M_PERSON = 24         # Personen (klein, deshalb feiner)
RAND = 2                     # Abstand zwischen Rahmen im Atlas


def packe(bilder, breite=1024):
    """Einfache Regalpackung. bilder: {name: Image}. Liefert (Atlas, {name: (x, y, w, h)})."""
    reihen = sorted(bilder.items(), key=lambda kv: (-kv[1].height, kv[0]))
    x = y = zeile_h = 0
    lage = {}
    for name, img in reihen:
        if x + img.width + RAND > breite:
            x, y = 0, y + zeile_h + RAND
            zeile_h = 0
        lage[name] = (x, y, img.width, img.height)
        x += img.width + RAND
        zeile_h = max(zeile_h, img.height)
    hoehe = y + zeile_h
    hoehe += (-hoehe) % 4
    atlas = Image.new("RGBA", (breite, hoehe), (0, 0, 0, 0))
    for name, (x, y, w, h) in lage.items():
        atlas.paste(bilder[name], (x, y))
    return atlas, lage


def spritesheet_json(bilddatei, atlas, lage, animationen=None, anker=None):
    frames = {}
    for name, (x, y, w, h) in sorted(lage.items()):
        a = (anker or {}).get(name, (0.5, 0.5))
        frames[name] = {"frame": {"x": x, "y": y, "w": w, "h": h}, "rotated": False, "trimmed": False,
                        "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h}, "sourceSize": {"w": w, "h": h},
                        "anchor": {"x": a[0], "y": a[1]}}
    j = {"frames": frames, "meta": {"app": "ARGUS tools/assets", "image": bilddatei, "format": "RGBA8888",
                                    "size": {"w": atlas.width, "h": atlas.height}, "scale": "1"}}
    if animationen:
        j["animations"] = animationen
    return j


def fahrzeug_atlas(d):
    """Alle Katalogtypen mit Sprite (intakt und Wrack), Personen und Luftfahrzeuge."""
    bilder, info = {}, {}
    for fid, f in d.fahrzeuge.items():
        if not f.get("sprite"):
            continue
        for wrack, name in ((False, f["sprite"]), (True, f["sprite_wrack"])):
            img = F.fahrzeug(fid, f["groesse_m"], PX_PRO_M, wrack=wrack, seed=7)
            bilder[name] = img
            info[name] = {"typ": fid, "wrack": wrack, "px_pro_m": PX_PRO_M,
                          "groesse_m": [round(img.width / PX_PRO_M, 2), round(img.height / PX_PRO_M, 2)]}
    rng = np.random.default_rng(5)
    for p in d.katalog_personen.values():
        for key, kw in (("sprite", {"haende_hoch": p["id"] == "besatzung_ergibt_sich"}),
                        ("sprite_tuch", {"haende_hoch": True, "tuch": True})):
            if not p.get(key):
                continue
            img = F.person(p["id"], PX_PRO_M_PERSON, rng, **kw)
            bilder[p[key]] = img
            info[p[key]] = {"person": p["id"], "px_pro_m": PX_PRO_M_PERSON,
                            "groesse_m": [round(img.width / PX_PRO_M_PERSON, 2), round(img.height / PX_PRO_M_PERSON, 2)]}
    for name in F.EXTRA:
        img = F.extra_sprite(name, PX_PRO_M)
        bilder[name + ".png"] = img
        info[name + ".png"] = {"luftfahrzeug": name, "px_pro_m": PX_PRO_M,
                               "groesse_m": [round(img.width / PX_PRO_M, 2), round(img.height / PX_PRO_M, 2)]}
    # Schritt 5b: Zustände als eigene Sprites (z. B. Z-24 nach dem Treffer: Kette abgesprungen) …
    for fid, zustaende in F.ZUSTAND_SPRITES.items():
        f = d.fahrzeuge.get(fid)
        if not f or not f.get("sprite"):
            continue
        for zu in zustaende:
            name = F.zustand_sprite(f["sprite"], zu)
            img = F.fahrzeug(fid, f["groesse_m"], PX_PRO_M, zustand=zu, seed=7)
            bilder[name] = img
            info[name] = {"typ": fid, "wrack": False, "zustand": zu, "px_pro_m": PX_PRO_M,
                          "groesse_m": [round(img.width / PX_PRO_M, 2), round(img.height / PX_PRO_M, 2)]}
    # … und Personen-Varianten für die Figuren der Live-Drohnenbilder (Farbe, Kind, weißes Tuch)
    for v in F.person_varianten():
        name = F.person_variante(v["art"], v["farbe"], v["klein"], v["tuch"])
        img = F.person(v["art"], PX_PRO_M_PERSON, np.random.default_rng(9), klein=v["klein"], haende_hoch=v["haende_hoch"],
                       tuch=v["tuch"], farbe=v["farbe"], haar=v["farbe"] + 1)
        bilder[name] = img
        info[name] = {"person": v["art"], "variante": True, "klein": v["klein"], "tuch": v["tuch"], "px_pro_m": PX_PRO_M_PERSON,
                      "groesse_m": [round(img.width / PX_PRO_M_PERSON, 2), round(img.height / PX_PRO_M_PERSON, 2)]}
    atlas, lage = packe(bilder)
    return atlas, lage, info
