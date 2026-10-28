# ARGUS – Ansichten (Schritt 6, ergänzt in 4b, 7, 6b, B1–B12 und C1–C9)

Fünf Ansichten in 1530 × 800 ohne Rollbalken: Aufklärung, Zielprüfung, Führung, Spielleitung und Plenum.
Jede Rolle hat eine Einweisung (im Spiel als Folien, als Druck A5 quer).

**Änderungen B1–B12 (25.10.2026, nach dem Solo-Durchlauf):** Die Rollen heißen in der Oberfläche nur noch
**Aufklärung**, **Zielprüfung**, **Führung** (Abzeichen A, Z, F; intern bleiben `g1`, `g2`, `g3`, im Szenario
`lage.G1` …). Die Spieluhr läuft **00:00–25:00** (`uhrzeit()` zeigt mm:ss, Zeiten in Texten des Szenarios
werden beim Laden umgerechnet, vor dem Start negativ, z. B. „−08:00“). Ziele heißen **„Ziel 1, 2, 3 …“** in der
Reihenfolge, in der ARGUS sie meldet, Gruppen „Ziel 7 (3 Fz)“; Verstärkungen bekommen die Nummer der letzten
Meldung mit Buchstaben („8a“); die Spielleitung sieht die interne Kennung klein daneben (`src/kern/zielnummern.ts`).
Texte des Szenarios (Lage, Injects, Fälle, Leitfragen) schreibt `src/kern/anzeige.ts` beim Laden um (Rollen mit
Artikel, Uhrzeiten, M-Nummern) – Kennungen in Daten und Protokoll bleiben. Der **Vermerk** der Aufklärung entfällt.
Weitere Punkte stehen bei den Abschnitten unten (Startseite, Einweisung, Drohnenbild, Fahrwege, Test ohne Lobby).

**Änderungen C1–C9 (28.10.2026, nach dem 2. Solo-Durchlauf, Szenario 2.2):** Kein Fahrzeug taucht mehr mitten im Bild auf.
Jedes Fahrzeug fährt vom Kartenrand ein und steht bei Aufklärung, Zielprüfung und Führung ab dort als **Kontakt** auf der Karte
(gelbes Zeichen „unbekannt“ nach APP-6, ohne Nummer, Zeigen: „Kontakt – Bewegung erkannt, (noch) keine Meldung bei dir“), bis eine
Meldung, die bei der Rolle angekommen ist, es zum „Ziel n“ macht. Kontakte im Wald sind nicht zu sehen (die Drohne sieht nicht
durch die Kronen). **Neue Meldung (C4):** Ring blinkt am Ort, die Marke leuchtet 5 s, am Eingang steht 6 s „neu: Ziel n“, liegt das
Ziel außerhalb des Ausschnitts, zeigt ein Pfeil am Kartenrand dorthin (Klick fährt hin); Ton nur auf Wunsch (`?ton=1`, im Browser
gemerkt; im Hörsaal mit 15 Rechnern sonst zu laut). **Zugweise Meldungen (C7, C8):** Zeichen mit Größenangabe nach APP-6
(●● ab 2, ●●● ab 3 Fahrzeugen, aus `katalog_fahrzeuge.json` `groesse_nach_anzahl`) und „n Fz“; das Zeichen folgt den noch
stehenden Fahrzeugen; ein getroffenes bekommt am Einschlagort ein eigenes durchgestrichenes Zeichen; fährt ein Fahrzeug mehr
als 40 m vom Zug weg, hat es ein eigenes kleines Zeichen mit derselben Nummer. Legende neu: „Zug“ (Zeichen mit ●●●) und „Kontakt“.
Seit Schritt 7 bewegt sich die Lage (Routen, Tracking, Effekte; siehe [`ENGINE.md`](ENGINE.md)). Seit
Schritt 6b ist die **Karte die Arbeitsfläche für Aufklärung, Zielprüfung und Führung** (Konzept v2, Abschnitt 6): Meldungen als
Marken am Ziel, kein Verlauf, der Eingang nur als Zahl, bei der Aufklärung das Drohnenbild live am Ort. Seit Schritt 8 die
**Auswertung** über alle Teams im Plenum und bei der Spielleitung (Teamvergleich, Kennzahlen, Konfidenz, Replay je
Schlüsselfall, Export) – siehe [`AUSWERTUNG.md`](AUSWERTUNG.md).

