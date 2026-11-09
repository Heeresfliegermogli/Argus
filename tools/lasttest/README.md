# Lasttest-Seite (Firebase) – seit 2.6

`…/Argus/lasttest.html` spielt gegen die Firebase-Datenbank eine echte Sitzung durch, so wie sie seit Änderung H läuft:
**n Team-Laptops** (Standard 7, je eine eigene Firebase-Verbindung, jeder rechnet sein Spiel selbst), die **Spielleitung**
(legt die Sitzung an, öffnet und startet die Spiele, liest Protokolle und Statusmeldungen) und das **Plenum** (liest mit).
Jeder Teilnehmer ist eine eigene `Sitzung` der App (`src/sitzung/sitzung.ts`) – Lobby, Anwesenheit, Teams, Upload in Stücken,
Statusmeldungen wie in den Fenstern im Hörsaal, nur ohne Oberfläche. Je Team-Laptop entscheidet ein Bot zur geplanten Spielzeit
(Plan: die Modellteams aus `tests/modellteam.ts`, im Browser einmal ohne Netz durchgespielt; naiv/ideal mit 20–35 s je Entscheidung).

Um jede Verbindung liegt ein `VerzugAdapter` (`src/sync/verzug.ts`): **künstlicher Netzverzug** je Richtung (ab „Start für alle“)
und eine **Trennung** der Team-Laptops für eine Zeit (Nachweis H1.6).

Gemessen wird, was H1 verspricht – auf einer Seite in 1530 × 800 zum Abfotografieren, Rohdaten als JSON:

| Ampel | Messwert |
|---|---|
| **Spiel der Teams flüssig** | Klick (Bot entscheidet am Laptop) → Ereignis im eigenen Spielstand; ohne Netz, daher Millisekunden – auch bei Verzug und Trennung. Dazu der Verzug der Ereignisschleife der Seite während des Spiels |
| **Spielleitung holt auf** | je Ereignis: Entstehen am Laptop → bei der Spielleitung (und beim Plenum); alle 500 ms Alter der letzten Statusmeldung und Rückstand des Protokolls; bei Spielende vollständig (gleicher Stand wie am Laptop) |
| **Auswertung vollständig** | Auswertung der Spielleitung aus den hochgeladenen Protokollen: alle Teams mit Spielende, Ausgang je Fall wie ohne Netz |

Dazu: Startsignal (Klick der Spielleitung → Uhr läuft am Laptop) und die Spanne der Spielzeiten danach (H1.4: ≤ 1–2 s).

Adresszeile (optional): `db=…`, `transport=lp|auto` (auto = nur WebSocket), `tempo=1|2|5|10|20`, `teams=1…7`, `plenum=0`,
`verzug=5` (s je Richtung), `trennen=30,20` (Team-Laptops ab 30 s nach dem Start für 20 s trennen), `aufteilung=alles|sl|beitreten`,
`hier=1,2`, `code=K7P`, `start=1`.

**Verteilt:** Hält ein Browser nicht alle Verbindungen gleichzeitig offen (Long-Polling über HTTP/1.1: höchstens 6 je Server), legt
ein Gerät die Sitzung an und führt Spielleitung und Plenum (`aufteilung=sl&hier=1`), weitere Geräte treten mit dem Code bei und führen
die übrigen Team-Laptops (`code=…&hier=2,3`). Jedes Gerät misst seine eigenen Laptops; die Spielleitung misst Upload und Status aller.

## Dateien

| Datei | Inhalt |
|---|---|
| `lasttest.html`, `main.ts` | Seite, Einstellungen, Start, Anzeige |
| `lauf.ts` | Ablauf: Sitzung anlegen, Spielleitung, Team-Laptops (Lobby), Plenum, Spiel öffnen, Tempo, Verzug, Start, Bots nach Plan, Trennung, Aufholen, Abgleich, Auswertung |
| `messung.ts` | `Messung` (Klick → Stand, Ankunft je Ereignis, Proben), `MessAdapter` (= `FirebaseAdapter` mit Verbindungsstand) |
| `plan.ts` | Modellteams und Plan je Team (Entscheidungen, angeklickte Lagemeldungen, Ausgang ohne Netz) |
| `auswertung.ts`, `ansicht.ts`, `stil.css` | Auswertung und Darstellung |
| `vite.config.ts` | baut eine Einzeldatei nach `public/lasttest.html` |

## Bauen und prüfen

```bash
npx tsc -p tools/lasttest                                   # Typprüfung
npx vite build --config tools/lasttest/vite.config.ts      # → public/lasttest.html (der normale Build kopiert sie nach dist/)
node tools/firebase-testserver/start.js &                   # Nachbildung (nur WebSocket, Regeln aktiv)
python3 -m http.server 4180 --directory public &
python3 tools/lasttest_probe.py http://localhost:4180/ --tempo 10                                   # 7 Teams + SL + Plenum
python3 tools/lasttest_probe.py http://localhost:4180/ --tempo 10 --verzug 5 --trennen 30,20        # 5 s Verzug, 20 s getrennt
python3 tools/lasttest_probe.py http://localhost:4180/ --tempo 10 --verzug 15 --trennen 30,60       # 15 s Verzug, 60 s getrennt
python3 tools/lasttest_probe.py http://localhost:4180/ --tempo 10 --verteilt 2                      # zwei „Geräte“
```

`public/lasttest.html` enthält Engine, Sitzung und Sync-Adapter zum Zeitpunkt des Bauens. Nach Änderungen an `src/` (Engine,
Sitzung, Sync) oder am Szenario neu bauen und mit committen.
