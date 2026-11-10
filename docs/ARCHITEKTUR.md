# ARGUS – Architektur und Datenformate (Stand Szenario 2.6)

Inhalte, Spiellogik, Netz und Ansichten sind getrennte Module. Neue Lagen, Karten, Fahrzeuge oder
Wirkmittel sind JSON-Dateien, kein Code. Zwischen Variante A (Firebase) und C (ein PC, mehrere
Fenster) wird nur der Sync-Adapter getauscht. Mehrere Teams spielen in einer Sitzung, jedes in einem
eigenen Spielstand (Lauf); Sitzung, Lobby und Teams: [`SITZUNG.md`](SITZUNG.md).

**Seit 2.6 (Änderungen H) rechnet jeder Team-Laptop sein Spiel selbst.** Die Engine des Teams läuft im Browser des Teams;
eine Entscheidung ist ohne Netz sofort im Spielstand. Das Netz trägt nur noch Lobby, die Aktionen der Spielleitung (Start,
Pause, Tempo, Spielzeit, Reserve, Notiz), die Statusmeldung je Team und den Upload des Protokolls.

```
public/daten/*.json ──lädt──▶ Inhalte (src/inhalte)
                                 │
Team-Laptop:  Ansicht Zielbearbeitung ──Entscheidung──▶ Host des Teams ──Ereignis──▶ Ablage (localStorage) ──Upload──▶ Protokoll im Netz
              (Sicht: ein Team)                         (src/engine, im           │                       in Stücken        │
                    ▲                                    Browser des Teams)        ▼                                         │
                    └──── Spielstand = reduce(Protokoll) (src/kern/zustand.ts) ◀───┘   Statusmeldung alle ~5 s ──▶ status/<team>
                                                               ▲                                                            │
Spielleitung: Übersicht, Teamansicht ──Aktion (Start …)── Netz ┘     ◀── Statusmeldungen, hochgeladene Protokolle (folgen) ─┘
Plenum, Zuschauer: folgen dem hochgeladenen Protokoll (mit Verzug)
```

## Module

| Ordner | Inhalt |
|---|---|
| `src/inhalte/` | Typen der JSON-Dateien (`typen.ts`), Laden (`laden.ts`, Quelle `fetch` oder eingebettet), Konsistenzprüfung (`pruefen.ts`) |
| `src/kern/` | Protokollformat (`ereignisse.ts`), Spielstand als reine Funktion des Protokolls (`zustand.ts`), Spieluhr (`uhr.ts`), Geometrie und Einsatzregeln aus `argus_lib.py` portiert (`geometrie.ts`, `regeln.ts`), wer was sieht (`sichten.ts`), Klartext je Ereignis (`beschreibung.ts`) |
| `src/engine/` | Host eines Teams (läuft am Team-Laptop): prüft Aktionen (`aktionen.ts`), spielt den Zeitplan ab (`ablauf.ts`), vergibt Laufnummern, Start mit Verzug (`host.ts`) |
| `src/sync/` | Schnittstelle (`adapter.ts`), Firebase RTDB (`firebase.ts`), lokal per localStorage + BroadcastChannel + storage-Ereignis (`lokal.ts`), Auswahl (`fabrik.ts`), künstlicher Verzug für Tests (`verzug.ts`) |
| `src/sitzung/` | `sitzung.ts`: ein Fenster in einer Sitzung (Lobby, Teams, wer rechnet, Steuerung der SL); `spiel.ts`: Spielstand eines Teams – rechnen (Team-Laptop: Host, Ablage, Upload, Status) oder folgen (SL, Plenum, Zuschauer); `ablage.ts`: Protokoll im localStorage des Team-Laptops; `sicht.ts`: ein Team aus Sicht der Zielbearbeitung, der SL oder des Plenums (auch nur lesen) |
| `src/kern/sitzungen.ts`, `src/kern/uebersicht.ts` | Codes, Teamnamen und -farben; Statusmeldung eines Teams für die Übersicht der Spielleitung (Eingang, Schlüsselfälle live, Panzer) |
| `src/kern/auswertung.ts` | Auswertung (Schritt 8): Ausgang je Fall und Team, Kennzahlen, Konfidenz, Zeitleiste, Stand zur Zeit t, Export – reine Funktion der Protokolle; Ansicht `src/ansichten/auswertung.tsx`, siehe [`AUSWERTUNG.md`](AUSWERTUNG.md) |
| `src/kern/lagebild.ts` | was eine Ansicht auf der Lagekarte sieht: Zielmeldungen (Zielbearbeitung) oder Kontrollkarte (SL/Plenum), reine Funktion von Inhalten, Spielstand und Lagezeit |
| `src/karte/` | Lagekarte mit PixiJS (`lagekarte.ts`, wird bei Bedarf nachgeladen), taktische Zeichen nach APP-6/MIL-STD-2525C mit milsymbol (`zeichen.ts`) |
| `src/drohne/` | Live-Drohnenbild (Schritt 6b): Ebenen, Sprites und Effekte zur Spielzeit auf Canvas 2D (`livebild.ts`); Aufnahme zur Meldezeit, wenn das Ziel den Ausschnitt verlassen hat |
| `src/ansichten/` | Preact-Ansichten Zielbearbeitung (`zb.tsx`), SL, Plenum, Eintrag in `register.tsx`; Einweisung mit Übersicht auf der Oberfläche und Folien (`einweisung.tsx`); Startseite, Lobby, Fenster des Teams, Übersicht und Fenster der Spielleitung (`start.tsx`, `lobby.tsx`, `tt-fenster.tsx`, `uebersicht.tsx`, `sl-fenster.tsx`); gemeinsam: Lagekarte mit Marken (`lagekarte.tsx`), Live-Drohnenbild mit Lupe (`livedrohne.tsx`), Bausteine, Rahmen. Überblick: [`UI.md`](UI.md) |
| `src/assets/` | Asset-Manifest (`typen.ts`), Zugriff (`assets.ts`: Manifest, Bildadresse, Atlas, Vorladen), Quelle Netz oder eingebettet (Alias `@assetquelle`) |
| `public/assets/` | Bilder und Manifest aus `tools/assets/gen_assets.py` (Karte, Drohnenbilder, Sprites, Effekte), siehe [`ASSETS.md`](ASSETS.md) |

