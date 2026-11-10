#!/usr/bin/env python3
"""Probe der Auswertung (Schritt 8; seit 2.7 15 min nach Änderungsliste G): die Auflösung so durchgehen, wie die Spielleitung es am
Smartboard tut.

Ablauf (1530 × 800, wie die Dienstrechner und das Smartboard):
  1. Auswertung öffnen – Beispiel (…/?auswertung=demo, sieben Modellteams: fünf des Drehbuchs, zwei mit anderem Tempo) oder das
     Plenum einer Sitzung (Adresse mit sitzung=…&rolle=plenum; nach Spielende schaltet es selbst auf die Auswertung).
  2. Kapitel für Kapitel mit der Taste „Bild ↓“ (wie ein Presenter): Teamvergleich 1:00, S3 und S2 (Replay, je 2:00), Bilanz 2:00 (erst
     Teil 1, ein „weiter“ deckt „Nicht in der Bilanz“ auf), Impuls 1:00 (Zitat ohne Quelle, „weiter“ deckt die Quelle auf; weitere
     Zitate per Klick), Diskussion 6:00 (Wertekompass), Abschluss 1:00 – zusammen 15:00. Je Kapitel: Foto, nichts abgeschnitten (kein
     Rollbalken, kein Feld zu klein), kleinste Schrift, Zeit bis das Kapitel steht, Uhr Soll/Ist.
  3. Inhalte: Ausgang je Team und Fall mit den Sekunden bis zur Entscheidung gegen die Auswertung im Prozess (tools/drehbuch_plan.ts,
     dieselben Modellteams); Bilanz je Team und „ARGUS allein“ gegen den Plan (Feindfahrzeuge, Wert, Fehlbekämpfungen ohne Eurowert);
     Zitate wörtlich (Liste G, G3.3) mit Quelle und Pflichtzeile; Wertekompass mit fünf Leitfragen; vier Kernaussagen, Schlussfrage.
  4. Replay je Schlüsselfall: ▶ (läuft im Tempo des Falls, ca. 45 s je Fall), Team per Klick und Ziffer, Sprung über eine Marke der
     Zeitleiste, Karte steht und zeichnet, Drohnenbild groß mit Lupe (Esc schließt), „Wie lange habt ihr hingeschaut?“, Notizen der SL 2.
  5. Zuschaltbar (Menü „+“): Kennzahlen, Konfidenz, Preis des Abwartens und Fall S1 – erscheinen an ihrer Stelle, die Uhr wächst; danach
     wieder der Standard.
  6. Export: JSON ohne Freitexte (keine Team- und Personennamen, mit Bilanz und Referenzlauf), mit Freitexten, CSV.

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
KAPITEL = ["teams", "S3", "S2", "bilanz", "impuls", "diskussion", "abschluss"]
BUDGET = {"teams": 60, "S3": 120, "S2": 120, "bilanz": 120, "impuls": 60, "diskussion": 360, "abschluss": 60}
FAELLE = ("S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8")
# Zitate wörtlich nach Liste G (G3.3)
ZITATE = {
    "zitat": "I have much more trust in a statistical mechanism than a soldier who lost a friend two days ago. […] The machine did it coldly. And that made it easier.",
    "karp": "… when it's necessary, to scare enemies and on occasion kill them.",
    "thiel": "A.I. is a military technology.",
    "luckey": "And my point to them is, where's the moral high ground in a landmine that can't tell the difference between a school bus full of kids and a Russian tank?",
    "guterres": "politically unacceptable, morally repugnant",
}
PFLICHT = "Die israelische Armee bestreitet wesentliche Darstellungen des Berichts."

LAYOUT_JS = """
() => {
  const de = document.documentElement;
  const zuGross = [];
  const main = document.querySelector('[data-testid=auswertung]');
  for (const el of [main, ...main.querySelectorAll('.tafel, .replay, .replay-links, .replay-rechts, .panel > .rumpf, .fall-kopf, .leitfragen, .g1-bild, .vergleich')]) {
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
    teams = s.eval_on_selector_all("[data-testid=teamvergleich] thead th[data-team]", "hs => hs.map(h => ({ id: h.dataset.team, name: h.querySelector('.team-marke span').textContent }))")
    print("Teams:", ", ".join(t["name"] for t in teams))

    def foto(name):
        s.screenshot(path=os.path.join(a.bilder, f"{name}.png"))

    def layout(name):
        lay = s.evaluate(LAYOUT_JS)
        if lay["seite"][0] > W or lay["seite"][1] > H:
            fehler.append(f"{name}: Seite {lay['seite']} größer als {W}×{H}")
        if lay["zuGross"]:
            fehler.append(f"{name}: {lay['zuGross'][:3]}")
        if lay["schrift"]["min"] < 12:
            fehler.append(f"{name}: kleinste Schrift {lay['schrift']['min']} px")
        return lay

    def kapitel_jetzt():
        return s.locator("[data-testid=auswertung]").get_attribute("data-kapitel")

    def text(testid):
        return s.get_by_test_id(testid).inner_text() if s.get_by_test_id(testid).count() else ""

    def pruefe_kapitel(nr, k):
        nonlocal schritte
        lay = layout(k)
        foto(f"{nr + 1}_{k}")
        protokoll.append((k, protokoll_dauer.get(k, 0), lay["schrift"]))
        uhr = s.get_by_test_id("zeitbudget").inner_text()
        if k in BUDGET and f"/ {BUDGET[k] // 60:02d}:{BUDGET[k] % 60:02d}" not in uhr:
            fehler.append(f"{k}: Uhr zeigt nicht das Soll {BUDGET[k]} s ({uhr!r})")
        if k == "teams":
            ist = s.eval_on_selector_all("[data-testid=teamvergleich] td[data-fall]",
                                         "cs => cs.map(c => ({ team: c.dataset.team, fall: c.dataset.fall, ausgang: c.dataset.ausgang, text: c.textContent ?? '' }))")
            tabelle = {}
            for c in ist:
                tabelle.setdefault(c["team"], {})[c["fall"]] = c
            breite = s.evaluate("() => { const t = document.querySelector('[data-testid=teamvergleich]'); return [t.scrollWidth, t.clientWidth, t.getBoundingClientRect().right]; }")
            if breite[2] > W:
                fehler.append(f"Teamvergleich ragt über 1530 px hinaus ({breite})")
            for i, t in enumerate(teams):
                zeile = tabelle[t["id"]]
                print(f"  {t['name'][:18]:<18} " + "  ".join(f"{f}:{z['ausgang'][:7]:<7}" for f, z in zeile.items()))
                if not any(re.search(r"\b\d+ s\b", z["text"]) for z in zeile.values()):
                    fehler.append(f"Teamvergleich {t['name']}: keine Sekunden bis zur Entscheidung in den Zellen")
                if plan and i < len(plan["teams"]):
                    soll = plan["teams"][i]["auswertung"]["faelle"]
                    for f, z in soll.items():
                        if zeile[f]["ausgang"] != z["ausgang"]:
                            fehler.append(f"Teamvergleich {t['name']} {f}: {zeile[f]['ausgang']} / im Prozess {z['ausgang']}")
        elif k == "kennzahlen":
            kz = s.eval_on_selector_all("[data-testid=kennzahlen] tbody tr", """rs => rs.map(r => {
                const w = (k) => r.querySelector(`[data-kz=${k}] .wert`)?.textContent.trim();
                return { team: r.dataset.team, fehl: w('fehl'), warnung: w('warnung'), widerspruch: w('widerspruch'),
                         recht: r.querySelector('[data-kz=widerspruch] .unter')?.textContent, zeit: w('zeit'), lm: w('lm') }; })""")
            for i, x in enumerate(kz):
                print(f"  {teams[i]['name'][:18]:<18} Fehl {x['fehl']} · trotz Warnung {x['warnung']} · Widerspruch {x['widerspruch']} ({x['recht']}) · Median {x['zeit']} · I-04 {x['lm']}")
                if not re.match(r"^\d+(,\d)? s$", x["zeit"] or ""):
                    fehler.append(f"Kennzahlen {teams[i]['name']}: Sekunden je Entscheidung fehlen ({x['zeit']})")
                if plan and i < len(plan["teams"]):
                    soll = plan["teams"][i]["auswertung"]["kennzahlen"]
                    pruef = [("fehl", str(soll["fehl"])), ("warnung", str(soll["warnung"])), ("widerspruch", str(soll["widerspruch"]))]
                    if soll.get("sek_median") is not None and demo:
                        pruef.append(("zeit", f"{int(soll['sek_median'] + 0.5)} s"))  # wie Math.round
                    for feld, wert in pruef:
                        if x[feld] != wert:
                            fehler.append(f"Kennzahlen {teams[i]['name']} {feld}: {x[feld]} / im Prozess {wert}")
                    if f"{soll['zu_recht']} zu Recht" not in (x["recht"] or ""):
                        fehler.append(f"Kennzahlen {teams[i]['name']}: {x['recht']} / im Prozess {soll['zu_recht']} zu Recht")
        elif k == "konfidenz":
            falsch = s.eval_on_selector_all("[data-falsch]", "gs => gs.map(g => g.dataset.falsch)")
            if not {"M08", "M12", "M20", "M21"} <= set(falsch):
                fehler.append(f"Konfidenz: falsche Empfehlungen {falsch}")
            if "Konfidenz sagt nicht" not in text("kernaussage"):
                fehler.append("Konfidenz: Kernaussage fehlt")
        elif k in FAELLE:
            warte(lambda: s.locator("[data-testid=replay-karte][data-bereit='1']").count() == 1, 30, f"Karte {k}")
            r = s.locator("section.replay")
            von, bis, tempo = float(r.get_attribute("data-von")), float(r.get_attribute("data-bis")), float(r.get_attribute("data-tempo"))
            replay_s = (bis - von) / tempo
            fragen = s.locator("[data-testid=leitfragen] li").count()
            notizen = s.locator("[data-testid=notizen-sl] li").count()
            hin = text("hingeschaut")
            if "Wie lange habt ihr hingeschaut?" not in hin or "20 seconds for each target" not in hin:
                fehler.append(f"{k}: „Wie lange habt ihr hingeschaut?“ mit Zitat fehlt ({hin[:80]!r})")
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
            zeilen = s.locator(".zl-zeile")
            if zeilen.count() > 1:
                zeilen.nth(1).locator(".zl-name").click()
                warte(lambda: r.get_attribute("data-team") == teams[1]["id"], 5, f"{k}: Team 2 per Klick")
            if len(teams) > 2:
                s.keyboard.press("3")
                warte(lambda: r.get_attribute("data-team") == teams[2]["id"], 5, f"{k}: Team 3 per Ziffer")
            marke = s.locator(".zl-zeile.an .zl-marke[data-art=einschlag], .zl-zeile.an .zl-marke[data-art=entscheid]").last
            if s.locator(".zl-marke[data-art=entscheid]").count() == 0:
                fehler.append(f"{k}: keine Entscheidung in der Zeitleiste")
            if marke.count():
                soll_t = marke.get_attribute("title")
                marke.dispatch_event("pointerdown")
                s.wait_for_timeout(400)
                foto(f"{nr + 1}_{k}_sprung")
                protokoll.append((f"{k} Sprung", 0, {"titel": soll_t, "t": r.get_attribute("data-t")}))
            if k == "S3":
                # seit 2.7 (I3.2, I4.2): Auflösung um 21:45 in der Zeitleiste, I-04 gelesen nach x s / ungelesen verschwunden
                titel = s.eval_on_selector_all(".zl-marke", "ms => ms.map(m => m.title)")
                if not any("I-04" in x and ("gelesen nach" in x or "ungelesen verschwunden" in x) for x in titel):
                    fehler.append("S3: I-04 ohne „gelesen nach x s“ / „ungelesen verschwunden“")
                if demo and not any("als verbündet erkannt" in x for x in titel):
                    fehler.append("S3: Auflösung (als verbündet erkannt) fehlt in der Zeitleiste")
            s.locator("[data-testid=team-bild] [data-testid=drohnenbild]").click()
            warte(lambda: s.locator("[data-testid=vergroesserung]").count() == 1, 5, f"{k}: Vergrößerung")
            s.mouse.move(W / 2, H / 2)
            s.wait_for_timeout(500)
            foto(f"{nr + 1}_{k}_lupe")
            s.keyboard.press("Escape")
            warte(lambda: s.locator("[data-testid=vergroesserung]").count() == 0, 5, f"{k}: Vergrößerung zu")
            if kapitel_jetzt() != k:
                fehler.append(f"{k}: Esc in der Lupe hat das Kapitel gewechselt")
            s.keyboard.press("1")
            print(f"  {k}: Fenster {von:.0f}–{bis:.0f} s, Replay ×{tempo:.0f} = {replay_s:.0f} s, {fragen} Leitfragen, {notizen} Notizen SL 2, Karte {fps} Bilder/s")
            if replay_s > 60:
                fehler.append(f"{k}: Replay dauert {replay_s:.0f} s (Budget je Fall 120 s)")
            if fragen < 3:
                fehler.append(f"{k}: nur {fragen} Leitfragen")
        elif k == "preis":
            n_teams = len(teams)
            n_kurven = s.locator(".preis-kurve").count()
            n_zeilen = s.locator(".preis-tabelle tbody tr").count()
            if n_kurven != n_teams or n_zeilen != n_teams:
                fehler.append(f"Preis des Abwartens: {n_kurven} Kurven, {n_zeilen} Zeilen für {n_teams} Teams")
            if "Druck war gebaut" not in text("offenlegung"):
                fehler.append("Preis des Abwartens: Offenlegung fehlt")
            print(f"  preis: {n_kurven} Kurven, {s.locator('.preis-marke').count()} Marken")
        elif k == "bilanz":
            warte(lambda: "wird gerechnet" not in text("bilanz"), 20, "Bilanz: Referenzlauf „ARGUS allein“ gerechnet")
            lay = layout("bilanz (ARGUS allein)")
            foto(f"{nr + 1}_bilanz")
            werte = s.eval_on_selector_all("table.bilanz tr.bz-haupt td", "ts => ts.map(t => ({ id: t.dataset.spalte, wert: t.querySelector('.bz-wert b')?.textContent }))")
            spalten = [w["id"] for w in werte]
            if spalten[-1] != "argus" or spalten[:-1] != [t["id"] for t in teams]:
                fehler.append(f"Bilanz: Spalten {spalten} – Teams in fester Reihenfolge, „ARGUS allein“ zuletzt")
            if s.locator("tr.bz-fehl").count():
                fehler.append("Bilanz: Fehlbekämpfungen schon vor dem Aufdecken sichtbar")
            if plan:
                soll = [(t["auswertung"].get("bilanz") or {}).get("wert_mio") for t in plan["teams"]]
                ist = [float(w["wert"].replace(",", ".")) if w["wert"] else None for w in werte[:-1]]
                for i, (x, y) in enumerate(zip(ist, soll)):
                    if y is not None and (demo or i < 2) and abs((x or 0) - y) > 0.005:
                        fehler.append(f"Bilanz {teams[i]['name']}: Wert {x} / im Prozess {y}")
                ref = plan.get("referenz")
                if ref and abs(float(werte[-1]["wert"].replace(",", ".")) - ref["wert_mio"]) > 0.005:
                    fehler.append(f"Bilanz ARGUS allein: Wert {werte[-1]['wert']} / im Prozess {ref['wert_mio']}")
            print("  bilanz: " + " · ".join(f"{w['id']} {w['wert']} Mio €" for w in werte))
            hinweis = text("bilanz-hinweis-sl")
            if "Warum braucht es euch noch?" not in hinweis:
                fehler.append(f"Bilanz: Hinweis für die SL fehlt ({hinweis[:60]!r})")
            # „weiter“ deckt Teil 2 auf, ohne das Kapitel zu wechseln
            s.keyboard.press("PageDown")
            schritte += 1
            warte(lambda: s.locator("tr.bz-fehl").count() == 7, 5, "Bilanz: Teil 2 aufgedeckt (7 Arten)")
            if kapitel_jetzt() != "bilanz":
                fehler.append("Bilanz: „weiter“ hat das Kapitel gewechselt statt aufzudecken")
            teil2 = s.eval_on_selector_all("tr.bz-fehl", "rs => rs.map(r => r.innerText)")
            if any("€" in z or "Mio" in z for z in teil2):
                fehler.append("Bilanz: Fehlbekämpfungen mit Eurowert")
            fehl = s.eval_on_selector_all("tr.bz-fehl", "rs => rs.map(r => [r.dataset.fehl, [...r.querySelectorAll('td')].map(t => t.querySelector('b')?.textContent ?? '0')])")
            if plan:
                for art, zellen in fehl:
                    for i, t in enumerate(plan["teams"][:len(teams)]):
                        b = (t["auswertung"].get("bilanz") or {}).get("fehl", {})
                        if (demo or i < 2) and str(b.get(art, 0)) != zellen[i]:
                            fehler.append(f"Bilanz {teams[i]['name']} {art}: {zellen[i]} / im Prozess {b.get(art)}")
                    ref = plan.get("referenz") or {}
                    if ref and str(ref["fehl"].get(art, 0)) != zellen[-1]:
                        fehler.append(f"Bilanz ARGUS allein {art}: {zellen[-1]} / im Prozess {ref['fehl'].get(art)}")
            layout("bilanz aufgedeckt")
            foto(f"{nr + 1}_bilanz_aufgedeckt")
        elif k == "impuls":
            folie = s.get_by_test_id("impuls").get_attribute("data-folie")
            t0 = text("impuls")
            if folie != "zitat" or ZITATE["zitat"] not in t0.replace("\n", " ") or "Stimmt ihr zu?" not in t0:
                fehler.append(f"Impuls Folie 1: {folie} {t0[:120]!r}")
            for verraet in ("Lavender", "+972", "israel", "Gaza"):
                if verraet.lower() in t0.lower():
                    fehler.append(f"Impuls Folie 1 verrät die Quelle ({verraet})")
            s.keyboard.press("PageDown")
            schritte += 1
            warte(lambda: s.get_by_test_id("impuls").get_attribute("data-folie") == "aufgedeckt", 5, "Impuls: Quelle aufgedeckt")
            t1 = text("impuls")
            for muss in ("„Lavender“", "+972 Magazine, Yuval Abraham, 03.04.2024", "I had zero added value as a human, apart from being a stamp of approval.",
                         "statistically it's fine. So you go for it.", "bis zu 15–20 zivile Tote je niedrigrangigem Ziel als zulässig", PFLICHT):
                if muss not in t1:
                    fehler.append(f"Impuls Folie 2: fehlt {muss!r}")
            layout("impuls aufgedeckt")
            foto(f"{nr + 1}_impuls_aufgedeckt")
            s.get_by_test_id("impuls-weitere").click()
            for fid in ("karp", "thiel", "luckey", "guterres"):
                s.locator(f"[data-impuls={fid}]").click()
                warte(lambda: s.get_by_test_id("impuls").get_attribute("data-folie") == fid, 5, f"Impuls {fid}")
                tz = text("impuls").replace("\n", " ")
                if ZITATE[fid] not in tz:
                    fehler.append(f"Impuls {fid}: Zitat nicht wörtlich ({tz[:140]!r})")
                layout(f"impuls {fid}")
                foto(f"{nr + 1}_impuls_{fid}")
        elif k == "diskussion":
            t = text("diskussion")
            for w in ("Menschenwürde", "Freiheit", "Frieden", "Gerechtigkeit", "Solidarität", "Demokratie", "Grundrechte", "Tapferkeit", "Treue",
                      "Kameradschaft", "Disziplin", "Gehorsam", "Mut", "Vertrauen", "Bescheidenheit"):
                if w not in t:
                    fehler.append(f"Diskussion: Wert/Tugend {w} fehlt")
            if s.locator(".leitfragen-diskussion li").count() != 5:
                fehler.append("Diskussion: nicht fünf Leitfragen")
        elif k == "abschluss":
            t = text("schluss")
            if "ihr oder ARGUS" not in t:
                fehler.append("Schlussfrage fehlt")
            if s.locator(".kernaussage-karte").count() != 4:
                fehler.append("Abschluss: nicht vier Kernaussagen")

    protokoll_dauer = {}
    for nr, k in enumerate(KAPITEL):
        if nr:
            t1 = time.time()
            for _ in range(8):
                if kapitel_jetzt() == k:
                    break
                s.keyboard.press("PageDown")
                schritte += 1
                s.wait_for_timeout(150)
            warte(lambda: kapitel_jetzt() == k, 10, f"Kapitel {k}")
            protokoll_dauer[k] = time.time() - t1
        s.wait_for_timeout(700 if k not in FAELLE else 1500)
        pruefe_kapitel(nr, k)
    gesamt = s.get_by_test_id("zeitbudget").inner_text()
    if "/ 15:00" not in gesamt:
        fehler.append(f"Uhr gesamt: {gesamt!r} (Soll 15:00)")

    # ---------------------------------------------------------------- Zuschalten: Kennzahlen, Konfidenz, Preis, Fall S1
    s.keyboard.press("Home")
    warte(lambda: kapitel_jetzt() == "teams", 5, "Pos1 zum Teamvergleich")
    s.get_by_test_id("kapitel-plus").click()
    for zid in ("kennzahlen", "konfidenz", "preis"):
        if s.locator(f"[data-zusatz={zid}]").count():
            s.locator(f"[data-zusatz={zid}]").check()
    s.locator("[data-fall-wahl=S1]").check()
    s.keyboard.press("Escape")
    chips = s.eval_on_selector_all(".kapitel-leiste [data-kapitel]", "bs => bs.map(b => b.dataset.kapitel)")
    soll_chips = ["teams", "kennzahlen", "konfidenz", "S3", "S2", "S1", "preis", "bilanz", "impuls", "diskussion", "abschluss"]
    if "preis" not in chips:
        soll_chips.remove("preis")
    if chips != soll_chips:
        fehler.append(f"Zuschalten: Kapitel {chips} / erwartet {soll_chips}")
    foto("zusatz_kapitelleiste")
    for k in ("kennzahlen", "konfidenz", "S1", "preis"):
        if k not in chips:
            continue
        s.locator(f".kapitel-leiste [data-kapitel={k}]").click()
        warte(lambda: kapitel_jetzt() == k, 10, f"Kapitel {k}")
        s.wait_for_timeout(700 if k not in FAELLE else 1500)
        alt = dict(BUDGET)
        BUDGET.update({"kennzahlen": 45, "konfidenz": 30, "preis": 60, "S3": 80, "S2": 80, "S1": 80})
        pruefe_kapitel(len(KAPITEL), k)
        BUDGET.clear()
        BUDGET.update(alt)
    # zurück zum Standard
    s.get_by_test_id("kapitel-plus").click()
    for zid in ("kennzahlen", "konfidenz", "preis"):
        if s.locator(f"[data-zusatz={zid}]").count():
            s.locator(f"[data-zusatz={zid}]").uncheck()
    s.locator("[data-fall-wahl=S1]").uncheck()
    s.keyboard.press("Escape")
    chips = s.eval_on_selector_all(".kapitel-leiste [data-kapitel]", "bs => bs.map(b => b.dataset.kapitel)")
    if chips != KAPITEL:
        fehler.append(f"Standard wiederhergestellt? {chips}")

    # ---------------------------------------------------------------- Navigation zurück
    s.keyboard.press("End")
    warte(lambda: kapitel_jetzt() == KAPITEL[-1], 5, "Ende")
    s.keyboard.press("PageUp")
    warte(lambda: kapitel_jetzt() == KAPITEL[-2], 5, f"Bild ↑ zurück zu {KAPITEL[-2]}")
    s.keyboard.press("Home")
    warte(lambda: kapitel_jetzt() == "teams", 5, "Pos1 zum Teamvergleich")
    # Klick auf eine Zelle im Teamvergleich öffnet das Replay dieses Falls für dieses Team (auch einen nicht gewählten Fall)
    zelle = s.locator(f"[data-testid=teamvergleich] td[data-team='{teams[-1]['id']}'][data-fall='S1']")
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
    if not all("bilanz" in t for t in ex["teams"]) or "referenz" not in ex:
        fehler.append("Export: Bilanz je Team oder Referenzlauf fehlt")
    if '"text"' in downloads["json"] or "notizen_spielleitung" in downloads["json"]:
        fehler.append("Export ohne Freitexte enthält Freitexte")
    if demo and "Lupe" not in downloads["json-freitext"]:
        fehler.append("Export mit Freitexten: Notizen fehlen")
    if "bilanz_wert_mio_eur" not in downloads["csv"] or "ARGUS allein;" not in downloads["csv"]:
        fehler.append("CSV: Bilanz fehlt")
    print(f"Export: JSON {len(downloads['json']) // 1024} KB, mit Freitexten {len(downloads['json-freitext']) // 1024} KB, CSV {len(downloads['csv'].splitlines())} Zeilen – keine Namen")

    return fehler, protokoll, schritte


def bericht(protokoll, schritte):
    print("\nKapitel                Zeit bis sichtbar   kleinste Schrift   Text < 14 px")
    for k, dauer, schrift in protokoll:
        if "min" in schrift:
            print(f"  {k:<20} {dauer:>6.2f} s           {schrift['min']:>5.1f} px        {schrift['klein']:>3} von {schrift['n']}")
    summe = sum(BUDGET[k] for k in KAPITEL)
    print(f"\nZeitbudget: {' + '.join(f'{BUDGET[k] // 60}:{BUDGET[k] % 60:02d}' for k in KAPITEL if BUDGET[k])} = {summe // 60}:{summe % 60:02d} min")
    print(f"Bedienschritte für die ganze Auflösung: {schritte} (Bild ↓ je Kapitel und Schritt, ▶ je Fall) – dazu nach Bedarf Team (Ziffer/Klick) und Sprung über die Zeitleiste")


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
