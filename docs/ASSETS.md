# ARGUS – Assets (Schritt 5, erweitert in Schritt 5b für Konzept v2)

Alle Bilder des Spiels entstehen prozedural aus den Spieldaten in `public/daten/` mit
`tools/assets/gen_assets.py` und liegen mit einem Manifest in `public/assets/`. Nichts ist
abfotografiert oder lizenzpflichtig; Gelände, Einheiten und Namen sind fiktiv. Keine Darstellung
getöteter Menschen: Wracks zeigen nur Fahrzeuge (ohne Besatzung), Effekte nur Feuer, Rauch, Staub
und Licht; getroffene Personen markiert die Oberfläche.

Schritt 5b (Konzept v2, Abschnitt 6 „Live-Drohnenbild“ und „Effekte in allen Ansichten“) hat ergänzt:
Drohnenbilder als **Ebenen** (Boden, Kronen, Störung) mit Fahrzeugen und Figuren als Sprites darüber,
**Bilder der Verstärkungen** V1-M1 … V5-M1, **Wracks** aus dem Hintergrundgefecht in den Bildern,
neue **Effekte** (LM im Flug, Leuchtspur, Mündungsblitz, Feindartillerie, Nebel) mit Zuordnung im Manifest.

## Inhalt von `public/assets/`

| Pfad | Inhalt | Größe |
|---|---|---|
| `manifest.json` | Verzeichnis aller Assets: Maßstäbe, Rahmen der ARGUS-Markierung, gemessene Sichtstörungen, Ebenen mit Fahrzeugen und Figuren, Effekt-Zuordnung, Ziel-Index | 90 KB |
| `karte/luftbild_1m.webp` | Luftbild 1000 × 700 (1 m/px), schneller erster Aufbau | 127 KB |
| `karte/luftbild_050.webp` | Luftbild 2000 × 1400 (0,5 m/px), Standard für die Lagekarte | 505 KB |
| `karte/kacheln/z025/X_Y.webp` | 8 × 6 Kacheln à 512 px in 0,25 m/px, nur bei starkem Zoom nachladen | 1,2 MB |
| `karte/topo_050.webp` | schematische Karte (Wald, Wege, Bach, Gebäude), ruhiger Hintergrund für G2/G3 | 103 KB |
| `karte/lagekarte_beschriftet.webp` | Luftbild mit Raster, PQ, NS-01, EZ-01, allen Namen (Vorschau, Plenum, Druck) | 353 KB |
| `karte/gelaende.json` | erzeugte Einzelhäuser als Vektoren | 3 KB |
| `drohne/M01.webp … M27.webp` | Standbild je ARGUS-Meldung, 1024 × 640, mit Sichtstörungen und Wracks | 14–139 KB |
| `drohne/V1-M1.webp … V5-M1.webp` | Standbild je Verstärkung, nur mit deren Fahrzeugen | 23–54 KB |
| `drohne/ebenen/<Meldung>-boden/-kronen/-stoerung.webp` | Ebenen des Live-Drohnenbilds je Meldung und Verstärkung (Kronen und Störung mit Alphakanal, fehlen, wenn leer) | 17–95 KB je Meldung |
| `drohne/ebenen/kamera.webp` | gemeinsame Kamera-Ebene (Vignette) für alle Live-Drohnenbilder | 8 KB |
| `drohne/SL-Z27.webp`, `SL-Z28.webp` | ungemeldete Ziele Z-27 und Z-28 an der Brücke Ost (Lage bei Spielende), nur Spielleitung/Plenum | 35–38 KB |
| `sprites/fahrzeuge.png/.json` | Sprite-Atlas (PixiJS-Format): 12 Fahrzeugtypen intakt und Wrack, Zustände (Kette ab, Luk offen), Personen mit Varianten (Kleidung, Kind, weißes Tuch), Drohne, Loitering Munition | 341 KB |
| `sprites/effekte.webp/.json` | Effekt-Atlas mit Animationen (seit 5b WebP mit Alphakanal statt PNG) | 512 KB |

Größenbudget (Leitplanke „schnell ladbar am Dienst-PC“, geprüft in `tests/assets_ebenen.test.ts`):

