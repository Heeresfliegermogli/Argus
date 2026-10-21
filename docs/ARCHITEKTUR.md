# ARGUS – Architektur und Datenformate (Stand Schritt 4b)

Inhalte, Spiellogik, Netz und Ansichten sind getrennte Module. Neue Lagen, Karten, Fahrzeuge oder
Wirkmittel sind JSON-Dateien, kein Code. Zwischen Variante A (Firebase) und C (ein PC, mehrere
Fenster) wird nur der Sync-Adapter getauscht. Seit Schritt 4b spielen mehrere Teams in einer Sitzung,
jedes in einem eigenen Spielstand (Lauf); Sitzung, Lobby und Teams: [`SITZUNG.md`](SITZUNG.md).

```
public/daten/*.json ──lädt──▶ Inhalte (src/inhalte)
                                 │
Ansicht G1/G2/G3/SL ──Aktion──▶ Sync-Adapter ──▶ Host des Teams (im Fenster ──Ereignis──▶ Protokoll
  (Sicht: ein Team,             (src/sync)        der steuernden SL, je Team       des Teams
   eine Rolle)                                    einer, ein Takt) (src/engine)        │
        ▲                                                                              │
        └──── Spielstand = reduce(Protokoll) (src/kern/zustand.ts) ◀── Sync-Adapter ◀──┘
```

## Module

| Ordner | Inhalt |
|---|---|
| `src/inhalte/` | Typen der JSON-Dateien (`typen.ts`), Laden (`laden.ts`, Quelle `fetch` oder eingebettet), Konsistenzprüfung (`pruefen.ts`) |
| `src/kern/` | Protokollformat (`ereignisse.ts`), Spielstand als reine Funktion des Protokolls (`zustand.ts`), Spieluhr (`uhr.ts`), Geometrie und Einsatzregeln aus `argus_lib.py` portiert (`geometrie.ts`, `regeln.ts`), wer was sieht (`sichten.ts`), Klartext je Ereignis (`beschreibung.ts`) |
| `src/engine/` | Host: prüft Aktionen (`aktionen.ts`), spielt den Zeitplan ab (`ablauf.ts`), vergibt Laufnummern und schreibt (`host.ts`) |
| `src/sync/` | Schnittstelle (`adapter.ts`), Firebase RTDB (`firebase.ts`), lokal per localStorage + BroadcastChannel + storage-Ereignis (`lokal.ts`), Auswahl (`fabrik.ts`) |
| `src/sitzung/` | `sitzung.ts`: ein Fenster in einer Sitzung (Lobby, Teams, Host-Bewerbung); `spiel.ts`: Spielstand eines Teams (Protokoll, Aktionen, im Host-Fenster mit Host); `sicht.ts`: ein Team aus Sicht einer Rolle für die Ansichten (auch nur lesen) |
| `src/kern/sitzungen.ts`, `src/kern/uebersicht.ts` | Codes, Teamnamen und -farben, Rollen im Team; Übersicht der Spielleitung je Team (Eingang, Schlüsselfälle live) |
| `src/engine/taktgeber.ts` | gemeinsamer Takt aller Team-Hosts im Fenster der Spielleitung |
| `src/kern/lagebild.ts` | was eine Rolle auf der Lagekarte sieht: Zielmeldungen (G2/G3) oder Kontrollkarte (SL/Plenum), reine Funktion von Inhalten, Spielstand und Lagezeit |
| `src/karte/` | Lagekarte mit PixiJS (`lagekarte.ts`, wird bei Bedarf nachgeladen), taktische Zeichen nach APP-6/MIL-STD-2525C mit milsymbol (`zeichen.ts`) |
| `src/ansichten/` | Preact-Ansichten je Rolle (G1, G2, G3, SL, Plenum), Eintrag in `register.tsx`; Einweisungskarten (`einweisung.tsx`); Startseite, Lobby, Teilnehmer-Fenster mit Doppelrolle, Übersicht und Fenster der Spielleitung (`start.tsx`, `lobby.tsx`, `tt-fenster.tsx`, `uebersicht.tsx`, `sl-fenster.tsx`); gemeinsam: Drohnenbild mit Lupe, Lagekarte als Baustein, Bausteine, Rahmen. Überblick: [`UI.md`](UI.md) |
| `src/assets/` | Asset-Manifest (`typen.ts`), Zugriff (`assets.ts`: Manifest, Bildadresse, Atlas, Vorladen), Quelle Netz oder eingebettet (Alias `@assetquelle`) |
| `public/assets/` | Bilder und Manifest aus `tools/assets/gen_assets.py` (Karte, Drohnenbilder, Sprites, Effekte), siehe [`ASSETS.md`](ASSETS.md) |

