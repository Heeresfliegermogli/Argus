#!/usr/bin/env python3
"""Bildschirmfotos aller Ansichten in 1530 × 800 mit einem kurzen, gespielten Ablauf.

Öffnet SL, G1, G2, G3 und Plenum im selben Raum (lokaler Sync), spielt bis kurz nach der Attrappe
(S1, M07) und fotografiert jede Ansicht in typischen Zuständen. Prüft dabei das Layout:
kein Rollbalken auf der Seite und kein abgeschnittener Inhalt in festen Feldern (nur Listen, die
mit data-liste markiert sind, dürfen innerhalb ihres Feldes rollen).

Aufruf (nach `npm run build` und `npx vite preview --port 4173`):
  python3 tools/ui_bilder.py http://localhost:4173/ --bilder ui-bilder
"""
import argparse
import os
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

W, H = 1530, 800
ROLLEN = ["sl", "g1", "g2", "g3", "plenum"]

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


def adresse(basis, rolle, raum):
    sep = "&" if "?" in basis else "?"
    return f"{basis}{sep}{urllib.parse.urlencode({'rolle': rolle, 'raum': raum, 'sync': 'lokal'})}"


def warte(bedingung, sek=15, text="Bedingung"):
    ende = time.time() + sek
    while time.time() < ende:
        try:
            if bedingung():
                return
        except Exception:
            pass
        time.sleep(0.1)
    raise AssertionError(f"{text} nicht erfüllt nach {sek} s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("basis")
    ap.add_argument("--bilder", default="ui-bilder")
    ap.add_argument("--raum", default=f"ui-{int(time.time()) % 100000}")
    a = ap.parse_args()
    os.makedirs(a.bilder, exist_ok=True)
    fehler = []
    konsole = []

    def foto(s, name):
        lay = s.evaluate(LAYOUT_JS)
        if lay["seite"][0] > W or lay["seite"][1] > H:
            fehler.append(f"{name}: Seite {lay['seite']} größer als {W}×{H}")
        for z in lay["zuGross"]:
            fehler.append(f"{name}: abgeschnitten – {z}")
        s.screenshot(path=os.path.join(a.bilder, f"{name}.png"))
        print("Foto", name, "OK" if not lay["zuGross"] else lay["zuGross"])

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
        s = {}
        for r in ROLLEN:
            pg = ctx.new_page()
            pg.on("console", lambda m, r=r: konsole.append(f"{r}: {m.type}: {m.text}") if m.type in ("error", "warning") else None)
            pg.on("pageerror", lambda e, r=r: konsole.append(f"{r}: pageerror: {e}"))
            pg.goto(adresse(a.basis, r, a.raum))
            s[r] = pg
            if r == "sl":
                warte(lambda: pg.locator(".rahmen[data-host='1']").count() == 1, 20, "SL steuert")
        sl, g1, g2, g3, pl = (s[r] for r in ROLLEN)
        warte(lambda: g1.locator("[data-testid=einweisung-g1]").count() == 1, 10, "Einweisung G1 offen")
        for r in ["g1", "g2", "g3"]:
            s[r].wait_for_timeout(300)
            foto(s[r], f"{r}_einweisung")
            s[r].get_by_test_id("einweisung-schliessen").click()
        warte(lambda: pl.locator("[data-testid=lagekarte][data-bereit='1']").count() == 1, 15, "Plenumskarte bereit")
        pl.wait_for_timeout(800)
        foto(pl, "plenum_einweisung")
        for r in ["g1", "g2", "g3"]:
            foto(s[r], f"{r}_leer")

        # Spielzeit 08:25, Start, bis M07 (Attrappe) da ist, dann anhalten
        sl.fill("[data-testid=sl-zeit]", "08:25")
        sl.get_by_text("Spielzeit setzen").click()
        sl.get_by_role("button", name="▶ Start").click()
        warte(lambda: g1.locator("[data-meldung=M07]").count() > 0, 30, "M07 bei G1")
        sl.get_by_role("button", name="❚❚ Anhalten").click()

        # G1: M01–M06 annehmen (M04 mit Vermerk), M07 bleibt offen
        for mid in ["M01", "M02", "M03", "M04", "M05", "M06"]:
            g1.locator(f".eintrag[data-meldung={mid}]").first.click()
            if mid == "M04":
                g1.fill("[data-testid=g1-vermerk]", "Wärme und Kettenspuren bestätigen")
            g1.get_by_test_id("g1-annehmen").click()
            warte(lambda: g1.locator(f"[data-testid=g1-offen]").count() == 1 and g1.locator(f".eintrag:not(.gedimmt)[data-meldung={mid}]").count() == 0, 10, f"{mid} angenommen")
        g1.locator(".eintrag[data-meldung=M07]").first.click()
        g1.wait_for_timeout(600)
        foto(g1, "g1_meldung_M07")
        g1.locator("[data-testid=drohnenbild]").click()
        g1.wait_for_timeout(400)
        g1.mouse.move(W / 2 + 40, H / 2 + 20)
        g1.wait_for_timeout(200)
        foto(g1, "g1_vergroesserung")
        g1.keyboard.press("Escape")

        # G2: M01 mit LM, M02 mit Mrs empfehlen; M03 mit Mörser zeigen (Warnung R3)
        warte(lambda: g2.locator("[data-testid=lagekarte][data-bereit='1']").count() == 1, 15, "G2-Karte bereit")
        for mid, wm in [("M01", "LM"), ("M02", "MRS")]:
            g2.locator(f".eintrag[data-meldung={mid}]").first.click()
            g2.locator(f"label[data-wm={wm}]").click()
            g2.get_by_test_id("g2-bekaempfen").click()
            warte(lambda: g2.locator(f".eintrag:not(.gedimmt)[data-meldung={mid}]").count() == 0, 10, f"{mid} empfohlen")
        g2.locator(".eintrag[data-meldung=M03]").first.click()
        g2.locator("label[data-wm=MRS]").click()
        g2.wait_for_timeout(500)
        foto(g2, "g2_warnung_M03")
        g2.locator("label[data-wm=LM]").click()
        g2.wait_for_timeout(400)
        foto(g2, "g2_ok_M03")

        # G3: I-01 quittieren, M01 freigeben, M02 gewählt lassen
        warte(lambda: g3.locator("[data-inject]").count() >= 3, 10, "Injects bei G3")
        g3.locator("[data-inject=I-01]").get_by_role("button", name="Gelesen").click()
        warte(lambda: g3.locator(".eintrag[data-meldung=M01]").count() > 0, 10, "M01 bei G3")
        g3.locator(".eintrag[data-meldung=M01]").first.click()
        g3.get_by_test_id("g3-freigabe").click()
        warte(lambda: g3.locator(".eintrag:not(.gedimmt)[data-meldung=M01]").count() == 0, 10, "M01 freigegeben")
        g3.fill("[data-testid=g3-lagehinweis]", "Achtung Schule NS-01: dort sind Zivilpersonen")
        g3.get_by_role("button", name="Senden").click()
        g3.wait_for_timeout(700)
        foto(g3, "g3_entscheiden")

        # Wirkung abwarten (LM 2:00 Vorlauf) mit Tempo ×20
        sl.get_by_role("button", name="×20").click()
        sl.get_by_role("button", name="▶ Start").click()
        warte(lambda: sl.evaluate("() => window.argus.stand.protokoll.some(e => e.typ === 'wirkung')"), 30, "Wirkung")
        sl.get_by_role("button", name="❚❚ Anhalten").click()
        sl.wait_for_timeout(800)
        foto(sl, "sl_kontrollkarte")
        foto(g1, "g1_mit_lagehinweis")
        foto(g2, "g2_nach_wirkung")
        foto(pl, "plenum_lage")

        # Spielende
        sl.fill("[data-testid=sl-zeit]", "24:57")
        sl.get_by_text("Spielzeit setzen").click()
        sl.get_by_role("button", name="▶ Start").click()
        warte(lambda: g1.locator("[data-testid=spielende]").count() == 1, 30, "Spielende bei G1")
        pl.wait_for_timeout(1500)
        foto(g1, "g1_spielende")
        foto(pl, "plenum_aufloesung")
        sl.locator(".reiter button", has_text="Protokoll").click()
        sl.wait_for_timeout(300)
        foto(sl, "sl_protokoll")

        renderer = g2.evaluate("() => document.querySelector('.karte canvas')?.getAttribute('data-renderer')")
        print("Karten-Renderer:", renderer)
        browser.close()

    relevante = [k for k in konsole if "favicon" not in k and "GPU stall" not in k and "WebGL" not in k]
    if relevante:
        print("Konsole:", *relevante[:15], sep="\n  ")
        if any("pageerror" in k or ": error:" in k for k in relevante):
            fehler.append("Fehler in der Browserkonsole")
    if fehler:
        print("FEHLER:", *fehler, sep="\n  ")
        sys.exit(1)
    print(f"OK – {len(os.listdir(a.bilder))} Bilder in {a.bilder}, kein Rollbalken, nichts abgeschnitten")


if __name__ == "__main__":
    main()