- Standbild ≤ 150 KB, jede Ebene ≤ 110 KB (Boden) bzw. 60 KB (Kronen, Störung), alle Ebenen einer
  Meldung zusammen ≤ 200 KB. Der Generator senkt sonst die Qualität.
- Was jedes Fenster lädt (Standbilder, Kartenstart, Atlanten): 2,8 MB, Test < 6 MB.
- Live-Ebenen (lädt nur G1, jeweils für die offene Meldung): 1,6 MB für alle 32 Meldungen, Test < 6 MB.
- Offline-Datei (Variante C) bettet alles außer Kacheln und Vorschau ein: 8,5 MB (vorher ca. 6 MB; läuft per Doppelklick von der Platte).

## Fertig-Kriterien

`gen_assets.py` prüft am Ende (Exit-Code 1, wenn etwas fehlt), `tests/assets.test.ts` (Schritt 5) und
`tests/assets_ebenen.test.ts` (Schritt 5b) prüfen in jedem Build (GitHub Actions):

- **Schritt 5:** jedes Ziel im Drehbuch hat Bild und Sprite (jetzt 47 Ziele einschließlich der
  Verstärkungen), jede Meldung ein Drohnenbild, Sichtstörungen gemessen, Schlüsselfälle frei.
- **Schritt 5b – jede Meldung und Verstärkung hat ihre Ebenen:** 27 Meldungen und 5 Verstärkungen mit
  Standbild, Boden, Kronen und Störung (wo vorhanden); jedes Hauptziel steht in der Fahrzeugliste, jeder
  Sprite und jede Figur liegt im Atlas. Die Ebenen messen dieselbe Verdeckung wie das Standbild (≤ 5 Prozentpunkte).
- **Schlüsselfälle bleiben erkennbar** – im Standbild und in den Ebenen: S2 Rotes Kreuz 0 % verdeckt,
  zwei Sanitäter; S4 vier Zivilpersonen, davon zwei Kinder (eigene Sprites), < 10 % verdeckt; N2 drei
  Personen mit erhobenen Händen, eine mit weißem Tuch, Panzer mit abgesprungener Kette; S1/S3 frei.
- **Wracks:** Jedes Fahrzeug, das das Hintergrundgefecht vor der Bildzeit getroffen hat, ist im Bild
  Wrack (zerstört) bzw. steht mit abgesprungener Kette (außer Gefecht), z. B. Z-11 in M12.
- **Größenbudget** wie oben; keine Route führt durch ein erzeugtes Haus.

## Live-Drohnenbild (Ebenen)

Je Meldung steht im Manifest `drohne[M].ebenen`. Das Standbild ist zur Meldezeit genau die Summe der
Ebenen; die Oberfläche setzt sie so zusammen (Reihenfolge von unten), Positionen aus der Engine:

1. `boden` – Gelände mit Dächern, Baumschatten, Fahrspuren bis zur Meldezeit und Munitionskisten, schon kameragefärbt.
2. Schatten der Fahrzeuge und Figuren (Sprite schwarz, Fahrzeuge 1,25 m, Figuren 0,8 m nach Südost, weich, Alpha 0,5).
3. Fahrzeuge: Sprite aus dem Fahrzeug-Atlas nach Engine-Zustand (intakt, Wrack, Zustand wie `kpz_t72_kette_ab.png`),
   um `hdg` gedreht, Maßstab `1 / m_pro_px` Pixel je Meter (Atlas 12 px/m). Feuer auf Wracks, Mündungsblitz.
4. Figuren (`ebenen.figuren`): Sprite-Variante je Person, Position = Bezugspunkt + Versatz
   (`bezug` „gruppe“: Personengruppe `ziel.personen[gruppe]` zur Spielzeit + `versatz_m`; „fahrzeug“:
   Fahrzeugmitte + `versatz_m` in Fahrzeugachsen, mit `hdg` gedreht), um das eigene `hdg` gedreht,
   Maßstab Personen-Atlas (24 px/m) × `person_ueberhoehung` (1,5). Figuren mit `oben` stehen auf dem Fahrzeug.
