#!/usr/bin/env python3
"""Probe Änderungen F (Szenario 2.5, „Panzerzug“) auf der Oberfläche; bis 2.4 prüfte sie D1–D5 mit drei Zügen.

Ein Team im Direktaufruf (SL, Aufklärung, Zielprüfung, Führung, Plenum; lokaler Sync), Uhr über die Steuerung der SL,
ohne Entscheidungen der Rollen (der Zeitplan läuft, der 1. Zug nimmt Schaden):
  F1  Alle Rollen sehen die vier Panzer 1/1–1/4 auf der Karte (Zeichen, Beschriftung), gezoomt als Sprites in Stellung
      (intakt, eingeschränkt, ausgefallen); Feinde nach Ground Truth nur auf der Kontrollkarte.
  F2.6 Kopfzeile in jedem Fenster „1. Zug: b/4 einsatzbereit · n Verwundete“ mit einem Balken je Panzer, überall gleich;
      ein getroffener Panzer blinkt (Tempo ×1).
  F2.7 Druckmeldungen K-… vom „1. Zug“ je Panzer im Postfach der Führung (≤ 140 Zeichen mit Absender), I-07 nennt 1/4.
  D4  Empfehlungskarte der Führung kompakt (eine Meldung durch die Kette).
  F2.9 Auswertung (Beispiel, 5 Teams): „Preis des Abwartens“ mit dem Zustand der vier Panzer je Team, Marken, Leitfragen.
Jede Ansicht in 1530 × 800 ohne Rollbalken, keine Konsolenfehler. Fotos in --bilder.

Aufruf (nach `npm run build` und `npx vite preview --port 4173`):
  python3 tools/verluste_probe.py http://localhost:4173/ --bilder verluste-bilder
"""
import argparse
import os
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