Seit Schritt 4b davor: **Startseite** (zwei Knöpfe: „Ich spiele mit“ – Code eingeben; „Spielleitung“ – alles
andere), **Lobby** (Teams bilden),
**Übersicht der Spielleitung** über alle Teams mit Teamansicht und Zuschauen – siehe
[`SITZUNG.md`](SITZUNG.md). Die Ansichten selbst zeigen in der Kopfzeile das Team; bei Doppelrolle
schaltet ein Umschalter oben links zwischen den Rollen.

Adressen: `…/Argus/` (Startseite), `?sitzung=K7P` (Teilnehmer), `&rolle=sl|plenum`; ohne Lobby wie
bisher `…/Argus/?rolle=g1|g2|g3|sl|plenum&raum=…` (g1 Aufklärung, g2 Zielprüfung, g3 Führung; `rolle=sl` allein
bedient alle drei Rollen). Druck der Einweisungskarten
`…/Argus/?druck=einweisung`. Die Spielleitung öffnet das Plenum mit „Plenum öffnen“.

## Die Ansichten Aufklärung, Zielprüfung, Führung (seit 6b)

Alle drei haben dieselbe Ordnung: **links die Karte** (Arbeitsfläche, ca. 1050 × 730 px), **rechts das
Meldungsfeld** (440 px, Führung 470 px). Die Nummern ①②③ stehen gleich in der Einweisung.

* **① Eingang als Zahl** oben im Meldungsfeld (Bernstein, solange etwas wartet; bei der Zielprüfung dazu
  „+ n zurückgestellt“). Es gibt keine Liste und keinen Verlauf mehr.
* **Marken auf der Karte:** Jede Meldung, die bei der Rolle liegt, steht als Knopf „Ziel n“ am
  Zeichen des Ziels und fährt mit (Tracking). Klick öffnet sie. Die älteste neue öffnet sich von selbst;
  nach einer Entscheidung öffnet sich die nächste. Gewählt = Rollenfarbe, neu = kurzes Aufleuchten,
  zurückgestellt (Zielprüfung, BEOBACHTEN) = gestrichelt mit „Ziel n · zurückgestellt“ – die Marke bleibt stehen,
  bis die Zielprüfung wieder entscheidet. Bei der Führung trägt eine Empfehlung mit Regelwarnung „· ⚠“.
  Freigegebene Wirkungen stehen bei Zielprüfung und Führung als „Einschlag 09:02“ am gestrichelten Kreis. Erledigte Meldungen bleiben als blasses Zeichen
  ohne Marke (Lagebild), bekämpfte durchgestrichen am Wrack.
* **Lagehinweise der Führung** stehen bei Aufklärung und Zielprüfung oben links auf der Karte (ohne Hinweis eine Zeile „noch keine“;
  der neueste ganz, ältere einzeilig, Klick zeigt sie ganz).

