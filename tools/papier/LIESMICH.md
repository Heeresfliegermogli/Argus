# Papierwerkzeuge Szenario 2.8 (Übergabe Liste M, 15.11.2026)

Diese drei Dateien gehören nach `claude/tools/` im Projekt PolBil (dort liegen noch ältere Fassungen; die Fassung 2.7 lag auf dem Zweig
`uebergabe-gi-papier`). Sie liegen hier nur zur Übergabe, weil das Projekt Dateien dieser Größe aus der Sitzung nicht ersetzen kann.

Gegenüber 2.7 geändert:

- `gen_drehbuch.py` – Abschnitt 9 „Druckmeldungen“: neue Regel M3.1 „Erster Einschlag bei uns → sofort eine Meldung“ mit den drei
  Feuervorbereitungen (H-01 05:00, H-04 13:35, H-12 19:50) aus den Daten; Kopf und Dateiliste mit 2.8 (`bau_szenario_v28.py`).
  I-03 und die alten Texte (I-12, „PL-PzKp (verbündet)“) kommen aus den Daten und sind damit von selbst raus.
- `gen_mappe.py` – Teil 1b: ein Satz zur ersten Meldung je Feuerquelle.
- `karte_render.py` – unverändert.

Aufruf in einem Ordner `tools/` mit `argus_lib.py`, `pruefe_szenario.py`, `simuliere_durchlauf.py`, `verluste.py`, `bilanz.py`
(= `tools/referenz/` auf main, Stand 2.8) und daneben `daten/` (= `public/daten/` auf main), also wie claude/tools und claude/daten im
Projekt:

    python3 gen_drehbuch.py Drehbuch_ARGUS.md
    python3 karte_render.py OUT && python3 gen_mappe.py OUT/Spielleitungsmappe_ARGUS.pdf OUT

Ergebnis am 15.11.: Drehbuch 2.8 (Markdown) und Spielleitungsmappe 2.8 (42 Seiten) – beide hängen am Chat bzw. liegen im Projekt.
