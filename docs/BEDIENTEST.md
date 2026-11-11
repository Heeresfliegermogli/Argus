# ARGUS – Bedientest (seit Szenario 2.6: eine Rolle „Zielbearbeitung“; Stand Liste K vom 11.11.2026, Szenario 2.7)

**Kriterien:** Zwei Unbeteiligte verstehen die Bedienung nach 3 min (Teil B). Startseite und Lobby sind ohne
Erklärung bedienbar (Teil A – kommt vor Teil B, dauert ca. 6 min).
**Unbeteiligt** heißt: nicht an der Entwicklung beteiligt und möglichst nicht Teilnehmer des Lehrgangs
(sonst kennen sie die Fallen vorher). Dauer ca. 20 min für beide Personen zusammen.

Seit 2.6 gibt es je Team **eine Rolle**: die Zielbearbeitung, 2–3 Personen an **einem Laptop**, eine Entscheidung je
Meldung (BEKÄMPFEN mit … · ZURÜCKSTELLEN · ABLEHNEN). Die Ziele heißen „Ziel 1, 2, 3 …“ in der Reihenfolge, in der
ARGUS sie meldet; die Spieluhr läuft von 00:00 bis 25:00. Der Test bleibt in Phase 1 (00:00–07:00). Die Schlüsselfälle
beginnen erst um 08:30 (Attrappe) und werden so nicht verraten.

## Teil A: Startseite und Lobby

**Aufbau:** zwei Rechner (oder ein Rechner mit Synchronisation **Lokal** und zwei Fenstern nebeneinander).
Der Testleiter öffnet https://heeresfliegermogli.github.io/Argus/ → **Spielleitung** → Name „SL 1“ →
**Neue Sitzung anlegen** und schreibt nur den Code (drei Zeichen, z. B. `K7P`) auf einen Zettel. Die Testpersonen
bekommen je ein Fenster mit der Startseite und den Zettel. Nichts erklären.

| Nr | Aufgabe (vorlesen) | Person | gelöst, wenn |
|---|---|---|---|
| A1 | „Tretet der Sitzung auf dem Zettel bei.“ | A, B | **Ich spiele mit**, Code eingegeben, Lobby offen |
| A2 | „Legt ein Team mit dem Namen ‚Adler‘ an.“ | A | Teamname, **Team anlegen**; „Dieser Laptop spielt für das Team.“ |
| A3 | „Lass dir einen Teamnamen vorschlagen und lege ein zweites Team an.“ | B | 🎲, **Team anlegen** |
| A4 | „B, verlass dein Team und schau beim Team Adler zu.“ | B | **Team verlassen**, dann **zuschauen** in der Karte „Adler“ |
| A5 | Testleiter: **Spiel öffnen – alle Teams**. „A, was zeigt dir der Bildschirm jetzt?“ | A | Übersicht mit Pfeilen durchgeklickt (**weiter ›**) oder übersprungen, danach Folien oder **Überspringen** |
| A6 | „Ruf die Einweisung noch einmal auf und schließ sie wieder.“ | A | **? Einweisung** oben rechts, dann **Übersicht überspringen** / **Überspringen** oder Esc |

Bestanden, wenn beide A1–A6 ohne Hilfe lösen (eine Rückfrage erlaubt). Unklarheiten in die Änderungsliste.
Zusätzlich beobachten: Sucht jemand auf der ersten Seite nach „Sitzung anlegen“, obwohl er nur mitspielt? Versteht B,
dass das zweite Fenster nur zusieht (Hinweis oben: „… rechnet der Laptop von … Hier nur zuschauen.“)?

**Seit Liste K (11.11.2026) – Schließen und Wiederöffnen** (zwei Laptops, eine Spielleitung; ohne Erklärung, nur fragen „was würdet
ihr tun?“):

