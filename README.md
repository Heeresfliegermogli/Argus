# ARGUS – Planspiel „Auswirkungen von KI auf die Entscheidungsfindung“

Browserbasiertes Planspiel für den Lehrgang OL TrD (Politische Bildung, Militärethik). Fünf Teams à
drei bearbeiten parallel – jedes in einem eigenen Spielstand – Zielmeldungen des fiktiven KI-Systems
ARGUS: Aufklärung, Zielprüfung, Führung. Die Spielleitung steuert alle Teams aus einem Fenster.
**Übungslage – Gelände, Einheiten, Namen und Ereignisse sind frei erfunden.**

Stand: Änderungen B1–B12 nach dem Solo-Durchlauf (25.10.2026) – Startseite mit zwei Knöpfen, Codes aus drei
Zeichen, Rollen ohne G-Nummern, Spieluhr 00:00–25:00, „Ziel 1, 2, 3 …“, Einweisung als Folien, Drohnenbild
verschiebbar und schließbar, Drohne verfolgt das Ziel, Fahrwege und Vorschau der Verstärkung für die Spielleitung,
im Test ohne Lobby alle Rollen bedienbar (Eintrag in `claude/Entscheidungen.md`; intern heißen die Rollen weiter
`g1`/`g2`/`g3`, die Meldungen `M07`). Davor Schritt 8 „Auswertung mit Teamvergleich“ – Auflösung im Plenum über alle Teams: Teamvergleich der
Schlüssel- und Nebenfälle (wer an welcher Stufe entschieden hat), Kennzahlen je Team, Kernaussage zur Konfidenz,
Replay je Schlüsselfall mit Zeitleiste aller Teams, Kontrollkarte zum Durchscrubben und Drohnenbild, wie die Aufklärung es sah,
Notizen der SL 2, Export ohne Namen; Üben mit `?auswertung=demo`. Überblick: [`docs/AUSWERTUNG.md`](docs/AUSWERTUNG.md).
Davor Schritt 6b „Oberfläche neu“ ([`docs/UI.md`](docs/UI.md)) und Schritt 7 „Engine und Live-Lage“ – Trefferregel nach der Lage beim Einschlag mit Vorausrechnung
der Warnungen, Bewegung entlang der Routen, Tracking gemeldeter Ziele, Hintergrundgefecht H-01–H-12,
Zustandswechsel, „Meldung entfällt“, E-01 automatisch, Verstärkung V-1–V-5 im Menü der Spielleitung,
Effekte auf der Karte (Einschlag, LM-Flug, Leuchtspur, Feindartillerie, Wrack, Rauch). Überblick:
[`docs/ENGINE.md`](docs/ENGINE.md). Davor Schritt 4b „Sitzung, Lobby und Teams“
([`docs/SITZUNG.md`](docs/SITZUNG.md)), Ansichten: [`docs/UI.md`](docs/UI.md).

Inhalte: Szenario KRÄHE-01 **v2.0** (Schritt 2b, Konzept v2): russischer Angriff in fünf Phasen,
27 Meldungen (davon 7 zugweise), realistische Routen, Hintergrundgefecht, Verstärkungen V-1 bis V-5,
Wirkmittel-Spielwerte. Referenz der Engine: `tools/referenz/argus_lib.py` (`einschlag`, `wirkung`, `gt_bei`)
und `tools/referenz/simuliere_durchlauf.py`.

## Spielen

Seite: `https://heeresfliegermogli.github.io/Argus/`

1. **Spielleitung:** **Spielleitung** → Name, **Neue Sitzung anlegen** → Übersicht mit Code (drei Zeichen,
   z. B. `K7P`), **Plenum öffnen** für das Smartboard. Die zuletzt genutzte Sitzung bietet die Seite unter
   **Spielleitung** zum Fortsetzen an.
2. **Teilnehmer:** Seite öffnen, **Ich spiele mit**, Code eingeben, **Beitreten** → Lobby: Team erstellen (Name frei, 🎲
   schlägt einen vor) oder einem Team beitreten, Rolle wählen; zu zweit übernimmt eine Person zwei
   Rollen (**+ dazu**).
3. **Spielleitung:** **Spiel öffnen – alle Teams** (Ansichten mit Einweisung als Folien erscheinen), dann
   **▶ Uhr starten – alle**. „ansehen ›“ öffnet ein Team: Steuerung (Kontrollkarte mit Fahrwegen) oder Zuschauen
   bei Aufklärung, Zielprüfung, Führung (◉, nur lesen, blau umrandet).
4. **Zweite Spielleitung:** Startseite → **Spielleitung** → Bestehende Sitzung öffnen → Code → **als Spielleitung**; beobachtet und kann
   „Steuerung übernehmen“ (bei Ausfall nach 20 s von selbst). In der Teamansicht **✎ Notiz** je Fall.
5. **Auswertung:** Nach Spielende in allen Teams zeigt das Plenum die Auswertung (Bild ↓ / Presenter: Teamvergleich,
   Kennzahlen, Konfidenz, S3, S2, S1, S4, Schlussfrage; ca. 12 min). Die Spielleitung: **Auswertung ›** in der
   Übersicht. Üben ohne Spiel: `…/Argus/?auswertung=demo`. Siehe [`docs/AUSWERTUNG.md`](docs/AUSWERTUNG.md).

