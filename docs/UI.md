# ARGUS – Ansichten (Schritt 6, ergänzt in 4b, 7, 6b, B1–B12, C1–C9, D1–D5, F, H, G und I)

**Seit Szenario 2.7 (Änderungen G und I, 10.11.2026):** Lagemeldungen stehen **30 s oder bis zum Klick** (kleines ✕) und sind dann
**ganz weg** – keine „frühere Meldungen“ mehr (`regeln.anzeige.lagemeldung_s`; gelesen nach x s steht im Protokoll, I4). Die
**rechte Spalte ist fest aufgeteilt** (I5): oben eine Zeile **„Wirkung unterwegs“** mit Chips „Ziel 17 ×3 0:23“ (höchstens drei,
Rest hinter „+n“ als Überlagerung), darunter der **Eingang mit fester Höhe** und eigener Rollleiste, darunter die geöffnete Meldung
an fester Stelle – die Knöpfe bewegen sich nie. **Kein Ziel verschwindet ohne Erklärung** (I1): Fällt eine Meldung aus dem
Eingang oder verlässt ein gemeldetes Ziel den Raum, steht eine Minute ein **Vermerk** im Eingang („Ziel 15 · über die Brücke
ELSTER durchgebrochen“, „Ziel 30 · verbündet – nicht bekämpfen“), dazu ein Hinweis; das Zeichen bleibt am Kartenrand stehen
(„Ziel 15 durchgebrochen“). Die **Karte füllt ihr Feld** (G4b) in Zielbearbeitung und Plenum: Ohne Zoom des Benutzers wird so
weit vergrößert, dass kein grauer Rand bleibt; „ganze Karte“ (⤢) zeigt wieder alles. Zielbearbeitung: rund 690 m von den eigenen
Panzern am Westrand über Bach und Brücke bis in die Ortschaft (mehr Breite geht bei vollem Feld nicht; Meldungen außerhalb zeigt
der Pfeil am Rand). Plenum: volle Breite, oben und unten je ca. 60 m weniger. Die **Kontrollkarte** der Spielleitung zeigt geprüft
weiter die ganze Karte (Ground Truth vom Ostrand mit den Einfahrten und dem Mörser im Wald MARDER bis zu den eigenen Panzern). Die Auswertung ist neu gegliedert (15 min, siehe
[`AUSWERTUNG.md`](AUSWERTUNG.md)).

