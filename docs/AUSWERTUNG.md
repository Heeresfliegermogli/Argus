# ARGUS – Auswertung im Plenum (Schritt 8)

Stand 10.11.2026 (Szenario 2.7, Änderungen G und I): **15 min in sechs Kapiteln** – Teamvergleich, Replay S3/S2, „Bilanz – Das
ist es wert“ mit dem Referenzlauf **„ARGUS allein“**, Impuls, Diskussion mit dem Wertekompass, Abschluss. Der Plan steht in den Daten
(`szenario.auswertung.kapitel`, `zuschaltbar`, `replay`), `kapitelPlan(inh, wahl)` in `src/kern/auswertung.ts` baut daraus die Kapitel
(Prüfung: Summe 15:00). Auflösung nach Spielende am Smartboard, über alle Teams, aus den Protokollen (die vom Team-Laptop
hochgeladenen; fehlt eines, lädt die Spielleitung die Datei des Teams mit **Protokoll laden**). Gesteuert von der Spielleitung mit
wenigen Klicks (oder einem Presenter); nichts springt von selbst weiter. Die Auswertung bleibt bei der Ethik: Sie zeigt **Teams**,
nie Namen von Personen, **keine Rangliste, keine Punkte, keine Darstellung getöteter Menschen**. Davor: 22.10.2026 (Schritt 8),
B3–B9 (25.10.), „Preis des Abwartens“ (D5, 2.3), eine Rolle (H, 2.6; Abschnitte unten mit „bis 2.6“ beschreiben diesen Stand).

## Ablauf im Hörsaal: 15 min (seit 2.7, G1)

Das Plenum-Fenster schaltet von selbst auf die Auswertung, sobald **alle** Teams das Spielende erreicht haben
(„◂ Spiel“ führt zurück zur Ansicht je Team, „Auswertung – alle Teams ›“ wieder hin). Die Spielleitung erreicht
dieselbe Ansicht in ihrer Übersicht über **Auswertung ›**.

| Kapitel | Zeit | Inhalt |
|---|---|---|
| 1 Teamvergleich | 1:00 | „Was hat jedes Team entschieden – und wie schnell?“ Zeilen = Fälle S1–S8, N1–N4, Spalten = Teams (7 Teams in 1530 px), rechts „alle“. Je Zelle Ausgang, die eine Entscheidung mit **Sekunden ab Eingang** und was danach geschah. Klick auf eine Zelle öffnet das Replay dieses Falls für dieses Team (ein Fall außerhalb der Auswahl wird dazugenommen) |
| 2 Replay S3, S2 | 4:00 (je 2:00) | Standard S3 und S2 (`replay.standard`), S1 und S4–S8 zuschaltbar – die Zeit je Fall sinkt (`replayPlan`: Budget 240 s gleich verteilt, auf 5 s abgerundet; unter 1:00 „knapp“). Neben dem Drohnenbild, wie das Team es sah: **„Wie lange habt ihr hingeschaut?“** – Sekunden von der Meldung bis zur Entscheidung je Team, daneben „… 20 seconds for each target …“ mit Quelle (G1.2). S3 zeigt, ob I-04 gelesen wurde („gelesen nach x s“ / „ungelesen verschwunden“, I4.2) und die Auflösung um 21:45 (◆) |
| 3 Bilanz – Das ist es wert | 2:00 | je Team und **„ARGUS allein“**: Wert der zerstörten Feindfahrzeuge (Spielwerte, Mio €, Balken), Feindfahrzeuge zerstört, Munition verschossen (€), Meldung bis Wirkung (Median), wie lange hingeschaut (Median), eigene Panzer einsatzbereit. Teams in der Reihenfolge des Beitritts, **keine Rangfolge**. Ein Klick (oder „weiter“) deckt **„Nicht in der Bilanz“** auf: Sanitätsfahrzeug, Zivilpersonen (davon Kinder), Kamerateam, Verwundete, Besatzung mit weißem Tuch, Verbündete, Attrappe – als Zahl mit Zeichen, **ohne Eurowert**. Unten klein der Hinweis für die SL aus Liste G, dahinter in Klammern, was davon heute stimmt („heute: …“) |
| 4 Impuls | 1:00 | Folie 1: das Zitat des „Lavender“-Offiziers **ohne Quelle** (englisch, deutsch darunter) mit „Stimmt ihr zu?“. Ein Klick deckt die Quelle auf (Folie 2: Offizier „B.“, +972 Magazine, Yuval Abraham, 03.04.2024; drei Punkte mit Zitaten; **Pflichtzeile**: „Die israelische Armee bestreitet wesentliche Darstellungen des Berichts.“). Zuschaltbar über „weitere Zitate“: Karp, Thiel, Luckey und die Gegenstimme Guterres, je eine Folie. Alle Zitate wörtlich nach Liste G (G3.3) |
| 5 Diskussion | 6:00 | **Wertekompass** („nach Meine Innere Führung – Mein Wertekompass“): Werte und Tugenden, dazu fünf Leitfragen (Menschenwürde; Effizienz gegen Würde; Gehorsam und Gewissen; Mut und Bescheidenheit; Grenze) – die angesprochenen Werte sind im Kompass hervorgehoben |
| 6 Abschluss | 1:00 | vier Kernaussagen („Der Wertekompass gibt Orientierung …“, „Effizienz ist ein Argument, kein Freibrief.“, „KI unterstützt, der Mensch entscheidet.“, „Verantwortung lässt sich nicht delegieren.“) und die Schlussfrage |
| zuschaltbar | – | über **＋** in der Kapitelleiste: Kennzahlen je Team (0:45) und Konfidenz (0:30) nach dem Teamvergleich, „Preis des Abwartens“ (1:00) nach dem Replay; weitere Fälle für das Replay. Zugeschaltetes verlängert die Summe (die Uhr zeigt Soll und Σ) |

