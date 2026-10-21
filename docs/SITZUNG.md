# ARGUS – Sitzung, Lobby und Teams (Schritt 4b)

Stand 21.10.2026. Spielform nach Konzept v2: **5 Teams à 3** (je eine Person G1, G2, G3 an einem
eigenen Rechner), alle Teams spielen dieselbe Lage parallel in **getrennten Spielständen**. Die
Spielleitung legt eine Sitzung mit Code an, die Teilnehmer bilden in der Lobby ihre Teams, das Fenster
der Spielleitung führt die Engine für alle Teams.

## Ablauf im Hörsaal

| Wer | Schritt | Wo |
|---|---|---|
| SL 1 | Startseite → Name → **Neue Sitzung anlegen**. Der Code steht oben in der Mitte (z. B. `KRAEHE-7Q`). | `…/Argus/` |
| SL 1 | **Plenum öffnen**: Das Smartboard zeigt Seite, Code und die Teams, die sich bilden. | Übersicht |
| TT | Startseite → Code eingeben (Groß-/Kleinschreibung, Umlaut und Bindestrich egal, die zwei Zeichen hinten reichen: `7q`) → **Beitreten**. | `…/Argus/` |
| TT | Lobby: Name (freiwillig). Ein TT je Team: Teamname (≤ 24 Zeichen, 🎲 schlägt einen vor) und **Erstellen und beitreten als G1/G2/G3**. Die anderen: in der Teamkarte bei der freien Rolle **beitreten**. Fehlt jemand: im eigenen Team **+ dazu** (Doppelrolle). Bis zum Start: **abgeben**, **wechseln**, **Team verlassen**. | Lobby |
| SL 1 | In der Übersicht prüfen (alle Rollen besetzt, „da 3/3“), ggf. umbenennen, verschieben, zuweisen, löschen. Dann **Spiel öffnen – alle Teams**: Jedes Team bekommt einen eigenen Lauf, die Ansichten erscheinen mit der Einweisungskarte, die Uhr steht. | Übersicht |
| SL 1 | **▶ Uhr starten – alle** (alle Teams im selben Takt). Anhalten, Tempo, Spielzeit, Reserve-Injects ebenso für alle; einzeln über die Zeile oder die Teamansicht. | Übersicht |
| SL 2 | Startseite → Code bei „Bestehende Sitzung öffnen“ → **als Spielleitung**. Beobachtet, kann **Steuerung übernehmen** (ohne Puls des Hosts nach 20 s von selbst). | Übersicht |

Wer später kommt, tritt einem laufenden Team bei („Spiel läuft“, freie Rolle **beitreten**) und landet
direkt in der Ansicht mit Einweisung. Neuladen führt in Team und Rolle zurück (die Adresse trägt
`ich=…`, die Kennung des Fensters).

## Adressen

| Fenster | Adresse |
|---|---|
| Startseite | `…/Argus/` |
| Teilnehmer | `…/Argus/?sitzung=KRAEHE-7Q` (Lobby, dann die eigene Ansicht; `&ich=…` kommt beim ersten Öffnen dazu) |
| Spielleitung | `…/Argus/?sitzung=KRAEHE-7Q&rolle=sl&name=SL%201` |
| Plenum | `…/Argus/?sitzung=KRAEHE-7Q&rolle=plenum` |
| Test ohne Lobby (ein Team, wie bis Schritt 6) | `…/Argus/?rolle=g1&raum=kraehe` (Startseite → „Test ohne Lobby“) |

Weiter wie bisher: `sync=lokal` (alle Fenster an einem PC), `transport=auto`, `db=…`, `szenario=…`.

## Spielleitung

**Übersicht aller Teams** (Startansicht):

* Steuerleiste für alle Teams: Spiel öffnen, ▶ Uhr starten / ❚❚ Anhalten, Tempo ×1–×20, Spielzeit
  setzen, Reserve R-01–R-03 an alle, Plenum öffnen, Neues Spiel – alle (zweistufig).
* Je Team eine Zeile: Teamname (Klick = umbenennen, ✕ = löschen, zweistufig), Spieler je Rolle mit
  Verbindungspunkt (Klick: Rollen ändern, in ein anderes Team verschieben, herausnehmen; „frei“:
  Teilnehmer ohne Team zuweisen), Spielzeit und Status, Eingang G1 · G2 · G3 (zurückgestellt in
  Klammern), **Schlüsselfälle live** S1–S4 (grau kommt noch, blau offen, grün richtig, rot falsch),
  Fehltreffer, Fast-Track, „da“ (verbunden/eingetragen), ▶/❚❚ für dieses Team, **ansehen ›**.
