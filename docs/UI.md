# ARGUS – Ansichten (Schritt 6, ergänzt in 4b)

Fünf Ansichten in 1530 × 800 ohne Rollbalken: G1 Aufklärung, G2 Zielprüfung, G3 Führung,
Spielleitung und Plenum. Jede Gruppe hat eine Einweisungskarte (im Spiel und als Druck, A5 quer).
Bewegung und Animationen folgen in Schritt 7, Kennzahlen und Replay in Schritt 8.

Seit Schritt 4b davor: **Startseite** (Code eingeben bzw. Sitzung anlegen), **Lobby** (Teams bilden),
**Übersicht der Spielleitung** über alle Teams mit Teamansicht und Zuschauen – siehe
[`SITZUNG.md`](SITZUNG.md). Die Ansichten selbst zeigen in der Kopfzeile das Team; bei Doppelrolle
schaltet ein Umschalter oben links zwischen den Rollen.

Adressen: `…/Argus/` (Startseite), `?sitzung=CODE` (Teilnehmer), `&rolle=sl|plenum`; ohne Lobby wie
bisher `…/Argus/?rolle=g1|g2|g3|sl|plenum&raum=…`. Druck der Einweisungskarten
`…/Argus/?druck=einweisung`. Die Spielleitung öffnet das Plenum mit „Plenum öffnen“.

## Die Ansichten

Jede Gruppenansicht hat dieselbe Ordnung: links die Liste (①), in der Mitte das Arbeitsfeld, rechts
die Entscheidung. Die Nummern ①②③ stehen gleich auf der Einweisungskarte. Die oberste Meldung ist
immer schon gewählt; nach einer Entscheidung springt die Auswahl zur nächsten.

| Ansicht | sieht | entscheidet |
|---|---|---|
| **G1 Aufklärung** | ① Eingang ARGUS, Lagehinweise, Verlauf · ② großes Drohnenbild (ca. 900 px) mit ARGUS-Markierung, Klick: Vergrößerung mit Lupe (Mausrad 1,6–6-fach) · ARGUS-Daten, Sensordaten mit Bildalter, Kleingedrucktes dauerhaft | ③ ANNEHMEN / ABLEHNEN, Vermerk (1 Zeile) |
| **G2 Zielprüfung** | ① Zielmeldungen (zurückgestellte unten, markiert), Verlauf · Zielmeldung als Leiste, Lagekarte mit allen Zielmeldungen an der gemeldeten Position · ② Wirkmittel mit Bestand, Warnungen je Wirkmittel, Abstände zu NS-01, EZ-01 und Einsatzgrenze; Wirkradius-Vorschau auf der Karte (grün/rot, Zonen mit Verstoß hervorgehoben, Einsatzgrenze gestrichelt), auch beim Zeigen auf ein Wirkmittel | ③ BEKÄMPFEN mit … (erst nach Wirkmittelwahl) / BEOBACHTEN / NICHT BEKÄMPFEN, Begründung |
| **G3 Führung** | ① Empfehlungen (Warnung markiert), Verlauf · ② Zielmeldung und Empfehlung mit Warnungen, Lagekarte mit Wirkradius · Postfach „Lagemeldungen“ (neue aufgeklappt, „Gelesen“ quittiert, Hinweis unten rechts bei neuer Meldung), Lagehinweis an G1/G2, Fast-Track | FREIGABE / ABLEHNEN / ZURÜCK AN G2, Bemerkung |
| **Spielleitung** | Steuerung (Start/Anhalten, Tempo, Spielzeit, Fast-Track, Plenum, neues Spiel) · bedingte Injects (wartet / kommt um … / ausgelöst / entfällt) mit „jetzt“, E-01, Reserve R-01–R-03 · Fenster im Raum · Notiz · **Kontrollkarte** (Ground Truth, ungemeldete Ziele, Personen, Wirkungen mit Fehltreffern, Zoom bis zu Sprites mit Schatten und Wracks) · Zeitplan mit „jetzt“, Protokoll mit Export | – |
| **Plenum** | schaltet selbst um: **Einweisung** (Lage für alle, die drei Gruppen, Karte) vor dem Start → **Lage** (Uhr, Karte ohne Ziele, Stand) während des Spiels → **Auflösung** (Kontrollkarte, Kennzahlen auf einen Blick, alle Wirkungen) nach Spielende; von Hand umschaltbar | – |