**Seit Szenario 2.6 (Änderungen H, 09.11.2026):** drei Ansichten in 1530 × 800 ohne Rollbalken – **Zielbearbeitung** (eine Rolle je
Team, 2–3 Personen an einem Laptop; intern `zb`), **Spielleitung** und **Plenum**. Die Rollen Aufklärung, Zielprüfung und Führung
(`g1`–`g3`) sind entfallen; die Abschnitte unten zu ihnen beschreiben den Stand bis 2.5 und sind als solche markiert. Die Einweisung
des Teams ist eine **Übersicht auf der echten Oberfläche** mit Pfeilen, danach vier Folien.

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
**Änderungen D1–D5 (01.11.2026, Szenario 2.3, „mehr Druck“):** Die **2. Kompanie steht sichtbar am Westrand**: drei Züge
(1. Zug Brücke West, 2. Zug Furt Nord West, 3. Zug Süd) als blaue Zeichen nach APP-6 (eigen, Panzergrenadiere, ●●●) mit „1. Zug 87 %“
darunter, beim Hineinzoomen die Schützenpanzer in Stellung (Sprite mit Erdwall), dahinter der Gefechtsstand – bei allen Rollen, auf
der Kontrollkarte und im Plenum (D1.3). Die eigene Panzerabwehr schießt aus diesen Stellungen (D1.2). Feindliches Feuer schlägt an der
Stellung ein (Einschlag, Rauch), das Zeichen des getroffenen Zuges **flackert** kurz (D3.3); die Beschriftung färbt sich ab den Schwellen.
**Kopfzeile aller Rollen:** „2. Kp 87 % · 4 Verwundete“ (blau, Bernstein unter 75 %, Rot unter 55 %; Zeigen: Stand je Zug) – Lage,
keine Punkte. **Führung:** Die Kompanie meldet ihre Verluste ins Postfach (Lagemeldungen K-01 …, „2. Kp: 3. Zug unter Mörserfeuer aus
Hof RABE, 2 neue Verwundete. Mörser bekämpfen!“), ab Stufe 2 („DRINGEND …“) und an der Untergrenze rot umrandet; I-07, I-06 und
I-13 nennen den Stand dieses Teams. Alle Lagemeldungen höchstens 140 Zeichen (D4.1). **Empfehlungskarte der Führung kompakt** (D4.3):
zwei Zeilen „Ziel n · Klasse · Konfidenz · ARGUS-Empfehlung“ und „Zielprüfung BEKÄMPFEN mit …“, die Begründung höchstens zwei Zeilen
(ganzer Text beim Zeigen), darunter „Freigabe jetzt: Einschlag …“ mit den Warnungen. **Auswertung:** Kapitel „Preis des Abwartens“
(siehe [`AUSWERTUNG.md`](AUSWERTUNG.md)).
**Änderungen F (02.11.2026, Szenario 2.5, „Panzerzug“):** Statt der Kompanie mit drei Zügen steht die **1./PzBtl 613** (fiktiv; seit
dem Folgeauftrag F5, Absender „1. Kp“) mit **vier Kampfpanzern Leopard 2A7V** einzeln ganz am Westrand: 1/2 am Waldrand FUCHS, 1/1 (Zugführer) an der
Hauptstraße, 1/3 und 1/4 südlich davon – bei allen Rollen, auf der Kontrollkarte und jetzt auch im Plenum (Lage und Einweisungskarte).
Zeichen Kampfpanzer blau (`SFGPEVAT`) mit Kennung und Zustandsbalken (blau einsatzbereit, gelb eingeschränkt), ausgefallen grau mit
Schrägstrich (`SFGDEVAT`); gezoomt der Sprite intakt, eingeschränkt oder ausgefallen. Feindfeuer ist sichtbar: Fehlschüsse als
Einschlag mit Staub neben dem Panzer, Treffer als Funken und Rauchwölkchen am Panzer, das Zeichen **blinkt** kurz; ausgefallen raucht.
Zeigen auf einen Panzer: Kennung, Stufe, Zustand, Treffer, Verwundete. **Kopfzeile aller Rollen:** „1. Kp: 3/4 einsatzbereit ·
4 Verwundete“ mit einem kleinen Balken je Panzer (einsatzbereit = nicht ausgefallen; Rahmen gelb, sobald einer eingeschränkt, rot,
sobald einer ausgefallen ist). **Führung:** Druckmeldungen je Panzer von der „1. Kp“ („1/3 unter Panzerfeuer von der Brücke Ost,
Treffer an der Kette. Panzer bekämpfen!“), I-07 nennt 1/4, I-06 den Stand der Kp, I-13 den getroffenen Panzer. Wirkmittel
„1. Kp (Kanone 120 mm)“ (kurz „Kanone“) statt „Panzerabwehr 2. Kp“; die Leuchtspur kommt vom schießenden Panzer. Die Zone heißt
„Schule“. Die Spielleitung sieht im Zeitplan nach dem Auslösen den gefüllten Text der Lagemeldung. Auswertung: „Preis des Abwartens“
mit dem Zustand der vier Panzer je Team.
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

## Die Ansicht Zielbearbeitung (seit 2.6, H2)

Eine Ansicht für das ganze Team, eine Entscheidung je Meldung. Aufbau (`src/ansichten/zb.tsx`, `src/stil/basis.css`):

