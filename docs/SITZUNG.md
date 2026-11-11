# ARGUS – Sitzung, Lobby und Teams

Stand 11.11.2026 (Szenario 2.7, Änderungen H und Liste K „Schließen, wieder öffnen, übernehmen“). Spielform: **7 Teams** (15 TT: sechs zu zweit, eines zu dritt), je Team
**ein Laptop und eine Rolle**, die Zielbearbeitung (intern `zb`). Alle Teams spielen dieselbe Lage parallel in **getrennten
Spielständen**. Die Spielleitung legt eine Sitzung mit Code an, die Teilnehmer bilden in der Lobby ihre Teams.

**Seit 2.6 rechnet jeder Team-Laptop sein Spiel selbst** (H1): Entscheidung, Einschlag, Karte, Meldungen – alles im Browser des
Teams, ohne Netz. Das Netz braucht es nur noch für Lobby und Beitritt, das Startsignal (und Pause, Tempo, Spielzeit, Reserve,
Notiz) der Spielleitung, eine **Statusmeldung** je Team etwa alle 5 s und den **Upload des Protokolls** für die Auswertung (laufend
in Stücken und vollständig bei Spielende). Bis 2.5 führte das Fenster der Spielleitung die Engine aller Teams; jede Entscheidung
ging Laptop → Firebase → SL → Firebase → Laptop (Desync bis ca. 5 s im Test am 09.11.).

## Ablauf im Hörsaal

| Wer | Schritt | Wo |
|---|---|---|
| SL 1 | Startseite → **Spielleitung** → Name → **Neue Sitzung anlegen**. Der Code (drei Zeichen, z. B. `K7P`) steht oben in der Mitte. Beim nächsten Mal bietet die Seite unter **Spielleitung** die zuletzt genutzte Sitzung an: **Fortsetzen als Spielleitung** oder **Plenum**. | `…/Argus/` |
| SL 1 | **Plenum öffnen**: Das Smartboard zeigt Seite, Code und die Teams, die sich bilden. | Übersicht |
| TT | Startseite → **Ich spiele mit** → Code eingeben (Groß-/Kleinschreibung, Leerzeichen und Punkte egal: `k 7 p`) → **Beitreten**. Mehr sehen Teilnehmer auf der Startseite nicht. | `…/Argus/` |
| TT | Lobby: Namen (freiwillig, z. B. „Lt Müller, Lt Schmidt“), Teamname (≤ 24 Zeichen, 🎲 schlägt einen vor) → **Team anlegen** – „Dieser Laptop spielt für das Team.“ Keine Rollenwahl. Ein zweites Fenster desselben Teams (Knopf **zuschauen**) sieht nur zu. **Team verlassen** jederzeit (im Lauf mit Nachfrage). | Lobby |
| SL 1 | In der Übersicht prüfen (je Team ein Laptop, verbunden), ggf. umbenennen, Fenster verschieben oder einem Team ohne Laptop zuweisen, löschen. Dann **Spiel öffnen – alle Teams**: Jedes Team bekommt einen eigenen Lauf, am Team-Laptop erscheint die Ansicht mit der Einweisung (Übersicht mit Pfeilen, dann Folien), die Uhr steht. | Übersicht |
| SL 1 | **▶ Start für alle**: Startsignal mit der Serverzeit des Klicks an alle Team-Laptops; jede Uhr läuft ab diesem Augenblick (H1.4, auch wenn das Signal später ankommt – bis 60 s holt der Laptop nach). Anhalten, Tempo, Spielzeit, Reserve ebenso für alle; einzeln über die Zeile oder die Teamansicht. | Übersicht |
| SL 2 | Startseite → **Spielleitung** → Code bei „Bestehende Sitzung öffnen“ → **als Spielleitung**. Beobachtet, notiert (✎ Notiz), kann **Steuerung übernehmen** (ohne Puls nach 20 s von selbst). | Übersicht |

