# ARGUS – Bedientest (Fertig-Kriterien Schritt 6/6b und 4b, Stand B1–B12 vom 25.10.2026)

**Kriterien:** Zwei Unbeteiligte verstehen die Bedienung nach 3 min (Teil B). Startseite und Lobby sind ohne
Erklärung bedienbar (Teil A – kommt vor Teil B, dauert ca. 8 min).
**Unbeteiligt** heißt: nicht an der Entwicklung beteiligt und möglichst nicht Teilnehmer des Lehrgangs
(sonst kennen sie die Fallen vorher). Dauer ca. 25 min für beide Personen zusammen.

Die Rollen heißen **Aufklärung**, **Zielprüfung** und **Führung**, die Ziele „Ziel 1, 2, 3 …“ in der Reihenfolge,
in der ARGUS sie meldet; die Spieluhr läuft von 00:00 bis 25:00. Der Test bleibt in Phase 1 (00:00–07:00). Die
Schlüsselfälle beginnen erst um 08:30 (Attrappe) und werden so nicht verraten.

## Teil A: Startseite und Lobby

**Aufbau:** zwei Rechner (oder ein Rechner mit Synchronisation **Lokal** und zwei Fenstern nebeneinander).
Der Testleiter öffnet https://heeresfliegermogli.github.io/Argus/ → **Spielleitung** → Name „SL 1“ →
**Neue Sitzung anlegen** und schreibt nur den Code (drei Zeichen, z. B. `K7P`) auf einen Zettel. Die Testpersonen
bekommen je ein Fenster mit der Startseite und den Zettel. Nichts erklären.

| Nr | Aufgabe (vorlesen) | Person | gelöst, wenn |
|---|---|---|---|
| A1 | „Tretet der Sitzung auf dem Zettel bei.“ | A, B | **Ich spiele mit**, Code eingegeben, Lobby offen |
| A2 | „Gründe ein Team mit dem Namen ‚Adler‘. Du bist die Zielprüfung.“ | A | Teamname, Knopf **Zielprüfung** |
| A3 | „Tritt dem Team Adler als Aufklärung bei.“ | B | **beitreten** in der Teamkarte bei Aufklärung |
| A4 | „Ihr seid nur zu zweit. Wer übernimmt die Führung? Richtet das ein.“ | A oder B | **+ dazu** bei Führung, „Deine Rolle: … und Führung“ |
| A5 | „B, wechsle von der Aufklärung zur Führung – die Aufklärung bleibt frei.“ (vorher A4 rückgängig, falls B die Führung hat) | B | **abgeben**, dann **beitreten**/+ dazu bei Führung |
| A6 | „Lass dir einen Teamnamen vorschlagen und gründe ein zweites Team.“ | B | 🎲, Rollenknopf, B ist in neuem Team |
| A7 | Testleiter: **Spiel öffnen – alle Teams**. „Wo seid ihr jetzt, und wie kommt ihr bei zwei Rollen zur anderen?“ | A, B | Folien der Einweisung durchgeblättert oder übersprungen; mit Doppelrolle: Umschalter oben links |
| A8 | „Ruf die Anleitung deiner Rolle noch einmal auf und schließ sie wieder.“ | A, B | Knopf **Einweisung** oben rechts, dann **Überspringen** oder Esc |

Bestanden, wenn beide A1–A8 ohne Hilfe lösen (eine Rückfrage erlaubt). Unklarheiten in die Änderungsliste.
Zusätzlich beobachten: Sucht jemand auf der ersten Seite nach „Sitzung anlegen“, obwohl er nur mitspielt?
`tools/lobby_probe.py` löst dieselben Aufgaben und weitere (falscher Code, Spielleitung, Plenum, Neuladen, zuletzt
genutzte Sitzung fortsetzen) nur über sichtbare Beschriftungen – das ersetzt den Test mit Menschen nicht.

## Teil B: Ansichten Aufklärung, Zielprüfung, Führung

Alle drei Rollen arbeiten auf der Karte: Meldungen stehen als Marken „Ziel n“ am Ziel (Klick öffnet), der Eingang
steht rechts oben nur als Zahl, einen Verlauf gibt es nicht. Die Aufklärung sieht das Drohnenbild live in einem
Fenster neben dem Ziel: Die Drohne verfolgt das Ziel, Klick = groß mit Lupe, an der Kopfleiste verschiebbar, ✕
schließt (die Marke öffnet es wieder). Aufklärung und Zielprüfung sehen die Lagehinweise der Führung oben links auf
der Karte. Jede Rolle ist eine Person; die Aufgaben sprechen sie deshalb mit „du“ an (wie die Einweisung).

## Aufbau