| Fenster | Adresse |
|---|---|
| Teilnehmer | `…/Argus/?sitzung=K7P` |
| Spielleitung | `…/Argus/?sitzung=K7P&rolle=sl` |
| Plenum (Smartboard) | `…/Argus/?sitzung=K7P&rolle=plenum` |
| Test ohne Lobby, allein in einem Fenster (Steuerung und alle drei Rollen bedienbar) | `…/Argus/?rolle=sl&raum=kraehe` |
| Test ohne Lobby, ein Fenster je Rolle | `…/Argus/?rolle=g1&raum=kraehe` (g1 Aufklärung, g2 Zielprüfung, g3 Führung, sl, plenum) |

Druckfassung der Einweisungskarten (mit den Folien je Rolle), A5 quer: `…/Argus/?druck=einweisung`. Bedientest mit
Unbeteiligten: [`docs/BEDIENTEST.md`](docs/BEDIENTEST.md).

Weitere Parameter: `sync=lokal` (alle Fenster an einem PC, ohne Netz), `transport=auto`
(WebSocket zulassen; Standard ist Long-Polling, weil WebSocket im Hörsaalnetz gesperrt ist),
`db=…` (andere Firebase-Datenbank), `szenario=…json`, `name=…` (Name der Spielleitung).

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

Sitzung, Lobby und Teams mit 16 echten Browserfenstern (5 Teams à 3 + Spielleitung, alles über die
Oberfläche) und die Aufgaben der Lobby nur über sichtbare Beschriftungen:

```bash
python3 tools/e2e_teams.py http://localhost:4173/                                # lokaler Sync
python3 tools/e2e_teams.py file://$PWD/dist/argus-offline.html                   # Offline-Datei
python3 tools/e2e_teams.py http://localhost:4173/ --sync firebase --transport auto \
  --db "http://localhost:5555?ns=argus-test"                                      # Firebase-Nachbildung mit Regeln
python3 tools/lobby_probe.py http://localhost:4173/                              # 20 Aufgaben Startseite und Lobby
```

Oberfläche in 1530 × 800 (seit 6b Karte als Arbeitsfläche; kein Rollbalken, nichts abgeschnitten, Bilder je Ansicht):

```bash
python3 tools/ui_bilder.py http://localhost:4173/ --bilder ui-bilder      # kurzer Ablauf bis S1
python3 tools/ui_faelle.py http://localhost:4173/ --bilder ui-faelle      # Schlüsselfälle, viele Marken, lange Texte
python3 tools/bedientest_probe.py http://localhost:4173/                  # 18 Aufgaben des Bedientests lösbar?
python3 tools/livelage_probe.py http://localhost:4173/ --bilder live      # Effekte, Tracking, Verstärkung, Bildrate
python3 tools/drohne_probe.py http://localhost:4173/ --bilder drohne      # Live-Drohnenbild: Ebenen, Schlüsselfälle, Kamera folgt, Bildrate
```

Das ganze Drehbuch mit fünf Teams (Schritt 7): `tests/durchlauf.test.ts` spielt die fünf Läufe von
`simuliere_durchlauf.py` (naiv, ideal, mit Verstärkungen) mit der echten Engine und vergleicht je Meldung;
im Browser mit 18 Fenstern (5 × 3, zwei Spielleiter, Plenum):

```bash
python3 tools/e2e_drehbuch.py http://localhost:4173/ --tempo 5 --bilder e2e-drehbuch   # ca. 12 min
```

Nach Änderungen an Szenario oder Simulation: `python3 tools/referenz/erzeuge_durchlauf.py`.

Die Regelprüfung (R2, R3, Einsatzbereich, Trefferregel) ist aus `argus_lib.py` portiert;
`tests/regeln.test.ts` vergleicht mit Referenzwerten aus `tools/referenz/erzeuge_referenz.py`.
Nach Änderungen an Szenario oder Regeln: `python3 tools/referenz/erzeuge_referenz.py`.

## Veröffentlichen

* **Spielseite:** Jeder Push auf `main` baut und veröffentlicht über GitHub Actions
  (`.github/workflows/pages.yml`). Einmalig: Repository → Settings → Pages → Source „GitHub Actions“.
* **Firebase-Regeln** (`firebase/database.rules.json`): Firebase-Konsole → Projekt `argus-sync-e9fbc`
  → Realtime Database → Regeln → Inhalt ersetzen → Veröffentlichen. Die Regeln ersetzen den
  Testmodus (läuft ca. 18.11.2026 ab): nur Sitzungen `argus/v1/sitzungen/<code>/…` (Code aus drei Zeichen
  `ACEFHJKMNPRTVWXY34679`, klein gespeichert, oder ein Raum des Tests ohne Lobby mit 4–32 Zeichen; Info, Teams,
  Anwesenheit, Host, Läufe je Team) und der Sync-Test (`rooms/…`) sind beschreibbar, eine Liste aller
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