* Fuß: Teilnehmer ohne Team, Legende.

**Teamansicht** („ansehen ›“): Leiste oben links statt des Rollenbands – ◂ Übersicht, Teamwahl,
**Steuerung** (die Spielleitungsansicht aus Schritt 6 für dieses Team: Uhr, Kontrollkarte, bedingte
Injects, Reserve, Zeitplan, Protokoll, Notiz, Export je Team) und **G1 · G2 · G3 zum Zuschauen**
(Ansicht der Rolle, „Zuschauen – nur lesen“, alle Knöpfe gesperrt). Unter der Kopfzeile kommt nichts
dazu, alles bleibt in 1530 × 800.

Das steuernde Fenster führt die Hosts **aller** Teams, egal welche Ansicht es zeigt. Folgenreiche Knöpfe
fragen im Knopf nach („Wirklich? …“) statt mit einem Browser-Dialog: `confirm()` hielte im
Host-Fenster die Engine aller Teams an.

**Plenum:** vor dem ersten Spiel Einweisung mit Seite, Code und den Teams (mit Zahl der Spieler),
danach Einweisung/Lage/Auflösung eines Teams, Teamwahl oben links. Der Teamvergleich kommt mit der
Auswertung (Schritt 8).

## Teilnehmer

* **Lobby** (ohne Erklärung bedienbar): oben in der Mitte steht, was zu tun ist („Team erstellen oder
  einem Team beitreten“ → „Warten auf den Start durch die Spielleitung“); links Name, neues Team bzw.
  das eigene Team, die drei Rollen in je einem Satz; rechts alle Teams als Karten mit G1, G2, G3.
  Teamfarben werden automatisch vergeben, stehen nie ohne Namen und sind weder Rollen- noch
  Signalfarbe.
* **Doppelrolle:** Im Spiel steht oben links ein Umschalter (z. B. `G1 Aufklärung | G2`), die Zahl an
  der anderen Rolle zeigt, was dort wartet. Jede Rolle hat ihre Einweisungskarte. Aktionen gehen mit
  der Rolle der gerade gezeigten Ansicht ins Protokoll.
* Die Kopfzeile jeder Ansicht zeigt das Team (Farbe und Name).

## Technik

### Datenmodell (Firebase `argus/v1/sitzungen/<code>/`, lokal `argus:v1:s:<code>:…`)

```
info                                   { code, szenario, version, titel, erstellt, von }  einmal angelegt
host                                   { id, name, puls }  steuernde Spielleitung, eine für alle Teams
anwesenheit/<client>                   { client, art: tt|sl|plenum, name, puls, version, team? }
teams/<team>                           { name, farbe, erstellt, lauf?, spieler/<client> { name, rollen: "g1" | "g2,g3", seit } }
laeufe/<team>/<lauf>/protokoll/e000001 Ereignisse, nur anhängen, nur der Host schreibt
laeufe/<team>/<lauf>/aktionen/<id>     Aktionen der Ansichten, nur anhängen
```

* Codes: Vorsilbe aus dem Szenario (`KRÄHE-01` → `KRAEHE`) und zwei Zeichen ohne 0/O/1/I/L.
  Gespeichert klein (`kraehe-7q`), angezeigt groß. Eine Liste aller Sitzungen gibt es nicht.
* Team-Kennung `t` + 5 Zeichen; das Team des Direktaufrufs heißt `traum`.
* Ein Lauf je Team (`lauf` am Team). „Neues Spiel“ setzt einen neuen Lauf, alte Läufe bleiben.
  Protokollformat und Ereignistypen unverändert (siehe ARCHITEKTUR.md).
* Die Lobby lädt nur `teams` und `anwesenheit`, keine Protokolle. Teilnehmer laden nur das Protokoll
  ihres Teams, Spielleitung und Plenum alle.

### Module