1. Rechner mit Edge, Fenster ca. 1530 × 800 (Dienst-PC mit 125 % Skalierung ist genau das).
2. https://heeresfliegermogli.github.io/Argus/ → **Spielleitung** → Synchronisation **Lokal** → „Test ohne Lobby“
   aufklappen → Raum `bedientest` → **Alle vier Fenster öffnen**. Ein Plenum-Fenster ist nicht nötig.
   (Mit zwei Rechnern: Synchronisation Firebase, gleicher Raum, je Rechner eine Rolle.)
3. Die Spielleitung (Testleiter) bedient SL und die Fenster, die gerade keine Testperson hat. Allein geht es auch
   mit **Allein testen (ein Fenster)**: Steuerung und alle drei Rollen in einem Fenster, oben umschalten.
4. Nichts erklären. Die Testperson bekommt nur ihr Fenster; die Einweisung ihrer Rolle (Folien) öffnet sich dort
   von selbst.

## Ablauf

| Durchgang | Person A | Person B | Testleiter spielt |
|---|---|---|---|
| 1 | Aufklärung | Zielprüfung | Führung, SL |
| 2 (SL: „Neues Spiel“) | Führung | Aufklärung | Zielprüfung, SL |

Je Durchgang:

1. **3 min Einweisung:** Die Person blättert die Folien ihrer Rolle durch (oder überspringt sie) und schaut sich die
   Ansicht an. SL startet gleichzeitig die Uhr (▶ Start, Tempo ×1). Um 00:20 kommt Ziel 1, um 00:30 I-01 an die
   Führung, um 01:15 Ziel 2, um 02:10 Ziel 3 (seit Szenario 2.2 etwa eine Meldung pro Minute).
2. **Aufgaben** (unten) vorlesen, eine nach der anderen; Aufklärung ab 02:10 (dann liegen Ziel 1–3 vor), die SL hält
   die Uhr dafür an. Keine Hilfe. Zeit und Auffälligkeiten notieren.
3. Um ca. 05:00 anhalten (❚❚ Anhalten).

## Aufgaben

**Aufklärung**

| Nr | Aufgabe | gelöst, wenn |
|---|---|---|
| 1 | „Nimm die erste Meldung an.“ | ANNEHMEN (Ziel 1 war schon offen) |
| 2 | „Wie viele Meldungen warten noch bei dir?“ | liest die Zahl neben „Eingang“ |
| 3 | „Öffne Ziel 3 auf der Karte. Wie sicher ist ARGUS, und was sagen die Sensordaten zur Bewegung?“ | Klick auf die Marke „Ziel 3“; Konfidenz und Zeile „Bewegung“ genannt |
| 4 | „Sieh dir das Fahrzeug genauer an.“ | Klick auf das Drohnenbild neben dem Ziel („Klick: groß mit Lupe“), Lupe auf dem Fahrzeug |
| 5 | „Das Drohnenbild verdeckt dir etwas. Schieb es zur Seite. Dann schließ es und hol es wieder.“ | an der Kopfleiste gezogen, ✕, Klick auf die Marke „Ziel 3“ |
| 6 | „Nimm Ziel 3 an und lehne die letzte Meldung ab.“ | ANNEHMEN, dann ABLEHNEN (Ziel 2) |
| 7 | „Wo würdest du einen Hinweis der Führung sehen?“ | zeigt auf „Lagehinweise der Führung“ oben links auf der Karte |

**Zielprüfung**

| Nr | Aufgabe | gelöst, wenn |
|---|---|---|
| 1 | „Empfiehl der Führung, Ziel 1 zu bekämpfen – mit einem Wirkmittel ohne Warnung.“ | LM oder Mörser gewählt, BEKÄMPFEN |
| 2 | „Wähle bei Ziel 3 den Mörser. Was sagt das System?“ | Marke „Ziel 3“ geöffnet, nennt die Warnung (R3, Ortschaft) und zeigt den roten Kreis |
| 3 | „Stell eine Zielmeldung zurück und öffne sie danach wieder.“ | BEOBACHTEN, Klick auf die Marke „Ziel n · zurückgestellt“ |
| 4 | „Wie viele Loitering Munition sind noch übrig?“ | liest den Bestand am Wirkmittel |

**Führung**

| Nr | Aufgabe | gelöst, wenn |
|---|---|---|
| 1 | „Lies die neue Lagemeldung und bestätige sie.“ | „Gelesen“ geklickt |
| 2 | „Gib die Empfehlung frei. Wann schlägt die Wirkung ein?“ | FREIGABE, liest „Einschlag mm:ss“ am gestrichelten Kreis auf der Karte |
| 3 | „Schick der Zielprüfung – nur ihr – einen Hinweis: ‚Schule ist belegt‘.“ | Haken „Aufklärung“ entfernt, Senden |
| 4 | „Schick die nächste Empfehlung zur erneuten Prüfung zurück.“ | Marke geöffnet, ZURÜCK an die Zielprüfung |
| 5 | „Schalte Fast-Track ein und wieder aus.“ | zweimal geschaltet (oben rechts) |