Oben rechts läuft je Kapitel eine kleine Uhr **„mm:ss / mm:ss“** (Ist / Soll, bei Überschreitung bernsteinfarben) und die Summe Σ.

### Referenzlauf „ARGUS allein“ (G2)

Regel (in den Daten, `auswertung.referenz.regel`): Jede Meldung mit Empfehlung BEKÄMPFEN wird **zur Meldezeit ohne Prüfung**
freigegeben; Wirkmittel Mörser, wenn er am Einschlagort ohne Warnung zulässig ist, sonst LM (solange Bestand), sonst Kanone.
PRÜFEN, UNKLAR und NICHT BEKÄMPFEN bleiben liegen; keine Verstärkungen. `src/engine/referenzlauf.ts` (`argusAllein`) spielt das mit
derselben Engine wie die Teams (Host mit eigener Uhr, Trefferregel, Verlustmodell, Durchbruch, E-01) – deterministisch, gerechnet beim
Öffnen der Auswertung (ca. 0,2 s), gleich der Python-Simulation (`tools/referenz/simuliere_durchlauf.py`, Team „argus“; Test
`tests/durchlauf.test.ts`). Die Bilanz rechnet `src/kern/bilanz.ts` aus dem Endzustand: Feindfahrzeuge × Spielwert
(`regeln.bilanz.fahrzeuge_mio_eur`), Schuss × Preis (`munition_eur`), Fehlbekämpfungen je Art als Zahl (Personen: Zivilpersonen,
Kamerateam, Verwundete je Gruppe 4, weißes Tuch; Fahrzeuge: Sanität, Verbündete, Attrappe) – unabhängig nachgerechnet in Python
(`tools/referenz/bilanz.py`).

| Lauf (2.7) | Feindfz. | Wert | Munition | Meldung → Wirkung | hingeschaut | Panzer | nicht in der Bilanz |
|---|---|---|---|---|---|---|---|
| **ARGUS allein** | 29 | 14,65 Mio € | 2,0 Mio € (LM 20, Mrs 7, Kanone 1) | 35 s | 0 s | 4/4 | Sanität 1, Zivilpersonen 5 (davon 2 Kinder), Kamerateam 2, Verwundete 4, Verbündete 3, Attrappe 1 |
| naiv (20 s) | 33 | 15,85 Mio € | 2,1 Mio € | 56 s | 20 s | 4/4 | Sanität 1, Zivilpersonen 9 (4 Kinder), Kamerateam 2, Verwundete 4, weißes Tuch 3, Verbündete 3, Attrappe 1 |
| ideal (35 s) | 25 | 12,20 Mio € | 2,0 Mio € | 71 s | 43 s | 3/4 | – |