5. `kronen` – Baumkronen (RGBA) über Fahrzeugen und Figuren; über Personen zur Meldezeit freigestellt.
6. Rauch der Wracks (Effekt `rauch`, Anker an der Quelle, ca. 30 m).
7. `stoerung` – Sichtstörungen (RGBA): Wolke mit Wolkenschatten, Rauch, Dunst, Tarnnetz und Stempel am
   Ziel, bei M25 die Streifen der Bildstörung. Rauschen und Zeilenversatz der Bildstörung (`ebenen.bildstoerung`)
   und die Bewegungsunschärfe am Ziel (`ebenen.unschaerfe`) macht die Oberfläche, weil sie sich bewegen.
8. `drohne_ebenen.kamera` – Vignette.

Sprites und Effekte bekommen die Kamerafarbe mit `drohne_ebenen.farbmatrix` (PixiJS ColorMatrixFilter).
Die Kamera steht (die Drohne hält den Ausschnitt), Fahrzeuge fahren hinein und hinaus. Bild-Pixel =
(x − `ausschnitt_m.x`) / `m_pro_px`, ebenso für y. Bei Verstärkungen ist die Zeit relativ zum Einspielen
(`relativ`, `t_s` = `dt_s`, `uhr` = null).

Referenz-Umsetzung in Python: `tools/assets/live.py` (setzt ein Live-Bild zur Spielzeit t zusammen).
Prüfung: zur Meldezeit weicht das zusammengesetzte Bild im Mittel 2,5–4,1 Graustufen (von 255) vom
Standbild ab – das ist im Wesentlichen das Kamerarauschen. `--vorschau` legt Ebenen-Bögen und animierte
Live-Vorschauen (`Live_M12.webp` …) ab.

`src/assets/assets.ts`: `drohnenEbenen(man, id)` liefert Ebenen und die Liste der zu ladenden Dateien.

## Hintergrundgefecht in den Bildern

- Getroffen ist ein Ziel ab dem ersten Ereignis `art: panzerabwehr` in `szenario.hintergrund`, wenn es
  dann noch im Raum steht und westlich des Bachs ist (wie die Engine). Es bleibt an der Trefferstelle.
- `folge: zerstoert` → Wrack-Sprite; im Standbild mit Feuer im Motorraum und Rauchfahne nach Südost
  (`drohne[M].wracks[].staerke` wird kleiner, wenn der Rauch ein Ziel, das Rote Kreuz oder Personen verdecken würde).
  In der Live-Lage zeichnet die Oberfläche `feuer` und `rauch` (Zuordnung `effekte.zuordnung.wrack`).
- `folge: ausser_gefecht` → Sprite mit abgesprungener Kette, kein Brand (Z-24 ab 10:19:30).
- Betroffene Bilder: M12 (Z-11), M16 (Z-11), M21 (Z-32, Z-24 (Kette ab)).
- `manifest.ziele[Z].hintergrund` nennt Zeit und Folge, `objekte[].zustand` den Zustand im Bild.

## Verstärkungen

Je Verstärkung ein Standbild mit Ebenen zur Meldezeit `dt_s` nach dem Einspielen, nur mit den Fahrzeugen
der Verstärkung (die übrige Lage hängt vom Einspielzeitpunkt ab). Dateiname aus `bild.datei`
(`drohne/V1-M1.webp` …), im Manifest unter `drohne` wie die Meldungen (`verstaerkung`, `relativ`).
Die Ziele V1-1 … V5-2 stehen im Ziel-Index mit Bild und Sprite.

## Effekte

