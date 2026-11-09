# Papierwerkzeuge Szenario 2.6 (Übergabe, 09.11.2026)

Diese drei Dateien gehören nach `claude/tools/` im Projekt PolBil (dort liegen noch die Fassungen 2.5).
Sie liegen hier nur zur Übergabe, weil das Projekt Dateien dieser Größe aus der Sitzung H nicht ersetzen konnte.

- `gen_drehbuch.py` – Drehbuch für eine Rolle (Szenario 2.6)
- `gen_mappe.py` – Spielleitungsmappe (42 Seiten, Meldekarten „ENTSCHEIDUNG · Ziel n“)
- `karte_render.py` – Kontrollkarte und Lagekarte des Teams

Aufruf im Ordner mit `argus_lib.py`, `pruefe_szenario.py`, `simuliere_durchlauf.py`, `verluste.py` (= `tools/referenz/` auf main)
und den Daten (= `public/daten/` auf main):

    python3 gen_drehbuch.py Drehbuch_ARGUS.md
    python3 karte_render.py OUT && python3 gen_mappe.py OUT/Spielleitungsmappe_ARGUS.pdf OUT
