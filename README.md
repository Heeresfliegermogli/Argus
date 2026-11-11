# ARGUS – Planspiel „Auswirkungen von KI auf die Entscheidungsfindung“

Browserbasiertes Planspiel für den Lehrgang OL TrD (Politische Bildung, Militärethik). Sieben Teams (15 TT, je 2–3 Personen
an einem Laptop) bearbeiten parallel – jedes in einem eigenen Spielstand – Zielmeldungen des fiktiven KI-Systems ARGUS: je Meldung
eine Entscheidung (BEKÄMPFEN mit Mörser / LM / Kanone, ZURÜCKSTELLEN, ABLEHNEN) unter Zeitdruck. **Jeder Team-Laptop rechnet sein
Spiel selbst**; die Spielleitung startet alle Teams, sieht ihren Stand und wertet aus.
**Übungslage – Gelände, Einheiten, Namen und Ereignisse sind frei erfunden.**

**Neu (Liste J, 10.11.2026, Szenario 2.7):** Die ganze Karte (10 : 7) passt in jedes Fenster ab 1280 × 600 – links in voller Höhe,
Lagemeldungen als Einblendung oben links auf der Karte, rechts Wirkung unterwegs, Eingang (4 Zeilen), geöffnete Meldung mit großem
Drohnenbild, Wirkmittel als drei Kacheln, Knöpfe immer ganz unten; darunter wird gleichmäßig verkleinert. Geprüft in 1536 × 730
(Dienst-Laptop, Standard), 1366 × 650, 1530 × 800 und 1920 × 960 ([`docs/UI.md`](docs/UI.md)). Firebase-Regeln unverändert.

Stand davor: Änderungen H (09.11.2026, Szenario **2.6**) nach dem Test auf Bundeswehr-Laptops – eine Rolle „Zielbearbeitung“ je Team
statt Aufklärung/Zielprüfung/Führung, Tempo statt Arbeitsteilung (Sekunden je Entscheidung im Protokoll und in der Auswertung);
die Engine läuft im Browser des Teams (kein Desync mehr), das Netz trägt nur Lobby, Start, Statusmeldungen und den Upload des
Protokolls (ausfallsicher, mit Datei als Rückfall); Fast-Track entfällt, Phase 5 heißt „Krise“, weniger Artilleriemeldungen;
Einweisung als Übersicht mit Pfeilen auf der Oberfläche; LM treffen sichtbar das Fahrzeug, Countdown bis zum Einschlag, Feuer auf die
eigenen Panzer deutlich. **Die Firebase-Regeln müssen dafür neu veröffentlicht werden** ([`docs/SITZUNG.md`](docs/SITZUNG.md)).
Überblick: [`docs/SITZUNG.md`](docs/SITZUNG.md), [`docs/UI.md`](docs/UI.md), [`docs/ENGINE.md`](docs/ENGINE.md),
[`docs/AUSWERTUNG.md`](docs/AUSWERTUNG.md). Die Geschichte davor (A–F, Schritte 4b–8) steht in diesen Dateien und in
`claude/Entscheidungen.md`.

Inhalte: Szenario KRÄHE-01 **v2.6** (Konzept v2, geändert mit A1–A9, C1–C9, D, E-a, F und H): russischer Angriff in fünf Phasen,
36 Meldungen, realistische Routen, Hintergrundgefecht, eigene 1. Kp mit vier Kampfpanzern und Verlustmodell, Verstärkungen V-1 bis
V-5, Wirkmittel-Spielwerte. Referenz der Engine: `tools/referenz/argus_lib.py` (`einschlag`, `wirkung`, `gt_bei`),
`tools/referenz/verluste.py` und `tools/referenz/simuliere_durchlauf.py`.

## Spielen

Seite: `https://heeresfliegermogli.github.io/Argus/`

1. **Spielleitung:** **Spielleitung** → Name, **Neue Sitzung anlegen** → Übersicht mit Code (drei Zeichen,
   z. B. `K7P`), **Plenum öffnen** für das Smartboard. Die zuletzt genutzte Sitzung bietet die Seite unter
   **Spielleitung** zum Fortsetzen an.
2. **Teilnehmer:** je Team ein Laptop – Seite öffnen, **Ich spiele mit**, Code eingeben, **Beitreten** → Lobby: Namen, Teamname
   (🎲 schlägt einen vor), **Team anlegen** – dieser Laptop spielt für das Team. Ein zweites Fenster desselben Teams sieht nur zu.
3. **Spielleitung:** **Spiel öffnen – alle Teams** (am Team-Laptop erscheinen Ansicht und Einweisung), dann **▶ Start für alle**.
   „ansehen ›“ öffnet ein Team: Steuerung (Kontrollkarte) oder Zuschauen bei der Zielbearbeitung (◉, nur lesen).
4. **Zweite Spielleitung:** Startseite → **Spielleitung** → Bestehende Sitzung öffnen → Code → **als Spielleitung**; beobachtet und kann
   „Steuerung übernehmen“ (bei Ausfall nach 20 s von selbst). In der Teamansicht **✎ Notiz** je Fall.