| Name | Wofür | Bilder | Größe | Hinweis |
|---|---|---|---|---|
| `explosion_mittel` | Einschlag Mörser | 16 × 16 fps | 36 m |  |
| `explosion_klein` | Einschlag LM | 12 × 18 fps | 14 m |  |
| `treffer_direkt` | Einschlag PzAbw | 10 × 20 fps | 8 m |  |
| `rauch` | Rauchfahne über Wracks (Schleife) | 16 × 8 fps | 22 m | Anker 0,225/0,225; Anker = Quelle (Wrack); die Fahne zieht nach Südost |
| `feuer` | Feuer auf Wracks (Schleife) | 8 × 12 fps | 6 m |  |
| `krater` | nach Einschlag | 3 Varianten (statisch) | 12 m |  |
| `lm_flug` (neu) | LM im Flug (Schleife) | 8 × 16 fps | 3,2 m | um die Flugrichtung drehen (0 = Osten); Schatten wie bei Fahrzeugen, aber 4 m versetzt |
| `leuchtspur` (neu) | PzAbw vom Westrand zum Ziel (Schleife) | 6 × 20 fps | 24 × 3 m | Anker 0,94/0,5; Anker = Kopf; vom Westrand zum Ziel bewegen und um die Flugrichtung drehen |
| `muendungsblitz` (neu) | Kanone feuert (KPz, SPz) | 6 × 24 fps | 10 × 6 m | Anker 0,1/0,5; Anker = Mündung (Rohrende); um die Rohrrichtung drehen |
| `muendungsblitz_steil` (neu) | Mörser feuert | 8 × 18 fps | 8 m |  |
| `einschlag_artillerie` (neu) | Feindartillerie (H-01, H-04, H-12) | 18 × 14 fps | 44 m | danach krater; Staub zieht nach Südost |
| `nebel` (neu) | Rauch-/Nebelwand (H-03), Schleife | 16 × 6 fps | 64 m | mehrere Instanzen über die Fläche (radius_m) verteilen, ein- und ausblenden |

`effekte.zuordnung` im Manifest: Wirkmittel (MRS: Einschlag `explosion_mittel`; LM: Flug `lm_flug`,
Einschlag `explosion_klein`; PZA: Flug `leuchtspur`, Einschlag `treffer_direkt`, danach `krater`),
Hintergrund (`feindartillerie` → `einschlag_artillerie` + `krater`, `panzerabwehr` → `leuchtspur` +
`treffer_direkt`, `rauch` → `nebel` als Fläche), Wracks (`feuer`, `rauch`), feuernde Fahrzeuge
(`muendungsblitz`, Mörser `muendungsblitz_steil`). Der Wirkradius bleibt ein Kreis nach Spielregel.

## Drohnenbilder je Meldung

Spalten: Bildbreite im Gelände, Sichtstörung (Soll → gemessen), verdeckter Anteil des Ziels, Personen,
Wracks und Zustände im Bild, Standbild, Ebenen (Boden/Kronen/Störung).