Bei Spielende sperrt eine Tafel die Gruppenansichten („Ansicht ansehen“ blendet sie aus, Eingaben
bleiben gesperrt).

## Startseite, Lobby, Übersicht (Schritt 4b)

| Fenster | Inhalt |
|---|---|
| **Startseite** | links „Mitspielen“: ein großes Codefeld und **Beitreten** (falscher Code: „Die Sitzung … gibt es nicht“); rechts „Spielleitung“: Name, **Neue Sitzung anlegen**, bestehende Sitzung als Spielleitung oder Plenum öffnen, Synchronisation; darunter eingeklappt der Test ohne Lobby |
| **Lobby** | Kopf: Sitzungscode, in der Mitte der nächste Schritt; links Name, „Neues Team“ (Name, 🎲, drei Rollenknöpfe in Rollenfarbe) bzw. „Du bist im Team“, die drei Rollen in je einem Satz; rechts alle Teams als Karten (bis 8 ohne Rollen), je Rolle eine Zeile mit Name oder **beitreten** / **wechseln** / **+ dazu**, eigene Rolle **abgeben** |
| **Übersicht (SL)** | Kopf mit großem Code; Steuerleiste für alle Teams; Tabelle je Team (Spieler als Chips mit Menü, Spielzeit, Eingang, S1–S4, Fehl, FT, da, ▶/❚❚, ansehen ›); Fuß mit Teilnehmern ohne Team |
| **Teamansicht (SL)** | Leiste statt Rollenband: ◂ Übersicht, Teamwahl, Steuerung · G1 · G2 · G3; G1–G3 nur lesen („Zuschauen – nur lesen“) |
| **Plenum** | vor dem ersten Spiel Einweisung mit Code und Teams; danach ein Team (Wahl oben links) |

Gestaltung: Teamfarben (Rosa, Gelb, Grün, Cyan, Indigo, Magenta, Hellgrau, Braun) sind weder Rollen-
noch Signalfarbe und stehen nie ohne Namen. Folgenreiches (neues Spiel, Team löschen) fragt im Knopf
nach, nie mit einem Browser-Dialog (der hielte im Fenster der Spielleitung die Engine aller Teams an).

## Lagekarte

`src/karte/lagekarte.ts` (PixiJS 8, WebGL, Rückfall Canvas) zeichnet nur, was das Lagebild
(`src/kern/lagebild.ts`) liefert – die Informationsverteilung steht damit an einer Stelle und ist getestet:

* **G2/G3:** Zielmeldungen an der gemeldeten Position mit dem Zeichen der ARGUS-Klasse (milsymbol,
  APP-6/MIL-STD-2525C), nie Ground Truth, keine Personen, keine ungemeldeten Ziele. Folgemeldungen
  zum selben Ziel ergeben ein Zeichen (z. B. „M16/M21“), Gruppen zeigen die Anzahl (M19: 3).
  Gewählt = gelb umrandet, erledigt = blass, bekämpft = Kreuz, freigegeben = roter gestrichelter Kreis
  mit Einschlagzeit.
* **Kontrollkarte (SL, Plenum-Auflösung):** alle Ziele nach Ground Truth zur Lagezeit (Standbild im
  5-s-Takt), Feind/verbündet/zivil/außer Gefecht, Attrappe mit Täuschungszeichen, Sanitätsfahrzeug mit
  Rotem Kreuz, ungemeldete Ziele violett umrandet, Personen (Zivil weiß, Soldaten rot, Besatzung mit
  weißem Tuch blau umrandet, getroffen = Kreuz), Wirkungen grau bzw. rot bei Fehltreffer.
* Raster, Planquadrate, Zonen, Gelände- und Wegenamen, eigene Kräfte als Pfeil am Westrand kommen aus
  `karte_kraehe.json` und dem Szenario. Hintergrund topografische Karte oder Luftbild (Knopf), ab 2 px/m
  Luftbild-Kacheln (nur Webseite). Zoom mit Mausrad, Doppelklick, Knöpfen; Zeigen öffnet einen Tooltip.
* Gezeichnet wird nur bei Änderungen (kein Dauertakt). Schritt 7 schaltet für Bewegung und Effekte den
  Takt ein und setzt die Lagezeit fortlaufend.
* Das Kartenmodul wird erst geladen, wenn eine Ansicht eine Karte zeigt (eigener Baustein, G1 lädt es nicht).