Wer später kommt, legt ein Team an; die Spielleitung öffnet sein Spiel einzeln (**öffnen** in der Zeile). Neuladen führt an den
Team-Laptop zurück (die Adresse trägt `ich=…`, die Kennung des Fensters) – der Spielstand liegt in der Ablage des Laptops.

## Schließen, wieder öffnen, übernehmen (seit Liste K, 11.11.2026)

Bis Stand J blockierte ein geschlossener Team-Tab sein Team für immer: Das früheste Fenster rechnet, auch wenn es weg ist; wer über
die Startseite neu kam, bekam eine neue Kennung und durfte nur zuschauen. Jetzt gilt:

| Fall | Was passiert | Was zu tun ist |
|---|---|---|
| **Tab geschlossen, Browser neu gestartet, Laptop zugeklappt** – derselbe Browser kommt wieder | Der Browser hat sich Kennung und Team je Sitzung gemerkt (`localStorage`, `argus:ich:<sitzung>`). Er ist sofort wieder der Laptop des Teams; das Spiel läuft aus der Ablage weiter wie nach Neuladen. | Startseite → **Ich spiele mit** → oben der große Knopf **„Zurück zu Team Adler (Code P9P)“** – oder den Code eingeben, oder das Lesezeichen. Die Spielleitung muss nichts tun. |
| **Zwei Tabs im selben Browser** | Der zweite Tab erkennt, dass die Kennung schon lebt, und sieht nur zu: „Das Spiel läuft schon in einem anderen Tab dieses Browsers“. | **hierher holen** hält den anderen Tab sauber an; das Spiel läuft dann hier. („anderes Team …“ ist nur für Tests mit mehreren Teams an einem PC.) |
| **Der Laptop ist wirklich weg** (Akku, anderer Rechner) | Ist der Laptop eines Teams **länger als 20 s nicht verbunden**, zeigt die Teamkarte in der Lobby jedes anderen Geräts **„Spiel hier weiterführen“** (mit Nachfrage), ebenso das Banner eines Zuschauers. Das neue Fenster rechnet ab dem hochgeladenen Protokoll. | Am neuen Gerät: Code eingeben → Teamkarte → **Spiel hier weiterführen**. |
| **Der alte Laptop kommt zurück** | Er ist nicht mehr das früheste Fenster, **stoppt seinen Host** und zeigt „Das Spiel wird an einem anderen Laptop weitergeführt“ (mit **⇩ Protokoll dieses Laptops**). Nie zwei verbundene rechnende Fenster. | Nichts – zuschauen oder **Team verlassen**. |
| **Die Spielleitung räumt auf** | In der Zeile des Teams steht „nicht verbunden seit 0:45“ und **Laptop freigeben** (Nachfrage): nimmt das tote Fenster aus dem Team. Dann rechnet das nächste Fenster des Teams oder eines, das neu beitritt. | Übersicht → Zeile → **Laptop freigeben**. |
| **Ein Gerät sauber freigeben** | **⎋ Team verlassen** steht jetzt auch in der Ansicht während des Laufs (Nachfrage): Der Laptop hält an, lädt das Protokoll hoch und geht in die Lobby. | Danach tritt ein anderes Gerät dem Team bei (**beitreten**) und führt weiter. |
| **Start, Pause, Tempo, während ein Laptop fehlt** | Die Befehle stehen im Kanal des Teams. Die Übersicht zeigt **„Start wartet auf Laptop“**; nach 10 s kommt der Hinweis „Team … antwortet nicht – Laptop nicht verbunden“ (kein Knopf bleibt auf „gesendet …“). Beim Wiederverbinden wird der Befehl ausgeführt: die Uhr läuft ab der Startzeit, höchstens 60 s nachgeholt (H1.4). Hat die Spielleitung inzwischen wieder angehalten, gilt nur der letzte Befehl. | Nichts – oder **Laptop freigeben** und ein anderes Gerät beitreten lassen. |
| **Spiel öffnen / Neues Spiel ohne Laptop** | Hinweis „kein Laptop verbunden – das Spiel startet, sobald einer beitritt“. | – |
| **Sitzung beenden** | Spielleitung, oben rechts **Sitzung beenden** (Nachfrage): Team-Fenster zeigen „Sitzung beendet – danke“, halten an, laden hoch und vergessen die Sitzung; das Plenum geht zur Startseite; der Code nimmt niemanden mehr an. Die Protokolle bleiben – die Spielleitung kommt weiter an die **Auswertung**. Auf der Startseite steht die Sitzung nicht mehr unter „Zuletzt genutzte Sitzung fortsetzen“ (dort sonst mit Datum und Zahl der Teams). | Danach **Neue Sitzung anlegen** – neuer Code, keine Reste. |