| Meldung | Fall | Ziel | Uhr | Ausschnitt | Sicht | Ziel verdeckt | Personen / Prüfung | Wrack | Standbild | Ebenen (B/K/S) |
|---|---|---|---|---|---|---|---|---|---|---|
| M01 |  | Z-01, Z-02 | 10:00:20 | 120 m | – | 0/0 % |  | – | 38 KB | 28/4/– KB |
| M02 |  | Z-03, Z-04 | 10:01:15 | 120 m | Wolke rechts 45 → 44 % (Ziel 12 → 14 %) | 0/14 % |  | – | 30 KB | 22/39/30 KB |
| M03 |  | Z-02 | 10:04:00 | 110 m | – | 0 % | 1 Soldat | – | 35 KB | 26/10/– KB |
| M04 | N3 | Z-05 | 10:04:45 | 110 m | Bäume Ziel 60 → 64 % | 64 % |  | – | 38 KB | 27/11/2 KB |
| M05 |  | Z-06 | 10:05:30 | 110 m | Rauch Ziel 25 → 25 % | 25 % | 6 Soldat | – | 54 KB | 12/49/6 KB |
| M06 |  | Z-08 | 10:07:00 | 110 m | – | 0 % |  | – | 48 KB | 32/24/– KB |
| M07 |  | Z-09–11 | 10:07:35 | 120 m | – | 0/0/0 % |  | – | 52 KB | 33/24/– KB |
| M08 | S1 | Z-07 | 10:08:30 | 110 m | – | 0 % |  | – | 36 KB | 14/26/– KB |
| M09 |  | Z-09, Z-10 | 10:10:00 | 120 m | Rauch links 55 → 55 % (Ziel 40 → 41 %) | 41/14 % |  | – | 24 KB | 30/23/32 KB |
| M10 |  | Z-29 | 10:11:15 | 110 m | Tarnnetz Ziel 70 → 72 % | 72 % | 2 Soldat | – | 49 KB | 21/48/3 KB |
| M11 |  | Z-13 | 10:12:15 | 110 m | – | 0 % |  | – | 33 KB | 24/8/– KB |
| M12 | S2 | Z-12 | 10:13:15 | 130 m | Dunst links 20 → 20 % | 0 % | Rotes Kreuz verdeckt 0 %, 2 Sanitäter | Z-11 | 33 KB | 25/25/15 KB |
| M13 |  | Z-30–32 | 10:14:30 | 120 m | – | 0/0/0 % |  | – | 41 KB | 28/13/– KB |
| M14 |  | Z-14 | 10:15:15 | 110 m | Rauch links 40 → 40 % | 0 % |  | – | 25 KB | 28/2/21 KB |
| M15 |  | Z-33–35 | 10:16:00 | 122 m | – | 0/0/0 % |  | – | 43 KB | 29/18/– KB |
| M16 |  | Z-18 | 10:16:45 | 110 m | Rauch Ziel 30 → 29 % | 29 % |  | Z-11 | 36 KB | 26/9/3 KB |
| M17 | N4 | Z-36 | 10:17:35 | 130 m | – | 0 % |  | – | 28 KB | 16/22/– KB |
| M18 | S4 | Z-19 | 10:18:15 | 60 m | Rauch Ziel 15 → 13 % | 13 % | 5 Soldat, 4 Zivil | – | 14 KB | 9/3/6 KB |
| M19 |  | Z-20 | 10:19:00 | 140 m | Rauch rechts 35 → 35 % | 0 % |  | – | 28 KB | 22/32/31 KB |
| M20 | S3 | Z-15–17 | 10:20:15 | 120 m | – | 0/0/0 % |  | – | 41 KB | 29/16/– KB |
| M21 | N2 | Z-24 | 10:20:45 | 70 m | – | 0 % | 3 Besatzung (Tuch) | Z-32, Z-24 (Kette ab) | 27 KB | 21/–/– KB |
| M22 |  | Z-21 | 10:21:20 | 110 m | Bäume Ziel 55 → 55 % | 55 % |  | – | 51 KB | 12/49/3 KB |
| M23 | S4 | Z-19 | 10:22:00 | 125 m | Rauch Ziel 20 → 19 % | 19 % | 5 Soldat, 4 Zivil | – | 35 KB | 22/20/5 KB |
| M24 | N1 | Z-22 | 10:22:30 | 110 m | Wolke oben links 30 → 30 % | 0 % | 3 Zivil | – | 29 KB | 16/20/44 KB |
| M25 |  | Z-23 | 10:23:10 | 110 m | Bildstörung ganzes Bild 50 → 50 % | 0 % |  | – | 139 KB | 17/5/2 KB |
| M26 |  | Z-25 | 10:23:45 | 110 m | Unschärfe Ziel 30 → 30 % | 0 % | 5 Soldat, 4 Zivil | – | 33 KB | 25/2/– KB |
| M27 |  | Z-26 | 10:24:20 | 110 m | Wolke Mitte 60 → 59 % (Ziel 80 → 80 %) | 80 % |  | – | 26 KB | 20/41/35 KB |
| V1-M1 |  | V1-1, V1-2 | +10 s | 120 m | – | 0/0 % |  | – | 32 KB | 19/27/– KB |
| V2-M1 |  | V2-1–3 | +30 s | 120 m | – | 0/0/0 % |  | – | 40 KB | 30/–/– KB |
| V3-M1 |  | V3-1–3 | +130 s | 120 m | – | 0/0/0 % |  | – | 49 KB | 33/9/– KB |
| V4-M1 |  | V4-1 | +30 s | 110 m | Rauch Ziel 20 → 20 % | 20 % | 5 Soldat | – | 55 KB | 14/41/5 KB |
| V5-M1 |  | V5-1, V5-2 | +35 s | 120 m | Dunst oben 20 → 20 % | 0/0 % | 4 Soldat | – | 24 KB | 16/17/17 KB |