| Bereich | Inhalt |
|---|---|
| **Kopfzeile** | Rollenband „ARGUS Zielbearbeitung“, Teamname; Uhr (mm:ss) und Phase („Phase 5: Krise“ – der Gegenangriff steht nirgends vorher, H3.2); **die vier Panzer** 1/1–1/4 als Kacheln mit Zustand (blinkt rot bei Treffer, ausgefallen durchgestrichen), Verwundete; **Bestand groß** („Mrs 12 · LM 20 · Kanone“, gelb bei wenig, rot bei leer, H5.6); Verbindung („verbunden · n offen“, „offline – Spiel läuft“), **⇩ Protokoll**, **? Einweisung** |
| **links: Lagemeldungen** (schmal) | Brigade, Nachbarn, 1. Kp, die neueste oben. Seit 2.7 (I4) steht eine Meldung **30 s oder bis zum Klick** (kleines ✕, ein Balken zeigt die Restzeit) und ist dann **ganz weg** – keine Liste „frühere Meldungen“. Unter Druck läuft der Feed unter, S3 lebt davon (H5.5). Ob und nach wie vielen Sekunden eine Meldung angeklickt wurde, steht im Protokoll (`inject_quittiert`); Spielleitung und Auswertung sehen alle |
| **Mitte: Lagekarte** | Marken der Meldungen im Eingang (Klick öffnet), gelbe Kontakte, bekämpfte Ziele mit **Countdown „Einschlag in 0:23“** am Ziel (H5.3), Vorschau des gewählten Wirkmittels am vorausberechneten Einschlagort mit Banner („Mrs: Einschlag in 0:35 – R2, R3 verletzt“), die vier Panzer mit Feindfeuer (Mündungsblitz am Schützen, Leuchtspur, Einschlag oder Treffer am Panzer, H5.7). Legende: Meldung (ARGUS), Kontakt, bekämpft – Einschlag folgt, bekämpft, No-Strike-Zone, Einschränkungsgebiet (H5.4) |
| **rechts oben: Wirkung unterwegs** (seit 2.7, I5) | eine Zeile fester Höhe: je bekämpftem Ziel mit ausstehendem Einschlag ein Chip „Ziel 17 ×3 0:23“ (der nächste Einschlag zuerst), höchstens drei; passen nicht alle, „+n“ – Klick zeigt alle als Überlagerung, nichts verschiebt sich |
| **rechts: Eingang** (feste Höhe, eigene Rollleiste) | je Meldung eine Zeile: „Ziel n“, ARGUS-Klasse und Konfidenz, Empfehlung, **Wartezeit m:ss** (ab 30 s hervorgehoben); zurückgestellte darunter mit ◷. Seit 2.7 (I1, I3) darunter eine Minute lang **Vermerke**: „durchgebrochen“, „abgezogen“, „verbündet – nicht bekämpfen“, „entfallen“. Die älteste neue Meldung öffnet sich von selbst, ein Klick öffnet eine andere |
| **rechts unten: geöffnete Meldung** (feste Stelle) | „Ziel n · im Eingang seit m:ss“, kleines **„i“** (Angaben des Herstellers, H6/E6.4); **Live-Drohnenbild** (Klick: groß mit Lupe); ARGUS-Ausgabe „Panzer · Feind 91 %“ mit Empfehlung und Bildalter (`argusBei`, `bildalter`, H6/E6.1); **Wirkmittel** je Zeile mit Bestand, „Einschlag in m:ss“, „✓ keine Warnung“ oder ⚠ R2/R3/EB, „nur k von n Fahrzeugen“; die drei Knöpfe **BEKÄMPFEN mit LM ×3** („Bestand 8 → 5“, „⚠ trotz Warnung“, H6/E3.2) · **ZURÜCKSTELLEN** (beobachten) · **ABLEHNEN** |

* Jede Entscheidung trägt die Sekunden ab Eingang und ab Öffnen ins Protokoll (`sek_eingang`, `sek_offen`, H2.4) – für die Frage
  der Auswertung „Wie lange habt ihr hingeschaut?“.
* Ein **Treffer an einem eigenen Panzer** lässt die Kachel rot blinken und zeigt einen kurzen roten Rand am Bildschirm; der erste
  Beschuss jedes Panzers kommt als Lagemeldung der 1. Kp (H5.7). Keine Personen.
* Der Team-Laptop rechnet das Spiel: Ein Klick ist im selben Bild in Karte, Drohnenbild und Eingang (H5.1).
* Ein zweites Fenster des Teams und die Spielleitung („◉ Zielbearbeitung“) sehen dieselbe Ansicht nur lesend (Abzeichen „◉ Zuschauen“,
  Knöpfe gesperrt).
* Im Test ohne Lobby steuert das Team die Uhr oben rechts selbst (▶ Start, ×1/×5/×20).
* Bei Spielende sperrt eine Tafel die Ansicht („Bitte zum Plenum“); ist das Protokoll noch nicht ganz im Netz, bietet sie
  **Protokoll speichern** an.