5. **Auswertung:** Nach Spielende in allen Teams zeigt das Plenum die Auswertung (Bild ↓ / Presenter: Teamvergleich,
   Kennzahlen, Konfidenz, S3, S2, S1, S4, Preis des Abwartens, Schlussfrage; ca. 12 min). Die Spielleitung: **Auswertung ›** in der
   Übersicht; fehlt ein Protokoll (Netz), **Protokoll laden** mit der Datei, die das Team mit **⇩ Protokoll** gespeichert hat. Üben
   ohne Spiel: `…/Argus/?auswertung=demo`. Siehe [`docs/AUSWERTUNG.md`](docs/AUSWERTUNG.md).

| Fenster | Adresse |
|---|---|
| Teilnehmer | `…/Argus/?sitzung=K7P` |
| Spielleitung | `…/Argus/?sitzung=K7P&rolle=sl` |
| Plenum (Smartboard) | `…/Argus/?sitzung=K7P&rolle=plenum` |
| Test ohne Lobby, allein in einem Fenster (das Team steuert die Uhr oben rechts) | `…/Argus/?rolle=zb&raum=kraehe` |
| Test ohne Lobby, Team und Spielleitung | `…/Argus/?rolle=zb&raum=kraehe`, `…?rolle=sl&raum=kraehe` (auch `plenum`) |

Druckfassung der Einweisungskarten (Team und Spielleitung), A5 quer: `…/Argus/?druck=einweisung`. Bedientest mit
Unbeteiligten: [`docs/BEDIENTEST.md`](docs/BEDIENTEST.md).

Weitere Parameter: `sync=lokal` (alle Fenster an einem PC, ohne Netz), `transport=auto`
(WebSocket zulassen; Standard ist Long-Polling, weil WebSocket im Hörsaalnetz gesperrt ist),
`db=…` (andere Firebase-Datenbank), `szenario=…json`, `name=…` (Name der Spielleitung), `verzug=5000` (künstlicher Netzverzug in
ms je Richtung, nur für Tests und Vorführung).

**Rückfall ohne Netz (Variante C):** `argus-offline.html` (liegt auf der Seite und im Build) per
Doppelklick öffnen, Sitzung anlegen, weitere Fenster derselben Datei öffnen und den Code eingeben.

## Entwickeln

```bash
npm install
npm run dev            # http://localhost:5173/?sync=lokal (Startseite) oder ?rolle=sl&raum=test&sync=lokal
npm test               # Unit-, Sync- und Regeltests (Vitest)
npm run build          # dist/ (Webseite) und dist/argus-offline.html (eine Datei)
```

Auswertung (Schritt 8) wie am Smartboard durchgehen – mit dem Beispiel oder dem Plenum einer Sitzung:

```bash
python3 tools/auswertung_probe.py http://localhost:4173/ --bilder auswertung-probe       # Beispiel (?auswertung=demo)
npx vite-node tools/auswertung_demo.ts                                                   # Beispieldaten neu erzeugen
```

Ende-zu-Ende-Test mit vier echten Browserfenstern im Direktaufruf (Python + Playwright):

```bash
npx vite preview --port 4173 &
python3 tools/e2e_vier_fenster.py http://localhost:4173/                       # lokaler Sync
python3 tools/e2e_vier_fenster.py file://$PWD/dist/argus-offline.html          # Offline-Datei
npm --prefix tools/firebase-testserver install && node tools/firebase-testserver/start.js &
python3 tools/e2e_vier_fenster.py http://localhost:4173/ --sync firebase --transport auto \
  --db "http://localhost:5555?ns=argus-test"                                   # Firebase-Nachbildung mit Regeln
```

Sitzung, Lobby und Teams mit echten Browserfenstern (7 Team-Laptops, ein Zuschauer, Spielleitung, Plenum – alles über die
Oberfläche; mit `--verzug 5000` über die Firebase-Nachbildung mit künstlichem Netzverzug) und die Aufgaben der Lobby nur über
sichtbare Beschriftungen:

```bash
python3 tools/e2e_teams.py http://localhost:4173/                                # lokaler Sync
python3 tools/e2e_teams.py file://$PWD/dist/argus-offline.html                   # Offline-Datei
python3 tools/e2e_teams.py http://localhost:4173/ --sync firebase --transport auto \
  --db "http://localhost:5555?ns=argus-test" --verzug 5000                        # Firebase-Nachbildung mit Regeln und 5 s Verzug
python3 tools/neuoeffnen_probe.py http://localhost:4173/                         # Liste K: Tab schließen/neu öffnen, übernehmen, freigeben, beenden
python3 tools/neuoeffnen_probe.py http://localhost:4173/ --sync firebase --transport auto \
    --db "http://localhost:5555?ns=argus-k"                                      # dasselbe gegen die Firebase-Nachbildung mit Regeln
python3 tools/lobby_probe.py http://localhost:4173/                              # 20 Aufgaben Startseite und Lobby
```