| Ansicht | Meldungsfeld rechts | entscheidet |
|---|---|---|
| **Aufklärung** | ① Eingang · ARGUS-Daten (Ziel n, Spielzeit, Lage, Klasse, Konfidenz, Empfehlung, Hinweis) · ② Sensordaten mit „Meldung vor n s“ und Sicht · Kleingedrucktes dauerhaft. Auf der Karte: **Drohnenbild am Ort** (siehe unten) | ③ ANNEHMEN / ABLEHNEN (gleich gewichtet, ohne Vermerk) |
| **Zielprüfung** | ① Eingang (+ zurückgestellt) · Zielmeldung kompakt (Ziel, Lage, Klasse, Konfidenz, ARGUS) · ② Wirkmittel mit Bestand, „Einschlag in n s (Uhrzeit)“, Warnungen je Wirkmittel und Abstände am **vorausberechneten Einschlagort**; Vorschau des Wirkradius auf der Karte dort (grün/rot, Zonen mit Verstoß hervorgehoben, Einsatzgrenze, Linie vom Ziel jetzt zum Einschlagort), auch beim Zeigen auf ein Wirkmittel, Banner „… bei Freigabe jetzt: Einschlag …“ | ③ BEKÄMPFEN mit … (erst nach Wirkmittelwahl) / BEOBACHTEN / NICHT BEKÄMPFEN, Begründung |
| **Führung** | ① Eingang, Fast-Track (EIN/AUS, Knopf) · ② Zielmeldung kompakt, „Zielprüfung empfiehlt …“ mit Begründung, live „Freigabe jetzt: Einschlag … – keine Regelwarnung“ bzw. die Verstöße dort („Die Zielprüfung hat dazu gewarnt“); Warnungen, die jetzt nicht mehr gelten, als „⚠ bei der Zielprüfung: …“ · Postfach „Lagemeldungen“ (neue aufgeklappt, „Gelesen“, Hinweis unten rechts bei neuer Meldung) · Lagehinweis an Aufklärung und Zielprüfung | FREIGABE / ABLEHNEN / ZURÜCK an die Zielprüfung, Bemerkung |
| **Spielleitung** | Steuerung (Start/Anhalten, Tempo, Spielzeit, Fast-Track, Plenum, neues Spiel) · bedingte Injects (wartet / kommt um … / ausgelöst / entfällt) mit „jetzt“, E-01 (automatisch, Stand live), Reserve R-01–R-04, Verstärkung V-1–V-5 („einspielen“, gesperrt mit Grund; **Zeigen auf die Zeile oder Fokus auf „einspielen“ zeigt Fahrwege und Einheiten grau auf der Kontrollkarte**, B10) · Fenster im Raum · Notiz · **Kontrollkarte** (Ground Truth, ungemeldete Ziele, Personen, Wirkungen mit Fehltreffern, **Fahrwege der Einheiten** – Knopf „Fahrwege“, Zoom bis zu Sprites mit Schatten und Wracks) · Zeitplan mit „Ziel n“ und interner Kennung klein, „jetzt“, Protokoll („Ziel 7 (M07) …“, Rollennamen) mit Export | – |
| **Plenum** | schaltet selbst um: **Einweisung** (Lage für alle, die drei Rollen, Karte) vor dem Start → **Lage** (Uhr, Karte ohne Ziele, Stand) während des Spiels → **Auswertung über alle Teams** (Schritt 8, [`AUSWERTUNG.md`](AUSWERTUNG.md)), sobald alle Teams das Spielende erreicht haben; „◂ Spiel“ zeigt je Team die **Auflösung** (Kontrollkarte, Kennzahlen auf einen Blick, alle Wirkungen); von Hand umschaltbar | – |

Bei Spielende sperrt eine Tafel die Gruppenansichten („Ansicht ansehen“ blendet sie aus, Eingaben
bleiben gesperrt). Beim Zuschauen (Spielleitung in einer Sitzung, „nur lesen“) sind es dieselben Ansichten ohne
Eingaben, deutlich gekennzeichnet: Abzeichen „◉ Zuschauen – nur lesen“ in der Kopfzeile, blau gestrichelter Rahmen
um die Ansicht, ◉ an den Reitern. **Im Test ohne Lobby (B11)** bedient die Spielleitung alle drei Rollen selbst
(Reiter ohne ◉, kein Rahmen) – „Allein testen (ein Fenster)“ auf der Startseite.

## Drohnenbild am Ort und Live-Drohnenbild (Aufklärung, seit 6b)

* **Fenster am Ort:** Die geöffnete Meldung zeigt ihr Drohnenbild in einem Fenster (416 × 260 px) neben dem
  Ziel, eine Linie führt zum Zeichen. Das Fenster sucht sich eine Ecke, in der es ganz auf der Karte liegt,
  das Ziel frei lässt und möglichst keine anderen Marken verdeckt; es bleibt stehen, solange das Ziel frei
  daneben liegt, und rückt weiter, wenn das Ziel darunter fährt oder Zoom/Ausschnitt sich ändern
  (`fensterLage` in `src/ansichten/gemeinsam/lagekarte.tsx`). Die Bilder der nächsten zwei Meldungen
  werden vorgeladen.
