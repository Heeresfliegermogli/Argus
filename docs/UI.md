# ARGUS – Ansichten (Schritt 6, ergänzt in 4b, 7 und 6b)

Fünf Ansichten in 1530 × 800 ohne Rollbalken: G1 Aufklärung, G2 Zielprüfung, G3 Führung,
Spielleitung und Plenum. Jede Rolle hat eine Einweisungskarte (im Spiel und als Druck, A5 quer).
Seit Schritt 7 bewegt sich die Lage (Routen, Tracking, Effekte; siehe [`ENGINE.md`](ENGINE.md)). Seit
Schritt 6b ist die **Karte die Arbeitsfläche für G1, G2 und G3** (Konzept v2, Abschnitt 6): Meldungen als
Marken am Ziel, kein Verlauf, der Eingang nur als Zahl, bei G1 das Drohnenbild live am Ort. Seit Schritt 8 die
**Auswertung** über alle Teams im Plenum und bei der Spielleitung (Teamvergleich, Kennzahlen, Konfidenz, Replay je
Schlüsselfall, Export) – siehe [`AUSWERTUNG.md`](AUSWERTUNG.md).

Seit Schritt 4b davor: **Startseite** (Code eingeben bzw. Sitzung anlegen), **Lobby** (Teams bilden),
**Übersicht der Spielleitung** über alle Teams mit Teamansicht und Zuschauen – siehe
[`SITZUNG.md`](SITZUNG.md). Die Ansichten selbst zeigen in der Kopfzeile das Team; bei Doppelrolle
schaltet ein Umschalter oben links zwischen den Rollen.

Adressen: `…/Argus/` (Startseite), `?sitzung=CODE` (Teilnehmer), `&rolle=sl|plenum`; ohne Lobby wie
bisher `…/Argus/?rolle=g1|g2|g3|sl|plenum&raum=…`. Druck der Einweisungskarten
`…/Argus/?druck=einweisung`. Die Spielleitung öffnet das Plenum mit „Plenum öffnen“.

## Die Ansichten G1, G2, G3 (seit 6b)

Alle drei haben dieselbe Ordnung: **links die Karte** (Arbeitsfläche, ca. 1050 × 730 px), **rechts das
Meldungsfeld** (440 px, G3 470 px). Die Nummern ①②③ stehen gleich auf der Einweisungskarte.

* **① Eingang als Zahl** oben im Meldungsfeld (Bernstein, solange etwas wartet; bei G2 dazu
  „+ n zurückgestellt“). Es gibt keine Liste und keinen Verlauf mehr.
* **Marken auf der Karte:** Jede Meldung, die bei der Rolle liegt, steht als Knopf mit ihrer Nummer am
  Zeichen des Ziels und fährt mit (Tracking). Klick öffnet sie. Die älteste neue öffnet sich von selbst;
  nach einer Entscheidung öffnet sich die nächste. Gewählt = Rollenfarbe, neu = kurzes Aufleuchten,
  zurückgestellt (G2, BEOBACHTEN) = gestrichelt mit „· zurückgestellt“ – die Marke bleibt stehen, bis G2
  wieder entscheidet. Bei G3 trägt eine Empfehlung mit Regelwarnung „· ⚠“. Freigegebene Wirkungen stehen bei
  G2 und G3 als „Einschlag 10:09:02“ am gestrichelten Kreis. Erledigte Meldungen bleiben als blasses Zeichen
  ohne Marke (Lagebild), bekämpfte durchgestrichen am Wrack.
* **Lagehinweise von G3** stehen bei G1 und G2 oben links auf der Karte (ohne Hinweis eine Zeile „noch keine“;
  der neueste ganz, ältere einzeilig, Klick zeigt sie ganz).