Was bleibt, wie es war: **Kein Fenster übernimmt von selbst** (ein Laptop ohne Netz spielt weiter, H1.3). Übernehmen ist immer ein
sichtbarer Klick – und erst möglich, wenn der Laptop 20 s kein Lebenszeichen gegeben hat (Puls alle 5 s). Spielt der alte Laptop
ohne Netz weiter, während ein anderer übernimmt, gilt ab der Übernahme der neue: Der alte stoppt, sobald er wieder Netz hat; was er
ohne Netz noch gespielt hat, bleibt als Datei („⇩ Protokoll dieses Laptops“).


## Adressen

| Fenster | Adresse |
|---|---|
| Startseite | `…/Argus/` |
| Startseite: Mitspielen / Spielleitung | `…/Argus/#mitspielen`, `…/Argus/#spielleitung` |
| Teilnehmer | `…/Argus/?sitzung=K7P` (Lobby, dann die Ansicht; `&ich=…` kommt beim ersten Öffnen dazu) |
| Spielleitung | `…/Argus/?sitzung=K7P&rolle=sl&name=SL%201` |
| Plenum | `…/Argus/?sitzung=K7P&rolle=plenum` |
| Test ohne Lobby, allein (das Team steuert die Uhr oben rechts) | `…/Argus/?rolle=zb&raum=kraehe` (Startseite → Spielleitung → „Test ohne Lobby: ein Team“ → **Allein testen**) |
| Test ohne Lobby, Team und Spielleitung | `…/Argus/?rolle=zb&raum=kraehe` und `…?rolle=sl&raum=kraehe` (**Team und Spielleitung öffnen**) |

Seit Liste K für Tests und Vorführung: `geraet=a` gibt dem Fenster einen eigenen Merkbereich – so lassen sich an EINEM Rechner
mehrere „Geräte“ in einem Browser nachstellen (lokaler Sync, Proben). Ohne den Parameter ist ein Browser ein Gerät.

Weiter wie bisher: `sync=lokal` (alle Fenster an einem PC), `transport=auto`, `db=…`, `szenario=…`. Neu für Tests und
Vorführung: `verzug=5000` legt um die Verbindung des Fensters einen künstlichen Netzverzug in ms je Richtung
(`src/sync/verzug.ts`) – nicht für das Seminar.

## Spielleitung

**Übersicht aller Teams** (Startansicht), seit 2.6 **aus den Statusmeldungen der Team-Laptops**:

* Steuerleiste: Spiel öffnen, ▶ Start für alle / ❚❚ Anhalten – alle, Tempo ×1–×20, Spielzeit setzen, Reserve R-01–R-03 an
  alle, Plenum öffnen, **Auswertung ›**, **Protokoll laden** (Datei eines Teams, wenn der Upload nicht ging), Neues Spiel –
  alle (zweistufig). Das Menü „Verstärkung“ ist ausgeblendet (`regeln.spielleitung.verstaerkung_menue: false`, H6).
