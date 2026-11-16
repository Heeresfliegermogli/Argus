# Papierwerkzeuge Szenario 2.9 (Übergabe Liste Q, 16.11.2026; zuvor Liste P)

Diese drei Dateien gehören nach `claude/tools/` im Projekt PolBil (dort liegen noch ältere Fassungen; die Fassung von Liste O lag auf dem
Zweig `uebergabe-o-papier`). Sie liegen hier nur zur Übergabe, weil das Projekt Dateien dieser Größe aus der Sitzung nicht ersetzen kann.

Gegenüber Liste P geändert (Liste Q, Szenario unverändert 2.9 – keine Personennamen mehr, nur Teamnamen):

- `gen_drehbuch.py` – Abschnitt 1 „Teamnamen statt Namen“: in der Lobby nur ein Teamname, Laptops heißen nach ihrem Gerät,
  Umbenennen in der Lobby und bis zum Start im Team-Fenster, danach nur die Spielleitung; auch auf Papier nur Teamnamen.
- `gen_mappe.py` – Deckblatt: „Das Team trägt nur einen Teamnamen, keine Namen von Personen“; Teamkarte und Beobachtungsbogen mit
  einer Zeile „Team: ____“ (nur der Teamname).
- `karte_render.py` – unverändert.

Gegenüber Liste O geändert (Liste P, Szenario 2.9):

- `gen_drehbuch.py` – Kanone „2. Kp“; Abschnitt 6 (Lagemeldungen) zeigt je Meldung alle Fassungen mit „nur, wenn …“ (aus `behauptet`
  der Daten), Reserve mit „Nur, wenn …“; Zeitleiste: M38 („Ziel 33a“) als bedingte Meldung, Durchbruch „nur, wenn ARGUS eines der Fahrzeuge
  spätestens 60 s vorher gemeldet hat; dann I-13 mit Namen“; Text zum Durchbruch und zu den ungemeldeten Z-27/Z-28 nachgezogen.
- `gen_mappe.py` – Kanone „2. Kp“, Teamkarte „Kanone reicht nur bis zum Ortsanfang KRÄHE“; Zeitleiste mit M38 („nur, wenn bis dahin eine
  Freigabe auf Z-15/Z-16/Z-17 kam“); Inject-Karten mit den Fassungen zum Ankreuzen („nur, wenn …“ / „sonst“) und Lücken für {durch},
  {ueber}, {getroffen_zahl}; Meldekarten nach Zeit sortiert (Nummer „33a“).
- `karte_render.py` – eigene Panzer mit dem Zeichen „Kampfpanzer, schwer“ (drei Striche).

Aufruf in einem Ordner `tools/` mit `argus_lib.py`, `behauptung.py` (neu), `pruefe_szenario.py`, `simuliere_durchlauf.py`, `verluste.py`,
`bilanz.py` (= `tools/referenz/` auf main, Stand 2.9 Liste P) und daneben `daten/` (= `public/daten/` auf main), also wie claude/tools und
claude/daten im Projekt:

    python3 gen_drehbuch.py Drehbuch_ARGUS.md
    python3 karte_render.py OUT && python3 gen_mappe.py OUT/Spielleitungsmappe_ARGUS.pdf OUT

Ergebnis am 16.11. (Liste P): Drehbuch 2.9 (Markdown) und Spielleitungsmappe 2.9 (PDF, 44 Seiten) – beide hängen am Chat.
Liste Q (16.11. abends): beide neu erzeugt, Inhalt sonst gleich.