## Grundsätze

* **Ein gültiger Spielstand je Team.** Nur der Host des Teams – seit 2.6 im Browser des Team-Laptops – schreibt ins Protokoll.
  Entscheidungen des Teams gehen direkt an ihn, Aktionen der Spielleitung über das Netz. Der Host prüft Rechte und Stand; was
  nicht passt, wird als `aktion_abgelehnt` protokolliert. Damit steht **jede Aktion im Protokoll**.
* **Stand = Protokoll.** Jedes Fenster berechnet den Spielstand selbst mit `anwenden()` aus dem Protokoll. Gleiches Protokoll ⇒
  gleicher Stand (Fingerabdruck `fingerabdruck()` zum Vergleichen). Spielleitung, Plenum und Zuschauer lesen das hochgeladene
  Protokoll und sind damit (mit Verzug) auf demselben Stand wie der Laptop.
* **Spieluhr ohne Taktsignal.** Uhr-Ereignisse halten fest: ab Serverzeit `ts` (bei verspätetem Startsignal `ab_ts`) gilt Spielzeit
  `t_s`, läuft ja/nein, Tempo. Jedes Fenster rechnet die Uhr selbst (Firebase: lokale Uhr + gemessener Versatz zur Serverzeit).
  So haben alle Teams dieselbe Spielzeit, auch wenn das Startsignal unterschiedlich spät ankommt (H1.4).
* **Ausfallsicher.** Fällt das Netz aus, spielt der Team-Laptop weiter (Ablage im localStorage); der Upload holt nach, sobald es
  wieder geht, sonst Datei (**⇩ Protokoll** / **Protokoll laden**). Fällt die steuernde Spielleitung aus, übernimmt eine andere
  („Steuerung übernehmen“ oder nach 20 s ohne Puls) – die Teams spielen davon unberührt weiter.
* **Läufe bleiben erhalten.** „Neues Spiel“ beginnt einen neuen Lauf; Testlauf und echter Durchlauf bleiben für die Auswertung gespeichert.

## Datenmodell im Sync (Firebase-Pfad `argus/v1/sitzungen/<code>/`)

