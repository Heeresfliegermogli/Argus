# ARGUS – Auswertung im Plenum (Schritt 8)

Stand 09.11.2026 (Szenario 2.6, Änderungen H): **eine Rolle je Team, eine Entscheidung je Meldung, sieben Teams.** Der
Teamvergleich ist gedreht (Zeilen = Fälle, Spalten = Teams) und passt mit 7 Teams in 1530 × 800; jede Zelle nennt die eine
Entscheidung mit den **Sekunden ab Eingang**; die Kennzahlen fragen „Wie lange habt ihr hingeschaut?“ (ab Eingang · ab Öffnen, H2.4);
das Replay zeigt je Meldung eine Entscheidung und das Drohnenbild, wie das Team es sah. Fast-Track gibt es nicht mehr; der Vergleich
mit der Automatik kommt mit Liste G als „ARGUS allein“. Davor: 22.10.2026, angepasst B3–B9 (25.10.), seit 2.3 (D5) mit dem Kapitel
**„Preis des Abwartens“**. Auflösung nach Spielende am Smartboard, über alle Teams, aus den Protokollen (seit 2.6 die vom Team-Laptop
hochgeladenen; fehlt eines, lädt die Spielleitung die Datei des Teams mit **Protokoll laden**). Gesteuert von der Spielleitung mit
wenigen Klicks (oder einem Presenter). Die Auswertung bleibt bei der Ethik: Sie zeigt **Teams**, nie Namen von Personen, keine
Rangliste und keine Punkte.

## Ablauf im Hörsaal: 12 min

Das Plenum-Fenster schaltet von selbst auf die Auswertung, sobald **alle** Teams das Spielende erreicht haben
(„◂ Spiel“ führt zurück zur Ansicht je Team, „Auswertung – alle Teams ›“ wieder hin). Die Spielleitung erreicht
dieselbe Ansicht in ihrer Übersicht über **Auswertung ›**.

| Kapitel | Zeit | Inhalt |
|---|---|---|
| 1 Teams | 0:45 | „Was hat jedes Team entschieden – und wie schnell?“ Zeilen = Fälle S1–S8, N1–N4, Spalten = Teams (seit 2.6 gedreht, 7 Teams in 1530 px), rechts „alle“ (richtig/falsch). Je Zelle der Ausgang (✓ richtig, ✕ falsch, ◐ zu Unrecht abgelehnt, … offen/entfallen), die eine Entscheidung (✓ bekämpft, ◷ zurückgestellt, ✕ abgelehnt) mit **Sekunden ab Eingang** und einzeilig, was danach geschah („→ Verbündete getroffen“). Klick auf eine Zelle öffnet das Replay dieses Falls für dieses Team. |
| 2 Kennzahlen | 0:45 | je Team: Fehlbekämpfungen (Zahl und Art), bekämpft trotz Regelwarnung, Widerspruch gegen ARGUS (zu Recht / zu Unrecht), **Wie lange habt ihr hingeschaut?** (Median ab Eingang · ab Öffnen, kürzeste und längste, Entscheidungen in höchstens 20 s), I-04 angeklickt (Spielzeit, wie lange nach Eingang), eigene Truppe (einsatzbereite Panzer, Verwundete) |
| 3 Konfidenz | 0:30 | Kernaussage: Streudiagramm Konfidenz × Sichtstörung je Meldung; die falschen Empfehlungen rot mit „n von 7 Teams bekämpft“; Ø der falschen gegen die richtigen BEKÄMPFEN; Kernaussage aus dem Szenario |
| S3, S2, S1, S4 | je 2:30 (mit Verlustmodell je 2:15) | Replay je Schlüsselfall (Reihenfolge aus den Daten, `reihenfolge`): Zeitleiste aller Teams, Kontrollkarte zum Durchscrubben, Drohnenbild, wie das Team es bei der Entscheidung sah, Leitfragen und Bezüge, Notizen der SL 2 |
| Preis des Abwartens (seit 2.3; seit 2.5 je Panzer, F2.9) | 1:00 | Zustand der vier Panzer der 1. Kp je Team über die Spielzeit (Kurve = Mittel der vier in der Teamfarbe, Linien bei 70 % „darunter eingeschränkt“ und 40 % „darunter ausgefallen – höchstens zwei, die Kp hält“), darauf die Entscheidungen bei S4, N4 und S3 (● richtig, ◆ falsch) am Zeitpunkt der Entscheidung; am Kurvenende „b/4“; rechts je Team ein Balken je Panzer (gelb eingeschränkt, grau ausgefallen), einsatzbereite Panzer, Verwundete und die Fehlbekämpfungen. Leitfragen an das Team mit den wenigsten Treffern an der eigenen Kp („Ihr hattet weniger Treffer an der eigenen Kp – um welchen Preis?“) und an das mit den meisten („Ihr habt gewartet, und eure Panzer wurden getroffen – war das richtig?“), darunter die **Offenlegung**: Der Druck war gebaut (Treffer an der eigenen Kp, Zeit, Forderungen der Panzer); wer bei S4, S5, N4 oder S3 wartete, sah eigene Panzer getroffen werden – und lag trotzdem richtig. Bezüge: Art. 51 Abs. 5 lit. b und Art. 57 ZP I, Fürsorge, Innere Führung. Keine Rangliste, keine Punkte; bis 2.4 Kampfkraft dreier Züge |
| Schluss | – | „Wer hat in diesem Spiel entschieden: ihr oder ARGUS?“ mit vier Zahlen über alle Teams (Bekämpfungen, davon wie von ARGUS empfohlen, Entscheidungen in höchstens 20 s, Mal widersprochen – davon zu Recht) |