| Ansicht | Meldungsfeld rechts | entscheidet |
|---|---|---|
| **G1 Aufklärung** | ① Eingang · ARGUS-Daten (Meldung, Uhrzeit, Lage, Klasse, Konfidenz, Empfehlung, Hinweis) · ② Sensordaten mit „Meldung vor n s“ und Sicht · Kleingedrucktes dauerhaft. Auf der Karte: **Drohnenbild am Ort** (siehe unten) | ③ ANNEHMEN / ABLEHNEN (gleich gewichtet), Vermerk (1 Zeile) |
| **G2 Zielprüfung** | ① Eingang (+ zurückgestellt) · Zielmeldung kompakt (Ziel, Lage, Klasse, Konfidenz, ARGUS, Vermerk G1) · ② Wirkmittel mit Bestand, „Einschlag in n s (Uhrzeit)“, Warnungen je Wirkmittel und Abstände am **vorausberechneten Einschlagort**; Vorschau des Wirkradius auf der Karte dort (grün/rot, Zonen mit Verstoß hervorgehoben, Einsatzgrenze, Linie vom Ziel jetzt zum Einschlagort), auch beim Zeigen auf ein Wirkmittel, Banner „… bei Freigabe jetzt: Einschlag …“ | ③ BEKÄMPFEN mit … (erst nach Wirkmittelwahl) / BEOBACHTEN / NICHT BEKÄMPFEN, Begründung |
| **G3 Führung** | ① Eingang, Fast-Track (EIN/AUS, Knopf) · ② Zielmeldung kompakt, „G2 empfiehlt …“ mit Begründung, live „Freigabe jetzt: Einschlag … – keine Regelwarnung“ bzw. die Verstöße dort („G2 hat dazu gewarnt“); Warnungen von G2, die jetzt nicht mehr gelten, als „⚠ bei G2: …“ · Postfach „Lagemeldungen“ (neue aufgeklappt, „Gelesen“, Hinweis unten rechts bei neuer Meldung) · Lagehinweis an G1/G2 | FREIGABE / ABLEHNEN / ZURÜCK AN G2, Bemerkung |
| **Spielleitung** | Steuerung (Start/Anhalten, Tempo, Spielzeit, Fast-Track, Plenum, neues Spiel) · bedingte Injects (wartet / kommt um … / ausgelöst / entfällt) mit „jetzt“, E-01 (automatisch, Stand live), Reserve R-01–R-04, Verstärkung V-1–V-5 („einspielen“, gesperrt mit Grund) · Fenster im Raum · Notiz · **Kontrollkarte** (Ground Truth, ungemeldete Ziele, Personen, Wirkungen mit Fehltreffern, Zoom bis zu Sprites mit Schatten und Wracks) · Zeitplan mit „jetzt“, Protokoll mit Export | – |
| **Plenum** | schaltet selbst um: **Einweisung** (Lage für alle, die drei Rollen, Karte) vor dem Start → **Lage** (Uhr, Karte ohne Ziele, Stand) während des Spiels → **Auswertung über alle Teams** (Schritt 8, [`AUSWERTUNG.md`](AUSWERTUNG.md)), sobald alle Teams das Spielende erreicht haben; „◂ Spiel“ zeigt je Team die **Auflösung** (Kontrollkarte, Kennzahlen auf einen Blick, alle Wirkungen); von Hand umschaltbar | – |

Bei Spielende sperrt eine Tafel die Gruppenansichten („Ansicht ansehen“ blendet sie aus, Eingaben
bleiben gesperrt). Beim Zuschauen (Spielleitung, „nur lesen“) sind es dieselben Ansichten ohne Eingaben.

## Drohnenbild am Ort und Live-Drohnenbild (G1, seit 6b)

* **Fenster am Ort:** Die geöffnete Meldung zeigt ihr Drohnenbild in einem Fenster (416 × 260 px) neben dem
  Ziel, eine Linie führt zum Zeichen. Das Fenster sucht sich eine Ecke, in der es ganz auf der Karte liegt,
  das Ziel frei lässt und möglichst keine anderen Marken verdeckt; es bleibt stehen, solange das Ziel frei
  daneben liegt, und rückt weiter, wenn das Ziel darunter fährt oder Zoom/Ausschnitt sich ändern
  (`fensterLage` in `src/ansichten/gemeinsam/lagekarte.tsx`). Die Bilder der nächsten zwei Meldungen
  werden vorgeladen.
