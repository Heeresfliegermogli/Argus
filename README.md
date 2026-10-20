# ARGUS – Planspiel „Auswirkungen von KI auf die Entscheidungsfindung“

Browserbasiertes Planspiel für den Lehrgang OL TrD (Politische Bildung, Militärethik). Drei Gruppen
bearbeiten Zielmeldungen des fiktiven KI-Systems ARGUS: G1 Aufklärung, G2 Zielprüfung, G3 Führung.
Die Spielleitung steuert Uhr und Ablauf. **Übungslage – Gelände, Einheiten, Namen und Ereignisse sind
frei erfunden.**

Stand: Schritt 4 „Architektur & Grundgerüst“ (Ansichten funktional, Gestaltung, Karte und Bilder folgen).

## Spielen

Seite: `https://heeresfliegermogli.github.io/Argus/` – dort Raum und Rolle wählen, oder direkt:

| Rechner | Adresse |
|---|---|
| Spielleitung | `…/Argus/?rolle=sl&raum=kraehe` |
| G1 Aufklärung | `…/Argus/?rolle=g1&raum=kraehe` |
| G2 Zielprüfung | `…/Argus/?rolle=g2&raum=kraehe` |
| G3 Führung | `…/Argus/?rolle=g3&raum=kraehe` |

Die erste Spielleitung im Raum übernimmt die Steuerung und legt ein Spiel an. Eine zweite Spielleitung
(z. B. SL 2 mit `&name=SL%202`) beobachtet und kann bei Ausfall „Steuerung übernehmen“.

Weitere Parameter: `sync=lokal` (alle Fenster an einem PC, ohne Netz), `transport=auto`
(WebSocket zulassen; Standard ist Long-Polling, weil WebSocket im Hörsaalnetz gesperrt ist),
`db=…` (andere Firebase-Datenbank), `szenario=…json`.

**Rückfall ohne Netz (Variante C):** `argus-offline.html` (liegt auf der Seite und im Build) per
Doppelklick öffnen, Rollen wie oben über die Startseite oder „Alle vier Fenster öffnen“.

## Entwickeln

```bash
npm install
npm run dev            # http://localhost:5173/?rolle=sl&raum=test&sync=lokal
npm test               # Unit-, Sync- und Regeltests (Vitest)
npm run build          # dist/ (Webseite) und dist/argus-offline.html (eine Datei)
```

Ende-zu-Ende-Test mit vier echten Browserfenstern (Python + Playwright):

```bash
npx vite preview --port 4173 &
python3 tools/e2e_vier_fenster.py http://localhost:4173/                       # lokaler Sync
python3 tools/e2e_vier_fenster.py file://$PWD/dist/argus-offline.html          # Offline-Datei
npm --prefix tools/firebase-testserver install && node tools/firebase-testserver/start.js &
python3 tools/e2e_vier_fenster.py http://localhost:4173/ --sync firebase --transport auto \
  --db "http://localhost:5555?ns=argus-test"                                   # Firebase-Nachbildung mit Regeln
```

Die Regelprüfung (R2, R3, Einsatzbereich, Trefferregel) ist aus `argus_lib.py` portiert;
`tests/regeln.test.ts` vergleicht mit Referenzwerten aus `tools/referenz/erzeuge_referenz.py`.
Nach Änderungen an Szenario oder Regeln: `python3 tools/referenz/erzeuge_referenz.py`.

## Veröffentlichen

* **Spielseite:** Jeder Push auf `main` baut und veröffentlicht über GitHub Actions
  (`.github/workflows/pages.yml`). Einmalig: Repository → Settings → Pages → Source „GitHub Actions“.
* **Firebase-Regeln** (`firebase/database.rules.json`): Firebase-Konsole → Projekt `argus-sync-e9fbc`
  → Realtime Database → Regeln → Inhalt ersetzen → Veröffentlichen. Die Regeln ersetzen den
  Testmodus (läuft ca. 18.11.2026 ab): nur der Raum-Bereich `argus/v1/raeume/…` und der Sync-Test
  (`rooms/…`) sind beschreibbar, Protokoll und Aktionen nur anhängbar, Formate werden geprüft.

## Inhalte pflegen

Szenario, Karte, Kataloge und Regeln liegen in `public/daten/` und werden zur Laufzeit geladen
(neue Daten brauchen keinen neuen Code). Die Python-Werkzeuge aus Schritt 2 (Drehbuch, Mappe,
Simulation) arbeiten mit derselben Struktur im Projekt (`claude/daten/`); bei Änderungen beide
Stände abgleichen.

## Aufbau

Siehe [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md): Module, Sync-Datenmodell, Protokollformat,
Ablauf einer Meldung.