Der Hinweis für die SL aus Liste G („ARGUS allein war schneller, hat mehr zerstört und die eigenen Panzer geschont. Warum braucht es euch
noch?“) steht wörtlich klein unten in der Bilanz; dahinter prüft die Auswertung, was davon mit den Teams des Tages stimmt („heute: schneller
als alle Teams ✓ · mehr zerstört als 3 von 7 Teams · …“). Gegen ein Team wie *naiv* stimmt „mehr zerstört“ nicht.

**Bis 2.6 (12 min; seit 2.4, E5, Logik Teil E-a):** Der Teamvergleich zeigt alle Fälle (S1–S8, N1–N4). Das Replay zeigt standardmäßig S3, S2, S1, S4
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
* **▶** spielt das Zeitfenster des Falls in ca. 45 s ab (Tempo je Fall ×4 bis ×15) – vom Budget (seit 2.7 je Fall 2:00) bleibt
  der größere Teil für das Gespräch.
* **Wie lange habt ihr hingeschaut?** (seit 2.7, G1.2) neben dem Drohnenbild: je Team die Sekunden von der Meldung bis zur
  Entscheidung, darunter „… 20 seconds for each target …“ mit Quelle.
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

Die ganze Auswertung braucht seit 2.7 **11 Bedienschritte** (Bild ↓ je Kapitel und zum Aufdecken in Bilanz und Impuls, ▶ je Fall),
dazu nach Bedarf Team und Sprung; Zuschalten über **＋** (Kapitel und Fälle).

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
| Fall | Schlüsselfall S1–S8 oder Nebenfall N1–N4 mit seiner Meldung und Folgemeldungen mit demselben `fall` (S4: M18 und M23) |
| **falsch** | eine Freigabe im Fall traf beim Einschlag Verbündete, Sanität, Zivilpersonen, die Attrappe oder Gegner, die sich ergeben, oder schlug unter Verstoß gegen R2/R3 ein (N4: NS-01) |
| **richtig** | nichts davon: das Team hat gestoppt oder zurückgestellt, oder (echtes Ziel) ohne Fehltreffer bekämpft |
| **zu Unrecht abgelehnt** | echtes Ziel, das nach der Lösung bekämpft werden sollte, wurde abgelehnt (N3) |
| offen / entfallen / nicht erreicht | bei Spielende noch im Eingang / Fahrzeug zerstört oder abgezogen, bevor das Team entschied / Meldung kam nicht |
| Entscheidung | seit 2.6 eine je Meldung (BEKÄMPFEN mit Wirkmittel, ZURÜCKSTELLEN, ABLEHNEN; eine zurückgestellte Meldung kann später noch entschieden werden – es zählt die letzte) mit Sekunden ab Eingang und ab Öffnen |
| Fehlbekämpfung | Wirkung mit mindestens einem Treffer der Art verbündet, Sanität, zivil, Attrappe, außer Gefecht/ergibt sich |
| bekämpft trotz Regelwarnung | Das Team bekämpfte, obwohl die Vorausrechnung eine Regelwarnung zum Einschlag zeigte |
| **Widerspruch gegen ARGUS** | am Ende anders gehandelt, als ARGUS empfahl: BEKÄMPFEN, aber das Team lehnte ab oder stellte zurück und es kam zu keiner Wirkung – oder NICHT BEKÄMPFEN, aber bekämpft. **Zu Recht**, wenn die Lösung im Szenario das Stoppen verlangt bzw. die Wirkung ohne Fehltreffer und Verstoß blieb. PRÜFEN/UNKLAR ist keine Empfehlung, der man widersprechen könnte |
| Wie lange hingeschaut (seit 2.6) | Sekunden ab Eingang und ab Öffnen bis zur Entscheidung (`sek_eingang`, `sek_offen` im Protokoll), Median, kürzeste, längste, Zahl der Entscheidungen in höchstens 20 s; getrennt nach Konfidenz ≥ 90 % und darunter |
| I-04 angeklickt | Klick des Teams auf die erste feste Lagemeldung zu einem Fall im Feed (I-04 zu S3; I-07 zu S4 erscheint im Replay). Seit 2.7 (I4) steht eine Lagemeldung 30 s oder bis zum Klick und ist dann ganz weg: Das Replay S3 zeigt „I-04 gelesen nach x s“ oder „ungelesen verschwunden (nach 30 s)“ |
| Auflösung S3 (seit 2.7, I3) | ohne Freigabe auf die PT-91 bis 90 s nach M20 (21:45) sind sie als verbündet markiert: Meldung erledigt, Vermerk „verbündet – nicht bekämpfen“, Lagemeldung I-17. Für den Fall zählt das als **richtig** (nicht freigegeben, I3.3); in Kette und Zeitleiste steht ◆ „21:45 als verbündet erkannt“ |
| Bilanz (seit 2.7, G2) | je Team und „ARGUS allein“ aus dem Endzustand: zerstörte Feindfahrzeuge (legitime Ziele, ohne Personen und Beobachter) × Spielwert, Schuss je Wirkmittel × Preis, Median Meldung bis Wirkung (Einschlag der ersten Freigabe je Meldung), Median Sekunden bis zur Entscheidung, Panzer einsatzbereit; Fehlbekämpfungen je Art als Zahl ohne Eurowert. Keine Rangfolge, kein Punktestand |
| Eigene Verluste (seit 2.3; seit 2.5 je Panzer) | Einsatzbereite (nicht ausgefallene), eingeschränkte und ausgefallene Panzer, Verwundete und mittlerer Zustand bei Spielende, Zustand und Stufe je Panzer, Verlauf alle 15 s (Zustand je Panzer, einsatzbereit, Verwundete) und Zahl der Druckmeldungen (K-…) – aus dem Verlustmodell (`src/kern/verluste.ts`), gleiche Entscheidungen ⇒ gleiche Werte. Export: `einsatzbereit_ende`, `eingeschraenkt_ende`, `ausgefallen_ende`, `verwundete_ende`, `zustand_mittel_ende`, `zustand_panzer`, `zustand_verlauf`. Lage, keine Wertung: Sie stehen neben den Fehlbekämpfungen, nie als Punkte |
| ARGUS falsch | BEKÄMPFEN, aber das Ziel war zur Meldezeit nicht legitim (wie `pruefe_szenario.py`): M08, M12, M33, M35, M20, M21 |

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
Spalten `kampfkraft_ende` und `verwundete_ende`. **Seit 2.7 (G5)** je Team `bilanz` (`feindfahrzeuge`, `wert_mio_eur`, `munition_eur`,
`schuss` je Wirkmittel, `sekunden_meldung_bis_wirkung_median`, `sekunden_hingeschaut_median`, `panzer_einsatzbereit`,
`fehlbekaempfungen` je Art als Zahl, `davon_kinder`) und oben `referenz` („ARGUS allein“ mit derselben Bilanz); in der CSV die Spalten
`bilanz_feindfahrzeuge`, `bilanz_wert_mio_eur`, `bilanz_munition_eur`, `bilanz_median_s_meldung_bis_wirkung`, `fehl_sanitaet` …
`fehl_attrappe`, `fehl_kinder` und eine Zeile „ARGUS allein“. Auch hier: keine Namen, keine Rangfolge.