```
info                                   { code, szenario, version, titel, erstellt, von }  einmal angelegt
host                                   { id, name, puls }  steuernde Spielleitung
anwesenheit/<client>                   { client, art (tt|sl|plenum), name, puls, version, team? }  (seit J: version „0.9.0 1536x730“ = Fenstergröße)
teams/<team>                           { name, farbe, erstellt, lauf?, spieler/<client> { name, rollen: "zb", seit } }
status/<team>                          Statusmeldung des Team-Laptops (seit 2.6; Felder in SITZUNG.md)
laeufe/<team>/<lauf>/protokoll/e000001 Ereignisse des Teams (nur anhängen; Upload des Team-Laptops)
laeufe/<team>/<lauf>/aktionen/<id>     Aktionen der Spielleitung an das Team (nur anhängen)
```

`lauf` am Team ist der aktuelle Lauf (z. B. `20261125-0931-k3x9`); „Neues Spiel“ setzt einen neuen,
alte bleiben für die Auswertung. Der Direktaufruf `?rolle=…&raum=kraehe` ist eine Sitzung `kraehe`
mit einem Team `traum`. Der lokale Adapter legt dieselbe Struktur im localStorage ab (`argus:v1:s:<code>:…`).

## Protokollformat

Ein **Ereignis**:

```json
{ "seq": 12, "typ": "entscheid", "ts": 1795600000000, "t_s": 512.4,
  "von": { "rolle": "zb", "client": "k3x9ab", "name": "Falke Nord" },
  "aktion": "-OdQ…", "ts_aktion": 1795599999700,
  "daten": { "meldung": "M07", "entscheid": "bekaempfen", "wirkmittel": "LM", "warnungen": [],
             "einschlag": { "t": 548.2, "pos": [612, 388], "ziel": "Z-09" }, "t_offen": 498.0, "sek_eingang": 22.4, "sek_offen": 14.4 } }
```

`seq` lückenlos ab 1, `ts` Serverzeit (ms), `t_s` Spielzeit (s) – bei Aktionen die Spielzeit des
Klicks, nicht die der Verarbeitung. `aktion`/`ts_aktion` nur bei Ereignissen aus Aktionen.

| typ | daten | entsteht durch |
|---|---|---|
| `spiel_neu` | lauf, szenario, version, titel | Host beim Laufbeginn (seq 1) |
| `uhr` | befehl (start/pause/tempo/setzen), laeuft, t_s, tempo, ab_ts? | SL (Start für alle …), im Test ohne Lobby das Team, Spielende; `ab_ts` (seit 2.6): Startsignal kam verspätet an, die Uhr läuft ab dieser Serverzeit |
| `meldung` | meldung, manuell?, entfaellt?, gestoert? | Zeitplan oder SL „jetzt“; `entfaellt`, wenn jedes Fahrzeug schon zerstört oder weg ist |
| `meldung_entfaellt` | meldung, stufe („offen“), grund | Zeitplan: jedes Fahrzeug der offenen Meldung ist inzwischen zerstört oder abgezogen |
| `entscheid` | meldung, entscheid (bekaempfen/zurueckstellen/ablehnen), wirkmittel?, warnungen?, einschlag? {t, pos, ziel}, einschlaege?, t_offen?, sek_eingang?, sek_offen? | Zielbearbeitung (seit 2.6 die eine Entscheidung je Meldung). Bei BEKÄMPFEN rechnet der Host Einschlag(e) und Warnungen am vorausberechneten Einschlagort; `sek_eingang`/`sek_offen` = Sekunden ab Eingang bzw. ab Öffnen bis zur Entscheidung (H2.4) |
| `wirkung` | meldung, wirkmittel, pos, t_freigabe, t_einschlag, ziel, getroffen[], verstoesse[], nr?, anzahl? | Zeitplan zum Einschlag: Treffer nach der Lage beim Einschlag; liegt der Einschlag nach Spielende, bei Spielende abgerechnet |
| `hintergrund` | id, art, ziel?, wirkt?, folge?, grund? | Zeitplan (Hintergrundgefecht H-01–H-12) |
| `durchbruch` | gruppe, t_ab, durch, grund? | Zeitplan (seit 2.1) |
| `ereignis` | ereignis, nr?, von?, ziel?, wirkt?, entfaellt?, grund? | Zeitplan (E-01) |
| `verstaerkung` | gruppe, t_ab | SL (Verstärkung V-1–V-5; Menü seit 2.6 ausgeblendet, Werkzeuge spielen sie über die Sitzung ein) |
| `inject` | inject, manuell?, text?, zug?, stufe? | Zeitplan (fest und bedingt, Druckmeldungen der 1. Kp) oder SL |
| `inject_quittiert` | inject | Zielbearbeitung (Lagemeldung im Feed angeklickt) |
| `notiz` | text, fall? | SL (Beobachtung, optional zu einem Fall S1–S8/N1–N4, erscheint in der Auswertung) |
| `spielende` | grund | Zeitplan (Spielzeit abgelaufen) |
| `aktion_abgelehnt` | aktionstyp, grund | Host, wenn eine Aktion nicht passt |

