# ARGUS – Bedientest (Fertig-Kriterien Schritt 6 und 4b)

**Kriterien:** Zwei Unbeteiligte verstehen die Bedienung nach 3 min (Schritt 6, Teil B). Die Lobby ist
ohne Erklärung bedienbar (Schritt 4b, Teil A – kommt vor Teil B, dauert ca. 8 min).
**Unbeteiligt** heißt: nicht an der Entwicklung beteiligt und möglichst nicht Teilnehmer des Lehrgangs
(sonst kennen sie die Fallen vorher). Dauer ca. 25 min für beide Personen zusammen.

Der Test bleibt in Phase 1 (10:00–10:07). Die Schlüsselfälle beginnen erst um 10:08:30 (M07) und werden
so nicht verraten.

## Teil A: Startseite und Lobby (Schritt 4b)

**Aufbau:** zwei Rechner (oder ein Rechner mit Synchronisation **Lokal** und zwei Fenstern nebeneinander).
Der Testleiter legt auf https://heeresfliegermogli.github.io/Argus/ eine Sitzung an (Name „SL 1“,
**Neue Sitzung anlegen**) und schreibt nur den Code auf einen Zettel. Die Testpersonen bekommen je ein
Fenster mit der Startseite und den Zettel. Nichts erklären.

| Nr | Aufgabe (vorlesen) | Person | gelöst, wenn |
|---|---|---|---|
| A1 | „Tretet der Sitzung auf dem Zettel bei.“ | A, B | Code eingegeben, Lobby offen |
| A2 | „Gründe ein Team mit dem Namen ‚Adler‘. Du bist G2.“ | A | Teamname, **G2 Zielprüfung** |
| A3 | „Tritt dem Team Adler als G1 bei.“ | B | **beitreten** in der Teamkarte bei G1 |
| A4 | „Ihr seid nur zu zweit. Wer übernimmt G3? Richtet das ein.“ | A oder B | **+ dazu** bei G3, „Deine Rolle: … und G3 Führung“ |
| A5 | „B, wechsle von G1 zu G3 – G1 bleibt frei.“ (vorher A4 rückgängig, falls B G3 hat) | B | **abgeben**, dann **beitreten**/+ dazu bei G3 |
| A6 | „Lass dir einen Teamnamen vorschlagen und gründe ein zweites Team.“ | B | 🎲, Rollenknopf, B ist in neuem Team |
| A7 | Testleiter: **Spiel öffnen – alle Teams**. „Wo seid ihr jetzt, und wie kommt ihr bei zwei Rollen zur anderen?“ | A, B | Einweisung gelesen; mit Doppelrolle: Umschalter oben links |

Bestanden, wenn beide A1–A7 ohne Hilfe lösen (eine Rückfrage erlaubt). Unklarheiten in die Änderungsliste.
`tools/lobby_probe.py` löst dieselben Aufgaben und weitere (Spielleitung, Plenum, Neuladen) nur über
sichtbare Beschriftungen – das ersetzt den Test mit Menschen nicht.

## Teil B: Ansichten G1, G2, G3 (Schritt 6)

## Aufbau

1. Rechner mit Edge, Fenster ca. 1530 × 800 (Dienst-PC mit 125 % Skalierung ist genau das).
2. https://heeresfliegermogli.github.io/Argus/ → Synchronisation **Lokal** → „Test ohne Lobby“ aufklappen →
   Raum `bedientest` → „Alle vier Fenster öffnen“. Zusätzlich ein Plenum-Fenster ist nicht nötig.
   (Mit zwei Rechnern: Synchronisation Firebase, gleicher Raum, je Rechner eine Rolle.)
3. Die Spielleitung (Testleiter) bedient SL und die Gruppenfenster, die gerade keine Testperson hat.
4. Nichts erklären. Die Testperson bekommt nur ihr Fenster; die Einweisungskarte öffnet sich dort von selbst.

## Ablauf

| Durchgang | Person A | Person B | Testleiter spielt |
|---|---|---|---|
| 1 | G1 Aufklärung | G2 Zielprüfung | G3, SL |
| 2 (SL: „Neues Spiel“) | G3 Führung | G1 Aufklärung | G2, SL |

Je Durchgang:

1. **3 min Einweisung:** Die Person liest ihre Einweisungskarte und schaut sich die Ansicht an. SL startet
   gleichzeitig die Uhr (▶ Start, Tempo ×1). Um 10:01 kommt M01, um 10:00:30 I-01 an G3.
2. **Aufgaben** (unten) vorlesen, eine nach der anderen. Keine Hilfe. Zeit und Auffälligkeiten notieren.
3. Um ca. 10:07 Uhr anhalten (❚❚ Anhalten).