Oben rechts läuft das **Zeitbudget** (Kapitel / gesamt, bei Überschreitung bernsteinfarben; Klick setzt zurück).

**Seit Szenario 2.4 (E5, Logik Teil E-a):** Der Teamvergleich zeigt alle Fälle (S1–S8, N1–N4). Das Replay zeigt standardmäßig S3, S2, S1, S4
(`szenario.auswertung.replay.standard`); die Spielleitung kann S5–S8 zuschalten (`zuschaltbar`) und die Reihenfolge ändern. Das Budget von
12 min bleibt: `replayPlan(inh, auswahl, mitPreis)` in `src/kern/auswertung.ts` zieht die festen Kapitel (2:00) und den Preis des Abwartens
(1:00) ab und teilt den Rest gleich auf die gewählten Fälle (auf 5 s abgerundet): vier Fälle je 2:15, sechs je 1:30, acht je 1:05 (`knapp`
unter 1:30). Unbekannte, doppelte und Nebenfälle in der Auswahl fallen weg. `kapitelListe(a, inh, auswahl)` nimmt den Plan; die Auswahl
in der Oberfläche baut Teil E-b. Weitere Änderungen der Logik: „Freigabe trotz Warnung“ zählt nur Regelwarnungen (`regelWarnung`: nicht
„Bestand … aufgebraucht“ und nicht „nur k von n Fahrzeugen – Bestand reicht nicht“); Fehlbekämpfung „außer Gefecht“ heißt jetzt
„Wehrlose“ (Besatzung, die sich ergibt, und Verwundete am Wrack, S6); im Konfidenzbild tragen die Meldungen zur EloKa-Zeit `eloka: true`
und als Sichtstörung die EloKa-Stärke (die Bilanz bleibt bei den Werten der Daten: 30 richtig, 6 falsch, Ø 92,3 % gegen 88,2 %).

### Replay je Schlüsselfall

* **Zeitleiste** (unter der Karte): je Team eine Zeile mit Ausgang, darauf die Marken der Meldung (◆ ARGUS) → die eine
  Entscheidung mit Sekunden (BEKÄMPFEN rot) → ✸ Einschlag (rot bei Fehltreffer) und – wo es den Fall betrifft –
  ✉ Lagemeldung angeklickt, ✎ Notiz der SL. Gestrichelte Linien: Lagemeldung zum Fall
  (S3: I-04, S4: I-07) und Meldezeit, für alle Teams gleich. Klick oder Ziehen auf einer Zeile wählt Team und Zeitpunkt,
  Klick auf eine Marke springt genau dorthin.
* **Kontrollkarte** des gewählten Teams mit Ground Truth, Bewegung, Wirkungen und Effekten zur Zeit des Replays (Stand aus
  dem Protokoll bis zu diesem Zeitpunkt), Ausschnitt auf den Fall (Weg der Fahrzeuge im Zeitfenster, Einschläge).
