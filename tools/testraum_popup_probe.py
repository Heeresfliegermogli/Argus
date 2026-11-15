"""Probe Liste M (M1.3, 15.11.2026), angepasst an Liste N: „Team und Spielleitung öffnen“ mit Pop-up-Sperre wie im echten Chrome.

Playwright schaltet die Pop-up-Sperre von Chromium sonst ab (--disable-popup-blocking); hier bleibt sie an: Je Klick lässt Chromium
nur EIN neues Fenster zu, ein zweites `window.open` im selben Klick wird still blockiert – der Befund von Lt Mann zu Stand L.
Seit Liste N öffnet „Team und Spielleitung öffnen“ das Testpult im selben Tab (gar kein neues Fenster); „Team-Fenster öffnen“ (M1.2)
gibt es weiter bei der Spielleitung im Testraum außerhalb des Pults.

  P0  Gegenprobe: Ein Klick mit zwei `window.open` öffnet in diesem Browser nur ein Fenster (die Sperre wirkt wie in Chrome).
  P1  Startseite → Test ohne Lobby → „Team und Spielleitung öffnen“ (auch mit gesperrtem window.open): kein neues Fenster, das Testpult
      im selben Tab; Reiter Spielleitung → „▶ Start“ → die Uhr läuft (Spielleitung und Zielbearbeitung), kein Hinweis „kein Laptop“.
  P2  Spielleitung im Testraum ohne Team-Fenster (M1.2): „Team-Fenster öffnen“ erscheint, öffnet die Zielbearbeitung desselben Raums
      als neues Fenster (eigener Klick, nicht blockiert); „▶ Start“ → Uhr läuft.
  P3  Blockiert der Browser das Team-Fenster trotzdem: Hinweis „Bitte Pop-ups für diese Seite erlauben …“ am Knopf der Spielleitung.

Aufruf (nach `npm run build` und `npx vite preview --port 4173`):
  python3 tools/testraum_popup_probe.py http://localhost:4173/ [--groesse 1366x650] [--bilder popup-bilder]
"""
import argparse
import os
import sys
import time

from playwright.sync_api import sync_playwright

from pruefgroessen import groessen_argument, lies_groesse, pruefe_layout


