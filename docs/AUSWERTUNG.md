# ARGUS – Auswertung im Plenum (Schritt 8)

Stand 22.10.2026. Auflösung nach Spielende am Smartboard, über alle Teams, aus den Protokollen. Gesteuert von der
Spielleitung mit wenigen Klicks (oder einem Presenter). Die Auswertung bleibt bei der Ethik: Sie zeigt **Teams**, nie
Namen von Personen, keine Rangliste und keine Punkte.

## Ablauf im Hörsaal: 12 min

Das Plenum-Fenster schaltet von selbst auf die Auswertung, sobald **alle** Teams das Spielende erreicht haben
(„◂ Spiel“ führt zurück zur Ansicht je Team, „Auswertung – alle Teams ›“ wieder hin). Die Spielleitung erreicht
dieselbe Ansicht in ihrer Übersicht über **Auswertung ›**.

| Kapitel | Zeit | Inhalt |
|---|---|---|
| 1 Teams | 0:45 | Teamvergleich: Teams × S3, S2, S1, S4 und N1–N4. Je Zelle der Ausgang (✓ richtig, ✕ falsch, ◐ zu Unrecht abgelehnt, … offen/entfallen), die Kette **G1 → G2 → G3 → ✸** (✓ weiter, ✕ gestoppt, ◷ zurückgestellt, ↩ zurück an G2, FT Fast-Track) mit der **entscheidenden Stufe umrandet**, darunter zwei Zeilen („FREIGABE 10:22:15 (PzAbw)“ / „→ Verbündete getroffen“). Unten je Fall: wie viele Teams richtig/falsch. Klick auf eine Zelle öffnet das Replay dieses Falls für dieses Team. |
| 2 Kennzahlen | 0:45 | je Team: Fehlbekämpfungen (Zahl und Art), Freigabe trotz Regelwarnung, Widerspruch gegen ARGUS (zu Recht / zu Unrecht), Bearbeitungszeit je Stufe (Median, dazu ≥ 90 % und darunter), Fast-Track (wann ein, Meldungen ohne G1), I-04 gelesen (Uhrzeit, wie lange nach Eingang), Lagehinweise an G1/G2 (erster nach I-04) |
| 3 Konfidenz | 0:30 | Kernaussage: Streudiagramm Konfidenz × Sichtstörung je Meldung; die vier falschen Empfehlungen (M08, M12, M20, M21) rot mit „n von 5 Teams bekämpft“; Ø 93,5 % (falsch) gegen 88,3 % (richtig BEKÄMPFEN); alle vier über der Fast-Track-Schwelle; Kernaussage aus dem Szenario |
| S3, S2, S1, S4 | je 2:30 | Replay je Schlüsselfall (Reihenfolge aus den Daten, `reihenfolge`): Zeitleiste aller Teams, Kontrollkarte zum Durchscrubben, Drohnenbild wie G1 es sah, Leitfragen und Bezüge, Notizen der SL 2 |
| Schluss | – | „Wer hat in diesem Spiel entschieden: ihr oder ARGUS?“ mit vier Zahlen über alle Teams (Freigaben, davon auf BEKÄMPFEN von ARGUS, Meldungen per Fast-Track ohne G1, Widerspruch) |

Oben rechts läuft das **Zeitbudget** (Kapitel / gesamt, bei Überschreitung bernsteinfarben; Klick setzt zurück).

### Replay je Schlüsselfall

* **Zeitleiste** (unter der Karte): je Team eine Zeile mit Ausgang, darauf die Marken der Meldung (◆ ARGUS, schraffiert
  bei Fast-Track) → G1 → G2 → G3 (Freigabe rot) → ✸ Einschlag (rot bei Fehltreffer) und – wo es den Fall betrifft –
  ✉ Lagemeldung gelesen, ▲ Lagehinweis an G1/G2, „FT ein“, ✎ Notiz der SL. Gestrichelte Linien: Lagemeldung zum Fall
  (S3: I-04, S4: I-07) und Meldezeit, für alle Teams gleich. Klick oder Ziehen auf einer Zeile wählt Team und Zeitpunkt,
  Klick auf eine Marke springt genau dorthin.
* **Kontrollkarte** des gewählten Teams mit Ground Truth, Bewegung, Wirkungen und Effekten zur Zeit des Replays (Stand aus
  dem Protokoll bis zu diesem Zeitpunkt), Ausschnitt auf den Fall (Weg der Fahrzeuge im Zeitfenster, Einschläge).
* **▶** spielt das Zeitfenster des Falls in ca. 45 s ab (Tempo je Fall ×4 bis ×15) – vom Budget von 2:30 bleibt der
  größte Teil für das Gespräch.