## Bis 2.5: die Ansichten Aufklärung, Zielprüfung, Führung (6b – 2.5, abgelöst)

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

## Drohnenbild am Ort (bis 2.5) und Live-Drohnenbild (seit 6b)

* **Seit 2.6** steht das Live-Drohnenbild an der geöffneten Meldung rechts (bis 520 × 325 px, 16 : 10); Klick = groß mit Lupe wie
  unten. Fenster am Ort, Verschieben und ✕ gab es bis 2.5 bei der Aufklärung:
* **Fenster am Ort (bis 2.5):** Die geöffnete Meldung zeigt ihr Drohnenbild in einem Fenster (416 × 260 px) neben dem
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

## Einweisung (seit 2.6, H4) und Einweisungskarten

**Im Spiel** öffnet sich am Team-Laptop vor dem Start (je Lauf und Fenster einmal, bei spätem Beitritt auch im laufenden Spiel)
die Einweisung, `src/ansichten/einweisung.tsx`, jederzeit wieder über **? Einweisung** oben rechts:

1. **Übersicht auf der echten Oberfläche** (H4.1): Lichtfleck und Pfeil auf das Element, Sprechblase daneben, sieben Schritte –
   „Hier kommen die Meldungen rein“ (Eingang), „Hier entscheidet ihr“ (geöffnete Meldung), „Die Lagekarte“, „Hier eure vier Panzer“,
   „Hier Lagemeldungen“, „Hier Wirkmittel und Bestand“, „Spieluhr“. Weiter mit **weiter ›**, Pfeiltasten, Klick in den dunklen
   Bereich; **Übersicht überspringen** jederzeit; am Ende **weiter zur Einweisung ›**.
2. **Vier Folien** (H4.2): „Die Phasen“ (Aufklärung, Gefechtsaufklärung, Bergung, Hauptangriff, Krise – je ein Satz, ohne
   Gegenangriff), „Was ARGUS meldet“ (je Klasse ein helles, scharfes Bildbeispiel als Ausschnitt mit Lupe – Panzer, Fahrzeug,
   Infanterie; keine Lösungshinweise, H4.4), „Die Wirkmittel“ (je Wirkmittel eine kurze Animation), „Los geht’s“. Bedienung:
   **weiter ›** / **‹ zurück**, Punkte, Pfeiltasten, Wischen, **Überspringen**, **Übersicht noch einmal**, Esc; auf der letzten
   Folie **Verstanden – zur Ansicht**.

Nicht mehr in der Einweisung (H4.3): das Kleingedruckte des Herstellers (steht im Befehl, im Spiel hinter „i“, in der Auswertung),
der Block „Regelungen“ (die Regeln stehen im Befehl, das System warnt), die Kette der drei Rollen.

**Spielleitung:** Auftrag und Folien zum Ablauf (Lage vorlesen, **Spiel öffnen – alle Teams**, **▶ Start für alle**).

**Druck** (`?druck=einweisung`, A5 quer): eine Karte für das Team (Skizze der Ansicht mit nummerierten Bereichen, die Folien als
Raster) und die Karte der Spielleitung.

## Startseite, Lobby, Übersicht (Schritt 4b)