def warte(bedingung, sek=10, text="Bedingung"):
    ende = time.time() + sek
    while time.time() < ende:
        try:
            if bedingung():
                return
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.1)
    raise AssertionError(f"{text} nicht erfüllt nach {sek} s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("basis")
    ap.add_argument("--bilder", default="popup-bilder")
    groessen_argument(ap)
    a = ap.parse_args()
    W, H = lies_groesse(a.groesse)
    os.makedirs(a.bilder, exist_ok=True)
    basis = a.basis.rstrip("/") + "/"
    ergebnis = []
    konsole = []

    def schritt(name, f):
        t0 = time.time()
        try:
            f()
            ergebnis.append((name, True, time.time() - t0, ""))
            print(f"  ✓ {name} ({time.time() - t0:.1f} s)", flush=True)
        except Exception as e:  # noqa: BLE001
            text = (str(e) or type(e).__name__).splitlines()[0][:600]
            ergebnis.append((name, False, time.time() - t0, text))
            print(f"  ✗ {name}: {text}", flush=True)

    with sync_playwright() as p:
        # Pop-up-Sperre AN (Playwright setzt sonst --disable-popup-blocking). channel="chromium" = das volle Chromium im neuen
        # Headless-Modus; die schlanke Headless-Shell, die Playwright sonst nimmt, sperrt Pop-ups gar nicht.
        browser = p.chromium.launch(channel="chromium", ignore_default_args=["--disable-popup-blocking"],
                                    args=["--disable-gpu", "--disable-software-rasterizer", "--disable-background-timer-throttling",
                                          "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"])

        def neuer_kontext():
            ctx = browser.new_context(viewport={"width": W, "height": H})
            ctx.on("page", lambda pg: (pg.on("pageerror", lambda e: konsole.append(f"pageerror: {e}")),
                                       pg.on("console", lambda m: konsole.append(f"{m.type}: {m.text}") if m.type == "error" else None)))
            return ctx

        def foto(pg, name):
            pg.screenshot(path=os.path.join(a.bilder, f"{name}_{W}x{H}.jpg"), quality=80, type="jpeg")

        def uhr_laeuft(pg):
            return pg.locator(".uhr .uhr-info").first.inner_text().startswith("läuft")

        def einweisung_falls(pg):
            try:
                warte(lambda: pg.get_by_role("button", name="Übersicht überspringen").count() == 1, 6, "Einweisung")
            except AssertionError:
                return
            pg.get_by_role("button", name="Übersicht überspringen").click()
            warte(lambda: pg.get_by_role("button", name="Überspringen").count() == 1, 10, "Folien der Einweisung")
            pg.get_by_role("button", name="Überspringen").click()

        raum_nr = [int(time.time()) % 100000]

        def neuer_raum():
            raum_nr[0] += 1
            return f"popup-{raum_nr[0]}"

        # -------------------------------------------------------------- P0
        def p0():
            ctx = neuer_kontext()
            pg = ctx.new_page()
            pg.goto(basis + "?sync=lokal")
            pg.evaluate("""() => { const b = document.createElement('button'); b.id = 'zwei'; b.textContent = 'zwei';
              b.onclick = () => { window.open('about:blank', 'a1', 'popup'); window.open('about:blank', 'a2', 'popup'); };
              document.body.appendChild(b); }""")
            vorher = len(ctx.pages)
            pg.click("#zwei")
            pg.wait_for_timeout(1500)
            neu = len(ctx.pages) - vorher
            assert neu == 1, f"{neu} neue Fenster – die Pop-up-Sperre wirkt nicht wie in Chrome"
            ctx.close()

        # -------------------------------------------------------------- P1
        def p1():
            ctx = neuer_kontext()
            pg = ctx.new_page()
            pg.goto(basis + "?sync=lokal#spielleitung")
            pg.get_by_text("Test ohne Lobby: ein Team").click()
            foto(pg, "P1_start_test_ohne_lobby")
            # ein gesperrtes window.open darf nichts ausmachen – das Pult öffnet kein Fenster
            pg.evaluate("() => { window.open = () => { throw new Error('window.open im Testpult'); }; }")
            pg.get_by_role("button", name="Team und Spielleitung öffnen").click()
            warte(lambda: "testpult=1" in pg.url, 10, "Testpult im selben Tab")
            pg.wait_for_timeout(1500)
            assert len(ctx.pages) == 1, f"{len(ctx.pages)} Fenster"
            sl = pg.locator("[data-pult-frame=sl]").element_handle().content_frame()
            team = pg.locator("[data-pult-frame=zb]").element_handle().content_frame()
            einweisung_falls(team)
            warte(lambda: team.locator(".rahmen[data-rolle=zb][data-rechnet='1']").count() == 1, 15, "Zielbearbeitung rechnet")
            pg.locator("[data-pult-reiter=sl]").click()
            knopf = sl.get_by_role("button", name="▶ Start")
            warte(lambda: knopf.is_enabled(), 15, "„▶ Start“ bereit")
            assert sl.get_by_test_id("team-fenster").count() == 0, "„Team-Fenster öffnen“ im Testpult"
            knopf.click()
            t0 = time.time()
            warte(lambda: uhr_laeuft(sl) and uhr_laeuft(team), 10, "Uhr läuft (Spielleitung und Zielbearbeitung)")
            print(f"    Uhr läuft nach {time.time() - t0:.1f} s", flush=True)
            assert sl.get_by_test_id("uhr-grund").count() == 0, f"Hinweis am Knopf: {sl.get_by_test_id('uhr-grund').inner_text()}"
            pg.wait_for_timeout(800)
            foto(pg, "P1_testpult_sl_uhr_laeuft")
            ctx.close()

        # -------------------------------------------------------------- P2
        def p2():
            ctx = neuer_kontext()
            sl = ctx.new_page()
            raum = neuer_raum()
            sl.goto(basis + f"?rolle=sl&raum={raum}&sync=lokal")
            warte(lambda: sl.get_by_test_id("team-fenster-oeffnen").count() == 1, 10, "„Team-Fenster öffnen“ bei der Spielleitung")
            assert sl.get_by_test_id("popup-blockiert").count() == 0
            fehler, _ = pruefe_layout(sl, karte_ganz=False)
            assert not fehler, f"Layout: {fehler[:3]}"
            foto(sl, "P2_sl_team_fenster_oeffnen")
            # erst „▶ Start“ ohne Team: der Grund bleibt am Knopf, daneben der Knopf
            sl.get_by_role("button", name="▶ Start").click()
            warte(lambda: sl.get_by_test_id("uhr-grund").count() == 1, 15, "Grund „im Team ist kein Laptop“")
            assert "kein Laptop" in sl.get_by_test_id("uhr-grund").inner_text()
            foto(sl, "P2_sl_kein_laptop_mit_knopf")
            with ctx.expect_page(timeout=10000) as neu:
                sl.get_by_test_id("team-fenster-oeffnen").click()
            team = neu.value
            team.wait_for_load_state()
            assert "rolle=zb" in team.url and f"raum={raum}" in team.url, team.url
            # der wartende Start wird ausgeführt, sobald das Team-Fenster rechnet
            einweisung_falls(team)
            warte(lambda: uhr_laeuft(sl) and uhr_laeuft(team), 20, "Uhr läuft (wartender Start)")
            foto(sl, "P2_sl_uhr_laeuft")
            ctx.close()

        # -------------------------------------------------------------- P3
        def p3():
            ctx = neuer_kontext()
            # (a) am Knopf der Spielleitung: window.open liefert null wie bei blockiertem Pop-up
            sl = ctx.new_page()
            raum = neuer_raum()
            sl.goto(basis + f"?rolle=sl&raum={raum}&sync=lokal")
            warte(lambda: sl.get_by_test_id("team-fenster-oeffnen").count() == 1, 10, "„Team-Fenster öffnen“")
            sl.evaluate("() => { window.open = () => null; }")
            sl.get_by_test_id("team-fenster-oeffnen").click()
            warte(lambda: sl.get_by_test_id("popup-blockiert").count() == 1, 5, "Hinweis bei blockiertem Fenster")
            text = sl.get_by_test_id("popup-blockiert").inner_text()
            assert "Pop-ups für diese Seite erlauben" in text and "„Zielbearbeitung“ unter „Test ohne Lobby“" in text, text
            foto(sl, "P3_sl_popup_blockiert")
            ctx.close()

        print(f"Probe M1/N1 (Pop-up-Sperre wie Chrome), {W} × {H}", flush=True)
        schritt("P0 Gegenprobe: zwei window.open in einem Klick → ein Fenster", p0)
        schritt("P1 „Team und Spielleitung öffnen“ → Testpult im selben Tab, kein Fenster → Start → Uhr läuft", p1)
        schritt("P2 Spielleitung ohne Team: „Team-Fenster öffnen“ → Uhr läuft", p2)
        schritt("P3 Fenster blockiert: Hinweis „Pop-ups erlauben“", p3)
        browser.close()

    fehler = [k for k in konsole if "pageerror" in k]
    ok = sum(1 for e in ergebnis if e[1])
    print(f"\n{ok}/{len(ergebnis)} bestanden" + (f", Konsolenfehler: {fehler[:3]}" if fehler else ", keine Konsolenfehler"))
    sys.exit(0 if ok == len(ergebnis) and not fehler else 1)


if __name__ == "__main__":
    main()