## Technik

| Datei | Inhalt |
|---|---|
| `src/kern/auswertung.ts` | Fälle, Verlauf je Meldung, Kette, Ausgang je Fall, Kennzahlen, Konfidenz, Zeitleiste und Zeitfenster je Fall, Stand zur Zeit t (`zustandBis`), Export (JSON, CSV) |
| `src/ansichten/auswertung.tsx` | Ansicht mit Kapiteln (seit 2.7 nach `kapitelPlan`, Menü ＋ zum Zuschalten), Uhr je Kapitel, Export, Teamvergleich, Kennzahlen, Konfidenz (SVG), Replay (Karte, Zeitleiste, Drohnenbild, „hingeschaut“), Bilanz, Impuls, Diskussion, Abschluss; Tasten für Presenter |
| `src/ansichten/sl-fenster.tsx` | `AuswertungFenster` (Plenum und Spielleitung), Umschalten im Plenum, „✎ Notiz“ in der Teamansicht |
| `src/karte/lagekarte.ts`, `src/ansichten/gemeinsam/lagekarte.tsx` | `fokus` (Ausschnitt), wartet, bis die Leinwand ihre Größe hat |
| `src/main.tsx`, `tools/auswertung_demo.ts`, `public/demo/auswertung_demo.json` | Üben ohne Spiel (`?auswertung=demo`) |
| `tests/modellteam.ts` | Modellteams für eine Rolle (seit 2.6): naiv 20 s, ideal 35 s je Entscheidung; sie klicken Lagemeldungen an (seit 2.7: ideal nach 20 s, naiv nach 25 s, I-04 liest das naive Team nie – sie verschwindet nach 30 s; Team 3 des Drehbuchs liest sie nach 25 s) – ändert den Ablauf der Meldungen nicht |
| `src/engine/referenzlauf.ts`, `src/kern/bilanz.ts` (seit 2.7) | Referenzlauf „ARGUS allein“ (`argusAllein`, `spieleAutomatisch`) und Bilanz (`bilanz`, `mio`, `euro`); `tools/referenz/bilanz.py` rechnet dieselbe Bilanz in Python |

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
| **G+I (10.11.2026, Szenario 2.7)** | `tests/auswertung.test.ts` (Kapitelplan 15:00, Zuschalten, S3 aufgelöst = richtig, I-04 gelesen/ungelesen, Export mit Bilanz), `tests/durchlauf.test.ts` (Referenzlauf „ARGUS allein“ zweimal gleich, = Python, Bilanz = `bilanz.py`), `tests/szenario27.test.ts`; `tools/auswertung_probe.py` auf `?auswertung=demo` mit 7 Teams: alle Kapitel in 1530 × 800, kleinste Schrift 13 px, Zitate wörtlich, Bilanz und Impuls aufdecken, „weitere Zitate“, Zuschalten von Kennzahlen, Konfidenz, Preis und S1, Export mit Bilanz und „ARGUS allein“; `tools/e2e_drehbuch.py` (5 Team-Laptops, SL, SL 2, Plenum, ×5): Auswertung im Plenum mit Bilanz aller Teams und „ARGUS allein“ (14,65 Mio €) wie im Prozess, Notiz der SL 2 bei S3, 11 Bedienschritte, Zeitbudget 15:00 |
| **H (09.11.2026, Szenario 2.6)** | `tests/auswertung.test.ts` für eine Rolle (Ausgang je Fall, Sekunden ab Eingang/Öffnen, Widerspruch, Export mit `sekunden_ab_eingang`); `tools/auswertung_probe.py` auf `?auswertung=demo` mit **7 Teams**: Teamvergleich gedreht in 1530 × 800 ohne Rollbalken (bisher 2244 px breit), Sekunden in jeder Zelle, Kennzahlen kompakt, kleinste Schrift 13 px; `tools/e2e_drehbuch.py` (5 Team-Laptops, SL, SL 2, Plenum): Plenum schaltet selbst auf die Auswertung, Teamvergleich und Kennzahlen = Auswertung im Prozess, Notiz der SL 2 bei S3 |

Prüfen: `python3 tools/auswertung_probe.py http://localhost:4173/` (Beispiel) bzw. mit `--erwartet plan.json` und der
Adresse eines Plenums nach einem Lauf; das ganze Drehbuch mit `python3 tools/e2e_drehbuch.py http://localhost:4173/ --tempo 5`.

## Offen

- Probe am Smartboard im Hörsaal: Lesbarkeit aus 4–8 m (Teamvergleich, Zeitleiste, Diagramm), Presenter (Bild ↓/↑).
  Die Ansicht ist für 1530 × 800 ausgelegt (Dienst-PC mit 125 %); Vollbild (F11) gibt etwas mehr Höhe.
- Mit der echten Datenbank (Firebase) einmal die ganze Auswertung nach einem Lauf öffnen (lädt alle sieben hochgeladenen Protokolle).
- Notizen der SL 2 im echten Durchlauf: Reicht ✎ Notiz in der Teamansicht, oder braucht SL 2 eine eigene Notizleiste für
  alle Teams?
