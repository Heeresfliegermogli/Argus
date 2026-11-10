#!/usr/bin/env python3
"""Bildschirmfotos aller Ansichten mit einem kurzen, gespielten Ablauf (seit 2.6: eine Rolle je Team; seit Liste J in den Prüfgrößen).

Öffnet Spielleitung, Zielbearbeitung (Team-Laptop, rechnet das Spiel) und Plenum im selben Raum (lokaler Sync, Direktaufruf
ohne Lobby), fotografiert die Einweisung (Übersicht mit Pfeilen, Folien), spielt bis zur Attrappe (S1, M08) und weiter bis zum
ersten Beschuss eines eigenen Panzers und einem Einschlag, dann bis Spielende. Prüft dabei das Layout (tools/pruefgroessen.py):
kein Rollbalken, nichts abgeschnitten (nur Listen mit data-liste dürfen rollen), Text in Knöpfen und Kacheln passt, ganze Karte
sichtbar (auch der Ostrand), die drei Knöpfe ganz sichtbar und an fester Stelle, kleinste Schrift 12 px; dazu, dass „Fast-Track“
und „Gegenangriff“ vor dem Ereignis nirgends zu sehen sind.

Standardgröße ist seit Liste J der Dienst-Laptop (1536 × 730). Die wichtigen Bilder der Zielbearbeitung (leer, Meldung offen, Wahl
des Wirkmittels, Countdown, Lagemeldungen) entstehen und werden geprüft in allen vier Prüfgrößen (1536 × 730, 1366 × 650,
1530 × 800, 1920 × 960), mit --alle-groessen jedes Bild.

Aufruf (nach `npm run build` und `npx vite preview --port 4173`):
  python3 tools/ui_bilder.py http://localhost:4173/ --bilder ui-bilder
  python3 tools/ui_bilder.py http://localhost:4173/ --groesse 1366x650
"""
import argparse
import os
import re
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

from pruefgroessen import GROESSEN, STANDARD, groessen_argument, groesse_text, lies_groesse, pruefe_layout