* Je Team eine Zeile: Teamname (Klick = umbenennen, ✕ = löschen, zweistufig), Laptop mit Verbindungspunkt (★ = rechnet; Klick:
  verschieben oder herausnehmen; „frei“: Fenster ohne Team zuweisen), Spielzeit und Status, Eingang (zurückgestellte in Klammern),
  **Schlüsselfälle live** S1–S8 (grau kommt noch, blau offen, grün richtig, rot falsch), Fehltreffer, die vier Panzer, **Protokoll**
  (im Netz / beim Team · Alter der letzten Statusmeldung), ▶/❚❚ für dieses Team, **ansehen ›**.
* Die Zahlen kommen etwa alle 5 s; bei Netzverzug später – die Uhr der Zeile läuft aus der letzten Meldung weiter. Ohne
  Statusmeldung rechnet die Übersicht aus dem hochgeladenen Protokoll.

**Teamansicht** („ansehen ›“): Leiste oben links – ◂ Übersicht, Teamwahl, **Steuerung** (Uhr, Kontrollkarte, bedingte Injects,
Reserve, Zeitplan, Protokoll, Export je Team) und **◉ Zielbearbeitung** zum Zuschauen (Ansicht des Teams aus dem hochgeladenen
Protokoll, mit Verzug; Abzeichen „◉ Zuschauen“, alle Knöpfe gesperrt), **✎ Notiz** je Fall. Alles bleibt in 1530 × 800.

Folgenreiche Knöpfe fragen im Knopf nach („Wirklich? …“) statt mit einem Browser-Dialog.

**Plenum:** vor dem ersten Spiel Einweisung mit Seite, Code und den Teams, danach Lage/Auflösung eines Teams, Teamwahl oben links.
Haben alle Teams das Spielende erreicht, zeigt es die **Auswertung über alle Teams** ([`AUSWERTUNG.md`](AUSWERTUNG.md)).

## Teilnehmer

* **Lobby** (ohne Erklärung bedienbar): oben in der Mitte steht, was zu tun ist („Team anlegen oder beitreten“ → „Warten auf die
  Spielleitung“); links Namen, neues Team bzw. das eigene Team, „So spielt ihr“ in zwei Sätzen; rechts alle Teams als Karten mit den
  Fenstern (★ = Team-Laptop) und dem Knopf **beitreten** (Team ohne Laptop: dieser Laptop rechnet dann) oder **zuschauen**.
  Teamfarben werden automatisch vergeben, stehen nie ohne Namen und sind keine Signalfarbe.
* **Ansicht:** eine für alle (siehe [`UI.md`](UI.md)). Ein zweites Fenster des Teams sieht zu („Das Spiel dieses Teams rechnet der
  Laptop von … Hier nur zuschauen.“). Ist der Team-Laptop länger als 20 s nicht verbunden, bietet es **Spiel hier weiterführen** an – nur für den
  Fall, dass der Laptop aus ist.
* Kopfzeile: Team (Farbe und Name), Uhr und Phase, die vier Panzer, Bestand, Verbindung („verbunden · n offen“ = so viele
  Einträge noch nicht im Netz; „offline – Spiel läuft“), **⇩ Protokoll** (als Datei speichern), **? Einweisung**.

## Technik

### Datenmodell (Firebase `argus/v1/sitzungen/<code>/`, lokal `argus:v1:s:<code>:…`)

```
info                                   { code, szenario, version, titel, erstellt, von }  einmal angelegt
host                                   { id, name, puls }  steuernde Spielleitung
anwesenheit/<client>                   { client, art: tt|sl|plenum, name, puls, version, team? }  (seit J: version „0.9.0 1536x730“ = Fenstergröße)
teams/<team>                           { name, farbe, erstellt, lauf?, spieler/<client> { name, rollen: "zb", seit } }
status/<team>                          Statusmeldung des Team-Laptops (neu in 2.6, flache Felder, siehe unten)
laeufe/<team>/<lauf>/protokoll/e000001 Ereignisse, nur anhängen – schreibt nur der Team-Laptop (Upload)
laeufe/<team>/<lauf>/aktionen/<id>     Aktionen der Spielleitung an den Team-Laptop, nur anhängen
```