* **Klick = groß mit Lupe:** Vergrößerung über das ganze Fenster, die Lupe folgt der Maus (2,6-fach,
  Mausrad 1,6–6-fach) und zeichnet dieselbe Szene stärker vergrößert – die Sprites kommen dabei scharf aus
  dem Atlas. Schließen mit Esc oder Klick daneben.
* **Live:** `src/drohne/livebild.ts` setzt das Bild zur laufenden Spielzeit aus den Ebenen von Schritt 5b
  zusammen (Reihenfolge wie `tools/assets/live.py`): Boden → Krater → Fahrzeuge mit Schatten (Sprite nach
  Zustand: intakt, Wrack, Kette ab, Luk offen) → Feuer auf Wracks, Mündungsblitz → Figuren (Bezug und
  Versatz aus dem Manifest) → Kronen → Rauch der Wracks → Einschlag, LM im Flug, Leuchtspur, Nebel →
  Störung → Kamera → Rauschen und Zeilenversatz (M25), Bewegungsunschärfe (M26). Positionen aus denselben
  Bahnen wie die Karte (Welt des Teams mit Verstärkungen), Wracks an der Trefferstelle, Effekte wie auf der
  Karte der Rolle (`effekte(…, bekannteZiele(…, "g1"))`). Getroffene Personen und Besatzungen zerstörter
  Fahrzeuge verschwinden aus dem Bild (keine Darstellung getöteter Menschen). Die ARGUS-Markierung ist HTML
  über der Leinwand und folgt dem Fahrzeug. Kopf: „● LIVE 10:14:31“.
* **Aufnahme:** Die Kamera hält den Ausschnitt; viele Ziele fahren nach 15–40 s hinaus (11 von 27 Meldungen,
  z. B. M13, M20, M24). Ist kein gemeldetes Fahrzeug mehr im Bild, zeigt das Fenster das Bild zur Meldezeit
  (Standbild = das, was ARGUS ausgewertet hat) mit der Markierung wie im Manifest, Kopf „AUFNAHME 10:14:30“,
  Fuß „Ziel hat das Bild verlassen“; die Lupe arbeitet dann auf der Aufnahme. Fährt das Ziel wieder hinein,
  läuft das Bild wieder live.
* **Takt:** höchstens 30 Bilder/s, solange die Uhr läuft; bei stehender Uhr 12 Bilder/s, solange Feuer,
  Rauch, Mündungsblitz, Nebel oder Bildstörung laufen, sonst nur bei Änderungen; die Aufnahme wird nur bei
  Größen- oder Lupenänderung neu gezeichnet; höchstens `?fps=…`. Bildrate und Zeichenzeit stehen an der
  Leinwand (`data-fps`, `data-ms`, `argusLive`).
* Ohne Ebenen (oder solange sie laden) zeigt das Fenster das Standbild.

## Einweisungskarten (seit 6b für Teams à 3)

Jede Person hat eine Rolle; ihre Karte spricht sie mit „du“ an (auch der Auftrag im Szenario, `lage.G1` …):

* **Kopf:** Rolle und ein Satz („Du prüfst jede ARGUS-Meldung zuerst.“).
* **Euer Team:** die Kette G1 → G2 → G3 mit Teamname und -farbe und den Namen aus der Lobby, die eigene
  Rolle hervorgehoben („… (du)“), je Rolle was sie tut und was sie sieht (G1: Drohnenbild live,
  Sensordaten; G2: Zielmeldung, Wirkmittel, Warnungen; G3: Empfehlung, Lagemeldungen). Darunter: „Alle drei
  sehen die Karte mit den gemeldeten Zielen, sonst jede Person nur ihre eigene Ansicht. Ihr sitzt als Team
  zusammen und dürft miteinander sprechen.“ – keine Aufforderung, etwas weiterzugeben (keine Lösungshinweise).
* **Dein Auftrag** (Szenario) und **So bedienst du die Ansicht** in drei Schritten mit denselben Nummern wie
  in der Ansicht, dazu der wichtigste Satz.