## Aufgaben

**G1 Aufklärung**

| Nr | Aufgabe | gelöst, wenn |
|---|---|---|
| 1 | „Nehmt die erste Meldung an und gebt G2 einen kurzen Vermerk mit.“ | Vermerk eingetragen, ANNEHMEN |
| 2 | „Wie sicher ist ARGUS bei der nächsten Meldung, und was sagen die Sensordaten zur Bewegung?“ | Konfidenz und Zeile „Bewegung“ genannt |
| 3 | „Seht euch das Fahrzeug genauer an.“ | Klick aufs Bild, Lupe auf dem Fahrzeug |
| 4 | „Lehnt eine Meldung ab.“ | ABLEHNEN |
| 5 | „Wo würdet ihr einen Hinweis der Führung sehen?“ | zeigt auf „Lagehinweise“ |

**G2 Zielprüfung**

| Nr | Aufgabe | gelöst, wenn |
|---|---|---|
| 1 | „Empfehlt G3, M01 zu bekämpfen – mit einem Wirkmittel ohne Warnung.“ | LM oder Mörser gewählt, BEKÄMPFEN |
| 2 | „Wählt bei M03 den Mörser. Was sagt das System?“ | nennt die Warnung (R3, Einschränkungsgebiet) und zeigt den roten Kreis |
| 3 | „Stellt eine Zielmeldung zurück und findet sie wieder.“ | BEOBACHTEN, Eintrag „zurückgestellt“ gefunden |
| 4 | „Wie viele Loitering Munition sind noch übrig?“ | liest den Bestand am Wirkmittel |

**G3 Führung**

| Nr | Aufgabe | gelöst, wenn |
|---|---|---|
| 1 | „Lest die neue Lagemeldung und bestätigt sie.“ | „Gelesen“ geklickt |
| 2 | „Gebt die Empfehlung frei. Wann schlägt die Wirkung ein?“ | FREIGABE, Uhrzeit am gestrichelten Kreis oder im Verlauf |
| 3 | „Schickt G2 – nur G2 – einen Hinweis: ‚Schule NS-01 ist belegt‘.“ | Haken G1 entfernt, Senden |
| 4 | „Schickt die nächste Empfehlung zur erneuten Prüfung zurück.“ | ZURÜCK AN G2 |
| 5 | „Schaltet Fast-Track ein und wieder aus.“ | zweimal geschaltet |

Der Testleiter sorgt dafür, dass bei G3 rechtzeitig Empfehlungen ankommen (im G2-Fenster M01–M03
empfehlen).

## Bewertung

**Bestanden**, wenn beide Personen alle Aufgaben ihrer Ansichten **ohne Hilfe** lösen; erlaubt ist eine
Rückfrage zur Bedienung je Ansicht. Jede Unklarheit kommt in die Änderungsliste (auch bei „bestanden“).

## Bogen

| Durchgang | Person | Ansicht | Aufgabe | ohne Hilfe | Zeit | Was war unklar? |
|---|---|---|---|---|---|---|
| 1 | A | G1 | 1 | ☐ ja ☐ nein | | |
| 1 | A | G1 | 2 | ☐ ja ☐ nein | | |
| 1 | A | G1 | 3 | ☐ ja ☐ nein | | |
| 1 | A | G1 | 4 | ☐ ja ☐ nein | | |
| 1 | A | G1 | 5 | ☐ ja ☐ nein | | |
| 1 | B | G2 | 1 | ☐ ja ☐ nein | | |
| 1 | B | G2 | 2 | ☐ ja ☐ nein | | |
| 1 | B | G2 | 3 | ☐ ja ☐ nein | | |
| 1 | B | G2 | 4 | ☐ ja ☐ nein | | |
| 2 | A | G3 | 1 | ☐ ja ☐ nein | | |
| 2 | A | G3 | 2 | ☐ ja ☐ nein | | |
| 2 | A | G3 | 3 | ☐ ja ☐ nein | | |
| 2 | A | G3 | 4 | ☐ ja ☐ nein | | |
| 2 | A | G3 | 5 | ☐ ja ☐ nein | | |
| 2 | B | G1 | 1–5 | ☐ ja ☐ nein | | |
| A | A | Lobby | A1–A7 | ☐ ja ☐ nein | | |
| A | B | Lobby | A1–A7 | ☐ ja ☐ nein | | |

Abschlussfrage an beide: „Was hat euch beim ersten Hinsehen am meisten verwirrt?“

Ergebnis mit Datum in `claude/Entscheidungen.md` eintragen; danach Arbeitsplan Schritt 6 und 4b auf „Fertig“.