Der Testleiter sorgt dafür, dass bei der Führung rechtzeitig Empfehlungen ankommen (im Fenster der Zielprüfung
Ziel 1–3 empfehlen). `tools/bedientest_probe.py` löst alle Aufgaben nur über sichtbare Beschriftungen (Knöpfe,
Marken, Feldhinweise), dazu „Allein testen“: im Solo-Fenster ist die Aufklärung bedienbar und die angenommene
Meldung kommt bei der Zielprüfung an – das ersetzt den Test mit Menschen nicht.

Zusätzlich beim Bedientest beobachten (ohne Aufgabe):

- Findet die Aufklärung neue Meldungen auf der Karte, wenn das Drohnenbild offen ist? Verschiebt sie es von selbst?
- Versteht die Aufklärung, dass die Drohne dem Ziel folgt? Wird ein Fahrzeug einer Gruppe zerstört, schwenkt das
  Bild nach ca. 0,5 s mit kurzem Rauschen („◌ AUSRICHTUNG …“) zum nächsten – in Phase 1 kommt das nicht vor, erst
  ab ca. 18:30 (Ziel 18).
- Seit 2.2: Erkennen die Personen die gelben **Kontakte** (Bewegung ohne Meldung bei der Rolle) und dass ein Kontakt
  zur Zielmeldung wird, sobald die Meldung bei ihnen ankommt? Fällt ihnen die Ankündigung neuer Meldungen auf
  („neu: Ziel n“ im Eingang, Ring am Zeichen)?
- Nach den Aufgaben, nur mit Unbeteiligten, die nicht am Lehrgang teilnehmen: SL setzt die Spielzeit auf 18:20, die
  Aufklärung öffnet Ziel 21 (S4) – erkennt sie mit der Lupe die zwei Kinder? Im Live-Bild sind sie kleinere Figuren
  in Draufsicht.

## Bewertung

**Bestanden**, wenn beide Personen alle Aufgaben ihrer Ansichten **ohne Hilfe** lösen; erlaubt ist eine
Rückfrage zur Bedienung je Ansicht. Jede Unklarheit kommt in die Änderungsliste (auch bei „bestanden“).

## Bogen

| Durchgang | Person | Ansicht | Aufgabe | ohne Hilfe | Zeit | Was war unklar? |
|---|---|---|---|---|---|---|
| 1 | A | Aufklärung | 1 | ☐ ja ☐ nein | | |
| 1 | A | Aufklärung | 2 | ☐ ja ☐ nein | | |
| 1 | A | Aufklärung | 3 | ☐ ja ☐ nein | | |
| 1 | A | Aufklärung | 4 | ☐ ja ☐ nein | | |
| 1 | A | Aufklärung | 5 | ☐ ja ☐ nein | | |
| 1 | A | Aufklärung | 6 | ☐ ja ☐ nein | | |
| 1 | A | Aufklärung | 7 | ☐ ja ☐ nein | | |
| 1 | B | Zielprüfung | 1 | ☐ ja ☐ nein | | |
| 1 | B | Zielprüfung | 2 | ☐ ja ☐ nein | | |
| 1 | B | Zielprüfung | 3 | ☐ ja ☐ nein | | |
| 1 | B | Zielprüfung | 4 | ☐ ja ☐ nein | | |
| 2 | A | Führung | 1 | ☐ ja ☐ nein | | |
| 2 | A | Führung | 2 | ☐ ja ☐ nein | | |
| 2 | A | Führung | 3 | ☐ ja ☐ nein | | |
| 2 | A | Führung | 4 | ☐ ja ☐ nein | | |
| 2 | A | Führung | 5 | ☐ ja ☐ nein | | |
| 2 | B | Aufklärung | 1–7 | ☐ ja ☐ nein | | |
| A | A | Start/Lobby | A1–A8 | ☐ ja ☐ nein | | |
| A | B | Start/Lobby | A1–A8 | ☐ ja ☐ nein | | |

Abschlussfragen an beide: „Was hat euch beim ersten Hinsehen am meisten verwirrt?“ und – zur Einweisung – „Wer in
eurem Team sieht das Drohnenbild, wer die Lagemeldungen?“ (Antwort steht auf der ersten Folie unter „Euer Team“:
Aufklärung bzw. Führung.)

Ergebnis mit Datum in `claude/Entscheidungen.md` eintragen; danach Arbeitsplan Schritt 6 und 4b auf „Fertig“.