* **Drohnenbild, wie G1 es sah**: das Live-Bild zur Zeit der Entscheidung von G1 (bei Fast-Track zur Meldezeit mit
  „Fast-Track: G1 hat dieses Bild nie gesehen.“), Klick = groß mit Lupe (Esc schließt). Darunter die Sensordaten, die
  nur G1 hatte (Wärme, Bewegung, Spuren, Kennzeichnung, Personen).
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

Während des Spiels: in der Teamansicht (Steuerung oder Zuschauen bei G1–G3) **✎ Notiz** – der Fall, der bei diesem Team
gerade läuft, ist vorgewählt (S1–S4, N1–N4 oder „allgemein“), Text, Enter. Die Notiz steht im Protokoll des Teams
(`notiz {text, fall}`) und erscheint in der Auswertung beim Fall – also **am Smartboard**: Rollen (G1, G2, G3) statt
Namen, so steht es auch im Feld. Nach dem Spiel kann die Spielleitung in ihrer Auswertung im Replay weitere Notizen zum
gewählten Team und Fall schreiben.

### Üben ohne Spiel

`…/Argus/?auswertung=demo` (Startseite unten: „Auswertung üben (Beispiel, 5 Teams)“): die fünf Modellteams des
Drehbuchs (naiv, ideal, beide mit Verstärkungen, naiv mit fünf) mit einigen Notizen. Daten in
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
| offen / entfallen / nicht erreicht | bei Spielende noch in der Kette / Fahrzeug zerstört oder abgezogen, bevor jemand entschied / Meldung kam nicht |
| entscheidende Stufe | bei „falsch“ und bei Bekämpfung G3 (Freigabe), sonst die Stufe, die gestoppt oder zurückgestellt hat |
| Fehlbekämpfung | Wirkung mit mindestens einem Treffer der Art verbündet, Sanität, zivil, Attrappe, außer Gefecht/ergibt sich |
| Freigabe trotz Regelwarnung | G3 gab frei, obwohl die Vorausrechnung eine Warnung zum Einschlag zeigte |
| **Widerspruch gegen ARGUS** | am Ende anders gehandelt, als ARGUS empfahl: BEKÄMPFEN, aber ein Mensch stoppte (G1 ABLEHNEN, G2 NICHT BEKÄMPFEN/BEOBACHTEN, G3 ABLEHNEN/ZURÜCK) und es kam zu keiner Wirkung – oder NICHT BEKÄMPFEN, aber bekämpft. **Zu Recht**, wenn die Lösung im Szenario das Stoppen verlangt bzw. die Wirkung ohne Fehltreffer und Verstoß blieb. PRÜFEN/UNKLAR ist keine Empfehlung, der man widersprechen könnte |
| Bearbeitungszeit je Stufe | Eingang bei der Stufe bis zu ihrer Entscheidung (jede Runde, z. B. nach ZURÜCK erneut), Median; getrennt nach Konfidenz ≥ Fast-Track-Schwelle (90 %) und darunter |
| Fast-Track | Zeitpunkt des letzten Einschaltens, Meldungen, die ohne G1 an G2 gingen |
| I-04 gelesen | Quittung von G3 („gelesen“) der ersten festen Lagemeldung zu einem Fall (Reihenfolge der Fälle: I-04 zu S3; I-07 zu S4 erscheint im Replay) |
| Lagehinweise | Anzahl, erster nach I-04 |
| ARGUS falsch | BEKÄMPFEN, aber das Ziel war zur Meldezeit nicht legitim (wie `pruefe_szenario.py`): M08, M12, M20, M21 |

## Export (anonym, für die Seminarauswertung)

**Export ▾** oben rechts: JSON ohne Freitexte, JSON mit Freitexten, CSV (Kennzahlen und Fälle je Team, Semikolon, für
Excel). Teams heißen **Team A, B, C …** (Reihenfolge wie in der Auswertung), keine Namen von Personen oder Teams, keine
Kennungen der Rechner, nur Spielzeit (keine Uhrzeit des Seminars). Freitexte (Vermerk, Begründung, Bemerkung,
Lagehinweise, Notizen der SL) nur auf Wunsch, weil sie Namen enthalten können. Inhalt: Fälle, ARGUS-Bilanz je Meldung
(Konfidenz, Sichtstörung, wie viele Teams bekämpft), je Team Kennzahlen, Fälle mit Kette und Einschlag, alle Meldungen
mit Entscheidungen, Wirkungen und entfallenen Meldungen, Lagehinweise, Verstärkungen.

## Technik