| Nr | Aufgabe | gelöst, wenn |
|---|---|---|
| K-1 | „Euer Tab ist versehentlich zu. Kommt zurück in euer Spiel.“ | über „Zurück zu Team …“, den Code oder den Verlauf wieder am eigenen Spiel, ohne die Spielleitung zu rufen |
| K-2 | „Euer Laptop ist ausgefallen (zuklappen). Spielt am Nachbar-Laptop weiter.“ | Code eingeben, Teamkarte „Spiel hier weiterführen“ (nach 20 s), Nachfrage bestätigt |
| K-3 | Der erste Laptop wird wieder aufgeklappt. „Was seht ihr?“ | der Hinweis „wird an einem anderen Laptop weitergeführt“ wird gelesen und verstanden |
| K-4 | Spielleitung: „Team … hat keinen Laptop mehr. Was tun Sie?“ | „nicht verbunden seit …“ gesehen, „Laptop freigeben“ gefunden |
| K-5 | Spielleitung: „Die Stunde ist vorbei.“ | „Sitzung beenden“ gefunden; danach neue Sitzung angelegt |

`tools/neuoeffnen_probe.py` löst diese und weitere Aufgaben über die Oberfläche (lokal und gegen die Firebase-Nachbildung).

`tools/lobby_probe.py` löst dieselben Aufgaben und weitere (falscher Code, Team ohne Laptop, zwei Laptops gleichzeitig,
Spielleitung verschiebt/benennt um/löscht, Plenum, Neuladen, später Beitritt, zuletzt genutzte Sitzung fortsetzen) nur über
sichtbare Beschriftungen – das ersetzt den Test mit Menschen nicht.

## Teil B: Ansicht Zielbearbeitung

Aufbau der Ansicht (seit Liste J, Dienst-Laptop 1536 × 730): links die **ganze Lagekarte** (Marken der Meldungen, bekämpfte
Ziele mit Countdown bis zum Einschlag), oben links auf der Karte die **Lagemeldungen** (Brigade, Nachbarn, 1. Kp; höchstens zwei
auf einmal; eine steht 30 s oder bis sie angeklickt wird – kleines ✕ –, danach ist sie ganz weg), unten links die Legende
(einklappbar); rechts fest aufgeteilt (nichts verschiebt sich): oben die Zeile **„Wirkung unterwegs“** (je bekämpftem Ziel ein
Chip mit Countdown, z. B. „Ziel 17 ×3 0:23“, mehr als drei hinter „+n“), darunter der **Eingang** mit der Wartezeit je Meldung
(vier Zeilen, eigene Rollleiste; Vermerke wie „Ziel 15 über die Brücke durchgebrochen“ stehen dort eine Minute), darunter die
geöffnete Meldung: Live-Drohnenbild (Klick: groß mit Lupe), ARGUS-Ausgabe („Panzer · Feind 91 %“, Empfehlung), die Wirkmittel
als **drei Kacheln** (Bestand, Countdown, ✓ oder ⚠), eine Zeile mit der Warnung zum gewählten Wirkmittel und ganz unten die drei
Knöpfe an fester Stelle. Kopfzeile: Uhr und Phase, die vier Panzer der 1. Kp mit Zustand, der Bestand groß.

## Aufbau

1. Rechner mit Edge, Browser maximiert (Dienst-Laptop 1920 × 1080 mit 125 % Skalierung: Fenster ca. 1536 × 730). Die Ansicht passt
   sich jeder Größe ab 1280 × 600 an; ist das Fenster kleiner, wird alles verkleinert und ein Hinweis bittet um Vollbild (F11). Die
   Fenstergröße steht unten in der Einweisung und bei der Spielleitung in der Übersicht.
2. https://heeresfliegermogli.github.io/Argus/ → **Spielleitung** → Synchronisation **Lokal** → „Test ohne Lobby: ein Team“
   aufklappen → Raum `bedientest` → **Team und Spielleitung öffnen** (zwei Fenster). Ein Plenum-Fenster ist nicht nötig.
   (Mit zwei Rechnern: Synchronisation Firebase, gleicher Raum, je Rechner ein Fenster.)
