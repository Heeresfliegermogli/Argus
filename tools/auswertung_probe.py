#!/usr/bin/env python3
"""Probe der Auswertung (Schritt 8): die Auflösung so durchgehen, wie die Spielleitung es am Smartboard tut.

Ablauf (1530 × 800, wie die Dienstrechner und das Smartboard):
  1. Auswertung öffnen – Beispiel (…/?auswertung=demo, fünf Modellteams des Drehbuchs) oder das Plenum einer Sitzung
     (Adresse mit sitzung=…&rolle=plenum; nach Spielende schaltet es selbst auf die Auswertung).
  2. Kapitel für Kapitel mit der Taste „Bild ↓“ (wie ein Presenter): Teamvergleich, Kennzahlen, Konfidenz, S3, S2, S1, S4,
     Schlussfrage. Je Kapitel: Foto, nichts abgeschnitten (kein Rollbalken, kein Feld zu klein), kleinste Schrift,
     Zeit bis das Kapitel steht.
  3. Inhalte: Ausgang je Team und Fall und die Kennzahlen gegen die Auswertung im Prozess (tools/drehbuch_plan.ts,
     dieselben Modellteams); Konfidenz (falsche Empfehlungen M08, M12, M20, M21, Kernaussage); Leitfragen je Fall.
  4. Replay je Schlüsselfall: ▶ (läuft im Tempo des Falls, ca. 45 s je Fall), Team per Klick und Ziffer, Sprung über
     eine Marke der Zeitleiste, Karte steht und zeichnet, Drohnenbild groß mit Lupe (Esc schließt), Notizen der SL 2.
  5. Export: JSON ohne Freitexte (keine Team- und Personennamen), mit Freitexten, CSV.
  6. Zeitbudget: 12 min (2 min Kennzahlen, je Fall 2,5 min) und Zahl der Bedienschritte für die ganze Auflösung.

Aufruf (nach `npm run build` und `npx vite preview --port 4173`):
  python3 tools/auswertung_probe.py http://localhost:4173/ --bilder auswertung-probe
  python3 tools/auswertung_probe.py "http://localhost:4173/?sitzung=K7P&rolle=plenum&sync=lokal" --erwartet plan.json
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time

from playwright.sync_api import sync_playwright

W, H = 1530, 800
HIER = os.path.dirname(os.path.abspath(__file__))
KAPITEL = ["teams", "kennzahlen", "konfidenz", "S3", "S2", "S1", "S4", "schluss"]
BUDGET = {"teams": 45, "kennzahlen": 45, "konfidenz": 30, "S3": 150, "S2": 150, "S1": 150, "S4": 150, "schluss": 0}

LAYOUT_JS = """
() => {
  const de = document.documentElement;
  const zuGross = [];
  const main = document.querySelector('[data-testid=auswertung]');
  for (const el of [main, ...main.querySelectorAll('.tafel, .replay, .replay-links, .replay-rechts, .panel > .rumpf, .fall-kopf, .leitfragen, .g1-bild')]) {
    if (!el) continue;
    if (el.scrollHeight > el.clientHeight + 2) zuGross.push(`${el.className}: Höhe ${el.scrollHeight} > ${el.clientHeight}`);
    if (el.scrollWidth > el.clientWidth + 2) zuGross.push(`${el.className}: Breite ${el.scrollWidth} > ${el.clientWidth}`);
  }
  for (const el of document.querySelectorAll('.kopf, .kapitel-leiste')) {
    if (el.scrollWidth > el.clientWidth + 2) zuGross.push(`${el.className}: Breite ${el.scrollWidth} > ${el.clientWidth}`);
  }
  // kleinste sichtbare Schrift (Text, der nicht nur Zierde ist)
  let min = 99, klein = 0, n = 0;
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode;
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none') continue;
    if (el.closest('.karte, .drohne, .karte-legende, svg')) continue;   // Karte und Bild haben eigene Regeln
    const fs = parseFloat(st.fontSize);
    n++;
    min = Math.min(min, fs);
    if (fs < 14) klein++;
  }
  return { seite: [de.scrollWidth, de.scrollHeight], zuGross, schrift: { min, klein, n } };
}
"""


def warte(bedingung, sek=15, text="Bedingung"):
    ende = time.time() + sek
    letzter = None
    while time.time() < ende:
        try:
            if bedingung():
                return
        except Exception as e:  # noqa: BLE001
            letzter = e
        time.sleep(0.1)
    raise AssertionError(f"{text} nicht erfüllt nach {sek} s" + (f" ({letzter})" if letzter else ""))


def erwartung(pfad):
    if pfad:
        return json.load(open(pfad, encoding="utf-8"))
    ziel = os.path.join(tempfile.mkdtemp(), "plan.json")
    subprocess.run(["npx", "vite-node", os.path.join(HIER, "drehbuch_plan.ts"), "--", ziel], check=True, cwd=os.path.dirname(HIER),
                   stdout=subprocess.DEVNULL)
    return json.load(open(ziel, encoding="utf-8"))


def pruefe_auswertung(s, plan, bilder, demo, praefix=""):
    """Geht die Auswertung im Fenster s Kapitel für Kapitel durch (wie die Spielleitung) und prüft Inhalt, Layout und
    Bedienung. Gibt Fehler, Bericht (je Kapitel) und die Zahl der Bedienschritte zurück. Auch für tools/e2e_drehbuch.py."""
    fehler, protokoll = [], []
    schritte = 0
    a = argparse.Namespace(bilder=bilder)
    teams = s.eval_on_selector_all("[data-testid=teamvergleich] tbody tr", "rs => rs.map(r => ({ id: r.dataset.team, name: r.querySelector('.team-marke span').textContent }))")
    print("Teams:", ", ".join(t["name"] for t in teams))

    def foto(name):
        s.screenshot(path=os.path.join(a.bilder, f"{name}.png"))

    def layout(name):
        lay = s.evaluate(LAYOUT_JS)
        if lay["seite"][0] > W or lay["seite"][1] > H:
            fehler.append(f"{name}: Seite {lay['seite']} größer als {W}×{H}")
        if lay["zuGross"]:
            fehler.append(f"{name}: {lay['zuGross'][:3]}")
        if lay["schrift"]["min"] < 13:
            fehler.append(f"{name}: kleinste Schrift {lay['schrift']['min']} px")
        return lay

    for nr, k in enumerate(KAPITEL):
        if nr:
            t1 = time.time()
            s.keyboard.press("PageDown")
            schritte += 1
            warte(lambda: s.locator(f"[data-testid=auswertung][data-kapitel='{k}']").count() == 1, 10, f"Kapitel {k}")
            if k in ("S3", "S2", "S1", "S4"):
                warte(lambda: s.locator("[data-testid=replay-karte][data-bereit='1']").count() == 1, 30, f"Karte {k}")
            dauer = time.time() - t1
        else:
            dauer = 0
        s.wait_for_timeout(700 if k not in ("S3", "S2", "S1", "S4") else 1500)
        lay = layout(k)
        foto(f"{nr + 1}_{k}")
        protokoll.append((k, dauer, lay["schrift"]))

        # ---------------------------------------------------------------- Inhalte je Kapitel
        if k == "teams":
            ist = s.eval_on_selector_all("[data-testid=teamvergleich] td[data-fall]",
                                         "cs => cs.map(c => ({ team: c.closest('tr').dataset.team, fall: c.dataset.fall, ausgang: c.dataset.ausgang, stufe: c.querySelector('.glied.entscheidend')?.className.match(/\\bg-(g[123])\\b/)?.[1] ?? null }))")
            tabelle = {}
            for c in ist:
                tabelle.setdefault(c["team"], {})[c["fall"]] = c
            for i, t in enumerate(teams):
                zeile = tabelle[t["id"]]
                print(f"  {t['name'][:18]:<18} " + "  ".join(f"{f}:{z['ausgang'][:7]:<7}{('@' + z['stufe']) if z['stufe'] else '':<4}" for f, z in zeile.items()))
                if plan and i < len(plan["teams"]):
                    soll = plan["teams"][i]["auswertung"]["faelle"]
                    for f, z in soll.items():
                        if zeile[f]["ausgang"] != z["ausgang"] or (z["stufe"] and (zeile[f]["stufe"] or "").lower() != z["stufe"]):
                            fehler.append(f"Teamvergleich {t['name']} {f}: {zeile[f]['ausgang']}@{zeile[f]['stufe']} / im Prozess {z['ausgang']}@{z['stufe']}")
        elif k == "kennzahlen":
            kz = s.eval_on_selector_all("[data-testid=kennzahlen] tbody tr", """rs => rs.map(r => {
                const w = (k) => r.querySelector(`[data-kz=${k}] .wert`)?.textContent.trim();
                return { team: r.dataset.team, fehl: w('fehl'), warnung: w('warnung'), widerspruch: w('widerspruch'),
                         recht: r.querySelector('[data-kz=widerspruch] .unter')?.textContent, ft: w('ft'), lm: w('lm'), hinweise: w('hinweise') }; })""")
            for i, x in enumerate(kz):
                print(f"  {teams[i]['name'][:18]:<18} Fehl {x['fehl']} · trotz Warnung {x['warnung']} · Widerspruch {x['widerspruch']} ({x['recht']}) · FT {x['ft']} · I-04 {x['lm']} · Hinweise {x['hinweise']}")
                if plan and i < len(plan["teams"]):
                    soll = plan["teams"][i]["auswertung"]["kennzahlen"]
                    pruef = [("fehl", str(soll["fehl"])), ("warnung", str(soll["warnung"])), ("widerspruch", str(soll["widerspruch"])),
                             ("ft", "EIN" if soll["ft"] else "aus"), ("hinweise", str(soll["lagehinweise"]))]
                    for feld, wert in pruef:
                        if x[feld] != wert:
                            fehler.append(f"Kennzahlen {teams[i]['name']} {feld}: {x[feld]} / im Prozess {wert}")
                    if f"{soll['zu_recht']} zu Recht" not in (x["recht"] or ""):
                        fehler.append(f"Kennzahlen {teams[i]['name']}: {x['recht']} / im Prozess {soll['zu_recht']} zu Recht")
        elif k == "konfidenz":
            falsch = s.eval_on_selector_all("[data-falsch]", "gs => gs.map(g => g.dataset.falsch)")
            if sorted(falsch) != ["M08", "M12", "M20", "M21"]:
                fehler.append(f"Konfidenz: falsche Empfehlungen {falsch}")
            if "Konfidenz sagt nicht" not in s.get_by_test_id("kernaussage").inner_text():
                fehler.append("Konfidenz: Kernaussage fehlt")
        elif k in ("S3", "S2", "S1", "S4"):
            r = s.locator("section.replay")
            von, bis, tempo = float(r.get_attribute("data-von")), float(r.get_attribute("data-bis")), float(r.get_attribute("data-tempo"))
            replay_s = (bis - von) / tempo
            fragen = s.locator("[data-testid=leitfragen] li").count()
            notizen = s.locator("[data-testid=notizen-sl] li").count()
            # ▶ abspielen: läuft im Tempo des Falls
            t_vor = float(r.get_attribute("data-t"))
            s.get_by_test_id("replay-play").click()
            schritte += 1
            s.wait_for_timeout(3000)
            t_nach = float(r.get_attribute("data-t"))
            s.keyboard.press(" ")  # Pause (Leertaste)
            gelaufen = t_nach - t_vor
            if not (tempo * 3 * 0.55 <= gelaufen <= tempo * 3 * 1.5):
                fehler.append(f"{k}: Replay lief {gelaufen:.1f} s Spielzeit in 3 s (Tempo ×{tempo:.0f})")
            fps = s.locator("[data-testid=replay-karte] .karte-leinwand").get_attribute("data-fps")
            foto(f"{nr + 1}_{k}_abgespielt")
            # Team per Klick auf die Zeile, dann per Ziffer
            zeilen = s.locator(".zl-zeile")
            if zeilen.count() > 1:
                zeilen.nth(1).locator(".zl-name").click()
                warte(lambda: r.get_attribute("data-team") == teams[1]["id"], 5, f"{k}: Team 2 per Klick")
            if len(teams) > 2:
                s.keyboard.press("3")
                warte(lambda: r.get_attribute("data-team") == teams[2]["id"], 5, f"{k}: Team 3 per Ziffer")
            # Sprung über die Marke „Einschlag“ oder die letzte Entscheidung der Führung
            marke = s.locator(".zl-zeile.an .zl-marke[data-art=einschlag], .zl-zeile.an .zl-marke[data-art=g3]").last
            if marke.count():
                soll_t = marke.get_attribute("title")
                marke.dispatch_event("pointerdown")
                s.wait_for_timeout(400)
                foto(f"{nr + 1}_{k}_sprung")
                protokoll.append((f"{k} Sprung", 0, {"titel": soll_t, "t": r.get_attribute("data-t")}))
            # Drohnenbild groß mit Lupe, Esc schließt
            s.locator("[data-testid=g1-bild] [data-testid=drohnenbild]").click()
            warte(lambda: s.locator("[data-testid=vergroesserung]").count() == 1, 5, f"{k}: Vergrößerung")
            s.mouse.move(W / 2, H / 2)
            s.wait_for_timeout(500)
            foto(f"{nr + 1}_{k}_lupe")
            s.keyboard.press("Escape")
            warte(lambda: s.locator("[data-testid=vergroesserung]").count() == 0, 5, f"{k}: Vergrößerung zu")
            if s.locator("[data-testid=auswertung]").get_attribute("data-kapitel") != k:
                fehler.append(f"{k}: Esc in der Lupe hat das Kapitel gewechselt")
            s.keyboard.press("1")  # zurück zum ersten Team für das nächste Kapitel
            print(f"  {k}: Fenster {von:.0f}–{bis:.0f} s, Replay ×{tempo:.0f} = {replay_s:.0f} s, {fragen} Leitfragen, {notizen} Notizen SL 2, Karte {fps} Bilder/s")
            if replay_s > 50:
                fehler.append(f"{k}: Replay dauert {replay_s:.0f} s (Budget je Fall 150 s)")
            if fragen < 3:
                fehler.append(f"{k}: nur {fragen} Leitfragen")
        elif k == "schluss":
            if "ihr oder ARGUS" not in s.get_by_test_id("schluss").inner_text():
                fehler.append("Schlussfrage fehlt")

    # ---------------------------------------------------------------- Navigation zurück
    s.keyboard.press("PageUp")
    warte(lambda: s.locator("[data-testid=auswertung][data-kapitel='S4']").count() == 1, 5, "Bild ↑ zurück zu S4")
    s.keyboard.press("Home")
    warte(lambda: s.locator("[data-testid=auswertung][data-kapitel='teams']").count() == 1, 5, "Pos1 zum Teamvergleich")
    # Klick auf eine Zelle im Teamvergleich öffnet das Replay dieses Falls für dieses Team
    zelle = s.locator(f"[data-testid=teamvergleich] tr[data-team='{teams[-1]['id']}'] td[data-fall='S1']")
    zelle.click()
    warte(lambda: s.locator("section.replay[data-fall='S1']").count() == 1, 10, "Zelle → Replay S1")
    if s.locator("section.replay").get_attribute("data-team") != teams[-1]["id"]:
        fehler.append("Zelle im Teamvergleich: Replay zeigt nicht das gewählte Team")

    # ---------------------------------------------------------------- Export
    namen = [t["name"] for t in teams]
    downloads = {}
    for art in ("json", "json-freitext", "csv"):
        s.get_by_test_id("export-knopf").click()
        with s.expect_download() as d:
            s.locator(f"[data-export='{art}']").click()
        pfad = os.path.join(a.bilder, d.value.suggested_filename)
        d.value.save_as(pfad)
        downloads[art] = open(pfad, encoding="utf-8-sig").read()
    for art, inhalt in downloads.items():
        for n in namen:
            if n in inhalt:
                fehler.append(f"Export {art}: Teamname „{n}“ enthalten")
        if re.search(r"Lt [GS]", inhalt):
            fehler.append(f"Export {art}: Personenname enthalten")
    ex = json.loads(downloads["json"])
    if [t["team"] for t in ex["teams"]] != [f"Team {chr(65 + i)}" for i in range(len(teams))]:
        fehler.append(f"Export: Teams {[t['team'] for t in ex['teams']]}")
    if '"text"' in downloads["json"] or "notizen_spielleitung" in downloads["json"]:
        fehler.append("Export ohne Freitexte enthält Freitexte")
    if demo and "Attrappe" not in downloads["json-freitext"]:
        fehler.append("Export mit Freitexten: Notizen fehlen")
    print(f"Export: JSON {len(downloads['json']) // 1024} KB, mit Freitexten {len(downloads['json-freitext']) // 1024} KB, CSV {len(downloads['csv'].splitlines())} Zeilen – keine Namen")

    return fehler, protokoll, schritte


def bericht(protokoll, schritte):
    print("\nKapitel                Zeit bis sichtbar   kleinste Schrift   Text < 14 px")
    for k, dauer, schrift in protokoll:
        if "min" in schrift:
            print(f"  {k:<20} {dauer:>6.2f} s           {schrift['min']:>5.1f} px        {schrift['klein']:>3} von {schrift['n']}")
    print(f"\nZeitbudget: {' + '.join(f'{BUDGET[k] // 60}:{BUDGET[k] % 60:02d}' for k in KAPITEL if BUDGET[k])} = {sum(BUDGET.values()) // 60}:{sum(BUDGET.values()) % 60:02d} min")
    print(f"Bedienschritte für die ganze Auflösung: {schritte} (Bild ↓ je Kapitel, ▶ je Fall) – dazu nach Bedarf Team (Ziffer/Klick) und Sprung über die Zeitleiste")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("adresse", help="Basis der Spielseite (Beispiel ?auswertung=demo) oder Plenum-Adresse einer Sitzung")
    ap.add_argument("--bilder", default="auswertung-probe")
    ap.add_argument("--erwartet", default=None, help="Plan aus tools/drehbuch_plan.ts (Ausgang je Fall); sonst neu erzeugt")
    ap.add_argument("--ohne-vergleich", action="store_true", help="Inhalte nicht mit dem Plan vergleichen (andere Teams)")
    a = ap.parse_args()
    os.makedirs(a.bilder, exist_ok=True)
    demo = "sitzung=" not in a.adresse
    url = a.adresse if not demo else a.adresse.rstrip("/") + "/?auswertung=demo"
    plan = None if a.ohne_vergleich else erwartung(a.erwartet)
    fehler, konsole = [], []

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-gpu", "--disable-software-rasterizer"])
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1, accept_downloads=True)
        s = ctx.new_page()
        s.on("console", lambda m: konsole.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        s.on("pageerror", lambda e: konsole.append(f"pageerror: {e}"))
        t0 = time.time()
        s.goto(url)
        warte(lambda: s.locator("[data-testid=auswertung]").count() == 1, 60, "Auswertung sichtbar")
        print(f"Auswertung offen nach {time.time() - t0:.1f} s ({'Beispiel' if demo else 'Sitzung'})")
        fehler2, protokoll, schritte = pruefe_auswertung(s, plan, a.bilder, demo)
        fehler += fehler2

        relevante = [k for k in konsole if "GPU stall" not in k and "WebGL" not in k and "swiftshader" not in k.lower() and "favicon" not in k]
        if any("pageerror" in k or k.startswith("error") for k in relevante):
            fehler.append(f"Konsole: {relevante[:3]}")
        browser.close()

    bericht(protokoll, schritte)
    if fehler:
        print("FEHLER:", *fehler[:40], sep="\n  ")
        sys.exit(1)
    print("OK – Auswertung vollständig, in 1530×800 ohne Rollbalken, Inhalte wie die Auswertung im Prozess")


if __name__ == "__main__":
    main()
