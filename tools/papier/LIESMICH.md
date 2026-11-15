# Papierwerkzeuge Szenario 2.8 (Übergabe Liste O, 15.11.2026)

Diese drei Dateien gehören nach `claude/tools/` im Projekt PolBil (dort liegen noch ältere Fassungen; die Fassung von Liste M lag auf dem
Zweig `uebergabe-m-papier`). Sie liegen hier nur zur Übergabe, weil das Projekt Dateien dieser Größe aus der Sitzung nicht ersetzen kann.

Gegenüber Liste M geändert (Liste O, kurzes Plenum):

- `gen_drehbuch.py` – Abschnitt 13 heißt jetzt „Plenum (5 min) – danach PowerPoint“, sobald das Szenario `auswertung.faelle` hat:
  Ablauf des Blocks (PowerPoint → Start → These für später → Spiel → Plenum ca. 5 min → PowerPoint mit These, Zitat, Diskussion),
  Tabelle Gefecht beendet / S3, S2, S1, S4 je 0:45 (ARGUS-Zeile, „Es war: …“ aus `schluesselfaelle[].wirklich`) / Gesamt mit der Zahl,
  Zählregel „falsch behandelt“, Werte der Drehbuch-Teams (je Fall 3 von 5 – 60 %, die Zahl 20 s). Die Kapitel von 2.7 stehen darunter als
  „zuschaltbar“. Ohne `auswertung.faelle` (Szenario bis Liste N) wie bisher.
- `gen_mappe.py` – Teil 9 entsprechend: „Plenum (5 min) – danach PowerPoint“ mit derselben Tabelle; Bilanz, Impuls, Replay darunter
  als zuschaltbare Kapitel (Inhalte unverändert).
- `karte_render.py` – unverändert.

Aufruf in einem Ordner `tools/` mit `argus_lib.py`, `pruefe_szenario.py`, `simuliere_durchlauf.py`, `verluste.py`, `bilanz.py`
(= `tools/referenz/` auf main, Stand 2.8 Liste O) und daneben `daten/` (= `public/daten/` auf main), also wie claude/tools und claude/daten
im Projekt:

    python3 gen_drehbuch.py Drehbuch_ARGUS.md
    python3 karte_render.py OUT && python3 gen_mappe.py OUT/Spielleitungsmappe_ARGUS.pdf OUT

Ergebnis am 15.11. (Liste O): Drehbuch 2.8 (Markdown, Abschnitt 13 neu) und Spielleitungsmappe 2.8 (Teil 9 neu) – beide hängen am Chat.