W, H = STANDARD
ROLLEN = ["sl", "zb", "plenum"]

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
  for (const el of document.querySelectorAll('.stapel, .inhalt, main, .zb-meldung, .eingang, .feed')) {
    if (el.scrollHeight > el.clientHeight + 2) zuGross.push(`${el.className}: Höhe ${el.scrollHeight} > ${el.clientHeight}`);
  }
  // Folien der Einweisung: nichts ragt seitlich oder unten heraus
  for (const el of document.querySelectorAll('.folie-rumpf, .folie-inhalt')) {
    if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) zuGross.push(`${el.className}: ${el.scrollWidth}×${el.scrollHeight} in ${el.clientWidth}×${el.clientHeight}`);
  }
  return { seite: [de.scrollWidth, de.scrollHeight], zuGross, text: document.body.innerText };
}
"""

VERBOTEN = ["Fast-Track", "Fast Track", "Gegenangriff"]


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
    groessen_argument(ap)
    a = ap.parse_args()
    os.makedirs(a.bilder, exist_ok=True)
    w0, h0 = lies_groesse(a.groesse)
    fehler = []
    konsole = []
    # Knöpfe der Zielbearbeitung je Fenstergröße: stehen sie in jedem Bild an derselben Stelle?
    knopf_lage = {}
    schrift = {}

    def pruefen(s, name, verboten=True, karte_ganz=True):
        f, erg = pruefe_layout(s, karte_ganz=karte_ganz)
        fehler.extend(f"{name}: {x}" for x in f)
        if verboten:
            for v in VERBOTEN:
                if v in erg["text"]:
                    fehler.append(f"{name}: „{v}“ sichtbar")
        groesse = groesse_text((s.viewport_size["width"], s.viewport_size["height"]))
        if erg["knoepfe"]:
            alt = knopf_lage.setdefault(groesse, erg["knoepfe"])
            if alt != erg["knoepfe"]:
                fehler.append(f"{name}: Knöpfe nicht an fester Stelle ({groesse}): {alt} → {erg['knoepfe']}")
        if s == zb_seite[0]:
            schrift[groesse] = min(schrift.get(groesse, 99), erg["schrift"]["min"])
        return f

    def foto(s, name, verboten=True, karte_ganz=True):
        if a.alle_groessen and s == zb_seite[0]:
            return foto_alle(s, name, verboten)
        f = pruefen(s, name, verboten, karte_ganz)
        s.screenshot(path=os.path.join(a.bilder, f"{name}.png"))
        print("Foto", name, "OK" if not f else f)

    def foto_alle(s, name, verboten=True):
        """Bild in allen vier Prüfgrößen (name_1536x730.png …), danach zurück zur Standardgröße."""
        for g in GROESSEN:
            s.set_viewport_size({"width": g[0], "height": g[1]})
            s.wait_for_timeout(700)
            f = pruefen(s, f"{name} {groesse_text(g)}", verboten)
            s.screenshot(path=os.path.join(a.bilder, f"{name}_{groesse_text(g)}.png"))
            print("Foto", f"{name}_{groesse_text(g)}", "OK" if not f else f)
        s.set_viewport_size({"width": w0, "height": h0})
        s.wait_for_timeout(500)

    zb_seite = [None]

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = browser.new_context(viewport={"width": w0, "height": h0}, device_scale_factor=1)
        s = {}
        for r in ROLLEN:
            pg = ctx.new_page()
            pg.on("console", lambda m, r=r: konsole.append(f"{r}: {m.type}: {m.text}") if m.type in ("error", "warning") else None)
            pg.on("pageerror", lambda e, r=r: konsole.append(f"{r}: pageerror: {e}"))
            pg.goto(adresse(a.basis, r, a.raum))
            s[r] = pg
            if r == "sl":
                warte(lambda: pg.locator(".rahmen[data-host='1']").count() == 1, 20, "SL steuert")
        sl, zb, pl = (s[r] for r in ROLLEN)
        zb_seite[0] = zb
        zust = lambda x: x.evaluate("() => window.argus.stand.zustand")  # noqa: E731

        # Einweisung (H4): zuerst die Übersicht mit Pfeilen auf der echten Oberfläche, dann die Folien
        warte(lambda: zb.get_by_test_id("tour").count() == 1, 15, "Übersicht (Tour) offen")
        zb.wait_for_timeout(500)
        n = 0
        while zb.get_by_test_id("tour").count() == 1 and n < 12:
            n += 1
            ziel = zb.get_by_test_id("tour").get_attribute("data-schritt")
            if ziel == "feed" and zb.locator(".lage-einblendung .feed-beispiel").evaluate("e => getComputedStyle(e).display") == "none":
                fehler.append("Übersicht „Lagemeldungen“: keine Beispiel-Lagemeldung auf der Karte")
            foto(zb, f"zb_tour_{n}_{ziel}")
            zb.get_by_test_id("tour-weiter").click()
            zb.wait_for_timeout(250)
        warte(lambda: zb.get_by_test_id("einweisung-zb").count() == 1, 10, "Einweisung (Folien) nach der Übersicht")
        n = 1
        zb.wait_for_timeout(500)
        foto(zb, f"zb_einweisung_{n}")
        while zb.get_by_test_id("einweisung-schliessen").count() == 0 and n < 10:
            zb.get_by_test_id("einweisung-weiter").click()
            n += 1
            zb.wait_for_timeout(600)
            foto(zb, f"zb_einweisung_{n}")
        zb.get_by_test_id("einweisung-schliessen").click()
        if sl.get_by_test_id("einweisung-schliessen").count() or sl.get_by_test_id("einweisung-sl").count():
            n = 1
            foto(sl, f"sl_einweisung_{n}")
            while sl.get_by_test_id("einweisung-schliessen").count() == 0 and n < 10:
                sl.get_by_test_id("einweisung-weiter").click()
                n += 1
                sl.wait_for_timeout(300)
                foto(sl, f"sl_einweisung_{n}")
            sl.get_by_test_id("einweisung-schliessen").click()
        warte(lambda: pl.locator("[data-testid=lagekarte][data-bereit='1']").count() == 1, 15, "Plenumskarte bereit")
        pl.wait_for_timeout(800)
        foto(pl, "plenum_einweisung")
        foto_alle(zb, "zb_leer")
        foto(sl, "sl_leer")

        # Spielzeit 08:25, Start, bis M08 (Attrappe) im Eingang ist, dann anhalten
        sl.fill("[data-testid=sl-zeit]", "08:25")
        sl.get_by_text("Spielzeit setzen").click()
        sl.get_by_role("button", name="▶ Start").click()
        warte(lambda: zb.locator(".eingang-zeile[data-meldung=M08]").count() > 0, 40, "M08 im Eingang")
        sl.get_by_role("button", name="❚❚ Anhalten").click()
        warte(lambda: not zust(zb)["uhr"]["laeuft"], 10, "Uhr steht")

        # alle offenen Meldungen vor M08 ablehnen, M08 öffnen
        offen = zb.evaluate("() => { const z = window.argus.stand.zustand; return z.reihenfolge.filter((id) => z.meldungen[id].stufe === 'offen' && !z.meldungen[id].zurueckgestellt && id !== 'M08'); }")
        for mid in offen:
            zb.locator(f".eingang-zeile[data-meldung={mid}]").click()
            warte(lambda: zb.get_by_test_id("offene-meldung").get_attribute("data-meldung") == mid, 10, f"{mid} geöffnet")
            zb.get_by_test_id("zb-ablehnen").click()
            warte(lambda: zb.locator(f".eingang-zeile[data-meldung={mid}]").count() == 0, 10, f"{mid} abgelehnt")
        zb.locator(".eingang-zeile[data-meldung=M08]").click()
        warte(lambda: zb.locator("[data-testid=live-fenster][data-meldung=M08]").count() == 1, 15, "Live-Bild M08")
        zb.wait_for_timeout(800)
        foto_alle(zb, "zb_meldung_M08")
        zb.get_by_test_id("kleingedrucktes-knopf").click()
        zb.wait_for_timeout(200)
        foto(zb, "zb_kleingedrucktes")
        zb.get_by_test_id("kleingedrucktes-knopf").click()
        zb.locator("[data-testid=drohnenbild]").click()
        zb.wait_for_timeout(400)
        zb.mouse.move(W / 2 + 40, H / 2 + 20)
        zb.wait_for_timeout(300)
        foto(zb, "zb_vergroesserung")
        zb.keyboard.press("Escape")
        # M08 ablehnen (Attrappe)
        zb.get_by_test_id("zb-ablehnen").click()
        warte(lambda: zb.locator(".eingang-zeile[data-meldung=M08]").count() == 0, 10, "M08 abgelehnt")

        # bis M12 (Sanität neben der Schule) weiterspielen: der Mörser warnt (R2), die LM nicht
        sl.get_by_role("button", name="×5", exact=True).click()
        sl.get_by_role("button", name="▶ Start").click()
        warte(lambda: zb.locator(".eingang-zeile[data-meldung=M11]").count() > 0, 60, "M11 im Eingang")
        sl.get_by_role("button", name="❚❚ Anhalten").click()
        warte(lambda: not zust(zb)["uhr"]["laeuft"], 10, "Uhr steht")
        zb.locator(".eingang-zeile[data-meldung=M11]").click()
        warte(lambda: zb.get_by_test_id("offene-meldung").get_attribute("data-meldung") == "M11", 10, "M11 geöffnet")
        zb.locator("label[data-wm=MRS]").click()
        zb.wait_for_timeout(400)
        # J1.3: eine Zeile Warnung zum gewählten Wirkmittel, Kachel mit ⚠
        warn = zb.get_by_test_id("wm-warnung").inner_text()
        if "R2" not in warn and "⚠" not in warn:
            fehler.append(f"Mörser bei M11: keine Warnung in der Zeile unter den Kacheln („{warn}“)")
        foto_alle(zb, "zb_wahl_moerser")
        zb.locator("label[data-wm=LM]").click()
        zb.wait_for_timeout(400)
        knopf = zb.get_by_test_id("zb-bekaempfen").inner_text()
        if "LM" not in knopf or "Bestand" not in knopf:
            fehler.append(f"Knopf BEKÄMPFEN ohne Wirkmittel und Bestand: „{knopf}“")
        foto_alle(zb, "zb_wahl_lm")
        zb.get_by_test_id("zb-bekaempfen").click()
        # seit 2.7 (I5): Countdown in der Zeile „Wirkung unterwegs“ über dem Eingang
        warte(lambda: zb.locator(".unterwegs-chip[data-unterwegs=M11]").count() == 1, 10, "M11 bekämpft (Countdown)")
        zb.wait_for_timeout(400)
        if not re.search(r"\d:\d\d", zb.locator(".unterwegs-chip[data-unterwegs=M11]").inner_text()):
            fehler.append("kein Countdown in der Zeile „Wirkung unterwegs“")
        foto_alle(zb, "zb_countdown")
        sl.get_by_role("button", name="×1", exact=True).click()
        sl.get_by_role("button", name="▶ Start").click()
        zb.wait_for_timeout(12000)
        foto(zb, "zb_lm_im_anflug")
        foto(pl, "plenum_lage")
        sl.get_by_role("button", name="×5", exact=True).click()
        warte(lambda: zust(zb)["meldungen"]["M11"]["stufe"] == "erledigt", 60, "M11 Einschlag")
        sl.get_by_role("button", name="❚❚ Anhalten").click()
        sl.wait_for_timeout(800)
        foto(zb, "zb_nach_einschlag")
        foto(sl, "sl_kontrollkarte")

        # Beschuss eines eigenen Panzers (H5.7): Mündungsfeuer, Leuchtspur, Panzer blinkt, roter Rand
        sl.fill("[data-testid=sl-zeit]", "15:28")
        sl.get_by_text("Spielzeit setzen").click()
        sl.get_by_role("button", name="×1", exact=True).click()
        sl.get_by_role("button", name="▶ Start").click()
        ende = time.time() + 40
        gesehen = False
        while time.time() < ende:
            if zb.locator(".rahmen.treffer-rand, .pz-kachel.getroffen").count() > 0:
                zb.wait_for_timeout(150)
                foto(zb, "zb_beschuss")
                gesehen = True
                break
            zb.wait_for_timeout(100)
        if not gesehen:
            fehler.append("Treffer auf einen eigenen Panzer nicht sichtbar (roter Rand / blinkender Panzer)")
        sl.get_by_role("button", name="❚❚ Anhalten").click()
        zb.wait_for_timeout(500)
        # J1.2: Lagemeldungen als Einblendung oben links auf der Karte, höchstens zwei
        n_lm = zb.locator(".lage-einblendung .feed-meldung.echt").count()
        if n_lm > 2:
            fehler.append(f"mehr als zwei Lagemeldungen auf der Karte ({n_lm})")
        foto_alle(zb, "zb_lagemeldungen_nach_beschuss")

        # Spielende
        sl.fill("[data-testid=sl-zeit]", "24:57")
        sl.get_by_text("Spielzeit setzen").click()
        sl.get_by_role("button", name="▶ Start").click()
        warte(lambda: zb.locator("[data-testid=spielende]").count() == 1, 40, "Spielende am Team-Laptop")
        pl.wait_for_timeout(1500)
        foto(zb, "zb_spielende", verboten=False)
        # Plenum: nach Spielende von selbst die Auswertung; von Hand zurück zur Auflösung (Kontrollkarte ganz, J3.1)
        if pl.locator("[data-testid=auswertung]").count():
            foto(pl, "plenum_auswertung", verboten=False, karte_ganz=False)
            pl.get_by_test_id("auswertung-zurueck").click()
            warte(lambda: pl.locator("main[data-modus=aufloesung]").count() == 1, 20, "Auflösung im Plenum")
            pl.wait_for_timeout(1500)
        foto(pl, "plenum_aufloesung", verboten=False)
        sl.locator(".reiter button", has_text="Protokoll").click()
        sl.wait_for_timeout(300)
        foto(sl, "sl_protokoll", verboten=False)

        renderer = zb.evaluate("() => document.querySelector('.karte canvas')?.getAttribute('data-renderer')")
        print("Karten-Renderer:", renderer)
        browser.close()

    relevante = [k for k in konsole if "favicon" not in k and "GPU stall" not in k and "WebGL" not in k]
    if relevante:
        print("Konsole:", *relevante[:15], sep="\n  ")
        if any("pageerror" in k or ": error:" in k for k in relevante):
            fehler.append("Fehler in der Browserkonsole")
    print("Kleinste Schrift der Zielbearbeitung je Größe:", ", ".join(f"{g} {v} px" for g, v in schrift.items()))
    print("Knöpfe je Größe (x, y, Breite, Höhe):", *(f"{g}: {k}" for g, k in knopf_lage.items()), sep="\n  ")
    if fehler:
        print("FEHLER:", *fehler, sep="\n  ")
        sys.exit(1)
    print(f"OK – {len(os.listdir(a.bilder))} Bilder in {a.bilder}, kein Rollbalken, nichts abgeschnitten, ganze Karte, Knöpfe an fester Stelle")


if __name__ == "__main__":
    main()