* **▶** spielt das Zeitfenster des Falls in ca. 45 s ab (Tempo je Fall ×4 bis ×15) – vom Budget von 2:30 bleibt der
  größte Teil für das Gespräch.
* **Drohnenbild, wie das Team es sah**: das Live-Bild zur Zeit der Entscheidung („bei der Entscheidung 14:32 – bekämpft nach
  20 s“), mit derselben Kamera wie im Spiel (verfolgt das Ziel, schwenkt nach einer Zerstörung), Klick = groß mit Lupe (Esc
  schließt). Darunter, was ARGUS dem Team meldete (Klasse, Zugehörigkeit, Konfidenz, Empfehlung) – Sensordaten gibt es seit 2.4 nicht mehr.
* **Leitfragen und Bezüge** aus dem Szenario, **Notizen der SL 2** zu diesem Fall (gewähltes Team zuerst).

### Bedienung

| Was | Klick | Taste / Presenter |
|---|---|---|
| nächstes / voriges Kapitel | ▸ / ◂ oder Kapitel oben | Bild ↓, →, ↓ / Bild ↑, ←, ↑ |
| erstes / letztes Kapitel | Kapitel oben | Pos1 / Ende |
| Team im Replay | Zeile der Zeitleiste | Ziffer 1–9 |
| Replay abspielen / anhalten | ▶ | Leertaste oder P |
| Zeitpunkt | Klick/Ziehen auf der Zeitleiste, Klick auf eine Marke | – |
| Drohnenbild groß mit Lupe | Klick auf das Bild | Esc schließt |

Die ganze Auflösung braucht **11 Bedienschritte** (7 × weiter, 4 × ▶), dazu nach Bedarf Team und Sprung.

### Notizen der SL 2

Während des Spiels: in der Teamansicht (Steuerung oder Zuschauen) **✎ Notiz** – der Fall, der bei diesem Team gerade läuft, ist
vorgewählt (S1–S8, N1–N4 oder „allgemein“), Text (bis 500 Zeichen), Enter. Die Notiz geht als Aktion an den Team-Laptop, steht im
Protokoll des Teams (`notiz {text, fall}`) und erscheint in der Auswertung beim Fall – also **am Smartboard**: keine Namen, so steht es
auch im Feld. Nach dem Spiel kann die Spielleitung in ihrer Auswertung im Replay weitere Notizen zum
gewählten Team und Fall schreiben.

### Üben ohne Spiel

`…/Argus/?auswertung=demo` (Startseite unten: „Auswertung üben (Beispiel, 7 Teams)“): sieben Modellteams (die fünf des
Drehbuchs – naiv, ideal, beide mit Verstärkungen, naiv mit fünf – und zwei weitere mit 25 bzw. 30 s je Entscheidung) mit einigen Notizen. Daten in
`public/demo/auswertung_demo.json`, erzeugt mit `npx vite-node tools/auswertung_demo.ts`. Nur auf der Webseite, nicht in
der Offline-Datei.

## Was gezählt wird

Alles ist eine reine Funktion von Inhalten und Protokollen (`src/kern/auswertung.ts`); gezählt wird nur, was im
Protokoll steht.