* **Verschieben und schließen (B8):** An der Kopfleiste (oberste 30 px) lässt sich das Fenster ziehen; es bleibt
  dann dort (innerhalb der Karte), bis eine andere Meldung geöffnet wird. Ein Klick nach dem Ziehen öffnet keine
  Vergrößerung. ✕ oben rechts schließt es („Drohnenbild geschlossen – die Marke „Ziel n“ öffnet es wieder.“ im
  Meldungsfeld); Klick auf die Marke öffnet es wieder.
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
  über der Leinwand und folgt dem Fahrzeug. Kopf: „● LIVE 14:31“.
* **Die Drohne verfolgt das Ziel (B9):** Zur Meldezeit steht das Bild wie das Standbild; danach fährt der
  Ausschnitt mit dem ersten noch stehenden Fahrzeug der Meldung mit (es bleibt an seiner Stelle im Bild, der
  Boden zieht durch). Endet es (zerstört oder aus dem Raum), bleibt die Kamera 0,5 s darauf und schwenkt dann mit
  0,45 s Bildrauschen (Kopf „◌ AUSRICHTUNG …“) zum nächsten Fahrzeug, das dann zur Bildmitte hin steht; gibt es
  keines mehr, bleibt sie stehen. Die Zeiten gelten in Echtzeit (bei Tempo ×10 also 5 s Spielzeit). Außerhalb des
  Bodens der Meldung kommt der Grund aus dem eingefärbten Luftbild (0,5 m/px; im Web beim Hineinzoomen die Kacheln
  0,25 m/px), der Rand des Meldungsbodens ist weich überblendet. Die Kamera ist eine reine Funktion von Lage und
  Spielzeit (`LiveBild.kamera`) – das Replay „Drohnenbild, wie die Aufklärung es sah“ schwenkt deshalb genauso.
* **Aufnahme:** Ist trotzdem kein gemeldetes Fahrzeug im Bild (die Kamera steht, weil alle Fahrzeuge geendet
  haben), zeigt das Fenster das Bild zur Meldezeit mit der Markierung wie im Manifest, Kopf „AUFNAHME 14:30“. Seit
  B9 kommt das im Spiel praktisch nicht mehr vor (die Meldung entfällt dann).
* **Takt:** höchstens 30 Bilder/s, solange die Uhr läuft; bei stehender Uhr 12 Bilder/s, solange Feuer,
  Rauch, Mündungsblitz, Nebel oder Bildstörung laufen, sonst nur bei Änderungen; die Aufnahme wird nur bei
  Größen- oder Lupenänderung neu gezeichnet; höchstens `?fps=…`. Bildrate und Zeichenzeit stehen an der
  Leinwand (`data-fps`, `data-ms`, `argusLive`).
* Ohne Ebenen (oder solange sie laden) zeigt das Fenster das Standbild.

## Einweisung als Folien (B5) und Einweisungskarten

**Im Spiel** öffnet sich vor dem Start (je Rolle und Fenster einmal) eine kurze Anleitung als Folien,
`src/ansichten/einweisung.tsx`: Folie 1 „Euer Team“ (Kette Aufklärung → Zielprüfung → Führung mit Namen aus der
Lobby, der wichtigste Satz der Rolle), danach 2–4 Folien mit je einem Bild und zwei, drei Sätzen: Aufklärung
„Meldung auswählen“, „Drohnenbild ansehen“ (verfolgt das Ziel, Lupe, verschieben, ✕), „Daten prüfen“,
„Entscheiden“; Zielprüfung „Zielmeldung auswählen“, „Wirkmittel wählen“, „Empfehlen“; Führung „Empfehlung
auswählen“, „Entscheiden“, „Lagemeldungen und Lagehinweise“; Spielleitung Auftrag und drei Folien. Je Rolle 3–5
Folien. Bedienung: **weiter ›** / **‹ zurück**, Punkte, Pfeiltasten, Bild ↑/↓, Wischen (Touch), **Überspringen**
(jederzeit), Esc; auf der letzten Folie **Verstanden – zur Ansicht**. Später über **Einweisung** in der Kopfzeile
wieder aufrufbar. Die Bilder sind kleine Skizzen der Ansicht (Marke „Ziel 3“, Knöpfe gleich gewichtet) ohne
Hinweise auf Fallen.