* Im Spiel vor dem Start von selbst (je Rolle einmal), sonst über „Einweisung“ in der Kopfzeile. Im Druck
  (`?druck=einweisung`) je Rolle eine Karte A5 quer ohne Namen (für jedes Team einen Satz G1–G3), dazu die
  Karte der Spielleitung; das Plenum zeigt dieselben Rollensätze.

## Startseite, Lobby, Übersicht (Schritt 4b)

| Fenster | Inhalt |
|---|---|
| **Startseite** | links „Mitspielen“: ein großes Codefeld und **Beitreten** (falscher Code: „Die Sitzung … gibt es nicht“); rechts „Spielleitung“: Name, **Neue Sitzung anlegen**, bestehende Sitzung als Spielleitung oder Plenum öffnen, Synchronisation; darunter eingeklappt der Test ohne Lobby |
| **Lobby** | Kopf: Sitzungscode, in der Mitte der nächste Schritt; links Name, „Neues Team“ (Name, 🎲, drei Rollenknöpfe in Rollenfarbe) bzw. „Du bist im Team“, die drei Rollen in je einem Satz; rechts alle Teams als Karten (bis 8 ohne Rollen), je Rolle eine Zeile mit Name oder **beitreten** / **wechseln** / **+ dazu**, eigene Rolle **abgeben** |
| **Übersicht (SL)** | Kopf mit großem Code; Steuerleiste für alle Teams (seit Schritt 7 mit **Verstärkung ▾**: je Gruppe „an alle“ und je Team ein Knopf, gesperrt mit Grund; seit Schritt 8 **Auswertung ›**); Tabelle je Team (Spieler als Chips mit Menü, Spielzeit mit „+n V“ für eingespielte Verstärkungen, Eingang, S1–S4, Fehl, FT, da, ▶/❚❚, ansehen ›); Fuß mit Teilnehmern ohne Team |
| **Teamansicht (SL)** | Leiste statt Rollenband: ◂ Übersicht, Teamwahl, Steuerung · G1 · G2 · G3; G1–G3 nur lesen („Zuschauen – nur lesen“); seit Schritt 8 **✎ Notiz** (Beobachtung der SL 2 zu einem Fall, der laufende Fall ist vorgewählt) |
| **Plenum** | vor dem ersten Spiel Einweisung mit Code und Teams; danach ein Team (Wahl oben links) |

Gestaltung: Teamfarben (Rosa, Gelb, Grün, Cyan, Indigo, Magenta, Hellgrau, Braun) sind weder Rollen-
noch Signalfarbe und stehen nie ohne Namen. Folgenreiches (neues Spiel, Team löschen) fragt im Knopf
nach, nie mit einem Browser-Dialog (der hielte im Fenster der Spielleitung die Engine aller Teams an).

## Lagekarte

`src/karte/lagekarte.ts` (PixiJS 8, WebGL, Rückfall Canvas) zeichnet nur, was das Lagebild
(`src/kern/lagebild.ts`) liefert – die Informationsverteilung steht damit an einer Stelle und ist getestet:

* **G1, G2, G3:** Zielmeldungen mit dem Zeichen der ARGUS-Klasse (milsymbol, APP-6/MIL-STD-2525C), nie
  Ground Truth, keine Personen, keine ungemeldeten Ziele. Seit Schritt 7 **folgt das Zeichen dem Ziel**
  (erstes noch stehendes Fahrzeug der Meldung, Zahl = noch stehende Fahrzeuge); nach der Wirkung bleibt es
  durchgestrichen am Wrack, abgezogene Ziele verschwinden. Folgemeldungen zum selben Ziel ergeben ein
  Zeichen (z. B. „M18/M23“). Gewählt = gelb umrandet, erledigt = blass, bekämpft = Kreuz, freigegeben =
  roter gestrichelter Kreis am vorausberechneten Einschlagort mit Uhrzeit. Effekte nur zu Zielen, die die
  Rolle kennt (eigene Wirkungen, LM im Flug, Leuchtspur, Wracks), Feindartillerie und Nebel für alle.