## Grundsätze

* **Ein gültiger Spielstand je Team.** Nur der Host – das Fenster der steuernden Spielleitung, dort je
  Team einer – schreibt ins Protokoll des Teams. Alle anderen Fenster schicken Aktionen. Der Host prüft Rechte und Stand; was nicht passt,
  wird als `aktion_abgelehnt` protokolliert. Damit steht **jede Aktion im Protokoll**.
* **Stand = Protokoll.** Jedes Fenster berechnet den Spielstand selbst mit `anwenden()` aus dem
  Protokoll. Gleiches Protokoll ⇒ gleicher Stand (Fingerabdruck `fingerabdruck()` zum Vergleichen).
  Ein neu geladenes Fenster liest das Protokoll und ist sofort auf Stand.
* **Spieluhr ohne Taktsignal.** Uhr-Ereignisse halten fest: ab Serverzeit `ts` gilt Spielzeit `t_s`,
  läuft ja/nein, Tempo. Jedes Fenster rechnet die Uhr selbst (Firebase: lokale Uhr + gemessener
  Versatz zur Serverzeit).
* **Ausfallsicher.** Fällt der Host aus, übernimmt eine andere SL („Steuerung übernehmen“ oder
  automatisch nach 20 s ohne Puls). Der neue Host baut den Stand aus dem Protokoll auf; verarbeitete
  Aktionen erkennt er an ihrer Kennung, der Zeitplan ist eine reine Funktion von Stand und Uhr.
* **Läufe bleiben erhalten.** „Neues Spiel“ beginnt einen neuen Lauf; Testlauf und echter Durchlauf
  bleiben für die Auswertung gespeichert.

## Datenmodell im Sync (Firebase-Pfad `argus/v1/sitzungen/<code>/`)

```
info                                   { code, szenario, version, titel, erstellt, von }  einmal angelegt
host                                   { id, name, puls }  steuernde Spielleitung (eine für alle Teams)
anwesenheit/<client>                   { client, art (tt|sl|plenum), name, puls, version, team? }
teams/<team>                           { name, farbe, erstellt, lauf?, spieler/<client> { name, rollen, seit } }
laeufe/<team>/<lauf>/protokoll/e000001 Ereignisse des Teams (nur anhängen)
laeufe/<team>/<lauf>/aktionen/<id>     Aktionen der Ansichten des Teams (nur anhängen)
```

`lauf` am Team ist der aktuelle Lauf (z. B. `20261125-0931-k3x9`); „Neues Spiel“ setzt einen neuen,
alte bleiben für die Auswertung. Der Direktaufruf `?rolle=…&raum=kraehe` ist eine Sitzung `kraehe`
mit einem Team `traum`. Der lokale Adapter legt dieselbe Struktur im localStorage ab
(`argus:v1:s:<code>:…`). Bis Schritt 6 lag alles unter `argus/v1/raeume/<raum>/` ohne Teams.

## Protokollformat

Ein **Ereignis**:

```json
{ "seq": 12, "typ": "g1_entscheid", "ts": 1795600000000, "t_s": 512.4,
  "von": { "rolle": "g1", "client": "k3x9ab", "name": "G1 Aufklärung" },
  "aktion": "-OdQ…", "ts_aktion": 1795599999700,
  "daten": { "meldung": "M07", "entscheid": "ablehnen", "vermerk": "kalt, keine Spuren" } }
```

`seq` lückenlos ab 1, `ts` Serverzeit (ms), `t_s` Spielzeit (s) – bei Aktionen die Spielzeit des
Klicks, nicht die der Verarbeitung. `aktion`/`ts_aktion` nur bei Ereignissen aus Aktionen.