**Druck** (`?druck=einweisung`, A5 quer): je Rolle eine Karte mit „Euer Team“, den Folien als Raster und dem
wichtigsten Satz.

Jede Person hat eine Rolle; die Einweisung spricht sie mit „du“ an (auch der Auftrag im Szenario, `lage.G1` …):

* **Kopf:** Rolle und ein Satz („Du prüfst jede ARGUS-Meldung zuerst.“).
* **Euer Team:** die Kette Aufklärung → Zielprüfung → Führung mit Teamname und -farbe und den Namen aus der
  Lobby, die eigene Rolle hervorgehoben („… du“), je Rolle was sie tut und was sie sieht (Aufklärung: Drohnenbild
  live, Sensordaten; Zielprüfung: Zielmeldung, Wirkmittel, Warnungen; Führung: Empfehlung, Lagemeldungen). Darunter: „Alle drei
  sehen die Karte mit den gemeldeten Zielen, sonst jede Person nur ihre eigene Ansicht. Ihr sitzt als Team
  zusammen und dürft miteinander sprechen.“ – keine Aufforderung, etwas weiterzugeben (keine Lösungshinweise).
* Der lange Auftrag aus dem Szenario steht seit B5 nicht mehr auf der Karte der Spieler (kürzer); die
  Spielleitung sieht ihren Auftrag auf der ersten Folie. Im Druck je Rolle eine Karte ohne Namen (für jedes Team
  einen Satz Aufklärung, Zielprüfung, Führung), dazu die Karte der Spielleitung; das Plenum zeigt dieselben
  Rollensätze.

## Startseite, Lobby, Übersicht (Schritt 4b)

| Fenster | Inhalt |
|---|---|
| **Startseite** (B1) | zuerst nur zwei große Knöpfe **Ich spiele mit** und **Spielleitung** (Anker `#mitspielen`, `#spielleitung`, Zurück funktioniert). „Ich spiele mit“: nur das Codefeld (drei Zeichen) und **Beitreten** („„K0“ ist kein Code. Ein Code hat 3 Zeichen, z. B. K7P.“ bzw. „Die Sitzung … gibt es nicht“). „Spielleitung“: zuletzt genutzte Sitzung **Fortsetzen als Spielleitung** / **Plenum**, **Neue Sitzung anlegen** (Name), bestehende Sitzung als Spielleitung oder Plenum öffnen, Synchronisation; eingeklappt „Test ohne Lobby“ (Raum, **Allein testen (ein Fenster)**, **Alle vier Fenster öffnen**, einzelne Rollen); unten Auswertung üben, Einweisungskarten drucken, Lasttest |
| **Lobby** | Kopf: Sitzungscode, in der Mitte der nächste Schritt; links Name, „Neues Team“ (Name, 🎲, drei Rollenknöpfe Aufklärung, Zielprüfung, Führung in Rollenfarbe) bzw. „Du bist im Team“, die drei Rollen in je einem Satz; rechts alle Teams als Karten (bis 8 ohne Rollen), je Rolle eine Zeile mit Name oder **beitreten** / **wechseln** / **+ dazu**, eigene Rolle **abgeben** |
| **Übersicht (SL)** | Kopf mit großem Code; Steuerleiste für alle Teams (seit Schritt 7 mit **Verstärkung ▾**: je Gruppe „an alle“ und je Team ein Knopf, gesperrt mit Grund; seit Schritt 8 **Auswertung ›**); Tabelle je Team (Spieler als Chips mit Menü, Spielzeit mit „+n V“ für eingespielte Verstärkungen, Eingang, S1–S4, Fehl, FT, da, ▶/❚❚, ansehen ›); Fuß mit Teilnehmern ohne Team |
| **Teamansicht (SL)** | Leiste statt Rollenband: ◂ Übersicht, Teamwahl, Steuerung · ◉ Aufklärung · ◉ Zielprüfung · ◉ Führung; die Rollen nur lesen („◉ Zuschauen – nur lesen“, blauer Rahmen), im Test ohne Lobby bedienbar; seit Schritt 8 **✎ Notiz** (Beobachtung der SL 2 zu einem Fall, der laufende Fall ist vorgewählt) |
| **Plenum** | vor dem ersten Spiel Einweisung mit Code und Teams; danach ein Team (Wahl oben links) |