| Fenster | Inhalt |
|---|---|
| **Startseite** (B1) | zuerst nur zwei große Knöpfe **Ich spiele mit** und **Spielleitung** (Anker `#mitspielen`, `#spielleitung`, Zurück funktioniert). „Ich spiele mit“: nur das Codefeld (drei Zeichen) und **Beitreten** („„K0“ ist kein Code. Ein Code hat 3 Zeichen, z. B. K7P.“ bzw. „Die Sitzung … gibt es nicht“). „Spielleitung“: zuletzt genutzte Sitzung **Fortsetzen als Spielleitung** / **Plenum**, **Neue Sitzung anlegen** (Name), bestehende Sitzung als Spielleitung oder Plenum öffnen, Synchronisation; eingeklappt „Test ohne Lobby“ (Raum, **Allein testen (ein Fenster)**, **Alle vier Fenster öffnen**, einzelne Rollen); unten Auswertung üben, Einweisungskarten drucken, Lasttest |
| **Lobby** (seit 2.6) | Kopf: Sitzungscode, in der Mitte der nächste Schritt; links „Eure Namen“, „Neues Team“ (Name, 🎲, **Team anlegen** – „dieser Laptop spielt für das Team“) bzw. „Ihr seid im Team“ (rechnet / schaut zu, **Team verlassen**), „So spielt ihr“; rechts alle Teams als Karten mit den Fenstern (★ = Team-Laptop) und **beitreten** (Team ohne Laptop) bzw. **zuschauen** |
| **Übersicht (SL)** | Kopf mit großem Code; Steuerleiste für alle Teams (Spiel öffnen, **▶ Start für alle**, Anhalten, Tempo, Spielzeit, Reserve, Plenum, **Auswertung ›**, **Protokoll laden**; das Menü „Verstärkung“ ist seit 2.6 ausgeblendet); Tabelle je Team **aus den Statusmeldungen** (Laptop als Chip mit Menü, Spielzeit, Eingang, Schlüsselfälle S1–S8, Fehl, Panzer, Protokoll im Netz und Alter der Statusmeldung, ▶/❚❚, ansehen ›) |
| **Teamansicht (SL)** | Leiste statt Rollenband: ◂ Übersicht, Teamwahl, **Steuerung** · **◉ Zielbearbeitung** (nur lesen, mit Verzug); **✎ Notiz** (Beobachtung der SL 2 zu einem Fall, der laufende Fall ist vorgewählt) |
| **Plenum** | vor dem ersten Spiel Einweisung mit Code und Teams; danach ein Team (Wahl oben links) |

Gestaltung: Teamfarben (Rosa, Gelb, Grün, Cyan, Indigo, Magenta, Hellgrau, Braun) sind weder Rollen-
noch Signalfarbe und stehen nie ohne Namen. Folgenreiches (neues Spiel, Team löschen) fragt im Knopf
nach, nie mit einem Browser-Dialog (der hielte im Fenster der Spielleitung die Engine aller Teams an).

## Lagekarte

`src/karte/lagekarte.ts` (PixiJS 8, WebGL, Rückfall Canvas) zeichnet nur, was das Lagebild
(`src/kern/lagebild.ts`) liefert – die Informationsverteilung steht damit an einer Stelle und ist getestet:

* **Zielbearbeitung (bis 2.5 Aufklärung, Zielprüfung, Führung):** Zielmeldungen mit dem Zeichen der ARGUS-Klasse (milsymbol, APP-6/MIL-STD-2525C), nie
  Ground Truth, keine Personen. Seit Schritt 7 **folgt das Zeichen dem Ziel**
  (erstes noch stehendes Fahrzeug der Meldung, Zahl = noch stehende Fahrzeuge); nach der Wirkung bleibt es
  durchgestrichen am Wrack, abgezogene Ziele verschwinden. Seit C1–C9 (Szenario 2.2): Fahrzeuge ohne Meldung bei der Rolle
  als **Kontakt** (Zeichen „unbekannt“, keine Klasse, keine Nummer; nicht im Wald; ungemeldete Ziele wie Z-27/Z-28 bleiben
  unsichtbar); Zug-Zeichen mit Größenangabe (●●/●●●) und „n Fz“, Teilzeichen für Fahrzeuge > 40 m vom Zug, eigenes
  Wrackzeichen je getroffenem Fahrzeug (`src/kern/lagebild.ts`: `kontakt`, `teil`, `wrack`). Folgemeldungen zum selben Ziel ergeben ein
  Zeichen (z. B. „M18/M23“). Gewählt = gelb umrandet, erledigt = blass, bekämpft = Kreuz, freigegeben =
  roter gestrichelter Kreis am vorausberechneten Einschlagort, seit 2.6 mit Countdown „Einschlag in m:ss“. Die LM fliegt auf den
  vorausberechneten Einschlagort und führt im Endanflug auf das Fahrzeug nach – der Einschlag liegt sichtbar am Fahrzeug, auch im
  Replay (H5.2). Effekte nur zu Zielen, die das Team kennt (eigene Wirkungen, LM im Flug, Leuchtspur, Wracks), Feindartillerie, Nebel
  und das Feuer auf die eigenen Panzer für alle.
