"""Live-Drohnenbild aus den Ebenen zusammensetzen (Referenz für die Oberfläche, Schritt 6b).

Setzt ein Drohnenbild zur Spielzeit t so zusammen, wie es die Oberfläche tun soll:
  boden → Schatten → Fahrzeuge (Sprite, Wrack bzw. Zustand) → Feuer → Figuren → kronen → Rauch der Wracks
  → stoerung → kamera
Positionen kommen hier aus den Szenario-Routen (daten.py, mit Hintergrundgefecht); in der Oberfläche
aus der Engine. Zur Meldezeit muss das Ergebnis dem Standbild entsprechen (pruefe_ebenen).

Aufruf über gen_assets.py --vorschau ORDNER (Ebenen-Probe und Live-Vorschau als animiertes WebP).
"""
import json
import math
import os

import numpy as np
from PIL import Image, ImageFilter

from daten import Daten, drehe, position, vorhanden


class Atlas:
    def __init__(self, aus, eintrag):
        with open(os.path.join(aus, eintrag["json"]), encoding="utf-8") as f:
            self.j = json.load(f)
        self.bild = Image.open(os.path.join(aus, eintrag["bild"])).convert("RGBA")
        self._cache = {}

    def rahmen(self, name):
        if name not in self._cache:
            f = self.j["frames"][name]["frame"]
            self._cache[name] = self.bild.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
        return self._cache[name]

    def anker(self, name):
        a = self.j["frames"][name].get("anchor") or {"x": 0.5, "y": 0.5}
        return a["x"], a["y"]


def _faerben(img, matrix):
    a = np.asarray(img, np.float32)
    m = np.array(matrix, np.float32)
    rgb = a[..., :3] / 255
    out = rgb @ m[:3, :3].T + m[:3, 4]
    a[..., :3] = np.clip(out * 255, 0, 255)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def _setze(ziel, spr, mitte, anker=(0.5, 0.5), hdg=0.0, skala=1.0, alpha=1.0):
    """Sprite skalieren, um hdg drehen (Anker bleibt am Ort) und mit dem Anker auf mitte (px) setzen."""
    w, h = max(1, int(round(spr.width * skala))), max(1, int(round(spr.height * skala)))
    s = spr.resize((w, h), Image.BICUBIC)
    if alpha < 1:
        s = s.copy()
        s.putalpha(s.split()[3].point(lambda v: int(v * alpha)))
    ax, ay = anker[0] * w, anker[1] * h
    rand = int(math.hypot(w, h)) + 2                     # um den Anker drehen: auf große Fläche mit Anker in der Mitte
    tafel = Image.new("RGBA", (2 * rand, 2 * rand), (0, 0, 0, 0))
    tafel.paste(s, (int(round(rand - ax)), int(round(rand - ay))))
    tafel = tafel.rotate(-hdg, resample=Image.BICUBIC)
    ziel.alpha_composite(tafel, (int(round(mitte[0] - rand)), int(round(mitte[1] - rand))))