Gestaltung: Teamfarben (Rosa, Gelb, Grün, Cyan, Indigo, Magenta, Hellgrau, Braun) sind weder Rollen-
noch Signalfarbe und stehen nie ohne Namen. Folgenreiches (neues Spiel, Team löschen) fragt im Knopf
nach, nie mit einem Browser-Dialog (der hielte im Fenster der Spielleitung die Engine aller Teams an).

## Lagekarte

`src/karte/lagekarte.ts` (PixiJS 8, WebGL, Rückfall Canvas) zeichnet nur, was das Lagebild
(`src/kern/lagebild.ts`) liefert – die Informationsverteilung steht damit an einer Stelle und ist getestet:

* **Aufklärung, Zielprüfung, Führung:** Zielmeldungen mit dem Zeichen der ARGUS-Klasse (milsymbol, APP-6/MIL-STD-2525C), nie
  Ground Truth, keine Personen. Seit Schritt 7 **folgt das Zeichen dem Ziel**
  (erstes noch stehendes Fahrzeug der Meldung, Zahl = noch stehende Fahrzeuge); nach der Wirkung bleibt es
  durchgestrichen am Wrack, abgezogene Ziele verschwinden. Seit C1–C9 (Szenario 2.2): Fahrzeuge ohne Meldung bei der Rolle
  als **Kontakt** (Zeichen „unbekannt“, keine Klasse, keine Nummer; nicht im Wald; ungemeldete Ziele wie Z-27/Z-28 bleiben
  unsichtbar); Zug-Zeichen mit Größenangabe (●●/●●●) und „n Fz“, Teilzeichen für Fahrzeuge > 40 m vom Zug, eigenes
  Wrackzeichen je getroffenem Fahrzeug (`src/kern/lagebild.ts`: `kontakt`, `teil`, `wrack`). Folgemeldungen zum selben Ziel ergeben ein
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
* Weniger ist mehr (6b): keine Listen und kein Verlauf bei den drei Rollen; was offen ist, steht auf der Karte, der
  Eingang als Zahl. Rollentexte in der Du-Form (eine Person je Rolle).
* Keine Lösungshinweise in der Oberfläche: Was die Schlüsselfälle auflöst, steht nur dort, wo das
  Drehbuch es vorsieht (Sensordaten und Kleingedrucktes bei der Aufklärung, I-04 im Postfach der Führung). Die
  Sensordaten tragen deshalb keinen Zusatz „fließen nicht in ARGUS ein“ – das steht im Kleingedruckten;
  der Platzhalter für Lagehinweise nennt kein Beispiel aus dem Szenario.