* **Kontrollkarte (SL, Plenum-Auflösung):** alle Ziele nach Ground Truth, **in Bewegung** (Position je Bild,
  Sprite mit Fahrtrichtung, ab der Zerstörung Wrack, Z-24 ab 10:19:30 mit abgesprungener Kette), alle Effekte, Feind/verbündet/zivil/außer Gefecht, Attrappe mit Täuschungszeichen, Sanitätsfahrzeug mit
  Rotem Kreuz, ungemeldete Ziele violett umrandet, Personen (Zivil weiß, Soldaten rot, Besatzung mit
  weißem Tuch blau umrandet, getroffen = Kreuz), Wirkungen grau bzw. rot bei Fehltreffer.
* **Eigene Panzer (seit 2.5, F1; 2.3/2.4 eigene Züge):** bei der Zielbearbeitung, auf der Kontrollkarte und im Plenum – je Panzer das Zeichen
  `SFGPEVAT-------` (Kampfpanzer, eigen; ausgefallen `SFGDEVAT-------` grau mit Schrägstrich) mit Kennung 1/1–1/4 und Zustandsbalken,
  ab 2,6 px/m der Sprite `kpz_leo2a7v` (intakt, `_eingeschraenkt`, `_ausgefallen`) mit Erdwall zum Feind; Treffer lassen das Zeichen
  blinken; Zustand aus `src/kern/verluste.ts` (`eigeneLage` im Lagebild). Die Karte meldet an `argusKarte.diagnose.eigene` Zeichen,
  Sprites, blinkende Panzer, Beschriftungen und Stufen (für die Proben).
* Raster, Planquadrate, Zonen, Gelände- und Wegenamen, eigene Kräfte (bis 2.2 als Pfeil am Westrand) kommen aus
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
* ZURÜCKSTELLEN und ABLEHNEN stehen gleich groß neben BEKÄMPFEN: Die Oberfläche legt keine Antwort nahe (seit 2.6; bis 2.5
  ANNEHMEN/ABLEHNEN der Aufklärung).
* Weniger ist mehr: ein Eingang mit Wartezeit statt Verlauf; was offen ist, steht im Eingang und auf der Karte. Texte für das
  Team in der Ihr-Form (2–3 Personen an einem Laptop).
* Keine Lösungshinweise in der Oberfläche: Was die Schlüsselfälle auflöst, steht nur dort, wo das
  Drehbuch es vorsieht (Merkmale im Drohnenbild, Kleingedrucktes hinter „i“, die Lagemeldungen im Feed – S3 nur dort).
* Feste Felder schneiden nichts ab; nur Listen rollen innerhalb ihres Feldes, ohne sichtbaren Balken
  (unten ausgeblendet, solange mehr folgt). Ältere Lagemeldungen einzeilig, ganzer Text beim Klick.
* Schrift Barlow Semi Condensed und IBM Plex Mono (eingebettet, auch in der Offline-Datei).

## Datengetrieben

Neu in den Daten (nur Darstellung, keine Spielregel; `claude/daten/` und `public/daten/` gleich):

* **Fahrzeugkatalog 1.2:** `symbol.sidc` (Funktionsteil des taktischen Zeichens, z. B. `EVAT` Kampfpanzer)
  und `symbol.groesse` (z. B. `E` Kompanie). Zugehörigkeit und Status setzt die Oberfläche aus
  ARGUS-Klasse bzw. Ground Truth. Fehlt `sidc`, warnt die Szenario-Prüfung und die Karte zeigt ein
  allgemeines Fahrzeugzeichen.
* **Zone `beschriftung`:** Lage der Zonenbeschriftung auf der Karte (sonst berechnet). Szenario bleibt 1.3.

Texte der Einweisung: Phasen, Wirkmittel, Klassenbeispiele und Spielzeit aus den Daten; Übersicht und Bedienung stehen im Code
(`src/ansichten/einweisung.tsx`). Fast-Track gibt es seit 2.6 nicht mehr.

## Prüfung