| Begriff | Festlegung |
|---|---|
| Fall | Schlüsselfall S1–S4 oder Nebenfall N1–N4 mit seiner Meldung und Folgemeldungen mit demselben `fall` (S4: M18 und M23) |
| **falsch** | eine Freigabe im Fall traf beim Einschlag Verbündete, Sanität, Zivilpersonen, die Attrappe oder Gegner, die sich ergeben, oder schlug unter Verstoß gegen R2/R3 ein (N4: NS-01) |
| **richtig** | nichts davon: das Team hat gestoppt oder zurückgestellt, oder (echtes Ziel) ohne Fehltreffer bekämpft |
| **zu Unrecht abgelehnt** | echtes Ziel, das nach der Lösung bekämpft werden sollte, wurde abgelehnt (N3) |
| offen / entfallen / nicht erreicht | bei Spielende noch im Eingang / Fahrzeug zerstört oder abgezogen, bevor das Team entschied / Meldung kam nicht |
| Entscheidung | seit 2.6 eine je Meldung (BEKÄMPFEN mit Wirkmittel, ZURÜCKSTELLEN, ABLEHNEN; eine zurückgestellte Meldung kann später noch entschieden werden – es zählt die letzte) mit Sekunden ab Eingang und ab Öffnen |
| Fehlbekämpfung | Wirkung mit mindestens einem Treffer der Art verbündet, Sanität, zivil, Attrappe, außer Gefecht/ergibt sich |
| bekämpft trotz Regelwarnung | Das Team bekämpfte, obwohl die Vorausrechnung eine Regelwarnung zum Einschlag zeigte |
| **Widerspruch gegen ARGUS** | am Ende anders gehandelt, als ARGUS empfahl: BEKÄMPFEN, aber das Team lehnte ab oder stellte zurück und es kam zu keiner Wirkung – oder NICHT BEKÄMPFEN, aber bekämpft. **Zu Recht**, wenn die Lösung im Szenario das Stoppen verlangt bzw. die Wirkung ohne Fehltreffer und Verstoß blieb. PRÜFEN/UNKLAR ist keine Empfehlung, der man widersprechen könnte |
| Wie lange hingeschaut (seit 2.6) | Sekunden ab Eingang und ab Öffnen bis zur Entscheidung (`sek_eingang`, `sek_offen` im Protokoll), Median, kürzeste, längste, Zahl der Entscheidungen in höchstens 20 s; getrennt nach Konfidenz ≥ 90 % und darunter |
| I-04 angeklickt | Klick des Teams auf die erste feste Lagemeldung zu einem Fall im Feed (I-04 zu S3; I-07 zu S4 erscheint im Replay). Ohne Klick rutscht sie nach ca. 8 s in „frühere Meldungen“ – ob sie gelesen wurde, weiß man dann nicht |
| Eigene Verluste (seit 2.3; seit 2.5 je Panzer) | Einsatzbereite (nicht ausgefallene), eingeschränkte und ausgefallene Panzer, Verwundete und mittlerer Zustand bei Spielende, Zustand und Stufe je Panzer, Verlauf alle 15 s (Zustand je Panzer, einsatzbereit, Verwundete) und Zahl der Druckmeldungen (K-…) – aus dem Verlustmodell (`src/kern/verluste.ts`), gleiche Entscheidungen ⇒ gleiche Werte. Export: `einsatzbereit_ende`, `eingeschraenkt_ende`, `ausgefallen_ende`, `verwundete_ende`, `zustand_mittel_ende`, `zustand_panzer`, `zustand_verlauf`. Lage, keine Wertung: Sie stehen neben den Fehlbekämpfungen, nie als Punkte |
| ARGUS falsch | BEKÄMPFEN, aber das Ziel war zur Meldezeit nicht legitim (wie `pruefe_szenario.py`): M08, M12, M20, M21 |

## Export (anonym, für die Seminarauswertung)

**Export ▾** oben rechts: JSON ohne Freitexte, JSON mit Freitexten, CSV (Kennzahlen und Fälle je Team, Semikolon, für
Excel). Teams heißen **Team A, B, C …** (Reihenfolge wie in der Auswertung), keine Namen von Personen oder Teams, keine
Kennungen der Rechner, nur Spielzeit 00:00–25:00 (keine Uhrzeit des Seminars). Je Meldung die Zielnummer der Spieler (`ziel`),
je Entscheidung `sekunden_ab_eingang` und `sekunden_ab_oeffnen`, CSV-Spalten `median_s_ab_eingang`, `median_s_ab_oeffnen`,
`median_s_konfidenz_hoch`, `median_s_konfidenz_niedrig`, `bis_20_s` (seit 2.6; bis 2.5 je Rolle). Freitexte (Notizen der SL; aus
älteren Läufen Begründung, Bemerkung, Lagehinweise) nur auf Wunsch, weil sie Namen enthalten können. Inhalt: Fälle, ARGUS-Bilanz je Meldung
(Konfidenz, Sichtstörung, wie viele Teams bekämpft), je Team Kennzahlen, Fälle mit Kette und Einschlag, alle Meldungen
mit Entscheidungen, Wirkungen und entfallenen Meldungen, Lagehinweise, Verstärkungen. Seit 2.3 (D5.3) je Team `verluste`
(`kampfkraft_ende`, `verwundete_ende`, `druckmeldungen`, `kampfkraft_zuege` je Zug, `kampfkraft_verlauf` je Minute), in der CSV die
Spalten `kampfkraft_ende` und `verwundete_ende`.