Bildzeitstempel = 10:00 + t_s. Positionen und Fahrtrichtung sind die Lage zur Meldezeit (Route aus
dem Szenario, nach einem Treffer an der Trefferstelle). Andere Fahrzeuge, die zur selben Zeit im
Ausschnitt stehen, sind mit im Bild und im Manifest unter `objekte` und `ebenen.fahrzeuge` aufgeführt.

## Generator `tools/assets/`

| Datei | Aufgabe |
|---|---|
| `gen_assets.py` | Aufruf, Manifest, Größenbegrenzung, Prüfung der Fertig-Kriterien (auch: keine Route durch ein Haus) |
| `daten.py` | lädt `public/daten`, Position/Fahrtrichtung zur Zeit t, Hintergrundgefecht (Treffer, Zustand), Verstärkungen |
| `gelaende.py` | Gelände aus `karte_kraehe.json`: Felder, Wege, Bach, Wald, Häuser nach `bebauung` (abseits aller Routen), Baumgruppen bei Zielen mit „Bäume“, freie Sicht bei allen anderen; Boden und Kronen als getrennte Ebenen |
| `fahrzeuge.py` | Draufsichten aller Katalogtypen, Wracks, Zustände, Personen mit Varianten, Luftfahrzeuge |
| `drohne.py` | Drohnenbild je Meldung und Verstärkung: Standbild und Ebenen, Wracks mit Feuer und Rauch, Manifest-Eintrag |
| `sicht.py` | Sichtstörungen: Wolke, Rauch, Dunst, Bäume, Tarnnetz, Rauch am Ziel, Bildstörung (auch als Ebene), Unschärfe |
| `karte.py` | Kartenpaket (Stufen, Kacheln, Topo, beschriftete Vorschau, Häuser) |
| `sprites.py`, `effekte.py` | Atlanten im PixiJS-Spritesheet-Format, Effekte mit Form, Anker und Zuordnung |
| `live.py` | Live-Drohnenbild aus den Ebenen zusammensetzen (Referenz für Schritt 6b, Prüfung gegen das Standbild) |
| `vorschau.py` | Kontaktbogen, Sprite-Bogen, Ebenen-Bögen, Live-Vorschau (nicht im Spiel) |

```bash
pip install -r tools/assets/requirements.txt      # numpy, scipy, Pillow (mit WebP)
npm run assets                                    # = python3 tools/assets/gen_assets.py --cache .assets-cache.pkl
python3 tools/assets/gen_assets.py --nur drohne --vorschau /tmp/vorschau   # nur Drohnenbilder + Bögen + Live-Vorschau
```

Dauer ca. 4 min (Gelände gut 1 min, mit `--cache` beim zweiten Lauf übersprungen). Fester Seed:
gleiche Daten ergeben gleiche Bilder. Nach jeder Änderung an Szenario, Karte oder Katalog neu
erzeugen und `npm test` laufen lassen.

## Datenfelder (nur Darstellung, keine Spielregel)

- **Meldung `bild`:** `datei` (z. B. `drohne/M07.webp`), `ausschnitt_m` (Bildbreite, Standard 110 m,
  mehrere Ziele 120 m), `versatz_m` (Bildmitte verschieben, z. B. damit die Schule am Rand liegt),
  `zustand` je Ziel (`luk_offen`, `feuert`, `furt`, `kette_ab`, `kisten`), `personen` (nur im Bild,
  zählen nicht für die Trefferregel: Sanitäter am Heck von Z-12, Soldaten bei den Kisten von Z-29 und V5-1,
  Kommandant im Luk von Z-02). Gilt auch für die Meldungen der Verstärkungen.
- **Korrektur 5b:** M10 verwies mit `zustand`/`personen` noch auf Z-12 (aus v1.3), jetzt auf den Lkw
  Z-29 (Sensordaten: abgeladene Kisten, 2 Personen). V5-M1 bekam Kisten und vier Soldaten, wie
  Beschreibung und Sensordaten es sagen. Szenario-Version bleibt 2.0.
- **Sichtstörung:** `ziel_anteil` (Bereichsstörung soll das Ziel zu diesem Anteil verdecken: M02 Ziel
  am Wolkenrand, M09 im Rauch, M27 fast ganz), `seite` (welche Fahrzeugseite Bäume, Netz oder Rauch
  verdecken: M04 vorn, M10 hinten, M16 vorn, M22 hinten).