class Live:
    def __init__(self, d: Daten, aus, man):
        self.d = d
        self.aus = aus
        self.man = man
        self.fz = Atlas(aus, man["fahrzeuge"])
        self.ef = Atlas(aus, man["effekte"])
        self.info = man["drohne_ebenen"]
        self.kamera = Image.open(os.path.join(aus, self.info["kamera"])).convert("RGBA")

    def _ebene(self, pfad):
        return Image.open(os.path.join(self.aus, pfad)).convert("RGBA") if pfad else None

    def bild(self, mid, t, effekte_zeit=0.0):
        """Live-Drohnenbild der Meldung mid zur Spielzeit t (bei Verstärkungen relativ zum Einspielen)."""
        d, e = self.d, self.man["drohne"][mid]
        eb = e["ebenen"]
        a = e["ausschnitt_m"]
        mpp = e["m_pro_px"]
        mat = self.info["farbmatrix"]
        vz = e.get("verstaerkung")

        def px(p):
            return ((p[0] - a["x"]) / mpp, (p[1] - a["y"]) / mpp)

        if vz:
            kand = [z for z in d.v_ziele.values() if d.v_gruppe[z["id"]] == vz]
        else:
            kand = [z for z in d.szenario["ziele"] if not z.get("ungemeldet") or z["id"] in [f["id"] for f in eb["fahrzeuge"]]]
        bekannt = {f["id"]: f for f in eb["fahrzeuge"]}
        img = self._ebene(eb["boden"])
        schatten = Image.new("RGBA", img.size, (0, 0, 0, 0))
        fahrzeuge, feuer, rauch, figuren = [], [], [], []
        k_fz = (1 / mpp) / self.man["fahrzeuge"]["px_pro_m"]
        for z in kand:
            if not d.da(z, t):
                continue
            p, h = d.pos(z, t), d.hdg(z, t)
            q = px(p)
            if not (-80 < q[0] < img.width + 80 and -80 < q[1] < img.height + 80):
                continue
            f = d.fahrzeuge[z["typ"]]
            sch = d.zustand_bei(z, t) if z["id"] in d.ziele else "intakt"
            if sch == "zerstoert":
                name = f["sprite_wrack"]
                feuer.append(q)
                rauch.append(q)
            elif z["id"] in bekannt and bekannt[z["id"]].get("darstellung") in ("luk_offen", "kette_ab"):
                name = bekannt[z["id"]]["sprite"]
            elif sch == "ausser_gefecht" and f["sprite"].replace(".png", "_kette_ab.png") in self.fz.j["frames"]:
                name = f["sprite"].replace(".png", "_kette_ab.png")
            else:
                name = f["sprite"]
            spr = _faerben(self.fz.rahmen(name), mat)
            fahrzeuge.append((spr, q, h, k_fz))
            sh = Image.new("RGBA", spr.size, (0, 0, 0, 255))
            sh.putalpha(spr.split()[3])
            v = self.info["schatten"]["fahrzeug_m"] / mpp
            _setze(schatten, sh, (q[0] + v, q[1] + v), hdg=h, skala=k_fz)
            # Figuren dieses Fahrzeugs (Liste aus dem Manifest, Lage zur Spielzeit)
            for fg in eb["figuren"]:
                if fg["bei"] != z["id"]:
                    continue
                if fg["bezug"] == "gruppe":
                    pe = z["personen"][fg["gruppe"]]
                    if not vorhanden(pe, t, z):
                        continue
                    g = position(pe, t)
                    w = (g[0] + fg["versatz_m"][0], g[1] + fg["versatz_m"][1])
                else:
                    if "gruppe" in fg and not vorhanden(z["personen"][fg["gruppe"]], t, z):
                        continue
                    w = drehe([tuple(fg["versatz_m"])], p, h)[0]
                figuren.append((fg, px(w)))
        k_p = (1 / mpp) * self.info["person_ueberhoehung"] / 24
        for fg, q in figuren:
            if fg.get("oben"):
                continue
            spr = self.fz.rahmen(fg["sprite"])
            sh = Image.new("RGBA", spr.size, (0, 0, 0, 200))
            sh.putalpha(spr.split()[3].point(lambda v: int(v * 0.8)))
            v = self.info["schatten"]["person_m"] / mpp
            _setze(schatten, sh, (q[0] + v, q[1] + v), hdg=fg["hdg"], skala=k_p)
        sa = np.asarray(schatten.filter(ImageFilter.GaussianBlur(self.info["schatten"]["unschaerfe_m"] / mpp)), np.float32)
        sa[..., 3] *= self.info["schatten"]["alpha"]
        img.alpha_composite(Image.fromarray(sa.astype(np.uint8), "RGBA"))
        for spr, q, h, k in fahrzeuge:
            _setze(img, spr, q, hdg=h, skala=k)
        ef = self.man["effekte"]["animationen"]
        n_feuer = len([k for k in self.ef.j["animations"]["feuer"]])
        for q in feuer:
            fr = self.ef.j["animations"]["feuer"][int(effekte_zeit * ef["feuer"]["fps"]) % n_feuer]
            _setze(img, _faerben(self.ef.rahmen(fr), mat), q, skala=(ef["feuer"]["groesse_m"] * 0.6 / mpp) / ef["feuer"]["px"], alpha=0.8)
        for fg, q in figuren:
            if not fg.get("oben"):
                _setze(img, _faerben(self.fz.rahmen(fg["sprite"]), mat), q, hdg=fg["hdg"], skala=k_p)
        for fg, q in figuren:
            if fg.get("oben"):
                _setze(img, _faerben(self.fz.rahmen(fg["sprite"]), mat), q, hdg=fg["hdg"], skala=k_p)
        kr = self._ebene(eb["kronen"])
        if kr:
            img.alpha_composite(kr)
        n_rauch = len(self.ef.j["animations"]["rauch"])
        for q in rauch:
            fr = self.ef.j["animations"]["rauch"][int(effekte_zeit * ef["rauch"]["fps"]) % n_rauch]
            _setze(img, _faerben(self.ef.rahmen(fr), mat), q, anker=self.ef.anker(fr),
                   skala=(30.0 / mpp) / ef["rauch"]["px"], alpha=1.0)
        st = self._ebene(eb["stoerung"])
        if st:
            img.alpha_composite(st)
        img.alpha_composite(self.kamera)
        return img.convert("RGB")


def pruefe_ebenen(d, aus, man, ids=None):
    """Mittlere Abweichung (Graustufen 0…255) zwischen Standbild und den zusammengesetzten Ebenen zur Meldezeit."""
    live = Live(d, aus, man)
    out = {}
    for mid, e in man["drohne"].items():
        if ids and mid not in ids:
            continue
        a = np.asarray(live.bild(mid, e["t_s"]), np.float32)
        b = np.asarray(Image.open(os.path.join(aus, e["datei"])).convert("RGB"), np.float32)
        if e["ebenen"].get("bildstoerung"):
            out[mid] = None                                  # Rauschen und Zeilenversatz macht die Oberfläche
            continue
        out[mid] = round(float(np.abs(a - b).mean()), 1)
    return out