| Prüfung | Ergebnis |
|---|---|
| **G+I (10.11.2026, Szenario 2.7)** `npm test`, `ui_bilder.py`, `ui_faelle.py` (neu: I4 Feed, I5 acht Wirkungen und zehn Meldungen), `bedientest_probe.py`, `livelage_probe.py` (neu: A8 PT-91 und Auflösung, A9 Ziel 15 durchgebrochen), `auswertung_probe.py` (15-min-Plan), `verluste_probe.py`, `e2e_drehbuch.py` | siehe `claude/Zwischenstand_GI.md` |
| **H (09.11.2026, Szenario 2.6)** `npm test`, `ui_bilder.py`, `ui_faelle.py`, `bedientest_probe.py`, `lobby_probe.py`, `verluste_probe.py`, `drohne_probe.py`, `livelage_probe.py`, `auswertung_probe.py`, `e2e_teams.py`, `e2e_drehbuch.py` (alle auf eine Rolle umgestellt) | siehe `claude/Zwischenstand_H.md`: alle Ansichten in 1530 × 800 ohne Rollbalken (Übersicht mit Pfeilen, Folien, Eingang voll, Lupe je Schlüsselfall, Countdown, frühere Lagemeldungen, Teamvergleich mit 7 Teams); Bedientest 13/13, Lobby 20/20; Beschuss der Panzer sichtbar (Mündungsblitz, Leuchtspur, Blinken, roter Rand) |
| **F (02.11.2026, Szenario 2.5)** `npm test`, `verluste_probe.py` (für F neu geschrieben), `ui_bilder.py`, `ui_faelle.py`, `bedientest_probe.py`, `auswertung_probe.py`, `e2e_drehbuch.py` | 176 Tests (neu `tests/szenario25.test.ts`); vier Panzer mit Kennung und Zustandsbalken bei allen Rollen, auf der Kontrollkarte und im Plenum, gezoomt als Sprites (intakt, eingeschränkt, ausgefallen), Kopfzeile „1. Zug: b/4 einsatzbereit · n Verwundete“ (seit F5 „1. Kp: …“) mit Balken je Panzer in allen Fenstern gleich, Druckmeldungen je Panzer ≤ 140 Zeichen, I-07 nennt 1/4, Zeichen blinkt bei Treffer, Untergrenze hält, Preis des Abwartens je Panzer; Bedientest 18/18 (F-2: seit E3 zwei Einschlagsmarken für Ziel 1); Plenum-Einweisung nach Kürzen der Lage ohne Rollbalken; `e2e_drehbuch.py` mit zwei Teams: Protokolle und Druckmeldungen wie im Prozess (siehe ENGINE.md). **Offen, seit E-a (Aufgabe von E-b):** Teamvergleich der Auswertung mit zwölf Spalten 2244 px breit (`plenum_aufloesung`, `plenum_auswertung_teamvergleich`), Sensordaten noch in Einweisung und Replay (E6.3) |
| **D1–D5 (01.11.2026, Szenario 2.3)** `npm test`, `verluste_probe.py` (neu), `ui_bilder.py`, `ui_faelle.py`, `bedientest_probe.py`, `lobby_probe.py`, `drohne_probe.py`, `auswertung_probe.py` | 150 Tests (neu `tests/szenario23.test.ts`); eigene Züge mit Kampfkraft bei allen Rollen, Kopfzeile in allen Fenstern gleich, Druckmeldungen im Postfach ≤ 140 Zeichen, Flackern bei Treffer, Empfehlungskarte 89 px hoch, Kapitel „Preis des Abwartens“; 29 und 22 Bilder in 1530 × 800 ohne Rollbalken; Bedientest 18/18, Lobby 20/20, Live-Drohnenbild 43 Prüfpunkte; Auswertung mit Preis-Kapitel (12:00 min) |
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

* Bedientest mit Menschen für 2.6 (Teil A Start und Lobby, Teil B Zielbearbeitung zu zweit); dabei Tempo und Feed beobachten.
* Bildrate am Dienst-PC (WebGL 2) für Karte und Live-Drohnenbild bestätigen (`data-fps` an Karte und Leinwand).
* Schritt 8 ist umgesetzt (Auswertung, [`AUSWERTUNG.md`](AUSWERTUNG.md)); offen: Probe am Smartboard im Hörsaal (Lesbarkeit aus 4–8 m, Presenter).
