# Lasttest-Seite (Firebase)

`…/Argus/lasttest.html` spielt gegen die Firebase-Datenbank eine echte Sitzung durch: n Teams à 3 Bot-Spieler
(G1, G2, G3, **je eine eigene Firebase-Verbindung**, Standard Long-Polling wie im Hörsaal) und ein Host
(Spielleitung, führt die Engine aller Teams). Jeder Teilnehmer ist eine eigene `Sitzung` der App
(`src/sitzung/sitzung.ts`) – Lobby, Anwesenheit, Teams, Host, Protokolle wie in den Fenstern im Hörsaal, nur ohne
Oberfläche. Die Bots spielen das Drehbuch der fünf Modellteams wie `tools/e2e_drehbuch.py` (Plan aus
`tests/modellteam.ts`, im Browser einmal ohne Netz durchgespielt); die Spielleitung spielt die Verstärkungen ein.

Gemessen wird der Weg **Klick → Protokoll** (Bot sendet → Ereignis steht im Protokoll seines eigenen Fensters,
über seine eigene Verbindung), je Team und je 5 min Spielzeit, dazu die Teilstrecken (Server bestätigt, beim Host,
Verarbeitung, zurück, bei allen im Team, Verteilung jedes Ereignisses). Alles läuft in einer Seite mit einer Uhr
(`performance.now()`), daher ohne Uhrenversatz. Ergebnis auf einer Seite in 1530 × 800 zum Abfotografieren,
Rohdaten als JSON.

Adresszeile (optional): `db=…`, `transport=lp|auto` (auto = nur WebSocket), `tempo=1|2|5|10|20`, `teams=1…5`,
`beobachter=1` (Plenum und SL 2 verbinden sich zusätzlich), `aufteilung=alles|host|beitreten`, `hier=1,2`,
`code=KRAEHE-7Q`, `start=1`.

**Verteilt:** Hält ein Browser nicht alle Verbindungen gleichzeitig offen (Long-Polling über HTTP/1.1: höchstens 6
je Server), legt ein Gerät die Sitzung an und führt den Host (`aufteilung=host&hier=1`), weitere Geräte treten mit
dem Code bei und spielen die übrigen Teams (`code=…&hier=2,3`). Jedes Gerät misst seine eigenen Bots.

## Dateien

| Datei | Inhalt |
|---|---|
| `lasttest.html`, `main.ts` | Seite, Einstellungen, Start, Anzeige |
| `lauf.ts` | Ablauf: Sitzung anlegen, Host, Bots, Lobby, Spiel öffnen, Tempo, Start, Bots nach Plan, Abschluss |
| `messung.ts` | `MessAdapter` (= `FirebaseAdapter` mit Zeitstempeln), `Messung`, Kennzahlen |
| `plan.ts` | Plan der Modellpersonen (wie `tools/drehbuch_plan.ts`) |
| `auswertung.ts`, `ansicht.ts`, `stil.css` | Auswertung und Darstellung |
| `vite.config.ts` | baut eine Einzeldatei nach `public/lasttest.html` |

## Bauen und prüfen

```bash
npx tsc -p tools/lasttest                                   # Typprüfung
npx vite build --config tools/lasttest/vite.config.ts      # → public/lasttest.html (der normale Build kopiert sie nach dist/)
node tools/firebase-testserver/start.js &                   # Nachbildung (nur WebSocket)
python3 -m http.server 4180 --directory public &
python3 tools/lasttest_probe.py http://localhost:4180/ --tempo 20 --bild lasttest.png            # 5 Teams, eine Seite
python3 tools/lasttest_probe.py http://localhost:4180/ --tempo 20 --verteilt 2                   # zwei „Geräte“
```

`public/lasttest.html` enthält Engine, Sitzung und Sync-Adapter zum Zeitpunkt des Bauens. Nach Änderungen an
`src/` (Engine, Sitzung, Sync) oder am Szenario neu bauen und mit committen.