| Datei | Inhalt |
|---|---|
| `src/kern/sitzungen.ts` | Codes (anlegen, Eingabe verzeihen), Teamnamen (Würfel), Teamfarben, Rollen als Text, Doppelrolle |
| `src/kern/uebersicht.ts` | Übersicht je Team: Eingang je Stufe, Fehltreffer, Schlüsselfälle live (reine Funktion, getestet) |
| `src/sync/adapter.ts` | Schnittstelle: Sitzung, Teams/Spieler, Läufe je Team, Anwesenheit, Host; `teamKanal()` für Host und Spiel |
| `src/sync/firebase.ts`, `lokal.ts`, `fabrik.ts` | beide Adapter mit gleichem Datenmodell; Auswahl an einer Stelle |
| `src/sitzung/sitzung.ts` | ein Fenster in einer Sitzung: Lobby-Aktionen, Teamverwaltung der SL, Host-Bewerbung, je Team ein Spiel |
| `src/sitzung/spiel.ts` | Spielstand eines Teams (Protokoll, Stand, Aktionen senden), im Host-Fenster mit Host |
| `src/sitzung/sicht.ts` | was eine Ansicht bekommt: ein Team aus Sicht einer Rolle, optional nur lesen |
| `src/engine/taktgeber.ts` | ein gemeinsamer Takt für alle Team-Hosts im SL-Fenster |
| `src/ansichten/start.tsx`, `lobby.tsx`, `tt-fenster.tsx`, `uebersicht.tsx`, `sl-fenster.tsx` | Startseite, Lobby, Teilnehmer-Fenster (Doppelrolle), Übersicht, Fenster der Spielleitung und des Plenums |

Die Ansichten G1, G2, G3, SL und Plenum kennen nur ihre `Sicht` – Sitzung und Lobby sind für sie
unsichtbar. Ein Team hinzuzufügen ist damit keine Änderung an den Ansichten.

### Regeln für das Miteinander

* **Gleichzeitig dieselbe Rolle:** Jeder Spielereintrag trägt `seit` (Serverzeit der Rollenwahl).
  Haben zwei Fenster dieselbe Rolle, behält sie das frühere (bei Gleichstand die kleinere Kennung);
  das spätere gibt sie von selbst ab und zeigt „… hat X schon genommen – bitte eine andere Rolle
  wählen“. Beide entscheiden nach denselben Daten, es bleibt genau eines.
* **Wer weg ist, gibt seine Rolle frei:** Ohne Puls (20 s) gilt eine Rolle als frei („frei · Name ist
  weg“). Wer sie übernimmt, nimmt sie dem Abwesenden weg.
* **Die Spielleitung entscheidet:** Setzt sie jemanden auf eine besetzte Rolle, gibt der bisherige
  Inhaber sie ab.
* **Teamwechsel** ist ein Schreibvorgang über mehrere Pfade (raus aus dem alten, rein ins neue Team).
* Teamfarben: Haben zwei gleichzeitig angelegte Teams dieselbe Farbe, gibt der Host dem späteren eine freie.

### Host für mehrere Teams

Das Fenster der steuernden Spielleitung hat je Team ein `Spiel` mit einem `Host`. Alle Hosts hängen an
einem `Taktgeber` (250 ms): Meldungen, Injects und Wirkungen werden in allen Teams im selben Durchgang
fällig. „▶ Uhr starten – alle“ sendet je Team eine Uhr-Aktion; im Test lagen die Startzeiten der fünf
Teams 1–4 ms auseinander. Fällt der Host aus, übernimmt SL 2 alle Teams auf einmal (die Hosts bauen
ihren Stand aus den Protokollen auf, wie in Schritt 4).

### Lokaler Sync (Variante C)

Ein PC, mehrere Fenster: localStorage + BroadcastChannel wie bisher, dazu das `storage`-Ereignis.
Befund der Lobby-Probe: Chromium gleicht localStorage zwischen Tabs verzögert ab, eine
BroadcastChannel-Nachricht kann vor den Daten ankommen – ein Fenster sah den Lauf seines Teams nicht.
Für alles, was neu gelesen wird (Teams, Info, Anwesenheit, Host), ist jetzt das `storage`-Ereignis
maßgeblich; Ereignisse und Aktionen tragen ihre Daten selbst und kommen zusätzlich auf diesem Weg
(doppelt zugestellt ist erlaubt). Im Speicher bleiben höchstens vier Sitzungen und je Team vier Läufe.

### Firebase-Regeln

`firebase/database.rules.json` (= `claude/firebase/database.rules.json`), ohne Anmeldung:

* lesbar ist nur `argus/v1/sitzungen/<code>` mit gültigem Code – keine Sitzungsliste, keine Raumliste;
* `info` nur anlegen, nie ändern (Code muss zum Pfad passen); `teams/<team>` nur mit gültiger Kennung,
  Name 1–24 Zeichen, Farbe `#rrggbb`, Lauf im Laufformat, Spieler mit Rollentext (`g1`, `g2,g3` …),
  Name ≤ 40, `seit` als Zeit; keine weiteren Felder;
* Protokoll und Aktionen je Team und Lauf nur anhängen, Formate und Textlängen geprüft (wie Schritt 4);
* der alte Pfad `argus/v1/raeume/…` ist nicht mehr beschreibbar; `rooms/…` (Sync-Test) bleibt.

**Einspielen:** Firebase-Konsole → Projekt `argus-sync-e9fbc` → Realtime Database → Regeln → Inhalt
ersetzen → Veröffentlichen (vor Ablauf des Testmodus ca. 18.11.2026). Danach einmal Sitzung anlegen,
zwei Teilnehmer beitreten lassen, Spiel öffnen.

## Nachweis „Fertig, wenn“

| Prüfung | Ergebnis |
|---|---|
| 66 automatische Tests (Vitest), darunter `tests/teams.test.ts`: Lobby, Doppelrolle, gleichzeitiger Zugriff, verwaiste Rolle, SL verwaltet, **16 Fenster (5 × 3 + SL)** mit getrennten Spielständen, Übernahme durch SL 2, neues Spiel für ein Team; Firebase-Regeln mit einem echten Lauf zweier Teams; Firebase-Adapter gegen die Nachbildung | bestanden |
| `tools/e2e_teams.py`: 16 echte Browserfenster, alles über die Oberfläche (Code eingeben, Teams mit Namen wie „Team Ömer & Co“, beitreten, Spiel öffnen, Start für alle, je Team andere Entscheidungen, Notiz und Zuschauen der SL) – **lokaler Sync, Offline-Datei, Firebase-Nachbildung mit den neuen Regeln** | je Team gleicher Lauf, gleiche seq und gleicher Fingerabdruck in allen vier Fenstern, gleiche Uhr; fünf verschiedene Läufe und Stände; jede der 39 gespeicherten Aktionen im Protokoll ihres Teams, keine in einem fremden, keine unbestätigt; Start aller Uhren innerhalb von 1–4 ms; kein Rollbalken, nichts abgeschnitten in allen 16 Fenstern; keine Konsolenfehler |
| `tools/lobby_probe.py`: 19 Aufgaben nur über sichtbare Beschriftungen (falscher Code, Code klein ohne Bindestrich, Würfel, beitreten, abgeben, Doppelrolle, wechseln, gleichzeitiger Klick, umbenennen, verschieben, zuweisen, löschen, Plenum mit Code, Start für alle, Umschalter der Doppelrolle, Zuschauen, Neuladen, später Beitritt, Teamwahl im Plenum) | 19/19, dreimal hintereinander |
| Werkzeuge aus Schritt 4–6 im Direktaufruf (`e2e_vier_fenster.py` lokal/offline/Nachbildung, `ui_bilder.py`, `ui_faelle.py`, `bedientest_probe.py`) | unverändert bestanden |

„Lobby ohne Erklärung bedienbar“ ist damit für die Oberfläche gezeigt; der Test mit Menschen folgt im
Bedientest am 03.11. (BEDIENTEST.md, Teil A).

## Offen

* Firebase-Regeln in der Konsole einspielen (siehe oben). Bis dahin läuft die Datenbank im Testmodus.
* Test mit der echten Datenbank (Long-Polling) mit 16 Fenstern bzw. Rechnern – aus der
  Entwicklungsumgebung ist firebaseio.com nicht erreichbar. Vorschlag: 16 Tabs über github.io an einem
  Rechner, dann im Hörsaal.
* Verstärkung reinrufen (Konzept v2 §3) und „Druck halten“ kommen mit Szenario v2 und der Live-Lage
  (Schritte 2b, 6b/7). Teamvergleich in Plenum und Auswertung: Schritt 8.
* Die Einweisungskarten sprechen die Gruppe an („ihr“) – passt zum Team, das zusammensitzt; der Text
  wird mit der neuen Oberfläche (6b/7) ohnehin überarbeitet.