Seit Liste J (J2.4) meldet jedes Fenster mit der Anwesenheit seine **Fenstergröße**, damit die Spielleitung am Tag sieht, ob ein
Laptop zu klein ist (Übersicht: „Fenster 1536 × 730“, rot mit „F11!“ unter 1280 × 600). Die Regeln kennen für `anwesenheit` kein
eigenes Feld dafür; die Größe hängt deshalb am Feld `version` (bis 20 Zeichen erlaubt): geschrieben „0.9.0 1536x730“, beim Lesen
wieder getrennt (`anwesenheitSchreiben`/`anwesenheitLesen` in `src/sync/firebase.ts`, geprüft in `tests/firebase_regeln.test.ts`).
**Die Firebase-Regeln bleiben dafür unverändert.** Ändert sich die Fenstergröße, meldet sich das Fenster nach 1 s Ruhe neu.

* **Wer rechnet:** das früheste Fenster des Teams (`seit`), auch wenn es gerade nicht verbunden ist. Kein anderes Fenster übernimmt
  von selbst – ein Laptop ohne Netz spielt weiter, ein zweites Fenster würde sonst einen zweiten Spielstand anfangen. Übernehmen
  nur von Hand („Spiel hier weiterführen“): Das übernehmende Fenster trägt sich mit `seit` um 1 ms vor dem bisher frühesten ein.
* **Seit Liste K:** Kennung je Sitzung im `localStorage` (`src/sitzung/gemerkt.ts`), Tab-Wache je Kennung über BroadcastChannel
  (`src/sitzung/tabwache.ts`: `wer`/`ich`/`abgeben`/`frei`), „nicht verbunden seit“ ab dem letzten Puls der Anwesenheit (sonst der
  letzten Statusmeldung), Übernahme erst nach `UEBERNAHME_MS` = 20 s. Steht nach einer Übernahme im Netz ein anderer Spielstand (der
  alte Laptop hat beim Wiederverbinden noch hochgeladen), übernimmt ihn der Laptop, der rechnet – das Protokoll ist nur zum Anhängen.
* **Aktionen der Spielleitung** stehen in `aktionen/` und bleiben dort. Die Spielleitung liest sie mit: Was dort steht und noch nicht
  im Protokoll ist, steht aus („Start wartet auf Laptop“ – auch nach Neuladen und bei der zweiten Spielleitung). Der Host sammelt alte
  Start-/Pause-Befehle (älter als 3 s) und führt nur den letzten aus; überholte stehen als `aktion_abgelehnt` im Protokoll.
* **Sitzung beendet** ist ein Eintrag `teams/tbeendet` („Sitzung beendet“) – kein Team (neue Teams haben `t` + 5 Zeichen). So braucht
  es keine neuen Regeln. **Regelfehler** eines Team-Fensters reisen als `!R` im Feld `version` der Anwesenheit zur Spielleitung
  („0.9.0 !R 1536x730“, höchstens 20 Zeichen).
* **Ablage:** Jedes Ereignis liegt sofort im `localStorage` des Team-Laptops (`src/sitzung/ablage.ts`), erst danach geht es ins Netz.
  Nach Neuladen gewinnt das längere gültige Protokoll (Ablage oder Netz).
* **Upload:** in Stücken (höchstens 100 Ereignisse je Schreibvorgang, ein Mehrpfad-Update), bei Fehlern nach einer Pause von
  2 s bis 30 s neu abgleichen, was im Netz steht. Bei Spielende vollständig. Geht es gar nicht: **⇩ Protokoll** am Laptop, bei der
  Spielleitung **Protokoll laden**.
