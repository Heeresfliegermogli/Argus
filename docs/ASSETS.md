# ARGUS – Assets (Schritt 5)

Alle Bilder des Spiels entstehen prozedural aus den Spieldaten in `public/daten/` mit
`tools/assets/gen_assets.py` und liegen mit einem Manifest in `public/assets/`. Nichts ist
abfotografiert oder lizenzpflichtig; Gelände, Einheiten und Namen sind fiktiv. Keine Darstellung
getöteter Menschen: Wracks zeigen nur Fahrzeuge, getroffene Personen markiert die Oberfläche.

## Inhalt von `public/assets/`

| Pfad | Inhalt | Größe |
|---|---|---|
| `manifest.json` | Verzeichnis aller Assets mit Maßstäben, Rahmen der ARGUS-Markierung, gemessenen Sichtstörungen, Ziel-Index | ca. 35 KB |
| `karte/luftbild_1m.webp` | Luftbild 1000 × 700 (1 m/px), schneller erster Aufbau | 0,15 MB |
| `karte/luftbild_050.webp` | Luftbild 2000 × 1400 (0,5 m/px), Standard für die Lagekarte | 0,48 MB |
| `karte/kacheln/z025/X_Y.webp` | 8 × 6 Kacheln à 512 px in 0,25 m/px, nur bei starkem Zoom nachladen | 1,3 MB |
| `karte/topo_050.webp` | schematische Karte (Wald, Wege, Bach, Gebäude), ruhiger Hintergrund für G2/G3 | 0,2 MB |
| `karte/lagekarte_beschriftet.webp` | Luftbild mit Raster, PQ, NS-01, EZ-01, allen Namen (Vorschau, Plenum, Druck) | 0,3 MB |
| `karte/gelaende.json` | erzeugte Einzelhäuser als Vektoren | 4 KB |
| `drohne/M01.webp … M25.webp` | ein Drohnenbild je ARGUS-Meldung, 1024 × 640, mit Sichtstörungen | 18–142 KB |
| `drohne/SL-Z27-Z28.webp` | ungemeldete Ziele Z-27/Z-28 an der Brücke Ost, nur Spielleitung/Plenum | 35 KB |
| `sprites/fahrzeuge.png/.json` | Sprite-Atlas (PixiJS-Format): 12 Fahrzeugtypen intakt und Wrack, Personen, Drohne, Loitering Munition | 0,3 MB |
| `sprites/effekte.png/.json` | Effekt-Atlas mit Animationen: Explosion mittel/klein, Treffer, Rauch, Feuer, Krater | 0,6 MB |

Für das Spiel (ohne Kacheln und Vorschau) zusammen ca. 2,5 MB; der Test begrenzt auf 6 MB und
jedes Drohnenbild auf 150 KB. Die Offline-Datei (Variante C) bettet alles außer Kacheln und Vorschau
ein (ca. 4 MB).

## Fertig-Kriterium „jedes Ziel im Drehbuch hat Bild und Sprite“

`gen_assets.py` prüft es am Ende (Exit-Code 1, wenn etwas fehlt), `tests/assets.test.ts` prüft es
in jedem Build (GitHub Actions):

- 28 von 28 Zielen haben mindestens ein Bild (`manifest.ziele[Z].bilder`) und Sprite + Wrack im Atlas.
  Z-27/Z-28 (ungemeldet) nur im Spielleitungsbild, in keinem Bild der Spieler.
- 25 von 25 Meldungen haben ein Drohnenbild; die Sichtstörungen aus `bild.sicht` sind gemessen
  (Abweichung ≤ 8 Prozentpunkte), Ziele ohne Störung am Ziel sind frei (< 5 % verdeckt).
- Schlüsselfälle: S1 Attrappe und S3 PT-91 frei sichtbar, S2 Rotes Kreuz 0 % verdeckt, S4 vier
  Zivilpersonen sichtbar (davon zwei Kinder), N2 drei Personen der Besatzung mit weißem Tuch.
- Jedes Wirkmittel hat seinen Effekt (`katalog_wirkmittel.json → effekt`).

## Drohnenbilder je Meldung

Spalten: Bildbreite im Gelände, Sichtstörung (Soll → gemessen), verdeckter Anteil des Ziels, Personen im Bild.