## Technik

| Datei | Inhalt |
|---|---|
| `src/kern/auswertung.ts` | Fälle, Verlauf je Meldung, Kette, Ausgang je Fall, Kennzahlen, Konfidenz, Zeitleiste und Zeitfenster je Fall, Stand zur Zeit t (`zustandBis`), Export (JSON, CSV) |
| `src/ansichten/auswertung.tsx` | Ansicht mit Kapiteln, Zeitbudget, Export, Teamvergleich, Kennzahlen, Konfidenz (SVG), Replay (Karte, Zeitleiste, Drohnenbild), Schlussfrage; Tasten für Presenter |
| `src/ansichten/sl-fenster.tsx` | `AuswertungFenster` (Plenum und Spielleitung), Umschalten im Plenum, „✎ Notiz“ in der Teamansicht |
| `src/karte/lagekarte.ts`, `src/ansichten/gemeinsam/lagekarte.tsx` | `fokus` (Ausschnitt), wartet, bis die Leinwand ihre Größe hat |
| `src/main.tsx`, `tools/auswertung_demo.ts`, `public/demo/auswertung_demo.json` | Üben ohne Spiel (`?auswertung=demo`) |
| `tests/modellteam.ts` | Modellteams für eine Rolle (seit 2.6): naiv 20 s, ideal 35 s je Entscheidung; sie klicken Lagemeldungen an (ideal nach 20 s, naiv nach 40 s, I-04 erst nach 270 s) – ändert den Ablauf der Meldungen nicht |

Protokoll: `notiz` hat ein optionales Feld `fall` (S1–S8, N1–N4; der Host prüft, dass es den Fall gibt); `entscheid` trägt seit 2.6
`t_offen`, `sek_eingang`, `sek_offen`.

## Nachweis „Fertig, wenn“