* Feste Felder schneiden nichts ab; nur Listen rollen innerhalb ihres Feldes, ohne sichtbaren Balken
  (unten ausgeblendet, solange mehr folgt). Lange Freitexte (Begründung) bei der Führung höchstens
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
| **C1–C9 (28.10.2026, Szenario 2.2)** `npm test`, `ui_bilder.py`, `ui_faelle.py`, `bedientest_probe.py`, `lobby_probe.py`, `drohne_probe.py`, `livelage_probe.py`, `auswertung_probe.py` | 140 Tests (neu `tests/szenario22.test.ts`, Kontakte, Teil- und Wrackzeichen in `tests/lagebild.test.ts`); 29 und 22 Bilder in 1530 × 800 ohne Rollbalken (gelbe Kontakte, Zug-Zeichen mit ●●●, eigene Wrackzeichen, Legende einzeilig); Bedientest 18/18 (Ziel 3 ist jetzt der Tigr aus M28, das Drohnenfenster wird zur Kartenmitte gezogen); Lobby 20/20; Live-Drohnenbild 43 Prüfpunkte (alle 30 Meldungen wie das Standbild, M25 mit starker Bildstörung, Rotes Kreuz, Kinder, weißes Tuch, Bildrate 28–30 Bilder/s); Live-Lage und Auswertung bestanden |
| **B1–B12 (25./26.10.2026)** `npm test` | 122 Tests, neu u. a. `tests/anzeige.test.ts` (Rollen mit Artikel, Spieluhr, Zielnummern mit Verstärkung „1a“, Protokolltexte), kurze Codes in `teams.test.ts` und den Firebase-Regeln |
| **B12** `tools/lobby_probe.py` | 20/20 nur über sichtbare Beschriftungen: erste Seite nur zwei Knöpfe, Mitspieler sehen nur das Codefeld, falsches Format und unbekannter Code, Code klein mit Leerzeichen, Rollen Aufklärung/Zielprüfung/Führung, Folien durchblättern, Einweisung wieder aufrufen, zuletzt genutzte Sitzung fortsetzen |
| **B12** `tools/bedientest_probe.py` | 18/18: Folien bzw. Überspringen, „Ziel 3“ über die Marke, Lupe, Drohnenbild an der Kopfleiste schieben, ✕ und über die Marke wieder öffnen, „Ziel 3 · zurückgestellt“, „Einschlag mm:ss“, Hinweis nur an die Zielprüfung, ZURÜCK an die Zielprüfung; „Allein testen (ein Fenster)“: Aufklärung bedienbar, Ziel kommt bei der Zielprüfung an |
| **B12** `tools/ui_bilder.py`, `ui_faelle.py` | 29 bzw. 22 Bilder in 1530 × 800 ohne Rollbalken, alle Folien jeder Rolle; S2 Rotes Kreuz, S4 Kinder, S3, N2 weißes Tuch mit Lupe |
| **B9** `tools/drohne_probe.py` | alle 27 Meldungen setzen sich zur Meldezeit wie das Standbild zusammen; M13: Kamera folgt Z-30 (Ausschnitt 219 m weiter, Z-30 bleibt auf ±0 px); M15: Z-33 zerstört → 0,25 s später noch LIVE auf Z-33, nach 0,72 s „◌ AUSRICHTUNG …“, nach 2 s LIVE auf Z-34 mit ARGUS-Rahmen; Rotes Kreuz 437 rote Bildpunkte in der Lupe, zwei Kinder, weißes Tuch 1900 weiße Bildpunkte; Bildrate Fenster am Ort und Vergrößerung je 30 Bilder/s (Canvas ohne Grafikkarte) |
| **B2, B3** `e2e_vier_fenster.py` (lokal, Offline-Datei), `e2e_teams.py` (16 Fenster) | bestanden mit Startseite „Ich spiele mit“/„Spielleitung“, Codes aus drei Zeichen, Rollennamen |
| **B12** `livelage_probe.py`, `auswertung_probe.py`, Lasttest-Seite (Nachbildung, 5 Teams, ×20) | bestanden; Auswertung in 1530 × 800 (Legende einzeilig, Leitfragen 15,5 px); Lasttest Klick → Protokoll Median 34–85 ms, alle Fenster gleich |
| **B12** `e2e_drehbuch.py` (18 Fenster, ×5) | alle fünf Teams bis Spielende, Protokolle wie die Engine im Prozess, keine Layout- und Konsolenfehler; Klickverzug der Modellpersonen 3–8 s – auf derselben (inzwischen langsameren) Maschine hat der Stand vor B (Schritt 8) 7–20 s, die Abweichung liegt also an der Testumgebung. Befund unterwegs: die Kamera (B9) kostete anfangs viel Rechenzeit in jedem Aufklärungs-Fenster (bis 31 s Verzug); behoben durch den Grund im Maßstab der Anzeige |
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

* Bedientest mit Menschen (Teil A Start und Lobby, Teil B Ansichten); dabei „◌ AUSRICHTUNG …“ (ab Ziel 18), die Kinder in Ziel 21 und die gelben Kontakte (seit Szenario 2.2) beobachten.
* Bildrate am Dienst-PC (WebGL 2) für Karte und Live-Drohnenbild bestätigen (`data-fps` an Karte und Leinwand).
* Schritt 8 ist umgesetzt (Auswertung, [`AUSWERTUNG.md`](AUSWERTUNG.md)); offen: Probe am Smartboard im Hörsaal (Lesbarkeit aus 4–8 m, Presenter).