| Meldung | Fall | Ziel | Uhr | Ausschnitt | Sicht | Ziel verdeckt | Personen / Prüfung | Datei |
|---|---|---|---|---|---|---|---|---|
| M01 |  | Z-01 | 10:01:00 | 110 m | – | 0 % |  | 19 KB |
| M02 |  | Z-02 | 10:02:30 | 110 m | Wolke rechts 45 → 44 % (Ziel 12 → 11 %) | 11 % |  | 18 KB |
| M03 |  | Z-03 | 10:04:00 | 110 m | – | 0 % | 1 Soldat | 34 KB |
| M04 | N3 | Z-04 | 10:05:15 | 110 m | Bäume Ziel 60 → 60 % | 60 % |  | 37 KB |
| M05 |  | Z-05 | 10:06:30 | 110 m | Bäume Ziel 20 → 21 % | 21 % |  | 40 KB |
| M06 |  | Z-06 | 10:07:30 | 110 m | Rauch Ziel 25 → 24 % | 24 % | 6 Soldat | 53 KB |
| M07 | S1 | Z-07 | 10:08:30 | 110 m | – | 0 % |  | 36 KB |
| M08 |  | Z-08 | 10:09:30 | 110 m | Wolke oben 50 → 49 % (Ziel 33 → 33 %) | 33 % |  | 27 KB |
| M09 |  | Z-09 | 10:10:30 | 110 m | Bäume Ziel 60 → 60 % | 60 % |  | 40 KB |
| M10 |  | Z-10 | 10:11:15 | 110 m | Tarnnetz Ziel 70 → 75 % | 75 % | 2 Soldat | 45 KB |
| M11 |  | Z-11 | 10:12:15 | 110 m | – | 0 % |  | 32 KB |
| M12 | S2 | Z-12 | 10:13:15 | 130 m | Dunst links 20 → 20 % | 0 % | Rotes Kreuz verdeckt 0 %, 2 Sanitäter | 29 KB |
| M13 |  | Z-13 | 10:14:15 | 110 m | Rauch links 40 → 40 % | 0 % |  | 18 KB |
| M14 |  | Z-14 | 10:15:15 | 110 m | Rauch Ziel 30 → 34 % | 34 % |  | 34 KB |
| M15 |  | Z-18 | 10:16:30 | 110 m | Wolke unten 35 → 35 % | 0 % |  | 25 KB |
| M16 | S4 | Z-19 | 10:18:15 | 60 m | Rauch Ziel 15 → 14 % | 14 % | 5 Soldat, 4 Zivil | 19 KB |
| M17 |  | Z-20 | 10:19:00 | 140 m | Rauch rechts 35 → 35 % | 0 % |  | 24 KB |
| M18 |  | Z-21 | 10:19:45 | 110 m | Bäume Ziel 55 → 57 % | 57 % |  | 54 KB |
| M19 | S3 | Z-15–17 | 10:20:15 | 121 m | – | 0/0/0 % |  | 38 KB |
| M20 | N2 | Z-24 | 10:20:45 | 70 m | – | 0 % | 3 Besatzung (Tuch) | 27 KB |
| M21 | S4 | Z-19 | 10:21:30 | 154 m | Rauch Ziel 20 → 18 % | 18 % | 5 Soldat, 4 Zivil | 48 KB |
| M22 | N1 | Z-22 | 10:22:00 | 110 m | Wolke oben links 30 → 30 % | 0 % | 3 Zivil | 18 KB |
| M23 |  | Z-23 | 10:22:45 | 110 m | Bildstörung ganzes Bild 50 → 50 % | 0 % |  | 142 KB |
| M24 |  | Z-25 | 10:23:30 | 110 m | Unschärfe Ziel 30 → 30 % | 0 % |  | 37 KB |
| M25 |  | Z-26 | 10:24:15 | 110 m | Wolke Mitte 60 → 60 % (Ziel 80 → 80 %) | 80 % |  | 23 KB |

Bildzeitstempel = 10:00 + t_s. Positionen und Fahrtrichtung sind die Lage zur Meldezeit (Route aus
dem Szenario). Andere Fahrzeuge, die zur selben Zeit im Ausschnitt stehen, sind mit im Bild und im
Manifest unter `objekte` aufgeführt (Bildposition), damit die Oberfläche später z. B. ein bereits
zerstörtes Fahrzeug mit dem Wrack-Sprite überdecken kann.

## Generator `tools/assets/`

| Datei | Aufgabe |
|---|---|
| `gen_assets.py` | Aufruf, Manifest, Größenbegrenzung, Prüfung des Fertig-Kriteriums |
| `daten.py` | lädt `public/daten`, Position/Fahrtrichtung zur Zeit t (Logik aus `argus_lib.py`) |
| `gelaende.py` | Gelände aus `karte_kraehe.json`: Felder, Wege, Bach, Wald, Häuser nach `bebauung`, Baumgruppen bei Zielen mit „Bäume“, freie Sicht bei allen anderen; Boden und Kronen als getrennte Ebenen |
| `fahrzeuge.py` | Draufsichten aller Katalogtypen (`generator` im Katalog), Wracks, Personen, Luftfahrzeuge |
| `drohne.py` | Drohnenbild je Meldung: Ausschnitt, Fahrspuren, Schatten, Personen, Kronen über den Fahrzeugen, Störungen, Kamera |
| `sicht.py` | Sichtstörungen: Wolke, Rauch, Dunst (Bildbereich, Anteil per Schwellwert), Bäume, Tarnnetz, Rauch am Ziel (Stempel bis zum Anteil), Bildstörung, Unschärfe |
| `karte.py` | Kartenpaket (Stufen, Kacheln, Topo, beschriftete Vorschau, Häuser) |
| `sprites.py`, `effekte.py` | Atlanten im PixiJS-Spritesheet-Format |
| `vorschau.py` | Kontaktbogen und Sprite-Bogen zur Kontrolle (nicht im Spiel) |