3. Der Testleiter bedient die Spielleitung. Allein geht es auch mit **Allein testen (ein Fenster)**: Die Uhr steuert dann
   das Team selbst oben rechts (▶ Start, ×1/×5/×20).
4. Nichts erklären. Die Testpersonen sitzen **zu zweit** am Fenster der Zielbearbeitung (wie im Seminar); die Einweisung
   (erst die Übersicht mit Pfeilen auf der Oberfläche, dann vier Folien) öffnet sich dort von selbst.

## Ablauf

1. **3 min Einweisung:** Die Personen klicken die Übersicht durch und blättern die Folien (oder überspringen sie) und
   schauen sich die Ansicht an. SL startet gleichzeitig die Uhr (▶ Start, Tempo ×1). Um 00:20 kommt Ziel 1, um 00:30 die
   erste Lagemeldung der Brigade, um 01:15 Ziel 2, um 02:10 Ziel 3 (etwa eine Meldung pro Minute).
2. **Aufgaben** (unten) vorlesen, eine nach der anderen, ab 02:10 (dann liegen Ziel 1–3 im Eingang); die SL hält die Uhr
   dafür an (vor Aufgabe 9 lässt sie die Uhr bis 03:00 weiterlaufen – dann kommt die Lagemeldung der Brigade zur Schule – und
   hält wieder an). Keine Hilfe. Zeit und Auffälligkeiten notieren. Die Personen wechseln sich ab (A: 1–5, B: 6–11).
3. Um ca. 05:00 anhalten (❚❚ Anhalten).

## Aufgaben

| Nr | Aufgabe | gelöst, wenn |
|---|---|---|
| 1 | „Wie viele Meldungen warten im Eingang, und wie lange wartet die älteste schon?“ | Zahl neben „Eingang“, Zeit m:ss in der Zeile von Ziel 1 |
| 2 | „Öffne Ziel 3. Was meldet ARGUS, und wie sicher ist es?“ | Klick auf die Zeile „Ziel 3“ (oder die Marke auf der Karte); liest „Fahrzeug · Feind …%“ und die Empfehlung |
| 3 | „Sieh dir das Fahrzeug genauer an.“ | Klick auf das Drohnenbild („Klick: groß mit Lupe“), Lupe auf dem Fahrzeug, Schließen/Esc |
| 4 | „Wähle für Ziel 3 den Mörser. Was sagt das System?“ | nennt die Warnung (R3, Ortschaft) – ⚠ auf der Kachel „Mrs“, Text in der Zeile darunter oder im Hinweis auf der Karte –, zeigt den roten Kreis |
| 5 | „Stell Ziel 3 zurück und öffne es danach wieder.“ | ZURÜCKSTELLEN; Zeile mit ◷ unter „+ 1 zurückgestellt“ angeklickt |
| 6 | „Bekämpft Ziel 1 mit einem Wirkmittel ohne Warnung. Wann schlägt es ein?“ | LM oder Mörser mit ✓ auf der Kachel („✓ keine Warnung“ in der Zeile darunter), BEKÄMPFEN; liest den Countdown m:ss im Chip „Ziel 1“ unter „Wirkung unterwegs“ (oder auf der Karte) |
| 7 | „Wie viele Loitering Munition habt ihr noch?“ | liest den Bestand in der Kopfzeile („LM 18“) oder groß auf der Kachel „LM“ |
| 8 | „Lehnt Ziel 2 ab.“ | Zeile „Ziel 2“, ABLEHNEN |
| 9 | „Was meldet die Brigade gerade? Klickt die Meldung danach weg.“ (Uhr vorher bis 03:00) | liest oben links auf der Karte „Evakuierung KRÄHE unvollständig …“ (Schule, Kinder), Klick auf die Meldung (✕) – sie ist weg |
| 10 | „Wie geht es euren Panzern?“ | zeigt auf 1/1–1/4 in der Kopfzeile, nennt den Zustand |
| 11 | „Ruft die Einweisung noch einmal auf.“ | **? Einweisung** oben rechts |