* **Status** (`status/<team>`, H1.2): `client, lauf, seq, hoch, ts, t_s, laeuft, tempo, ende` und `eingang, zurueck, meldungen,
  wirkungen, fehl, faelle` (Text, z. B. `S1:r,S2:o`), `panzer` (Text), `bereit, verwundete` – bei Änderung, sonst alle 5 s als Lebenszeichen.
* **Start mit Verzug** (H1.4): Die Uhr-Aktion trägt die Serverzeit des Klicks; kommt sie später an, läuft die Uhr ab dieser Zeit
  (`ab_ts` im Ereignis, höchstens 60 s nachgeholt). Im Lasttest lagen alle sieben Uhren bei 5 s und 15 s Verzug auf 0,2 s bzw. 0,04 s.
* Codes: drei Zeichen aus `ACEFHJKMNPRTVWXY34679`, gespeichert klein, angezeigt groß; Räume des Tests ohne Lobby 4–32 Zeichen.
  Team-Kennung `t` + 5 Zeichen; das Team des Direktaufrufs heißt `traum`. Ein Lauf je Team, „Neues Spiel“ setzt einen neuen.

### Module

| Datei | Inhalt |
|---|---|
| `src/kern/sitzungen.ts` | Codes, Teamnamen (Würfel), Teamfarben, Rollentext |
| `src/kern/uebersicht.ts` | Statusmeldung eines Teams (`teamStatus`) und ihre Anzeige: Eingang, Fehltreffer, Schlüsselfälle live, Panzer |
| `src/sync/adapter.ts`, `firebase.ts`, `lokal.ts`, `fabrik.ts` | Schnittstelle und beide Adapter: Sitzung, Teams, Status, Läufe (Upload in Stücken), Anwesenheit, Host |
| `src/sync/verzug.ts` | künstlicher Netzverzug und Trennung um einen Adapter (Nachweis H1.6, Adresszeile `verzug=`) |
| `src/sitzung/sitzung.ts` | ein Fenster in einer Sitzung: Lobby, Teamverwaltung der SL, wer rechnet, je Team ein Spiel, Protokoll aus Datei |
| `src/sitzung/spiel.ts` | Spielstand eines Teams: **rechnen** (Team-Laptop: Host, Ablage, Upload, Status) oder **folgen** (SL, Plenum, Zuschauer) |
| `src/sitzung/ablage.ts` | Protokoll je Team und Lauf im `localStorage` des Team-Laptops |
| `src/sitzung/gemerkt.ts`, `tabwache.ts` | seit Liste K: gemerkte Kennung und Team je Sitzung; ein Tab je Kennung („hierher holen“) |
| `src/sitzung/sicht.ts` | was eine Ansicht bekommt: ein Team aus Sicht der Zielbearbeitung, der SL oder des Plenums, optional nur lesen |
| `src/engine/host.ts` | Engine eines Teams; nimmt Entscheidungen direkt und Aktionen der SL über das Netz an, Start mit Verzug |
| `src/ansichten/start.tsx`, `lobby.tsx`, `tt-fenster.tsx`, `uebersicht.tsx`, `sl-fenster.tsx` | Startseite, Lobby, Fenster des Teams, Übersicht, Fenster der Spielleitung und des Plenums |

### Lokaler Sync

Ein PC, mehrere Fenster: localStorage + BroadcastChannel und das `storage`-Ereignis (wie bisher). Im lokalen Modus und in der
Offline-Datei liegt das „hochgeladene“ Protokoll ohnehin im localStorage.

### Firebase-Regeln

`firebase/database.rules.json` (= `claude/firebase/database.rules.json`), ohne Anmeldung:

* lesbar ist nur `argus/v1/sitzungen/<code>` mit gültigem Code (oder Raum) – keine Sitzungsliste;
* `info` nur anlegen; `teams/<team>` mit gültiger Kennung, Name 1–24 Zeichen, Farbe, Lauf im Laufformat, Spieler mit Rolle
  **`zb`** (seit 2.6; vorher `g1`–`g3`), Name ≤ 40, `seit`;