| Prüfung | Ergebnis |
|---|---|
| Testlauf mit 5 Teams (`tools/e2e_drehbuch.py`, 18 Browserfenster über Lobby und Code, ×5, 23.10.) | bestanden: alle fünf Teams bis Spielende, Protokolle wie die Engine im Prozess, das Plenum schaltet von selbst auf die Auswertung. Teamvergleich (40 Zellen: Ausgang und entscheidende Stufe) und Kennzahlen am Bildschirm = Auswertung im Prozess aus `tools/drehbuch_plan.ts`. Notiz der SL 2 mit ✎ Notiz während des Spiels (S3 vorgewählt) steht im Protokoll und im Replay S3. Übersicht der SL: „Auswertung ›“ (5 × 8 Zellen) und zurück. Export ohne Namen |
| 12 min | Budget 0:45 + 0:45 + 0:30 + 4 × 2:30 = 12:00. Replay je Fall 41–50 s (S3 ×10, S2 ×4, S1 ×4–5, S4 ×9), es bleiben je Fall ca. 1:40 für das Gespräch. Kapitelwechsel bis sichtbar ≤ 0,4 s (das erste Replay bis 0,7 s, es lädt die Karte). Die ganze Auflösung mit allen Prüfungen in 76 s durchgeklickt |
| am Smartboard lesbar | 1530 × 800 ohne Rollbalken, nichts abgeschnitten; kleinste Schrift 13 px (Beschriftungen), Werte 20–28 px, Kernaussage und Schlussfrage groß (Schlussfrage 52 px); Diagramm mit Form und Beschriftung, nicht nur Farbe |
| Bedienung mit wenigen Klicks | 11 Bedienschritte für die ganze Auflösung (7 × weiter, 4 × ▶), alles auch mit Presenter (Bild ↓/↑); Zelle → Replay, Ziffer oder Zeile → Team, Marke → Zeitpunkt |
| Ethik | Teams statt Namen, keine Rangliste, keine Punkte; Export Team A–E ohne Namen, Kennungen und Uhrzeit, Freitexte nur auf Wunsch (Test und Probe prüfen das) |
| **D5 (01.11.2026, Szenario 2.3)** | Kapitel „Preis des Abwartens“ mit den fünf Drehbuch-Teams (`tests/szenario23.test.ts`, `tools/verluste_probe.py` auf `?auswertung=demo`): Kurven aller Teams, Marken S4/N4/S3, Leitfragen, Offenlegung, 1530 × 800 ohne Rollbalken; Budget 0:45 + 0:45 + 0:30 + 4 × 2:15 + 1:00 = 12:00; Export mit Kampfkraft und Verwundeten, weiter ohne Namen |
| **E5 (01.11.2026, Szenario 2.4, Logik)** | `tests/auswertung.test.ts` mit allen zwölf Fällen der fünf Drehbuch-Teams (naiv trifft S5, S6, S8; ideal stoppt richtig: S5 an der Zielprüfung, S6 und die Presse in S8 bei der Aufklärung), Replay-Plan (Standard, sechs, acht Fälle, Budget ≤ 12:00), Regelwarnung ohne Bestandshinweis |
| **F2.9 (02.11.2026, Szenario 2.5)** | Kapitel „Preis des Abwartens“ mit dem Zustand der vier Panzer je Team (`tests/szenario23.test.ts`, `tools/verluste_probe.py` auf `?auswertung=demo`, Beispieldaten mit `tools/auswertung_demo.ts` neu erzeugt): fünf Kurven (Mittel der vier Panzer), 15 Marken, Balken je Panzer, „b/4“ je Team, Leitfragen und Offenlegung, kleinste Schrift 13,5 px, in 1530 × 800. Im Beispiel: Falke Nord 4/4 (naiv), Löwe 2 3/4 (ideal), Team Ömer & Co 3/4, Wega 2/4, Kassiopeia 3/4. `auswertung_probe.py`: Kapitel „Preis“ mit Werten wie im Prozess (einsatzbereit, Verwundete); **offen (seit E-a, Aufgabe von E-b):** Teamvergleich mit zwölf Spalten zu breit (2244 px), Konfidenz mit sechs falschen Empfehlungen |
| automatisch | 114 Tests (12 neu in `tests/auswertung.test.ts`), Build; `tools/auswertung_probe.py` auf `?auswertung=demo`, `ui_faelle.py` (22 Bilder), `bedientest_probe.py` 15/15, `lobby_probe.py` 19/19 |
| **H (09.11.2026, Szenario 2.6)** | `tests/auswertung.test.ts` für eine Rolle (Ausgang je Fall, Sekunden ab Eingang/Öffnen, Widerspruch, Export mit `sekunden_ab_eingang`); `tools/auswertung_probe.py` auf `?auswertung=demo` mit **7 Teams**: Teamvergleich gedreht in 1530 × 800 ohne Rollbalken (bisher 2244 px breit), Sekunden in jeder Zelle, Kennzahlen kompakt, kleinste Schrift 13 px; `tools/e2e_drehbuch.py` (5 Team-Laptops, SL, SL 2, Plenum): Plenum schaltet selbst auf die Auswertung, Teamvergleich und Kennzahlen = Auswertung im Prozess, Notiz der SL 2 bei S3 |

Prüfen: `python3 tools/auswertung_probe.py http://localhost:4173/` (Beispiel) bzw. mit `--erwartet plan.json` und der
Adresse eines Plenums nach einem Lauf; das ganze Drehbuch mit `python3 tools/e2e_drehbuch.py http://localhost:4173/ --tempo 5`.

## Offen

- Probe am Smartboard im Hörsaal: Lesbarkeit aus 4–8 m (Teamvergleich, Zeitleiste, Diagramm), Presenter (Bild ↓/↑).
  Die Ansicht ist für 1530 × 800 ausgelegt (Dienst-PC mit 125 %); Vollbild (F11) gibt etwas mehr Höhe.
- Mit der echten Datenbank (Firebase) einmal die ganze Auswertung nach einem Lauf öffnen (lädt alle sieben hochgeladenen Protokolle).
- Notizen der SL 2 im echten Durchlauf: Reicht ✎ Notiz in der Teamansicht, oder braucht SL 2 eine eigene Notizleiste für
  alle Teams?