* **Kontrollkarte (SL, Plenum-Auflösung):** alle Ziele nach Ground Truth, **in Bewegung** (Position je Bild,
  Sprite mit Fahrtrichtung, ab der Zerstörung Wrack, Z-24 ab 10:19:30 mit abgesprungener Kette), alle Effekte, Feind/verbündet/zivil/außer Gefecht, Attrappe mit Täuschungszeichen, Sanitätsfahrzeug mit
  Rotem Kreuz, ungemeldete Ziele violett umrandet, Personen (Zivil weiß, Soldaten rot, Besatzung mit
  weißem Tuch blau umrandet, getroffen = Kreuz), Wirkungen grau bzw. rot bei Fehltreffer.
* Raster, Planquadrate, Zonen, Gelände- und Wegenamen, eigene Kräfte als Pfeil am Westrand kommen aus
  `karte_kraehe.json` und dem Szenario. Hintergrund topografische Karte oder Luftbild (Knopf), ab 2 px/m
  Luftbild-Kacheln (nur Webseite). Zoom mit Mausrad, Doppelklick, Knöpfen; Zeigen öffnet einen Tooltip.
* Takt (seit Schritt 7): höchstens 30 Bilder/s, solange die Uhr läuft oder ein Einschlag, eine LM oder eine
  Leuchtspur unterwegs ist; bei stehender Uhr laufen Feuer, Rauch und Nebel mit ca. 12 Bildern/s weiter,
  sonst zeichnet die Karte nur bei Änderungen. Raster, Zonen und Namen werden nur bei Zoom/Verschieben neu
  gezeichnet. Bildrate und Zeichenzeit stehen an der Karte (`argusKarte.diagnose`).
* **Plenum während des Spiels:** Karte ohne Ziele, nur Feindartillerie und Nebel (nichts verrät ein Ziel).
* **Marken und Fenster (6b):** Die Karte hält den Marken der Ansicht den Platz frei (unsichtbare Beschriftung in
  der Größe des Knopfs, weicht wie jede Beschriftung aus) und meldet nach jedem Bild Rechteck und Zeichenpunkt
  (`onBild`); die Ansicht verschiebt die HTML-Knöpfe und das Fenster am Ort direkt, ohne neu zu zeichnen.
* Das Kartenmodul wird erst geladen, wenn eine Ansicht eine Karte zeigt (eigener Baustein).

## Gestaltungsregeln

* Bernstein gehört ARGUS (Markierung, Klasse, Konfidenz), Rot der Wirkung (BEKÄMPFEN, FREIGABE) und
  Regelverstößen. Jede Gruppe hat eine eigene Farbe (Kopfzeile, Einweisungskarte, Schrittnummern).
* ANNEHMEN und ABLEHNEN sind gleich gewichtet: Die Oberfläche legt keine Antwort nahe.
* Weniger ist mehr (6b): keine Listen und kein Verlauf bei G1–G3; was offen ist, steht auf der Karte, der
  Eingang als Zahl. Rollentexte in der Du-Form (eine Person je Rolle).
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

Texte der Einweisungskarten: Auftrag und Lage aus dem Szenario (`lage.G1` …, seit 6b in der Du-Form; nur Text,
Szenario-Version bleibt 2.0), Wirkmittel, Fast-Track-Schwelle und Spielzeit aus den Daten; Bedienung und
Teamleiste stehen im Code (`src/ansichten/einweisung.tsx`).

## Prüfung