* **`status/<team>`** (neu in 2.6): nur die Felder oben, Zahlen in Grenzen, Texte ≤ 200 bzw. 100 Zeichen, keine weiteren Felder;
* Protokoll und Aktionen je Team und Lauf nur anhängen, Formate und Textlängen geprüft; Absender `zb`, `sl`, `plenum`, `system`.

> **Neu veröffentlichen (seit 2.6 nötig):** Die Regeln von 2.5 kennen weder die Rolle `zb` noch den Pfad `status`. Firebase-Konsole →
> Projekt `argus-sync-e9fbc` → Realtime Database → Regeln → Inhalt durch `firebase/database.rules.json` ersetzen → Veröffentlichen.
> Danach einmal Sitzung anlegen, ein Team beitreten lassen, Spiel öffnen, Start. Lehnt Firebase ab, zeigt jede Ansicht einen roten
> Balken mit dieser Anleitung. Der Testmodus der Datenbank endet ca. 18.11.2026.

## Nachweis Liste K (11.11.2026)

| Prüfung | Ergebnis |
|---|---|
| `tests/neuoeffnen.test.ts` (14 Tests): Merker, Tab schließen und neu öffnen, Tab-Wache, Gast, Übernahme erst nach der Wartezeit und nie bei verbundenem Laptop, alter Laptop kommt zurück, Test mit Trennung, Laptop freigeben, Zeitlimit „gesendet …“, Start für den spät verbundenen Laptop, nur der letzte Start/Pause gilt, Team verlassen im Lauf, Sitzung beenden und neu anlegen | bestanden |
| `tests/firebase_regeln.test.ts`: Marke „beendet“, Übernehmen, Freigeben, `!R` in `version`, Start ohne Laptop – mit den **unveränderten** Regeln von Stand H | bestanden |
| `tools/neuoeffnen_probe.py` über die Oberfläche: lokal 14/14, Firebase-Nachbildung mit Regeln 15/15 (dort zusätzlich „Browser neu gestartet“: neuer Browserkontext mit gleichem Speicher) | bestanden |

## Nachweis „Fertig, wenn“ (2.6)

| Prüfung | Ergebnis |
|---|---|
| `tests/teams.test.ts`, `tests/sync.test.ts`: Lobby, wer rechnet, kein Übernehmen von selbst, SL verwaltet, getrennte Spielstände, Upload in Stücken, Ablage, Protokoll aus Datei | bestanden |
| `tests/firebase_regeln.test.ts` (Regeln mit targaryen): Rolle `zb`, Status je Team, Upload in Stücken, ganzer Testlauf zweier Team-Laptops | bestanden |
| `tests/firebase_adapter.test.ts` gegen die Firebase-Nachbildung: drei Team-Laptops + SL + Plenum mit **5 s und 15 s Verzug** je Richtung und Trennung | Spiel der Teams unverändert, SL holt auf, Protokolle vollständig |
| Lasttest (`tools/lasttest_probe.py`): **7 Team-Laptops + SL + Plenum** über die Nachbildung, 0 s / 5 s / 15 s Verzug, Trennung 20 s bzw. 60 s | Klick → eigener Stand max 2–4 ms; Start-Spanne ≤ 0,4 s; SL bei Spielende vollständig nach 3,8 / 18,8 / 43,8 s; Auswertung 7/7 Teams, Fälle wie ohne Netz |
| `tools/e2e_teams.py`: 7 Team-Laptops + Zuschauer + SL + Plenum über die Oberfläche (lokal; Nachbildung mit 5 s Verzug) | je Team eigener Lauf, gleicher Stand am Laptop und bei der SL, Entscheidungen nie im Netz, alles in 1530 × 800 |
| `tools/lobby_probe.py` (20 Aufgaben), `tools/bedientest_probe.py` (13 Aufgaben) | alle gelöst |