```bash
pip install -r tools/assets/requirements.txt      # numpy, scipy, Pillow (mit WebP)
npm run assets                                    # = python3 tools/assets/gen_assets.py --cache .assets-cache.pkl
python3 tools/assets/gen_assets.py --nur drohne --vorschau /tmp/vorschau   # nur Drohnenbilder + Kontaktbogen
```

Dauer ca. 2,5 min (Gelände 1 min, mit `--cache` beim zweiten Lauf übersprungen). Fester Seed:
gleiche Daten ergeben gleiche Bilder. Nach jeder Änderung an Szenario, Karte oder Katalog neu
erzeugen und `npm test` laufen lassen.

## Neue Datenfelder (nur Darstellung, keine Spielregel)

- **Meldung `bild`:** `datei` (z. B. `drohne/M07.webp`), `ausschnitt_m` (Bildbreite, Standard 110 m,
  mehrere Ziele 120 m), `versatz_m` (Bildmitte verschieben, z. B. damit die Schule am Rand liegt),
  `zustand` je Ziel (`luk_offen`, `feuert`, `furt`, `kette_ab`, `kisten`), `personen` (nur im Bild,
  zählen nicht für die Trefferregel: Sanitäter am Heck von Z-12, Soldaten bei Z-10, Kommandant im Luk von Z-03).
- **Sichtstörung:** `ziel_anteil` (Bereichsstörung soll das Ziel zu diesem Anteil verdecken: M02 Ziel
  am Wolkenrand, M08 ein Drittel des Panzers, M25 fast ganz), `seite` (welche Fahrzeugseite Bäume,
  Netz oder Rauch verdecken: M04 vorn, M05/M18 hinten, M10 hinten, M14 vorn).
- **Person:** `klein` (Kinder; Z-19: zwei von vier).
- **Karte:** `bilder` zeigt auf das Kartenpaket, `allee` an der Nordstraße, `bebauung` mit Regel
  (`abschnitte`, `abstand_m`, `schritt_m`), `einzelbaeume`, Flächen `schulhof` und `parkplatz_schule`.
- **Fahrzeugkatalog:** `generator` für alle Typen = Zeichenfunktion in `fahrzeuge.py`; Personen mit `sprite`.

## Einbinden (Schritt 6/7)

- **Manifest laden:** `ladeManifest()` aus `src/assets/assets.ts`, Bildadresse mit `assetUrl(pfad)`
  (Webseite: `assets/…`; Offline-Datei: eingebettete data:-Adresse). Atlas für PixiJS:
  `atlas(man, "fahrzeuge")` liefert JSON und Bildadresse.
- **Drohnenbild (G1):** `gemeinsam/drohnenbild.tsx` zeigt Bild, Eckrahmen (`ziele[].box`), Klasse und
  Konfidenz (bei M19 je Fahrzeug aus `argus.einzeln`) und lädt die nächsten Bilder vor. Seit Schritt 6
  ca. 900 × 562 px; Klick öffnet die Vergrößerung (ca. 1140 px) mit Lupe 1,6–6-fach (Mausrad) – für S2
  (Rotes Kreuz), S4 (Kinder) und N2 (weißes Tuch).
- **Fahrzeuge auf der Karte:** Sprite um `hdg` drehen (0 = Osten, im Uhrzeigersinn), Anker Mitte,
  Maßstab `px_pro_m` (Fahrzeuge 12, Personen 24). Bei 1,1 px/m auf der Lagekarte wären Fahrzeuge
  maßstäblich nur 8 px groß – mit Überhöhung (z. B. ×3) oder als taktisches Zeichen (milsymbol)
  zeigen, Sprites beim Hineinzoomen. Schatten: denselben Sprite schwarz, Alpha 0,45, 1,2 m nach Südost.
  Umgesetzt in Schritt 6 (`src/karte/lagekarte.ts`): taktische Zeichen, auf der Kontrollkarte ab
  2,6 px/m Sprite mit Schatten bzw. Wrack-Sprite; Luftbild-Kacheln ab 2 px/m.
- **Wirkung:** Effekt je Wirkmittel aus dem Katalog; Größe `groesse_m` (sichtbare Größe, nicht der
  Wirkradius – der bleibt ein Kreis nach Spielregel). Danach Wrack-Sprite, `krater` darunter, bei
  Fahrzeugen `rauch`/`feuer` als Schleife.
- **Karte:** zuerst `luftbild_1m`, dann `luftbild_050`; Kacheln (0,25 m/px) erst laden, wenn mehr als
  2 Bildpunkte je Meter gebraucht werden. Raster, PQ, Zonen und Namen aus den Daten zeichnen.