W, H = 1530, 800
LAYOUT_JS = """
() => {
  const de = document.documentElement;
  const zuGross = [];
  for (const r of document.querySelectorAll('.panel > .rumpf:not([data-liste])')) {
    if (r.scrollHeight > r.clientHeight + 2 || r.scrollWidth > r.clientWidth + 2) {
      const t = r.parentElement.querySelector('header h2')?.textContent?.trim() || '?';
      zuGross.push(`${t}: ${r.scrollWidth}×${r.scrollHeight} in ${r.clientWidth}×${r.clientHeight}`);
    }
  }
  for (const el of document.querySelectorAll('.stapel, .inhalt, main')) {
    if (el.scrollHeight > el.clientHeight + 2) zuGross.push(`${el.className}: Höhe ${el.scrollHeight} > ${el.clientHeight}`);
  }
  return { seite: [de.scrollWidth, de.scrollHeight], zuGross };
}
"""
KARTE_JS = """
(id) => { const e = document.querySelector(`[data-testid=${id}] .karte-leinwand`); return e && e.argusKarte ? e.argusKarte.diagnose : null }
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
        time.sleep(0.05)
    raise AssertionError(f"{text} nicht erfüllt nach {sek} s" + (f" ({letzter})" if letzter else ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("basis")
    ap.add_argument("--bilder", default="verluste-bilder")
    ap.add_argument("--raum", default=f"verl-{int(time.time()) % 100000}")
    a = ap.parse_args()
    os.makedirs(a.bilder, exist_ok=True)
    fehler, konsole = [], []

    def url(**q):
        sep = "&" if "?" in a.basis else "?"
        return f"{a.basis}{sep}{urllib.parse.urlencode({'sync': 'lokal', **q})}"

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-background-timer-throttling",
                                          "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"])
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)

        def seite(name, adresse):
            s = ctx.new_page()
            s.on("console", lambda m, n=name: konsole.append(f"{n}: {m.type}: {m.text}") if m.type == "error" else None)
            s.on("pageerror", lambda e, n=name: konsole.append(f"{n}: pageerror: {e}"))
            s.goto(adresse)
            return s

        def foto(s, name):
            lay = s.evaluate(LAYOUT_JS)
            if lay["seite"][0] > W or lay["seite"][1] > H:
                fehler.append(f"{name}: Seite {lay['seite']} größer als {W}×{H}")
            for z in lay["zuGross"]:
                fehler.append(f"{name}: abgeschnitten – {z}")
            s.screenshot(path=os.path.join(a.bilder, f"{name}.png"))

        def pruefe(bed, text):
            if not bed:
                fehler.append(text)
                print("  ✗", text)
            else:
                print("  ✓", text)

        sl = seite("SL", url(rolle="sl", raum=a.raum, name="SL 1"))
        warte(lambda: sl.locator(".rahmen[data-host='1']").count() == 1, 30, "SL steuert")
        g1, g2, g3, pl = (seite(r.upper(), url(rolle=r, raum=a.raum)) for r in ["g1", "g2", "g3", "plenum"])
        for s, r in [(g1, "g1"), (g2, "g2"), (g3, "g3")]:
            warte(lambda: s.locator(f"[data-testid=einweisung-{r}]").count() == 1, 20, f"Einweisung {r}")
            s.get_by_test_id("einweisung-ueberspringen").click()
        karten = [(sl, "kontrollkarte", "SL"), (g1, "g1-karte", "Aufklärung"), (g2, "lagekarte", "Zielprüfung"), (g3, "lagekarte", "Führung")]
        for s, k, _ in karten:
            warte(lambda: s.locator(f"[data-testid={k}] .karte-leinwand").count() == 1, 20, f"Karte {k}")

        def zustand():
            return sl.evaluate("() => { const z = window.argus.stand.zustand; return { t: window.argus.spielzeit(), laeuft: z.uhr.laeuft } }")

        def zeit(mmss, tempo=None):
            if zustand()["laeuft"]:
                sl.get_by_role("button", name="❚❚ Anhalten").click()
                warte(lambda: not zustand()["laeuft"], 5, "Uhr steht")
            sl.fill("[data-testid=sl-zeit]", mmss)
            sl.get_by_role("button", name="Spielzeit setzen").click()
            m, s_ = mmss.split(":")
            warte(lambda: abs(zustand()["t"] - (int(m) * 60 + float(s_))) < 0.3, 10, f"Spielzeit {mmss}")
            if tempo:
                sl.get_by_role("button", name=f"×{tempo}", exact=True).click()

        # ---------------------------------------------------------------- D4 Empfehlungskarte kompakt
        print("D4 – Empfehlungskarte der Führung (eine Meldung durch die Kette)")
        zeit("00:25")
        warte(lambda: g1.get_by_test_id("g1-offen").inner_text() != "0", 10, "Meldung bei der Aufklärung")
        mid = g1.evaluate("() => window.argus.stand.zustand.reihenfolge.filter((id) => window.argus.stand.zustand.meldungen[id].stufe === 'g1')")[-1]
        g1.locator(f".kmarke[data-meldung={mid}]").first.click()
        g1.get_by_test_id("g1-annehmen").click()
        warte(lambda: g2.locator(f".kmarke[data-meldung={mid}]").count() > 0, 10, f"{mid} bei der Zielprüfung")
        g2.locator(f".kmarke[data-meldung={mid}]").first.click()
        g2.locator("label[data-wm=LM]").click()
        g2.wait_for_timeout(300)
        g2.get_by_test_id("g2-bekaempfen").click()
        warte(lambda: g3.locator(f".kmarke[data-meldung={mid}]").count() > 0, 10, f"{mid} bei der Führung")
        g3.locator(f".kmarke[data-meldung={mid}]").first.click()
        warte(lambda: g3.get_by_test_id("g3-jetzt").count() == 1, 10, "Empfehlung offen")
        karte_h = g3.evaluate("() => document.querySelector('.g3-karte').getBoundingClientRect().height")
        txt = g3.locator(".g3-karte").inner_text()
        pruefe(karte_h <= 150, f"Empfehlungskarte kompakt: {karte_h:.0f} px hoch")
        pruefe("Zielprüfung" in txt and "Loitering" in txt and "Einschlag" in txt and "%" in txt, "Karte nennt Ziel, Klasse, Konfidenz, Empfehlung mit Wirkmittel und Einschlag")
        foto(g3, "d4_empfehlungskarte")
        g3.get_by_test_id("g3-ablehnen").click()

        # ---------------------------------------------------------------- F2.6 Kopfzeile, F1 Karten
        print("F1/F2.6 – vier Panzer und Kopfzeile (18:40, ohne Entscheidungen)")
        zeit("18:40")
        time.sleep(1.5)
        stand = {}
        for s, n in [(sl, "SL"), (g1, "Aufklärung"), (g2, "Zielprüfung"), (g3, "Führung"), (pl, "Plenum")]:
            warte(lambda: s.get_by_test_id("kp-stand").count() == 1, 10, f"Kopfzeile {n}")
            b = s.get_by_test_id("kp-stand")
            balken = s.evaluate("() => [...document.querySelectorAll('[data-testid=kp-stand] .pz-balken')].map(e => `${e.dataset.pz}:${e.dataset.stufe}:${e.dataset.zustand}`)")
            stand[n] = (b.get_attribute("data-bereit"), b.get_attribute("data-verwundete"), tuple(balken), b.inner_text(), b.get_attribute("class"))
        werte = {v[:3] for v in stand.values()}
        pruefe(len(werte) == 1, f"Kopfzeile in allen Fenstern gleich: {stand['Führung'][3]} {stand['Führung'][2]} ({len(werte)} Werte)")
        txt = stand["Führung"][3]
        pruefe(txt.startswith("1. Zug: ") and "/4 einsatzbereit" in txt and ("Verwundete" in txt or "Verwundeter" in txt or "keine Verwundeten" in txt),
               f"Text „1. Zug: b/4 einsatzbereit · n Verwundete“: {txt}")
        pruefe([x.split(":")[0] for x in stand["Führung"][2]] == ["1/1", "1/2", "1/3", "1/4"], "je Panzer ein Balken (1/1–1/4)")
        bereit = int(stand["Führung"][0])
        for s, k, n in karten:
            warte(lambda: (s.evaluate(KARTE_JS, k) or {}).get("eigene", {}).get("zeichen", 0) + (s.evaluate(KARTE_JS, k) or {}).get("eigene", {}).get("sprites", 0) > 0, 10, f"eigene Panzer {n}")
            d = s.evaluate(KARTE_JS, k)["eigene"]
            pruefe(sorted(d["texte"]) == ["1/1", "1/2", "1/3", "1/4"], f"{n}: vier Panzer beschriftet {d['texte']} {d['stufen']}")
        foto(g3, "f1_fuehrung_1840")
        foto(sl, "f1_kontrollkarte_1840")
        foto(g1, "f1_aufklaerung_1840")

        # gezoomt: Panzer in Stellung (Sprites)
        sl.evaluate("() => { const e = document.querySelector('[data-testid=kontrollkarte] .karte-leinwand'); e.argusKarte.zeigeAuf([60, 440], 5) }")
        time.sleep(1.2)
        d = sl.evaluate(KARTE_JS, "kontrollkarte")["eigene"]
        pruefe(d["sprites"] >= 3, f"Kontrollkarte gezoomt: Panzer in Stellung als Sprites ({d['sprites']}, {d['stufen']})")
        foto(sl, "f1_stellung_gezoomt")
        g3.evaluate("() => { const e = document.querySelector('[data-testid=lagekarte] .karte-leinwand'); e.argusKarte.zeigeAuf([70, 440], 4.5) }")
        time.sleep(1.2)
        d = g3.evaluate(KARTE_JS, "lagekarte")["eigene"]
        pruefe(d["sprites"] >= 3, f"Führung gezoomt: Panzer in Stellung ({d['sprites']})")
        foto(g3, "f1_fuehrung_gezoomt")
        g3.evaluate("() => { const e = document.querySelector('[data-testid=lagekarte] .karte-leinwand'); e.argusKarte.ganzeKarte() }")

        # ---------------------------------------------------------------- F2.7 Druckmeldungen und Blinken
        print("F2.7 – Druckmeldungen je Panzer und Treffer am Panzer")
        km = g3.locator("[data-testid=postfach] [data-inject^='K-']")
        pruefe(km.count() >= 3, f"Postfach der Führung: {km.count()} Druckmeldungen des Zuges")
        texte = g3.evaluate("""() => [...document.querySelectorAll("[data-testid=postfach] [data-inject]")].map(e => ({
            id: e.dataset.inject, von: e.querySelector('.kopfzeile span')?.textContent.split(' · ').slice(1).join(' · '),
            text: (e.querySelector('.text') || e.querySelector('.einzeilig'))?.textContent, dringend: e.classList.contains('dringend') }))""")
        lang = [t for t in texte if len(f"{t['von']}: {t['text']}") > 140]
        pruefe(not lang, f"alle {len(texte)} Lagemeldungen im Postfach ≤ 140 Zeichen mit Absender" + (f" – zu lang: {lang[:2]}" if lang else ""))
        i07 = next((t for t in texte if t["id"] == "I-07"), None)
        pruefe(bool(i07) and i07["text"].startswith("1/4 unter Mörserfeuer aus Hof RABE,"), f"I-07 nennt 1/4: {i07 and i07['text']}")
        k_texte = [t for t in texte if t["id"].startswith("K-")]
        pruefe(all(t["von"] == "1. Zug" for t in k_texte), "Druckmeldungen vom „1. Zug“")
        pruefe(all(any(n in (t["text"] or "") for n in ("1/1", "1/2", "1/3", "1/4")) for t in k_texte), "jede Druckmeldung nennt ihren Panzer")
        foto(g3, "f2_postfach_1840")
        # Blinken: 1/4 liegt unter Mörserfeuer aus Hof RABE (eine Salve alle 30 s), Tempo ×1
        zeit("18:41", tempo=1)
        sl.get_by_role("button", name="▶ Start").click()
        gesehen = set()
        ende = time.time() + 40
        while time.time() < ende and not gesehen:
            for s, k, _ in karten[:1] + karten[3:]:
                gesehen |= set(s.evaluate(KARTE_JS, k)["eigene"]["flackern"])
            time.sleep(0.05)
        pruefe(bool(gesehen), f"Zeichen blinkt bei Treffer (gesehen: {sorted(gesehen)})")
        sl.get_by_role("button", name="❚❚ Anhalten").click()
        warte(lambda: not zustand()["laeuft"], 5, "Uhr steht")

        # spät im Spiel: Panzer ausgefallen (grau), Untergrenze
        zeit("24:50")
        time.sleep(1.5)
        b = g3.get_by_test_id("kp-stand")
        bereit2 = int(b.get_attribute("data-bereit"))
        zst = g3.evaluate("() => [...document.querySelectorAll('[data-testid=kp-stand] .pz-balken')].map(e => [e.dataset.stufe, Number(e.dataset.zustand)])")
        pruefe(bereit2 <= bereit and bereit2 >= 2, f"ohne Abwehr: {bereit}/4 → {bereit2}/4 einsatzbereit, höchstens zwei ausgefallen")
        pruefe(all(z >= 40 for st, z in zst if st != "ausgefallen"), f"Zug hält (Untergrenze): {zst}")
        foto(g3, "f2_fuehrung_2450")
        foto(pl, "f1_plenum_2450")
        sl.evaluate("() => { const e = document.querySelector('[data-testid=kontrollkarte] .karte-leinwand'); e.argusKarte.zeigeAuf([60, 440], 5) }")
        time.sleep(1.2)
        foto(sl, "f2_stellung_gezoomt_2450")

        # ---------------------------------------------------------------- D5 Auswertung
        print("F2.9 – Auswertung „Preis des Abwartens“ (Beispiel, 5 Teams)")
        aw = seite("Auswertung", f"{a.basis}?auswertung=demo")
        warte(lambda: aw.locator("button[data-kapitel=preis]").count() == 1, 30, "Kapitel Preis")
        aw.click("button[data-kapitel=preis]")
        warte(lambda: aw.get_by_test_id("preis").count() == 1, 10, "Preis des Abwartens")
        time.sleep(0.6)
        n_kurven = aw.locator(".preis-kurve").count()
        n_marken = aw.locator(".preis-marke").count()
        pruefe(n_kurven == 5, f"fünf Kurven (mittlerer Zustand der vier Panzer) ({n_kurven})")
        n_pz = aw.locator(".preis-panzer").count()
        pruefe(n_pz == 5, f"Zustand der vier Panzer je Team ({n_pz} Zeilen)")
        pruefe(n_marken >= 10, f"Marken S4/N4/S3 auf den Kurven ({n_marken})")
        lf = aw.get_by_test_id("preis-leitfragen").inner_text()
        pruefe("um welchen Preis" in lf and "war das richtig" in lf, "Leitfragen „um welchen Preis?“ / „war das richtig?“")
        of = aw.get_by_test_id("offenlegung").inner_text()
        pruefe("Druck war gebaut" in of and "Art. 51 Abs. 5 lit. b" in of and "Art. 57" in of and "Innere Führung" in of, "Offenlegung mit Bezügen")
        klein = aw.evaluate("() => Math.min(...[...document.querySelectorAll('[data-testid=preis] text, [data-testid=preis] td, [data-testid=preis] p, [data-testid=preis] li')].map(e => parseFloat(getComputedStyle(e).fontSize)))")
        svg_f = aw.evaluate("() => { const s = document.querySelector('[data-testid=preis] svg'); const r = s.getBoundingClientRect(); return r.width / s.viewBox.baseVal.width }")
        pruefe(klein * (svg_f if svg_f < 1 else 1) >= 13, f"kleinste Schrift ≥ 13 px (≈ {klein * min(svg_f, 1):.1f} px)")
        budget = aw.get_by_test_id("zeitbudget").inner_text()
        pruefe("01:00" in budget and "12:00" in budget, f"Zeitbudget Kapitel 1:00, gesamt 12:00 ({budget.split()})")
        foto(aw, "f2_preis_des_abwartens")

        browser.close()

    print()
    for k in konsole:
        print("KONSOLE:", k)
    for f in fehler:
        print("FEHLER:", f)
    if fehler or konsole:
        print(f"{len(fehler)} Fehler, {len(konsole)} Konsolenfehler")
        sys.exit(1)
    print("OK – F: vier Panzer, Kopfzeile je Panzer, Druckmeldungen, Blinken, Empfehlungskarte, Preis des Abwartens, alles in 1530×800")


if __name__ == "__main__":
    main()
