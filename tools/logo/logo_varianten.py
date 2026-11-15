#!/usr/bin/env python3
"""ARGUS-Logo: Freistellung und Varianten (Liste O, O2).

Vorlage: Logo des Kameraden (Schild mit Auge, Schriftzug „ARGUS“), Bild1.png von Lt Mann (299 × 384, weißer Grund),
im Repo als tools/logo/bild1_vorlage.png. Daraus entsteht public/assets/argus_logo.png (240 × 265, Hintergrund transparent;
Schild = Zeilen 0–210, leere Trennzeile y = 211, darunter der Schriftzug) und aus diesem die Varianten:

  public/assets/argus_schild.png        nur das Schild (Kopfzeilen, Startseite, Plenum – auf dunklem Grund)
  public/assets/argus_schrift.png       nur der Schriftzug (dunkelrot/schwarz – nur auf hellem Grund)
  public/assets/argus_favicon_32.png    Schild, quadratisch 32 × 32
  public/assets/argus_favicon_64.png    Schild, quadratisch 64 × 64
  index.html                            beide Favicons als data-Adresse (auch in der Offline-Datei, die nichts nachladen darf)

Freistellung wie die Fassung im Projekt (claude/logo/argus_logo_png_base64.md): Ausschnitt ab (23, 51); Hintergrund ist, was
von außen zusammenhängend fast weiß ist (Abstand zu Weiß d = 255 − min(R, G, B) < 160); dort weicher Rand
α = (d − 11) · 255 / 244, Farbe gegen Weiß entmischt; alles andere bleibt deckend (helle Glanzlichter im Schild bleiben).
Zeilen zwischen Schild und Schriftzug mit α < 25 (auslaufender Schatten der Schildspitze) werden ganz durchsichtig.

Aufruf (im Repo-Wurzelordner):
  python3 tools/logo/logo_varianten.py                 Varianten aus public/assets/argus_logo.png
  python3 tools/logo/logo_varianten.py --frei VORLAGE  erst argus_logo.png aus der Vorlage freistellen, dann die Varianten
Liefert der Kamerad eine größere Fassung: freigestellt als public/assets/argus_logo.png ablegen (Schild oben, eine leere Zeile,
Schriftzug darunter) und dieses Skript ohne --frei aufrufen.
"""
import base64
import os
import re
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ZIEL = "public/assets"
LOGO = os.path.join(ZIEL, "argus_logo.png")
AUSSCHNITT = (23, 51, 240, 265)          # x, y, Breite, Höhe in der Vorlage 299 × 384
SCHWELLE = 160                           # d < SCHWELLE und von außen erreichbar: Hintergrund (weich)
RAND = 11                                # d bis RAND: ganz durchsichtig


def freistellen(vorlage: str) -> Image.Image:
    a = np.asarray(Image.open(vorlage).convert("RGBA")).astype(float)
    c = a[..., :3]
    d = 255 - c.min(axis=2)
    lab, _ = ndimage.label(d < SCHWELLE)
    aussen = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    hg = np.isin(lab, list(aussen))
    alpha = np.where(hg, np.clip(np.round((d - RAND) * 255 / (255 - RAND)), 0, 255), 255.0)
    al = alpha[..., None] / 255
    farbe = np.where(al > 0, (c - 255 * (1 - al)) / np.maximum(al, 1e-6), 0)
    farbe = np.clip(np.round(farbe), 0, 255)
    farbe[alpha == 0] = 0
    out = np.dstack([farbe, alpha]).astype(np.uint8)
    x, y, w, h = AUSSCHNITT
    out = out[y:y + h, x:x + w].copy()
    # Zwischen Schild und Schriftzug läuft der Schatten der Schildspitze aus: Zeilen mit nur noch einem Hauch (α < 25) ganz
    # durchsichtig – so entsteht die leere Trennzeile (y = 211) wie in der Fassung im Projekt.
    for z in range(h * 3 // 4, h):
        if out[z, :, 3].max() < 25:
            out[z] = 0
    return Image.fromarray(out, "RGBA")


def trennzeile(logo: Image.Image) -> int:
    """Leere Zeile zwischen Schild und Schriftzug (erste ganz durchsichtige Zeile ab der Mitte)."""
    al = np.asarray(logo)[..., 3]
    leer = [y for y in range(logo.height // 2, logo.height) if al[y].max() == 0]
    if not leer:
        raise SystemExit("keine leere Trennzeile zwischen Schild und Schriftzug gefunden")
    return leer[0]


def beschnitten(bild: Image.Image) -> Image.Image:
    return bild.crop(bild.getbbox())


def quadrat(bild: Image.Image, n: int) -> Image.Image:
    s = n / max(bild.size)
    klein = bild.resize((max(1, round(bild.width * s)), max(1, round(bild.height * s))), Image.LANCZOS)
    q = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    q.paste(klein, ((n - klein.width) // 2, (n - klein.height) // 2), klein)
    return q


def speichern(bild: Image.Image, name: str) -> None:
    pfad = os.path.join(ZIEL, name)
    bild.save(pfad, optimize=True)
    print(f"{pfad}: {bild.width} × {bild.height}, {os.path.getsize(pfad)} Byte")


def favicon_in_index(pfad: str = "index.html") -> None:
    """Die <link rel="icon">-Zeilen in index.html durch die beiden Favicons als data-Adresse ersetzen."""
    with open(pfad, encoding="utf-8") as f:
        html = f.read()
    zeilen = []
    for n in (32, 64):
        with open(os.path.join(ZIEL, f"argus_favicon_{n}.png"), "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        zeilen.append(f'    <link rel="icon" type="image/png" sizes="{n}x{n}" href="data:image/png;base64,{b64}" />')
    ohne = re.sub(r"[ \t]*<link rel=\"icon\"[^>]*>\n", "", html)
    neu = ohne.replace("  </head>", "\n".join(zeilen) + "\n  </head>", 1)
    with open(pfad, "w", encoding="utf-8") as f:
        f.write(neu)
    print(f"{pfad}: Favicons 32 und 64 px eingetragen")


def main() -> None:
    if len(sys.argv) >= 3 and sys.argv[1] == "--frei":
        speichern(freistellen(sys.argv[2]), "argus_logo.png")
    logo = Image.open(LOGO).convert("RGBA")
    y = trennzeile(logo)
    print(f"Trennzeile y = {y}")
    schild = beschnitten(logo.crop((0, 0, logo.width, y)))
    schrift = beschnitten(logo.crop((0, y, logo.width, logo.height)))
    speichern(schild, "argus_schild.png")
    speichern(schrift, "argus_schrift.png")
    for n in (32, 64):
        speichern(quadrat(schild, n), f"argus_favicon_{n}.png")
    favicon_in_index()


if __name__ == "__main__":
    main()
