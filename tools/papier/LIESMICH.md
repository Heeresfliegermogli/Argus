# Papierwerkzeuge Szenario 2.7 (Übergabe G+I, 10.11.2026)

Diese drei Dateien gehören nach `claude/tools/` im Projekt PolBil (dort liegen noch die Fassungen 2.5; die Fassung 2.6 lag auf dem Zweig
`uebergabe-h-papier`). Sie liegen hier nur zur Übergabe, weil das Projekt Dateien dieser Größe aus der Sitzung nicht ersetzen kann.

- `gen_drehbuch.py` – Drehbuch für eine Rolle (Szenario 2.7): E-01 ohne festes Ziel (je Schuss das erste stehende Fahrzeug der
  Reihenfolge), Auflösung von S3 nach Zeit (Zeitleiste „A-01“), Lagemeldungen 30 s, Abschnitt 13 „Auswertung und Diskussion (15 min)“
  mit Kapitelplan, Bilanz „Das ist es wert“ (ARGUS allein, naiv, ideal), Impuls (Zitate wörtlich aus den Daten) und Wertekompass
- `gen_mappe.py` – Spielleitungsmappe (41 Seiten): Zeitleiste mit E-01 und A-01, Inject-Karten mit 30 s, Teil 9 „Auswertung und
  Diskussion (15 min)“ mit Bilanz-Tabelle, Impuls, Wertekompass, Abschluss
- `karte_render.py` – Kontrollkarte und Lagekarte des Teams (unverändert gegenüber 2.6)

Aufruf in einem Ordner `tools/` mit `argus_lib.py`, `pruefe_szenario.py`, `simuliere_durchlauf.py`, `verluste.py`, `bilanz.py`
(= `tools/referenz/` auf main) und daneben `daten/` (= `public/daten/` auf main), also wie claude/tools und claude/daten im Projekt:

    python3 gen_drehbuch.py Drehbuch_ARGUS.md
    python3 karte_render.py OUT && python3 gen_mappe.py OUT/Spielleitungsmappe_ARGUS.pdf OUT