`tools/bedientest_probe.py` löst alle Aufgaben nur über sichtbare Beschriftungen (Knöpfe, Zeilen im Eingang, Zahlen in der
Kopfzeile), dazu „Allein testen“: Uhr oben rechts, Ziel 1 bekämpfen – das ersetzt den Test mit Menschen nicht.

Zusätzlich beim Bedientest beobachten (ohne Aufgabe):

- Wie lange schauen die Personen auf eine Meldung, bevor sie entscheiden (Sekunden „im Eingang seit“)? Reden sie dabei
  miteinander? Seit 2.6 steht das Tempo im Mittelpunkt: Wie schnell wird aus „hinschauen“ ein „wegklicken“?
- Verstehen die Personen, dass die Drohne dem Ziel folgt? Wird ein Fahrzeug einer Gruppe zerstört, schwenkt das Bild nach
  ca. 0,5 s mit kurzem Rauschen („◌ AUSRICHTUNG …“) zum nächsten – in Phase 1 kommt das nicht vor, erst ab ca. 18:30.
- Erkennen die Personen die gelben **Kontakte** (Bewegung ohne Meldung) und den Countdown an bekämpften Zielen?
- Bemerken die Personen die vier eigenen Panzer am Westrand (blau, 1/1–1/4) und ihren Zustand in der Kopfzeile? Ab ca.
  05:20 liegt 1/2 unter Mörserfeuer: Sehen sie die Lagemeldung der 1. Kp, die Einschläge neben dem Panzer, später bei
  einem Treffer das rote Blinken in der Kopfzeile und den kurzen roten Rand am Bildschirm?
- Finden sie das kleine „i“ an der Meldung (Angaben des Herstellers)? Es ist absichtlich unauffällig.
- Nach den Aufgaben, nur mit Unbeteiligten, die nicht am Lehrgang teilnehmen: SL setzt die Spielzeit auf 18:20, die
  Personen öffnen Ziel 26 (S4) – erkennen sie mit der Lupe die zwei Kinder? Im Live-Bild sind sie kleinere Figuren in
  Draufsicht.

## Bewertung

**Bestanden**, wenn beide Personen alle Aufgaben **ohne Hilfe** lösen; erlaubt ist eine Rückfrage zur Bedienung je Teil.
Jede Unklarheit kommt in die Änderungsliste (auch bei „bestanden“).

## Bogen

| Teil | Person | Aufgabe | ohne Hilfe | Zeit | Was war unklar? |
|---|---|---|---|---|---|
| A | A | A1–A6 | ☐ ja ☐ nein | | |
| A | B | A1–A6 | ☐ ja ☐ nein | | |
| B | A | 1 | ☐ ja ☐ nein | | |
| B | A | 2 | ☐ ja ☐ nein | | |
| B | A | 3 | ☐ ja ☐ nein | | |
| B | A | 4 | ☐ ja ☐ nein | | |
| B | A | 5 | ☐ ja ☐ nein | | |
| B | B | 6 | ☐ ja ☐ nein | | |
| B | B | 7 | ☐ ja ☐ nein | | |
| B | B | 8 | ☐ ja ☐ nein | | |
| B | B | 9 | ☐ ja ☐ nein | | |
| B | B | 10 | ☐ ja ☐ nein | | |
| B | B | 11 | ☐ ja ☐ nein | | |

Abschlussfragen an beide: „Was hat euch beim ersten Hinsehen am meisten verwirrt?“ und „Wie habt ihr euch zu zweit
aufgeteilt – wer schaut ins Drohnenbild, wer auf die Lagemeldungen?“ (Es gibt keine Vorgabe; die Antwort zeigt, ob die
Lagemeldungen auf der Karte überhaupt gelesen werden – S3 lebt davon.)

Ergebnis mit Datum in `claude/Entscheidungen.md` eintragen.