| Datei | Inhalt |
|---|---|
| `src/kern/auswertung.ts` | Fälle, Verlauf je Meldung, Kette, Ausgang je Fall, Kennzahlen, Konfidenz, Zeitleiste und Zeitfenster je Fall, Stand zur Zeit t (`zustandBis`), Export (JSON, CSV) |
| `src/ansichten/auswertung.tsx` | Ansicht mit Kapiteln, Zeitbudget, Export, Teamvergleich, Kennzahlen, Konfidenz (SVG), Replay (Karte, Zeitleiste, Drohnenbild), Schlussfrage; Tasten für Presenter |
| `src/ansichten/sl-fenster.tsx` | `AuswertungFenster` (Plenum und Spielleitung), Umschalten im Plenum, „✎ Notiz“ in der Teamansicht |
| `src/karte/lagekarte.ts`, `src/ansichten/gemeinsam/lagekarte.tsx` | `fokus` (Ausschnitt), wartet, bis die Leinwand ihre Größe hat |
| `src/main.tsx`, `tools/auswertung_demo.ts`, `public/demo/auswertung_demo.json` | Üben ohne Spiel (`?auswertung=demo`) |
| `tests/modellteam.ts` | G3 der Modellteams quittiert Lagemeldungen (ideal nach 20 s, naiv nach 40 s, I-04 erst nach 270 s) und gibt Lagehinweise (ideal; Team 3 des Drehbuchs warnt, schießt aber trotzdem) – ändert den Ablauf der Meldungen nicht |

Protokoll: `notiz` hat ein optionales Feld `fall` (S1–S4, N1–N4; der Host prüft, dass es den Fall gibt). Die
Firebase-Regeln lassen das ohne Änderung zu.

## Nachweis „Fertig, wenn“

| Prüfung | Ergebnis |
|---|---|
| Testlauf mit 5 Teams (`tools/e2e_drehbuch.py`, 18 Browserfenster über Lobby und Code, ×5, 23.10.) | bestanden: alle fünf Teams bis Spielende, Protokolle wie die Engine im Prozess, das Plenum schaltet von selbst auf die Auswertung. Teamvergleich (40 Zellen: Ausgang und entscheidende Stufe) und Kennzahlen am Bildschirm = Auswertung im Prozess aus `tools/drehbuch_plan.ts`. Notiz der SL 2 mit ✎ Notiz während des Spiels (S3 vorgewählt) steht im Protokoll und im Replay S3. Übersicht der SL: „Auswertung ›“ (5 × 8 Zellen) und zurück. Export ohne Namen |
| 12 min | Budget 0:45 + 0:45 + 0:30 + 4 × 2:30 = 12:00. Replay je Fall 41–50 s (S3 ×10, S2 ×4, S1 ×4–5, S4 ×9), es bleiben je Fall ca. 1:40 für das Gespräch. Kapitelwechsel bis sichtbar ≤ 0,4 s (das erste Replay bis 0,7 s, es lädt die Karte). Die ganze Auflösung mit allen Prüfungen in 76 s durchgeklickt |
| am Smartboard lesbar | 1530 × 800 ohne Rollbalken, nichts abgeschnitten; kleinste Schrift 13 px (Beschriftungen), Werte 20–28 px, Kernaussage und Schlussfrage groß (Schlussfrage 52 px); Diagramm mit Form und Beschriftung, nicht nur Farbe |
| Bedienung mit wenigen Klicks | 11 Bedienschritte für die ganze Auflösung (7 × weiter, 4 × ▶), alles auch mit Presenter (Bild ↓/↑); Zelle → Replay, Ziffer oder Zeile → Team, Marke → Zeitpunkt |
| Ethik | Teams statt Namen, keine Rangliste, keine Punkte; Export Team A–E ohne Namen, Kennungen und Uhrzeit, Freitexte nur auf Wunsch (Test und Probe prüfen das) |
| automatisch | 114 Tests (12 neu in `tests/auswertung.test.ts`), Build; `tools/auswertung_probe.py` auf `?auswertung=demo`, `ui_faelle.py` (22 Bilder), `bedientest_probe.py` 15/15, `lobby_probe.py` 19/19 |

Prüfen: `python3 tools/auswertung_probe.py http://localhost:4173/` (Beispiel) bzw. mit `--erwartet plan.json` und der
Adresse eines Plenums nach einem Lauf; das ganze Drehbuch mit `python3 tools/e2e_drehbuch.py http://localhost:4173/ --tempo 5`.

## Offen

- Probe am Smartboard im Hörsaal: Lesbarkeit aus 4–8 m (Teamvergleich, Zeitleiste, Diagramm), Presenter (Bild ↓/↑).
  Die Ansicht ist für 1530 × 800 ausgelegt (Dienst-PC mit 125 %); Vollbild (F11) gibt etwas mehr Höhe.
- Mit der echten Datenbank (Firebase) einmal die ganze Auswertung nach einem Lauf öffnen (lädt alle fünf Protokolle).
- Notizen der SL 2 im echten Durchlauf: Reicht ✎ Notiz in der Teamansicht, oder braucht SL 2 eine eigene Notizleiste für
  alle Teams?