| Prüfung | Ergebnis |
|---|---|
| `npm test` (Vitest) | 102 Tests (101 bestanden, Firebase-Nachbildung lokal übersprungen), neu `tests/oberflaeche.test.ts`: Fenster am Ort liegt überall ganz auf der Karte und verdeckt das Ziel nicht, weicht Marken aus; Marken je Meldung (zurückgestellt, ⚠, gewählt); Einweisung mit allen drei Rollen, Auftrag in der Du-Form |
| `tools/ui_bilder.py` | 19 Bilder eines kurzen Ablaufs bis S1 (Einweisungskarten, leere Ansichten, Drohnenbild am Ort, Vergrößerung, Warnung, Lagehinweis, Spielende): kein Rollbalken, nichts abgeschnitten, keine Konsolenfehler |
| `tools/ui_faelle.py` | 21 Bilder: Schlüsselfälle mit Lupe im Live-Bild (S2 Rotes Kreuz, S4 Kinder, S3, N2 weißes Tuch), viele Marken auf einmal (G1 bis 10, G2/G3 bis 11), 9 neue Lagemeldungen, längste Freitexte, mehrere Warnungen, Fehltreffer, Kontrollkarte gezoomt, Auflösung – alles in 1530 × 800 ohne Rollbalken |
| `tools/bedientest_probe.py` | alle 15 Aufgaben des Bedientests (Teil B, neue Bedienung) nur über sichtbare Beschriftungen gelöst: Marken, Zahl am Eingang, „Klick: groß mit Lupe“, „… · zurückgestellt“, „Einschlag hh:mm:ss“ am Kreis, „Lagehinweise von G3“ |
| `tools/drohne_probe.py` (neu) | 37 Prüfpunkte: alle 27 Meldungen setzen sich zur Meldezeit wie das Standbild zusammen (2,4–4,2 Graustufen Abweichung, M25 mit Rauschen 15; Fahrzeuge und Figuren ±1 px); LM auf Z-02 im Bild von M12 mit Flug, Einschlag, Wrack mit Feuer; S2 Rotes Kreuz (2 Sanitäter, 0 % verdeckt, 437 rote Bildpunkte in der Lupe), S4 zwei Kinder (0 % verdeckt), N2 weißes Tuch (0 % verdeckt, 1900 weiße Bildpunkte in der Lupe); M13 fährt aus dem Bild, danach „AUFNAHME 10:14:30“ mit drei ARGUS-Rahmen; **Bildrate** G1 allein (Rückfall Canvas, keine Grafikkarte): Fenster am Ort ×1 und ×10 je 30 Bilder/s bei höchstens 7,7 ms je Bild, Vergrößerung 30 Bilder/s bei höchstens 18–20 ms (Budget 33 ms), Karte daneben 10 (×1) bzw. 29 (×10) Bilder/s |
| `tools/livelage_probe.py` (WebGL und Rückfall Canvas), `e2e_vier_fenster.py` (lokal, Offline-Datei), `e2e_teams.py` (16 Fenster), `lobby_probe.py` (19 Aufgaben) | bestanden mit der neuen Oberfläche (Marken statt Listen); Karte im Rückfall Canvas wie in Schritt 7: Kontrollkarte allein ×10 30, ×1 10–30, gezoomt 15–30 Bilder/s, vier Kartenfenster 9–21 Bilder/s, Zeichenzeit höchstens ca. 11 ms |
| `tools/e2e_drehbuch.py` (18 Fenster, 5 Teams, Tempo ×5, G1 jetzt mit Karte und Live-Drohnenbild) | alle fünf Teams bis Spielende, Protokolle wie die Engine im Prozess, größte Zeitabweichung 1,0–2,8 s (Klickverzug bei ×5 und 18 Fenstern an einem Rechner ohne Grafikkarte), Klick → Protokoll Median 9–17 ms, höchstens 0,11 s, alle Fenster in 1530 × 800 |
| Druck `?druck=einweisung` | vier Karten auf vier Seiten A5 quer, jede passt auf ihre Seite (gemessen) |
| **Bedientest mit zwei Unbeteiligten** | **offen** – Ablauf und Bogen: [`BEDIENTEST.md`](BEDIENTEST.md) |

## Offen

* Bedientest mit Menschen (Teil A Lobby, Teil B Ansichten); dabei „AUFNAHME“ und die Kinder in M18 beobachten.
* Bildrate am Dienst-PC (WebGL 2) für Karte und Live-Drohnenbild bestätigen (`data-fps` an Karte und Leinwand).
* Schritt 8 ist umgesetzt (Auswertung, [`AUSWERTUNG.md`](AUSWERTUNG.md)); offen: Probe am Smartboard im Hörsaal (Lesbarkeit aus 4–8 m, Presenter).