| typ | daten | entsteht durch |
|---|---|---|
| `spiel_neu` | lauf, szenario, version, titel | Host beim Laufbeginn (seq 1) |
| `uhr` | befehl (start/pause/tempo/setzen), laeuft, t_s, tempo | SL, Spielende |
| `meldung` | meldung, fast_track?, manuell?, entfaellt? | Zeitplan oder SL „jetzt“ |
| `g1_entscheid` | meldung, entscheid (annehmen/ablehnen), vermerk? | G1 |
| `g2_empfehlung` | meldung, empfehlung (bekaempfen/beobachten/nicht_bekaempfen), wirkmittel?, begruendung?, warnungen? | G2; Warnungen (R2, R3, Einsatzbereich) berechnet der Host |
| `g3_entscheid` | meldung, entscheid (freigabe/ablehnen/zurueck), bemerkung?, wirkmittel?, warnungen? | G3; bei Freigabe Warnungen zur Freigabezeit |
| `wirkung` | meldung, wirkmittel, pos, t_freigabe, getroffen[] | Zeitplan nach Vorlaufzeit; Treffer nach der Lage zur Freigabe (Szenario 2.0 beschreibt die Lage beim Einschlag; Umsetzung in Schritt 6b/7) |
| `inject` | inject, manuell? | Zeitplan (fest und bedingt) oder SL |
| `inject_quittiert` | inject | G3 („gelesen“) |
| `lagehinweis` | text, an [g1, g2] | G3 |
| `fast_track` | an | G3 oder SL |
| `notiz` | text | SL (Beobachtung) |
| `spielende` | grund | Zeitplan (Spielzeit abgelaufen) |
| `aktion_abgelehnt` | aktionstyp, grund | Host, wenn eine Aktion nicht passt |

Unbekannte Typen (aus späteren Versionen) zählen für `seq`, ändern den Stand aber nicht.

Eine **Aktion**: `{ id, typ, von, ts, daten }`. Typen: die Spielaktionen oben plus `uhr`,
`meldung_ausloesen`, `inject_ausloesen` (nur SL). Rechte stehen in `RECHTE` (`ereignisse.ts`).

## Ablauf einer Meldung

`meldung` → Stufe **g1** (bei Fast-Track direkt **g2**) → ANNEHMEN: **g2** / ABLEHNEN: erledigt
→ BEKÄMPFEN: **g3** / BEOBACHTEN: bleibt bei g2 (zurückgestellt) / NICHT BEKÄMPFEN: erledigt
→ FREIGABE: **wirkung** (Bestand −1) / ZURÜCK: g2 / ABLEHNEN: erledigt → `wirkung` → erledigt.

## Zeitplan (Umfang Schritt 4)

Meldungen nach `t_s` (mit Fast-Track-Weiche; „entfällt“, wenn ein Ziel schon zerstört ist), feste
Injects, bedingte Injects (`freigabe`, `freigabe_mit_zivil`, `keine_freigabe_bis`), Wirkung nach
Vorlaufzeit, Spielende. **Offen für Schritt 7:** Skriptereignis E-01 (polnischer Gegenangriff),
„entfällt bei G3“, Bewegung und Animation.

## Sichten

G1 sieht die volle Meldung (Bild, ARGUS, Sensordaten, Kleingedrucktes, Bildalter). G2 und G3 sehen nur
die Zielmeldung (Meldung, Ziel-Nr., Feinlage, ARGUS-Klasse, Konfidenz, Empfehlung, Vermerk G1). Injects
an G3 sieht nur G3. Die Trennung ist eine Frage der Anzeige: Alle Rechner laden dieselben Dateien.
Auf der Lagekarte sehen G2 und G3 die Zielmeldungen an der gemeldeten Position mit dem Zeichen der
ARGUS-Klasse; Ground Truth, Personen und ungemeldete Ziele zeigt nur die Kontrollkarte (Spielleitung,
Plenum nach Spielende) – festgelegt in `src/kern/lagebild.ts`, geprüft in `tests/lagebild.test.ts`.