Oberfläche seit Liste J in 1536 × 730 (Dienst-Laptop) und den Prüfgrößen 1366 × 650, 1530 × 800, 1920 × 960 (`tools/pruefgroessen.py`:
kein Rollbalken, nichts abgeschnitten, ganze Karte, Knöpfe ganz und an fester Stelle, Schrift ≥ 12 px; `--groesse 1366x650`,
`--alle-groessen`):

```bash
python3 tools/ui_bilder.py http://localhost:4173/ --bilder ui-bilder      # kurzer Ablauf bis S1
python3 tools/ui_faelle.py http://localhost:4173/ --bilder ui-faelle      # Schlüsselfälle, voller Eingang, Countdown, lange Notiz
python3 tools/bedientest_probe.py http://localhost:4173/                  # 13 Aufgaben des Bedientests lösbar?
python3 tools/verluste_probe.py http://localhost:4173/ --bilder verluste  # vier Panzer, Beschuss sichtbar, Lagemeldungen, Preis
python3 tools/livelage_probe.py http://localhost:4173/ --bilder live      # Effekte, Tracking, Verstärkung, Bildrate
python3 tools/drohne_probe.py http://localhost:4173/ --bilder drohne      # Live-Drohnenbild: Ebenen, Schlüsselfälle, Kamera folgt, Bildrate
```

Das ganze Drehbuch mit fünf Teams: `tests/durchlauf.test.ts` spielt die fünf Läufe von `simuliere_durchlauf.py` (naiv 20 s,
ideal 35 s je Entscheidung, mit Verstärkungen) mit der echten Engine und vergleicht je Meldung; im Browser mit 8 Fenstern
(5 Team-Laptops, zwei Spielleiter, Plenum):

```bash
python3 tools/e2e_drehbuch.py http://localhost:4173/ --tempo 5 --bilder e2e-drehbuch   # ca. 6 min
```

Lasttest (7 Team-Laptops + Spielleitung + Plenum über Firebase bzw. die Nachbildung, mit Verzug und Trennung):
`…/Argus/lasttest.html`, Probe `tools/lasttest_probe.py` (siehe `tools/lasttest/README.md`).

Nach Änderungen an Szenario oder Simulation: `python3 tools/referenz/erzeuge_durchlauf.py`.

Die Regelprüfung (R2, R3, Einsatzbereich, Trefferregel) ist aus `argus_lib.py` portiert;
`tests/regeln.test.ts` vergleicht mit Referenzwerten aus `tools/referenz/erzeuge_referenz.py`.
Nach Änderungen an Szenario oder Regeln: `python3 tools/referenz/erzeuge_referenz.py`.

## Veröffentlichen

* **Spielseite:** Jeder Push auf `main` baut und veröffentlicht über GitHub Actions
  (`.github/workflows/pages.yml`). Einmalig: Repository → Settings → Pages → Source „GitHub Actions“.
* **Firebase-Regeln** (`firebase/database.rules.json`): Firebase-Konsole → Projekt `argus-sync-e9fbc`
  → Realtime Database → Regeln → Inhalt ersetzen → Veröffentlichen. **Seit 2.6 neu zu veröffentlichen** (Rolle `zb`, Pfad
  `status/<team>`). Die Regeln ersetzen den Testmodus (läuft ca. 18.11.2026 ab): nur Sitzungen `argus/v1/sitzungen/<code>/…`
  (Code aus drei Zeichen `ACEFHJKMNPRTVWXY34679`, klein gespeichert, oder ein Raum des Tests ohne Lobby mit 4–32 Zeichen; Info,
  Teams, Status, Anwesenheit, Host, Läufe je Team) und der Sync-Test (`rooms/…`) sind beschreibbar, eine Liste aller
  Sitzungen ist nicht lesbar, Protokoll und Aktionen nur anhängbar, Formate werden geprüft.

## Inhalte pflegen

Szenario, Karte, Kataloge und Regeln liegen in `public/daten/` und werden zur Laufzeit geladen
(neue Daten brauchen keinen neuen Code). Die Python-Werkzeuge aus Schritt 2 (Drehbuch, Mappe,
Simulation) arbeiten mit derselben Struktur im Projekt (`claude/daten/`); bei Änderungen beide
Stände abgleichen.

## Assets (Karte, Drohnenbilder, Sprites, Effekte)

Alle Bilder erzeugt `tools/assets/gen_assets.py` aus `public/daten/` (prozedural, fiktiv, fester Seed)
und legt sie mit `manifest.json` in `public/assets/` ab. Nach Änderungen an Szenario, Karte oder
Fahrzeugkatalog neu erzeugen:

```bash
pip install -r tools/assets/requirements.txt   # numpy, scipy, Pillow
npm run assets                                  # ca. 2,5 min, Gelände wird zwischengespeichert
npm test                                        # prüft u. a.: jedes Ziel hat Bild und Sprite
```

Inhalt, Manifest und Einbindung: [`docs/ASSETS.md`](docs/ASSETS.md).

## Aufbau

Siehe [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md): Module, Sync-Datenmodell, Protokollformat,
Ablauf einer Meldung; Sitzung, Teams und Host für mehrere Teams: [`docs/SITZUNG.md`](docs/SITZUNG.md).