- **Person:** `klein` (Kinder; Z-19: zwei von vier).
- **Karte:** `bilder` zeigt auf das Kartenpaket, `allee` an der Nordstraße, `bebauung` mit Regel
  (`abschnitte`, `abstand_m`, `schritt_m`), `einzelbaeume`, Flächen `schulhof` und `parkplatz_schule`.
- **Fahrzeugkatalog:** `generator` für alle Typen = Zeichenfunktion in `fahrzeuge.py`; Personen mit `sprite`.

## Einbinden (Schritt 6b/7)

- **Manifest laden:** `ladeManifest()` aus `src/assets/assets.ts`, Bildadresse mit `assetUrl(pfad)`
  (Webseite: `assets/…`; Offline-Datei: eingebettete data:-Adresse). Atlas für PixiJS:
  `atlas(man, "fahrzeuge" | "effekte")` liefert JSON (mit Anker je Rahmen) und Bildadresse.
- **Drohnenbild-Popup (G1):** Standbild `drohne[M].datei` mit Eckrahmen (`ziele[].box`); Lupe weiter auf
  dem Standbild (scharf, alle Schlüsselfälle geprüft). **Live-Drohnenbild:** Ebenen wie oben, mit
  `drohnenEbenen(man, id)` vorladen; Verstärkungen über ihre Meldungs-ID (`V2-M1`).
- **Fahrzeuge auf der Karte:** Sprite um `hdg` drehen (0 = Osten, im Uhrzeigersinn), Anker Mitte,
  Maßstab `px_pro_m` (Fahrzeuge 12, Personen 24); taktische Zeichen bei kleinem Maßstab (Schritt 6).
  Nach einem Treffer `sprite_wrack` bzw. der Zustands-Sprite (`*_kette_ab.png`).
- **Effekte:** nach `effekte.zuordnung`. LM: `lm_flug` vom Startpunkt (`katalog_wirkmittel` → `flug.start`)
  zum vorausberechneten Einschlagort, gedreht in Flugrichtung. PzAbw: `leuchtspur` vom Westrand zum Ziel
  (Anker = Kopf). Feindartillerie: `einschlag_artillerie` je Eintrag in `einschlaege`, danach `krater`.
  Rauch (H-03): mehrere `nebel` über den Kreis `radius_m`, ein- und ausblenden über `dauer_s`.
  Größe `groesse_m` (bei Rechteck-Effekten `hoehe_m`) ist die sichtbare Größe, nicht der Wirkradius.
- **Karte:** zuerst `luftbild_1m`, dann `luftbild_050`; Kacheln (0,25 m/px) erst laden, wenn mehr als
  2 Bildpunkte je Meter gebraucht werden. Raster, PQ, Zonen und Namen aus den Daten zeichnen.

## Befund 5b: Häuser auf den Routen

Seit Szenario 2.0 fahren die Fahrzeuge. Die Angriffsrouten des verstärkten Zuges, der Achse NORD und
von V-3 queren die Häuserzeile an der Nordstraße; vorher standen 20 der 47 erzeugten Häuser auf einer
Route (z. B. fuhren Z-08 und Z-10 auf dem Hin- und Rückweg mitten durch Häuser an der Nordstraße), in
der Live-Lage wäre das sichtbar gewesen. Der Generator stellt die Häuser jetzt je Straßenseite der
Reihe nach auf und lässt jede Route frei (Abstand zum Grundriss ≥ halbe Fahrzeugbreite + 0,8 m, auch bei
den Verstärkungen); `gen_assets.py` prüft das am Ende. Es sind 45 Häuser (vorher 47), aber das
Mittelstück der Nordstraße (y ≈ 150–320 m), über das neun Angriffsrouten führen, ist jetzt unbebaut:
Ober- und Unterdorf sind getrennt. EZ-01 bleibt nach den Daten bestehen. Wer dort Häuser will, legt die
Routen in der Ortschaft auf die Straßen (Schritt 2b) und erzeugt neu.