Bis 2.5 gab es statt `entscheid` die Kette `g1_entscheid` → `g2_empfehlung` → `g3_entscheid`, dazu `lagehinweis` und `fast_track`;
diese Typen sind seit 2.6 nicht mehr in `EREIGNIS_TYPEN`. Unbekannte Typen (aus anderen Versionen) zählen für `seq`, ändern den
Stand aber nicht. Feldnamen in `daten` nur aus Kleinbuchstaben und `_` (keine Ziffern), höchstens drei Ebenen tief – so prüfen
es die Firebase-Regeln.

Eine **Aktion**: `{ id, typ, von, ts, daten }`. Typen: `entscheid`, `inject_quittiert` (Zielbearbeitung), `uhr` (SL; im Test ohne
Lobby auch das Team), `notiz`, `meldung_ausloesen`, `inject_ausloesen`, `verstaerkung_einspielen` (nur SL). Rechte stehen in
`RECHTE` (`ereignisse.ts`).

## Ablauf einer Meldung

`meldung` → **offen** (im Eingang des Teams) → BEKÄMPFEN mit Mörser / LM / Kanone: **wirkung** (Bestand − Zahl der Einschläge) →
Einschlag (`wirkung`) → erledigt · ZURÜCKSTELLEN: bleibt offen (zurückgestellt, beobachten) · ABLEHNEN: erledigt.
Entfällt die Meldung, solange sie offen ist (Fahrzeug zerstört oder abgezogen): `meldung_entfaellt`.

## Zeitplan (seit Schritt 7)

`src/engine/ablauf.ts`, reine Funktion von Inhalten (Welt des Teams mit Verstärkungen), Stand und Uhr:
Hintergrundgefecht, Einschläge (Trefferregel beim Einschlag), Skriptereignis E-01, Meldungen, die im
Eingang entfallen, neue Meldungen („entfällt“), feste und bedingte Injects
(`freigabe`, `freigabe_mit_zivil` – Zivilpersonen beim Einschlag –, `keine_freigabe_bis`), Spielende.
Einzelheiten, Gleichzeitigkeit und Nachweis: `docs/ENGINE.md`.

## Sichten

Seit 2.6 gibt es eine Ansicht je Team: Die Zielbearbeitung sieht die volle Meldung (Live-Drohnenbild, ARGUS-Ausgabe mit Klasse,
Zugehörigkeit, Konfidenz und Empfehlung über `argusBei(…)`, Bildalter über `bildalter(…)`, das Kleingedruckte hinter „i“), die
Lagemeldungen (Feed) und die Lagekarte mit den Zielmeldungen; das Zeichen folgt dem Ziel (Tracking). Ground Truth, Personen und
ungemeldete Ziele zeigt nur die Kontrollkarte (Spielleitung, Plenum nach Spielende) – festgelegt in `src/kern/lagebild.ts`,
geprüft in `tests/lagebild.test.ts`. Effekte (Einschlag, LM, Leuchtspur, Wracks …) sieht das Team nur zu Zielen, die es aus Meldungen
kennt; Feindartillerie, Rauch und das Feuer auf die eigenen Panzer (Mündungsblitz, Leuchtspur, Treffer – H5.7) immer
(`src/kern/effekte.ts`).
