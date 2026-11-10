#!/usr/bin/env python3
"""Probe Panzerzug und Beschuss der eigenen Kp auf der Oberfläche (Änderungen F, Szenario 2.5; seit 2.6 eine Rolle, H3.3, H5.6, H5.7).

Ein Team im Direktaufruf (SL, Zielbearbeitung, Plenum; lokaler Sync), Uhr über die Steuerung der SL:
  E3.2 Knopf „BEKÄMPFEN mit LM ×2 – Bestand 20 → 18“ (Ziel 1, zwei Fahrzeuge), Bestand groß in der Kopfzeile (H5.6).
  F1   Alle Karten zeigen die vier Panzer 1/1–1/4 (Zeichen, Beschriftung), gezoomt als Sprites in Stellung.
  F2.6 Kopfzeile: Zielbearbeitung mit den vier Panzern (Zustand je Panzer), SL und Plenum „1. Kp: b/4 einsatzbereit …“ – überall
       derselbe Stand.
  H5.7 Beschuss der eigenen Panzer deutlich sichtbar (16:45 bei Tempo ×1, direktes Feuer auf 1/1): auf der Karte Mündungsblitz
       am Schützen und Leuchtspur zum Panzer, der getroffene Panzer blinkt in der Kopfzeile, kurzer roter Rand am Bildschirm;
       der erste Beschuss jedes Panzers kommt als Lagemeldung der 1. Kp in den Feed.
  H3.3 Lagemeldungen am Spielende: Druckmeldungen wegen Artillerie/Mörser mindestens 2 min auseinander, keine Hintergrund-
       meldungen der Feindartillerie (H-01, H-04, H-12) im Feed, jede Meldung ≤ 140 Zeichen mit Absender.
  F2.9 Auswertung (Beispiel, 7 Teams): „Preis des Abwartens“ mit dem Zustand der vier Panzer je Team, Marken, Leitfragen.
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
        zb, pl = (seite(n, url(rolle=r, raum=a.raum)) for n, r in [("Zielbearbeitung", "zb"), ("Plenum", "plenum")])
        warte(lambda: zb.get_by_test_id("tour").count() == 1, 20, "Übersicht")
        zb.get_by_test_id("tour-ueberspringen").click()
        zb.get_by_test_id("einweisung-ueberspringen").click()
        karten = [(sl, "kontrollkarte", "SL"), (zb, "lagekarte", "Zielbearbeitung"), (pl, "lagekarte", "Plenum")]
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

        # ---------------------------------------------------------------- E3.2 / H5.6 Bestand
        print("E3.2/H5.6 – BEKÄMPFEN mit Bestand, Bestand in der Kopfzeile")
        zeit("00:25")
        warte(lambda: zb.get_by_test_id("offene-meldung").get_attribute("data-meldung") == "M01", 10, "Ziel 1 offen")
        zb.locator("label[data-wm=LM]").click()
        knopf = zb.get_by_test_id("zb-bekaempfen").inner_text()
        pruefe("BEKÄMPFEN mit LM ×2" in knopf and "Bestand 20 → 18" in knopf, f"Knopf „{' – '.join(knopf.splitlines())}“")
        lm_vorher = zb.get_by_test_id("bestand").locator("[data-wm=LM]").inner_text()
        foto(zb, "e32_bekaempfen_lm_x2")
        zb.get_by_test_id("zb-bekaempfen").click()
        warte(lambda: zb.get_by_test_id("bestand").locator("[data-wm=LM]").get_attribute("data-bestand") == "18", 5, "Bestand LM 18")
        pruefe(lm_vorher.replace(" ", "").replace("\n", "") == "LM20", f"Kopfzeile vorher „{lm_vorher}“, jetzt LM 18")

        # ---------------------------------------------------------------- F2.6 Kopfzeile, F1 Karten
        print("F1/F2.6 – vier Panzer und Kopfzeile (18:40, ohne weitere Entscheidungen)")
        zeit("18:40")
        time.sleep(1.5)
        pz = zb.evaluate("() => [...document.querySelectorAll('[data-testid=panzer-leiste] .pz-kachel')].map(e => `${e.dataset.pz}:${e.dataset.stufe}:${e.dataset.zustand}`)")
        bereit_zb = zb.get_by_test_id("panzer-leiste").get_attribute("data-bereit")
        pruefe([x.split(":")[0] for x in pz] == ["1/1", "1/2", "1/3", "1/4"], f"Zielbearbeitung: je Panzer eine Kachel {pz}")
        stand = {}
        for s, n in [(sl, "SL"), (pl, "Plenum")]:
            warte(lambda: s.get_by_test_id("kp-stand").count() == 1, 10, f"Kopfzeile {n}")
            b = s.get_by_test_id("kp-stand")
            balken = s.evaluate("() => [...document.querySelectorAll('[data-testid=kp-stand] .pz-balken')].map(e => `${e.dataset.pz}:${e.dataset.stufe}:${e.dataset.zustand}`)")
            stand[n] = (b.get_attribute("data-bereit"), tuple(balken), b.inner_text())
        pruefe(all(v[0] == bereit_zb and list(v[1]) == pz for v in stand.values()), f"überall derselbe Stand: {bereit_zb}/4 {pz}")
        txt = stand["SL"][2]
        pruefe(txt.startswith("1. Kp: ") and "/4 einsatzbereit" in txt, f"SL „1. Kp: b/4 einsatzbereit …“: {txt}")
        bereit = int(bereit_zb)
        for s, k, n in karten:
            warte(lambda: (s.evaluate(KARTE_JS, k) or {}).get("eigene", {}).get("zeichen", 0) + (s.evaluate(KARTE_JS, k) or {}).get("eigene", {}).get("sprites", 0) > 0, 10, f"eigene Panzer {n}")
            d = s.evaluate(KARTE_JS, k)["eigene"]
            pruefe(sorted(d["texte"]) == ["1/1", "1/2", "1/3", "1/4"], f"{n}: vier Panzer beschriftet {d['texte']} {d['stufen']}")
        foto(zb, "f1_zielbearbeitung_1840")
        foto(sl, "f1_kontrollkarte_1840")

        # gezoomt: Panzer in Stellung (Sprites)
        for s, k, n in karten[:2]:
            s.evaluate(f"() => {{ const e = document.querySelector('[data-testid={k}] .karte-leinwand'); e.argusKarte.zeigeAuf([60, 440], 5) }}")
            time.sleep(1.2)
            d = s.evaluate(KARTE_JS, k)["eigene"]
            pruefe(d["sprites"] >= 3, f"{n} gezoomt: Panzer in Stellung als Sprites ({d['sprites']}, {d['stufen']})")
            foto(s, f"f1_stellung_gezoomt_{k}")
            s.evaluate(f"() => {{ const e = document.querySelector('[data-testid={k}] .karte-leinwand'); e.argusKarte.ganzeKarte() }}")

        # ---------------------------------------------------------------- H5.7 Beschuss sichtbar
        print("H5.7 – Beschuss der eigenen Panzer (16:45, Tempo ×1)")
        zeit("16:45", tempo=1)
        zb.evaluate("""() => { window.__h57 = { rand: 0, kachel: new Set() };
            new MutationObserver(() => { const r = document.querySelector('.rahmen'); if (r && r.classList.contains('treffer-rand')) window.__h57.rand++;
              for (const k of document.querySelectorAll('.pz-kachel.getroffen')) window.__h57.kachel.add(k.dataset.pz); })
              .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); }""")
        sl.get_by_role("button", name="▶ Start").click()
        gezeigt, flackern, foto_da = set(), set(), False
        ende = time.time() + 30
        while time.time() < ende:
            d = zb.evaluate(KARTE_JS, "lagekarte")
            gezeigt |= set(d["gezeigt"])
            flackern |= set(d["eigene"]["flackern"])
            if not foto_da and zb.locator(".rahmen.treffer-rand").count():
                zb.screenshot(path=os.path.join(a.bilder, "h57_treffer_zielbearbeitung.png"))
                foto_da = True
            if foto_da and {"muendungsblitz", "leuchtspur"} <= gezeigt and time.time() > ende - 15:
                break
            time.sleep(0.05)
        sl.get_by_role("button", name="❚❚ Anhalten").click()
        warte(lambda: not zustand()["laeuft"], 5, "Uhr steht")
        h57 = zb.evaluate("() => ({ rand: window.__h57.rand, kachel: [...window.__h57.kachel] })")
        pruefe({"muendungsblitz", "leuchtspur"} <= gezeigt, f"Karte der Zielbearbeitung: Mündungsblitz und Leuchtspur ({sorted(gezeigt)})")
        pruefe(bool(flackern), f"Zeichen des getroffenen Panzers blinkt auf der Karte ({sorted(flackern)})")
        pruefe(bool(h57["kachel"]), f"Kopfzeile: getroffener Panzer blinkt rot ({h57['kachel']})")
        pruefe(h57["rand"] > 0 and foto_da, f"roter Rand am Bildschirm bei Treffer ({h57['rand']}×, Foto h57_treffer_zielbearbeitung)")

        # ---------------------------------------------------------------- H3.3 / F2.7 Lagemeldungen am Spielende
        print("H3.3/F2.7 – Lagemeldungen (24:50, ohne weitere Entscheidungen)")
        zeit("24:50")
        time.sleep(1.5)
        # Seit 2.7 (I4) zeigt der Feed nur ungelesene Meldungen der letzten 30 s. Geprüft wird, was das Team im Lauf bekam: Zustand
        # des Teamfensters, Absender und Text wie im Feed (src/kern/verluste.ts injectAnzeige).
        texte = zb.evaluate("""() => { const s = window.argus; const z = s.stand.zustand; const inh = s.inh;
            const vm = (inh.basis ?? inh).szenario.verluste?.meldungen;
            const mss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
            return z.injectReihenfolge.map((id) => { const i = z.injects[id]; const plan = inh.injects[id];
              return { id, kopf: `${mss(i.erschienen.t_s)} · ${plan?.von ?? (vm?.von || '1. Kp')}`, text: i.text ?? plan?.text ?? '' }; }); }""")
        def sek(kopf):
            m, s_ = kopf.split(" · ")[0].split(":")
            return int(m) * 60 + int(s_)
        lang = [t for t in texte if len(f"{t['kopf'].split(' · ', 1)[1]}: {t['text']}") > 140]
        pruefe(not lang, f"alle {len(texte)} Lagemeldungen ≤ 140 Zeichen mit Absender" + (f" – zu lang: {lang[:2]}" if lang else ""))
        hg = [t["id"] for t in texte if t["id"] in ("H-01", "H-04", "H-12")]
        pruefe(not hg, f"keine Hintergrundmeldungen der Feindartillerie im Feed ({hg})")
        art = sorted(sek(t["kopf"]) for t in texte if t["id"].startswith("K-") and any(w in (t["text"] or "") for w in ("Mörser", "Artillerie", "Steilfeuer")))
        abst = [b_ - a_ for a_, b_ in zip(art, art[1:])]
        pruefe(all(x >= 120 for x in abst), f"Artilleriemeldungen der Kp mindestens 2 min auseinander ({len(art)} Meldungen, Abstände {abst} s)")
        k_texte = [t for t in texte if t["id"].startswith("K-")]
        pruefe(all(t["kopf"].endswith("1. Kp") for t in k_texte), f"{len(k_texte)} Meldungen der „1. Kp“")
        von_kp = [t for t in texte if t["kopf"].endswith("1. Kp")]
        erst = {n for n in ("1/1", "1/2", "1/3", "1/4") if any(n in (t["text"] or "") for t in von_kp)}
        pruefe(len(erst) == 4, f"Beschuss jedes Panzers als Lagemeldung der 1. Kp ({sorted(erst)})")
        foto(zb, "h33_feed_2450")
        b = pl.get_by_test_id("kp-stand")
        bereit2 = int(b.get_attribute("data-bereit"))
        zst = pl.evaluate("() => [...document.querySelectorAll('[data-testid=kp-stand] .pz-balken')].map(e => [e.dataset.stufe, Number(e.dataset.zustand)])")
        pruefe(bereit2 <= bereit and bereit2 >= 2, f"ohne Abwehr: {bereit}/4 → {bereit2}/4 einsatzbereit, höchstens zwei ausgefallen")
        pruefe(all(z >= 40 for st, z in zst if st != "ausgefallen"), f"Kp hält (Untergrenze): {zst}")
        foto(zb, "f2_zielbearbeitung_2450")
        foto(pl, "f1_plenum_2450")
        sl.evaluate("() => { const e = document.querySelector('[data-testid=kontrollkarte] .karte-leinwand'); e.argusKarte.zeigeAuf([60, 440], 5) }")
        time.sleep(1.2)
        foto(sl, "f2_stellung_gezoomt_2450")

        # ---------------------------------------------------------------- D5 Auswertung
        print("F2.9 – Auswertung „Preis des Abwartens“ (Beispiel, 7 Teams)")
        aw = seite("Auswertung", f"{a.basis}?auswertung=demo")
        # seit 2.7 (G1.1) ist „Preis des Abwartens“ zuschaltbar: über ＋ in der Kapitelleiste dazunehmen
        warte(lambda: aw.get_by_test_id("kapitel-plus").count() == 1, 30, "Kapitelleiste")
        aw.get_by_test_id("kapitel-plus").click()
        aw.locator("[data-zusatz=preis]").check()
        aw.keyboard.press("Escape")
        warte(lambda: aw.locator("button[data-kapitel=preis]").count() == 1, 10, "Kapitel Preis")
        aw.click("button[data-kapitel=preis]")
        warte(lambda: aw.get_by_test_id("preis").count() == 1, 10, "Preis des Abwartens")
        time.sleep(0.6)
        n_kurven = aw.locator(".preis-kurve").count()
        n_marken = aw.locator(".preis-marke").count()
        pruefe(n_kurven == 7, f"sieben Kurven (mittlerer Zustand der vier Panzer) ({n_kurven})")
        n_pz = aw.locator(".preis-panzer").count()
        pruefe(n_pz == 7, f"Zustand der vier Panzer je Team ({n_pz} Zeilen)")
        pruefe(n_marken >= 10, f"Marken S4/N4/S3 auf den Kurven ({n_marken})")
        lf = aw.get_by_test_id("preis-leitfragen").inner_text()
        pruefe("um welchen Preis" in lf and "war das richtig" in lf, "Leitfragen „um welchen Preis?“ / „war das richtig?“")
        of = aw.get_by_test_id("offenlegung").inner_text()
        pruefe("Druck war gebaut" in of and "Art. 51 Abs. 5 lit. b" in of and "Art. 57" in of and "Innere Führung" in of, "Offenlegung mit Bezügen")
        klein = aw.evaluate("() => Math.min(...[...document.querySelectorAll('[data-testid=preis] text, [data-testid=preis] td, [data-testid=preis] p, [data-testid=preis] li')].map(e => parseFloat(getComputedStyle(e).fontSize)))")
        svg_f = aw.evaluate("() => { const s = document.querySelector('[data-testid=preis] svg'); const r = s.getBoundingClientRect(); return r.width / s.viewBox.baseVal.width }")
        pruefe(klein * (svg_f if svg_f < 1 else 1) >= 13, f"kleinste Schrift ≥ 13 px (≈ {klein * min(svg_f, 1):.1f} px)")
        budget = aw.get_by_test_id("zeitbudget").inner_text()
        # seit 2.7 (G1): 15:00 im Standard, mit „Preis des Abwartens“ (1:00) zusammen 16:00
        pruefe("01:00" in budget and "16:00" in budget, f"Zeitbudget Kapitel 1:00, gesamt 15:00 + 1:00 ({budget.split()})")
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
    print("OK – vier Panzer, Kopfzeile, Bestand, Beschuss sichtbar (Mündungsblitz, Leuchtspur, Blinken, roter Rand), Lagemeldungen, "
          "Preis des Abwartens, alles in 1530×800")


if __name__ == "__main__":
    main()