## Gestaltungsregeln

* Bernstein gehört ARGUS (Markierung, Klasse, Konfidenz), Rot der Wirkung (BEKÄMPFEN, FREIGABE) und
  Regelverstößen. Jede Gruppe hat eine eigene Farbe (Kopfzeile, Einweisungskarte, Schrittnummern).
* ANNEHMEN und ABLEHNEN sind gleich gewichtet: Die Oberfläche legt keine Antwort nahe.
* Keine Lösungshinweise in der Oberfläche: Was die Schlüsselfälle auflöst, steht nur dort, wo das
  Drehbuch es vorsieht (Sensordaten und Kleingedrucktes bei G1, I-04 im Postfach von G3). Die
  Sensordaten tragen deshalb keinen Zusatz „fließen nicht in ARGUS ein“ – das steht im Kleingedruckten;
  der Platzhalter für Lagehinweise nennt kein Beispiel aus dem Szenario.
* Feste Felder schneiden nichts ab; nur Listen rollen innerhalb ihres Feldes, ohne sichtbaren Balken
  (unten ausgeblendet, solange mehr folgt). Lange Freitexte (Vermerk, Begründung) bei G3 höchstens
  zwei Zeilen, ganzer Text beim Zeigen.
* Schrift Barlow Semi Condensed und IBM Plex Mono (eingebettet, auch in der Offline-Datei).

## Datengetrieben

Neu in den Daten (nur Darstellung, keine Spielregel; `claude/daten/` und `public/daten/` gleich):

* **Fahrzeugkatalog 1.2:** `symbol.sidc` (Funktionsteil des taktischen Zeichens, z. B. `EVAT` Kampfpanzer)
  und `symbol.groesse` (z. B. `E` Kompanie). Zugehörigkeit und Status setzt die Oberfläche aus
  ARGUS-Klasse bzw. Ground Truth. Fehlt `sidc`, warnt die Szenario-Prüfung und die Karte zeigt ein
  allgemeines Fahrzeugzeichen.
* **Zone `beschriftung`:** Lage der Zonenbeschriftung auf der Karte (sonst berechnet). Szenario bleibt 1.3.

Texte der Einweisungskarten: Auftrag und Lage aus dem Szenario (`lage.G1` …), Wirkmittel, Fast-Track-
Schwelle und Spielzeit aus den Daten; nur die Bedienung steht im Code (`src/ansichten/einweisung.tsx`).

## Prüfung

| Prüfung | Ergebnis |
|---|---|
| `npm test` (Vitest) | 51 Tests bestanden, u. a. Lagebild je Rolle (keine Ground Truth bei G2/G3), taktische Zeichen für jeden Katalogtyp gültig, Attrappe/Schutzzeichen, geplante Wirkung, Spielende, bedingte Injects |
| `tools/ui_bilder.py` | 19 Bilder eines kurzen Ablaufs bis S1: kein Rollbalken, nichts abgeschnitten, keine Konsolenfehler |
| `tools/ui_faelle.py` | 19 Bilder der Schlüsselfälle (S2, S4, S3, N2 mit Lupe) und Belastung: 20 Meldungen und 7 Lagemeldungen auf einmal, längste Freitexte, mehrere Warnungen, Wirkungen mit Fehltreffern, Kontrollkarte gezoomt, Auflösung – alles in 1530 × 800 ohne Rollbalken |
| `tools/e2e_vier_fenster.py` | vier Fenster synchron, jede Aktion im Protokoll – Webseite und Offline-Datei |
| `tools/bedientest_probe.py` | alle 14 Aufgaben des Bedientests über sichtbare Beschriftungen lösbar |
| Druck `?druck=einweisung` | vier Karten auf vier Seiten A5 quer |
| **Bedientest mit zwei Unbeteiligten** | **offen** – Ablauf und Bogen: [`BEDIENTEST.md`](BEDIENTEST.md) |

## Offen für Schritt 7/8

* Bewegung entlang der Routen, Wirkung mit Effekt, Wrack, Krater, Rauch; E-01 automatisch;
  „entfällt bei G3“; im Drohnenbild bereits zerstörte Fahrzeuge mit Wrack überdecken (Manifest `objekte`).
* Auflösung im Plenum: Kennzahlen aus dem Protokoll, Replay je Schlüsselfall (S3, S2, S1, S4).
