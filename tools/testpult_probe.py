#!/usr/bin/env python3
"""Probe Liste N (N3, 15.11.2026): Testpult – „Team und Spielleitung öffnen“ öffnet EIN Fenster mit den Reitern
Spielleitung · Zielbearbeitung · Plenum.

  T1  Startseite → Test ohne Lobby → „Team und Spielleitung öffnen“: Testpult im selben Tab (kein neues Fenster), Reiter Zielbearbeitung
      vorn mit der Einweisung, Leiste ≤ 34 px, die drei Reiter lokal im Raum „pult“; die Wahl der Startseite (Firebase, Raum) bleibt.
      Die Einweisung bleibt beim Wechsel der Reiter an derselben Stelle (N1.2).
  T2  Reiter Spielleitung: kein Reiter „Zielbearbeitung (nur lesen)“, kein „Team-Fenster öffnen“, dafür „→ Reiter Zielbearbeitung“.
      Tempo ×5, „▶ Start“, 10 s auf der Spielleitung bleiben – der Reiter Zielbearbeitung zeigt die Zahl der Meldungen (gelb, „neu“);
      zurück: Uhr weitergelaufen, Meldungen eingegangen.
  T3  Geöffnete Meldung und Zoom bleiben beim Wechsel (N1.2); eine Meldung entscheiden (ABLEHNEN); Plenum zeigt „Lage“.
      Layout aller drei Reiter in 1536 × 730, 1366 × 650 und 1530 × 800: kein Rollbalken, nichts abgeschnitten, Leiste ganz.
  T4  Tempo ×20 bis Spielende (auf der Spielleitung): Punkt am Reiter Plenum; „Gefecht beendet“ in Zielbearbeitung und Plenum.
  T5  Beim Wechsel kein Neuladen (Zähler in jedem Fenster), „→ Reiter Zielbearbeitung“ führt hin, Startseite unverändert gewählt.
  T6  Neuladen des Pults: der zuletzt gewählte Reiter bleibt (sessionStorage), das Spiel steht wie vorher (gleicher Lauf und seq).
  T7  Ein gleichzeitig offener Testraum „kraehe“ (eigener Tab) bleibt unberührt: eigene Uhr steht, eigener Lauf.
  T8  „Neues Spiel“ und „Testraum leeren“ der Spielleitung wirken wie gewohnt: neuer Lauf in der Zielbearbeitung (00:00, keine Zahl);
      nach „Testraum leeren“ zeigt die Zielbearbeitung „Testraum geleert – neu laden“, ihr Reiter einen roten Punkt, die Spielleitung
      „→ Reiter Zielbearbeitung“; nach „neu laden“ rechnet die Zielbearbeitung wieder, das Pult selbst lädt nicht neu.
  Am Ende: keine Konsolenfehler (alle Frames).

Aufruf (nach `npm run build` und `npx vite preview --port 4173`):
  python3 tools/testpult_probe.py http://localhost:4173/ [--groesse 1366x650] [--bilder pult-bilder]
"""
import argparse
import os
import sys
import time

from playwright.sync_api import sync_playwright

from pruefgroessen import LAYOUT_JS, groessen_argument, lies_groesse

REITER = ["sl", "zb", "plenum"]


def warte(bedingung, sek=10, text="Bedingung"):
    ende = time.time() + sek
    letzte = None
    while time.time() < ende:
        try:
            if bedingung():
                return
        except Exception as e:  # noqa: BLE001
            letzte = e
        time.sleep(0.1)
    raise AssertionError(f"{text} nicht erfüllt nach {sek} s" + (f" ({str(letzte).splitlines()[0][:200]})" if letzte else ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("basis")
    ap.add_argument("--bilder", default="pult-bilder")
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
            return True
        except Exception as e:  # noqa: BLE001
            text = (str(e) or type(e).__name__).splitlines()[0][:600]
            ergebnis.append((name, False, time.time() - t0, text))
            print(f"  ✗ {name}: {text}", flush=True)
            return False

    with sync_playwright() as p:
        # volles Chromium im neuen Headless-Modus (wie testraum_popup_probe.py), Pop-up-Sperre an – das Pult darf kein Fenster öffnen
        browser = p.chromium.launch(channel="chromium", ignore_default_args=["--disable-popup-blocking"],
                                    args=["--disable-gpu", "--disable-software-rasterizer"])
        ctx = browser.new_context(viewport={"width": W, "height": H})
        neue_seiten = []

        def beobachte(pg):
            pg.on("pageerror", lambda e: konsole.append(f"pageerror: {e}"))
            pg.on("console", lambda m: konsole.append(f"{m.type}: {m.text}") if m.type == "error" else None)

        pg = ctx.new_page()
        beobachte(pg)
        # danach geöffnete Seiten: nur der Tab „kraehe“ der Probe (T7) – das Pult selbst öffnet kein Fenster
        ctx.on("page", lambda neu: (neue_seiten.append(neu), beobachte(neu)))
        kr = None
        st = {}

        def foto(name, seite=None):
            (seite or pg).screenshot(path=os.path.join(a.bilder, f"n_{name}_{W}x{H}.jpg"), quality=80, type="jpeg")

        def frame(r):
            return pg.locator(f"[data-pult-frame={r}]").element_handle().content_frame()

        def vorn():
            return pg.get_by_test_id("pult").get_attribute("data-vorn")

        def reiter(r):
            pg.locator(f"[data-pult-reiter={r}]").click()
            warte(lambda: vorn() == r, 3, f"Reiter {r} vorn")
            pg.wait_for_timeout(300)

        def zb(js):
            return frame("zb").evaluate(js)

        def spielzeit():
            return zb("() => window.argus.spielzeit()")

        def uhr_laeuft(fr):
            return fr.locator(".uhr .uhr-info").first.inner_text().startswith("läuft")

        def layout(fr, karte):
            erg = fr.evaluate(LAYOUT_JS, {"karte_ganz": karte, "karten": None})
            return erg["fehler"]

        # -------------------------------------------------------------- T1
        def t1():
            nonlocal kr
            # Testraum „kraehe“ läuft gleichzeitig in einem eigenen Tab (T7)
            kr = ctx.new_page()
            kr.goto(basis + "?rolle=zb&raum=kraehe&sync=lokal")
            warte(lambda: kr.locator(".rahmen[data-rolle=zb][data-rechnet='1']").count() == 1, 20, "Testraum kraehe rechnet")
            st["kr_lauf"] = kr.evaluate("() => window.argus.stand.lauf")
            pg.bring_to_front()
            pg.goto(basis + "#spielleitung")
            # Wahl der Startseite: Firebase und Raum „kraehe“ (N1.6: das Pult ändert daran nichts)
            pg.evaluate("() => { localStorage.setItem('argus:einst:sync', 'firebase'); localStorage.setItem('argus:einst:raum', 'kraehe'); }")
            pg.reload()
            pg.get_by_text("Test ohne Lobby: ein Team").click()
            knopf = pg.get_by_test_id("team-und-sl")
            assert "ein Fenster, drei Reiter" in knopf.inner_text(), knopf.inner_text()
            foto("t1_startseite_test_ohne_lobby")
            seiten = len(ctx.pages)
            knopf.click()
            warte(lambda: "testpult=1" in pg.url, 10, "Testpult im selben Tab")
            pg.wait_for_timeout(1000)
            assert len(ctx.pages) == seiten, f"neues Fenster geöffnet ({len(ctx.pages)} statt {seiten})"
            assert vorn() == "zb", f"Startreiter {vorn()}"
            leiste = pg.get_by_test_id("pult-leiste").bounding_box()
            assert leiste["height"] <= 34.5, f"Leiste {leiste['height']} px"
            st["leiste"] = leiste["height"]
            namen = [pg.locator(f"[data-pult-reiter={r}]").inner_text().strip() for r in REITER]
            assert namen == ["Spielleitung", "Zielbearbeitung", "Plenum"], namen
            for r in REITER:
                u = pg.locator(f"[data-pult-frame={r}]").get_attribute("src")
                assert f"rolle={r}" in u and "raum=pult" in u and "sync=lokal" in u and "pult=1" in u, u
            hilfe = pg.get_by_test_id("pult-so-gehts").inner_text().replace("\n", " ")
            assert "So geht’s: 1 Zielbearbeitung – Einweisung lesen · 2 Spielleitung – ▶ Start · 3 zurück zur Zielbearbeitung" in " ".join(hilfe.split()), hilfe
            # verdeckte Reiter: visibility hidden und inert, der vordere sichtbar
            for r in REITER:
                v = pg.locator(f"[data-pult-frame={r}]").evaluate("e => [getComputedStyle(e).visibility, e.inert, e.getBoundingClientRect().height]")
                assert v[0] == ("visible" if r == "zb" else "hidden") and v[1] == (r != "zb"), f"{r}: {v}"
                assert v[2] > 500, f"{r}: Frame {v[2]} px hoch"
            # Einweisung der Zielbearbeitung
            warte(lambda: frame("zb").get_by_test_id("tour").count() == 1, 20, "Einweisung (Übersicht) in der Zielbearbeitung")
            warte(lambda: zb("() => !!window.argus?.stand?.rechnet"), 15, "Zielbearbeitung rechnet")
            # Zähler in jedem Fenster (T5: kein Neuladen)
            pg.evaluate("() => { window.__pultZaehler = 4711; }")
            for r in REITER:
                frame(r).evaluate("() => { window.__pultZaehler = 4711; }")
            pg.wait_for_timeout(1200)
            foto("t1_pult_zb_einweisung")
            # N1.2: Einweisung bleibt beim Wechsel an derselben Stelle
            frame("zb").get_by_test_id("tour-weiter").click()
            pg.wait_for_timeout(300)
            schritt_vorher = frame("zb").get_by_test_id("tour").get_attribute("data-schritt")
            reiter("plenum")
            reiter("sl")
            reiter("zb")
            assert frame("zb").get_by_test_id("tour").count() == 1, "Einweisung nach dem Wechsel weg"
            schritt_nachher = frame("zb").get_by_test_id("tour").get_attribute("data-schritt")
            assert schritt_vorher == schritt_nachher, f"Einweisung {schritt_vorher} → {schritt_nachher}"
            # Einweisung schließen (Übersicht, Folien)
            frame("zb").get_by_test_id("tour-ueberspringen").click()
            warte(lambda: frame("zb").get_by_test_id("einweisung-ueberspringen").count() == 1, 10, "Folien der Einweisung")
            frame("zb").get_by_test_id("einweisung-ueberspringen").click()
            sync = pg.evaluate("() => [localStorage.getItem('argus:einst:sync'), localStorage.getItem('argus:einst:raum')]")
            assert sync == ["firebase", "kraehe"], f"Wahl der Startseite verändert: {sync}"

        # -------------------------------------------------------------- T2
        def t2():
            reiter("sl")
            sl = frame("sl")
            warte(lambda: sl.get_by_test_id("pult-zur-zb").count() == 1, 10, "„→ Reiter Zielbearbeitung“ in der Spielleitung")
            assert sl.locator("[data-sl-rolle=zb]").count() == 0, "Reiter „Zielbearbeitung (nur lesen)“ in der Spielleitung"
            assert sl.get_by_test_id("team-fenster-oeffnen").count() == 0, "„Team-Fenster öffnen“ im Testpult"
            assert "Zuschauen" not in sl.locator("body").inner_text(), "„Zuschauen“ in der Spielleitung"
            warte(lambda: "Laptop" in sl.get_by_test_id("sl-rechnet").inner_text(), 15, "Spielleitung sieht den rechnenden Laptop")
            sl.get_by_role("button", name="×5", exact=True).click()
            knopf = sl.get_by_role("button", name="▶ Start")
            warte(lambda: knopf.is_enabled(), 10, "„▶ Start“ bereit")
            t_vorher = spielzeit()
            knopf.click()
            warte(lambda: uhr_laeuft(sl), 5, "Uhr läuft (Spielleitung)")
            # 10 s auf dem Reiter Spielleitung bleiben – die Zahl am Reiter Zielbearbeitung beobachten
            zahlen, neu, foto_da = [], False, False
            ende = time.time() + 10
            while time.time() < ende:
                z = pg.locator("[data-pult-reiter=zb] [data-testid=pult-zahl]")
                if z.count():
                    zahlen.append(int(z.inner_text()))
                    neu = neu or "neu" in (z.get_attribute("class") or "")
                    if not foto_da and time.time() > ende - 3:
                        foto("t2_sl_uhr_laeuft_zahl_am_reiter")
                        foto_da = True
                assert vorn() == "sl"
                time.sleep(0.25)
            # verdeckt zeichnet die Karte der Zielbearbeitung nur 2 Bilder/s – das Spiel läuft trotzdem (Uhr unten)
            st["fps_verdeckt"] = int(frame("zb").locator("[data-fps]").first.get_attribute("data-fps") or 0)
            assert st["fps_verdeckt"] <= 3, f"verdeckte Karte zeichnet {st['fps_verdeckt']} Bilder/s"
            assert zahlen and max(zahlen) >= 1, f"keine Zahl am Reiter Zielbearbeitung ({zahlen[-5:]})"
            assert neu, "Zahl nicht als neu markiert"
            st["zahlen"] = sorted(set(zahlen))
            reiter("zb")
            t = spielzeit()
            assert t - t_vorher >= 40, f"Uhr nur {t - t_vorher:.1f} s weiter (×5, 10 s)"
            n = zb("() => window.argus.stand.zustand.reihenfolge.length")
            eingang = int(frame("zb").get_by_test_id("eingang-zahl").inner_text())
            assert n >= 1 and eingang >= 1, f"Meldungen {n}, Eingang {eingang}"
            assert pg.locator("[data-pult-reiter=zb] [data-testid=pult-zahl]").count() == 0, "Zahl am Reiter, obwohl er vorn ist"
            st["t2"] = (round(t, 1), n, eingang, max(zahlen))
            pg.wait_for_timeout(1500)
            st["fps_vorn"] = int(frame("zb").locator("[data-fps]").first.get_attribute("data-fps") or 0)
            assert st["fps_vorn"] >= 10, f"Karte vorn nur {st['fps_vorn']} Bilder/s"
            pg.wait_for_timeout(500)
            foto("t2_zb_meldungen_eingegangen")

        # -------------------------------------------------------------- T3
        def t3():
            z = frame("zb")
            # Tempo zurück auf ×1, damit Auswahl und Zoom in Ruhe geprüft werden
            reiter("sl")
            frame("sl").get_by_role("button", name="×1", exact=True).click()
            reiter("zb")
            warte(lambda: z.get_by_test_id("offene-meldung").get_attribute("data-meldung"), 10, "Meldung offen")
            zeilen = z.locator(".eingang-zeile[data-meldung]")
            if zeilen.count() >= 2:
                zeilen.nth(1).click()
            gewaehlt = z.get_by_test_id("offene-meldung").get_attribute("data-meldung")
            karte = z.locator("[data-testid=zb-karte] .karte[data-sichtbar]")
            z.get_by_role("button", name="Hineinzoomen").click()
            pg.wait_for_timeout(700)
            sicht = karte.get_attribute("data-sichtbar")
            assert sicht and not sicht.startswith("0,0,1000"), f"Zoom wirkt nicht ({sicht})"
            reiter("plenum")
            pl = frame("plenum")
            warte(lambda: pl.locator("main.plenum[data-modus=lage]").count() == 1, 10, "Plenum zeigt „Lage“")
            assert "Das Spiel läuft" in pl.locator(".plenum-kopf").inner_text()
            pg.wait_for_timeout(800)
            foto("t3_plenum_lage")
            reiter("sl")
            reiter("zb")
            assert z.get_by_test_id("offene-meldung").get_attribute("data-meldung") == gewaehlt, "geöffnete Meldung nach dem Wechsel anders"
            assert karte.get_attribute("data-sichtbar") == sicht, f"Zoom nach dem Wechsel anders ({karte.get_attribute('data-sichtbar')} statt {sicht})"
            z.get_by_role("button", name="Ganze Karte").click()
            z.get_by_test_id("zb-ablehnen").click()
            warte(lambda: zb(f"() => window.argus.stand.zustand.meldungen['{gewaehlt}'].ergebnis") == "abgelehnt", 5, f"{gewaehlt} abgelehnt")
            st["entschieden"] = gewaehlt
            pg.wait_for_timeout(500)
            foto("t3_zb_entschieden")
            # Layout aller drei Reiter (Spiel läuft), dazu die Leiste
            fehler = []
            for (w, h) in [(1536, 730), (1366, 650), (1530, 800)]:
                pg.set_viewport_size({"width": w, "height": h})
                for r in REITER:
                    reiter(r)
                    pg.wait_for_timeout(700)
                    fehler += [f"{w}x{h} {r}: {f}" for f in layout(frame(r), r != "sl")]
                    if r == "sl":
                        # „Bedingte Lagemeldungen“ bleibt mit mindestens einer Zeile sichtbar (niedrige Fenster: linke Spalte enger)
                        hb = frame("sl").evaluate("() => Math.round(document.querySelector('[data-testid=bedingt]').closest('.panel').getBoundingClientRect().height)")
                        st.setdefault("bedingt", {})[f"{w}x{h}"] = hb
                        if hb < 70:
                            fehler.append(f"{w}x{h} sl: „Bedingte Lagemeldungen“ nur {hb} px hoch")
                    if (w, h) == (W, H):
                        foto(f"t3_layout_{r}")
                top = pg.evaluate("""() => { const de = document.documentElement, l = document.querySelector('.pult-leiste'), h = document.querySelector('.pult-hilfe');
                  return [de.scrollWidth > innerWidth + 1 || de.scrollHeight > innerHeight + 1, l.scrollWidth > l.clientWidth + 1, h ? h.scrollWidth > h.clientWidth + 1 : false,
                          Math.round(l.getBoundingClientRect().height)]; }""")
                if top[0] or top[1] or top[2]:
                    fehler.append(f"{w}x{h} Leiste: Rollbalken {top[0]}, Leiste abgeschnitten {top[1]}, „So geht’s“ abgeschnitten {top[2]}")
                if top[3] > 35:
                    fehler.append(f"{w}x{h} Leiste {top[3]} px")
            pg.set_viewport_size({"width": W, "height": H})
            reiter("zb")
            assert not fehler, "; ".join(fehler[:6])

        # -------------------------------------------------------------- T4
        def t4():
            reiter("sl")
            frame("sl").get_by_role("button", name="×20", exact=True).click()
            t_rest = (1500 - spielzeit()) / 20
            warte(lambda: zb("() => window.argus.stand.zustand.ende"), t_rest + 30, "Spielende")
            warte(lambda: pg.get_by_test_id("pult-punkt-plenum").count() == 1, 6, "Punkt am Reiter Plenum")
            assert vorn() == "sl"
            pg.wait_for_timeout(600)
            foto("t4_sl_spielende_punkt_plenum")
            reiter("zb")
            warte(lambda: frame("zb").get_by_test_id("spielende").count() == 1, 5, "„Gefecht beendet“ in der Zielbearbeitung")
            assert "Gefecht beendet" in frame("zb").get_by_test_id("spielende").inner_text()
            pg.wait_for_timeout(600)
            foto("t4_zb_gefecht_beendet")
            assert pg.get_by_test_id("pult-punkt-plenum").count() == 1, "Punkt am Reiter Plenum weg, bevor das Plenum vorn war"
            reiter("plenum")
            pl = frame("plenum")
            warte(lambda: pl.locator(".rahmen[data-ansicht=auswertung] main[data-kapitel=gefecht]").count() == 1, 5, "„Gefecht beendet“ im Plenum")
            assert "Gefecht beendet" in pl.locator("main").inner_text()
            assert pg.get_by_test_id("pult-punkt-plenum").count() == 0, "Punkt am Reiter Plenum bleibt, obwohl das Plenum vorn ist"
            pg.wait_for_timeout(600)
            foto("t4_plenum_gefecht_beendet")

        # -------------------------------------------------------------- T5
        def t5():
            assert pg.evaluate("() => window.__pultZaehler") == 4711, "Pult neu geladen"
            for r in REITER:
                assert frame(r).evaluate("() => window.__pultZaehler") == 4711, f"Reiter {r} neu geladen"
            reiter("sl")
            frame("sl").get_by_test_id("pult-zur-zb").click()
            warte(lambda: vorn() == "zb", 3, "„→ Reiter Zielbearbeitung“ führt zur Zielbearbeitung")
            reiter("sl")
            frame("sl").get_by_test_id("pult-zum-plenum").click()
            warte(lambda: vorn() == "plenum", 3, "„→ Reiter Plenum“ führt zum Plenum")
            assert len(neue_seiten) == 1, f"{len(neue_seiten)} Fenster geöffnet (erwartet: nur der Testraum-Tab der Probe)"

        # -------------------------------------------------------------- T6
        def t6():
            reiter("plenum")
            vor = zb("() => [window.argus.stand.lauf, window.argus.stand.zustand.seq, window.argus.stand.zustand.ende]")
            pg.reload()
            warte(lambda: pg.get_by_test_id("pult").count() == 1, 10, "Pult nach dem Neuladen")
            assert vorn() == "plenum", f"nach dem Neuladen vorn: {vorn()}"
            warte(lambda: zb("() => !!window.argus?.stand?.geladen && window.argus.stand.zustand.ende"), 20, "Spiel nach dem Neuladen geladen")
            nach = zb("() => [window.argus.stand.lauf, window.argus.stand.zustand.seq, window.argus.stand.zustand.ende]")
            assert nach[0] == vor[0] and nach[1] >= vor[1] and nach[2], f"vorher {vor}, nachher {nach}"
            warte(lambda: frame("plenum").locator(".rahmen[data-ansicht=auswertung] main[data-kapitel=gefecht]").count() == 1, 10, "Plenum nach dem Neuladen")
            st["lauf"] = nach[0]
            # Zähler neu setzen (T8 prüft, dass das Pult selbst nicht neu lädt)
            pg.evaluate("() => { window.__pultZaehler = 4711; }")

        # -------------------------------------------------------------- T7
        def t7():
            kr.bring_to_front()
            kr.wait_for_timeout(500)
            lauf, laeuft, t = kr.evaluate("() => [window.argus.stand.lauf, window.argus.stand.zustand.uhr.laeuft, window.argus.spielzeit()]")
            assert lauf == st["kr_lauf"] and lauf != st.get("lauf"), f"Lauf kraehe {lauf} (vorher {st['kr_lauf']}, Pult {st.get('lauf')})"
            assert not laeuft and t == 0, f"Uhr im Testraum kraehe: läuft={laeuft}, t={t}"
            pg.bring_to_front()
            # Fenster im Pult (nach dem Neuladen melden sie sich wieder an): SL, ein Laptop, Plenum – kein Laptop aus „kraehe“
            fenster = frame("sl").get_by_test_id("fenster")
            warte(lambda: "Laptop" in fenster.inner_text() and "Plenum" in fenster.inner_text(), 15, "Fenster im Pult angemeldet")
            pg.wait_for_timeout(2500)
            namen = " ".join(fenster.inner_text().split())
            assert namen.count("Laptop ") == 1 or namen.count("Laptop") - namen.count("Laptop abmelden") == 1, f"Fenster im Pult: {namen}"

        # -------------------------------------------------------------- T8
        def t8():
            reiter("sl")
            sl = frame("sl")
            lauf_alt = zb("() => window.argus.stand.lauf")
            knopf = sl.get_by_role("button", name="Neues Spiel")
            knopf.click()
            sl.get_by_role("button", name="Wirklich? Klick = neues Spiel").click()
            warte(lambda: zb("() => window.argus?.stand?.lauf") not in (None, lauf_alt), 15, "neuer Lauf in der Zielbearbeitung")
            warte(lambda: zb("() => window.argus.stand.zustand.seq") <= 2 and zb("() => window.argus.spielzeit()") == 0, 10, "neuer Lauf steht bei 00:00")
            assert pg.locator("[data-pult-reiter=zb] [data-testid=pult-zahl]").count() == 0, "Zahl am Reiter nach „Neues Spiel“"
            # Testraum leeren
            sl.get_by_test_id("testraum-leeren").click()
            sl.get_by_test_id("testraum-leeren").click()
            warte(lambda: frame("zb").locator("[data-testid=entfernt][data-art=geleert]").count() == 1, 15, "„Testraum geleert – neu laden“")
            warte(lambda: pg.get_by_test_id("pult-achtung").count() == 1, 5, "roter Punkt am Reiter Zielbearbeitung")
            warte(lambda: sl.get_by_test_id("pult-zb-hinweis").count() == 1, 8, "„→ Reiter Zielbearbeitung“ unter „▶ Start“")
            assert sl.get_by_test_id("team-fenster-oeffnen").count() == 0
            pg.wait_for_timeout(400)
            foto("t8_sl_testraum_geleert")
            sl.get_by_test_id("pult-zur-zb-steuerung").click()
            warte(lambda: vorn() == "zb", 3, "Verweis führt zur Zielbearbeitung")
            frame("zb").get_by_test_id("neu-beitreten").click()
            warte(lambda: zb("() => !!window.argus?.stand?.rechnet"), 20, "Zielbearbeitung rechnet nach „neu laden“")
            warte(lambda: sl.get_by_test_id("pult-zb-hinweis").count() == 0, 10, "Hinweis bei der Spielleitung verschwindet")
            assert pg.evaluate("() => window.__pultZaehler") == 4711, "Pult neu geladen"

        print(f"Probe N (Testpult), {W} × {H}", flush=True)
        if schritt("T1 Startseite → Testpult im selben Tab, Zielbearbeitung vorn mit Einweisung, lokal im Raum „pult“", t1):
            schritt("T2 Spielleitung: ▶ Start, 10 s dort – Zahl am Reiter, zurück: Uhr und Meldungen weiter", t2)
            schritt("T3 Auswahl und Zoom bleiben, Meldung entschieden, Plenum „Lage“, Layout aller Reiter", t3)
            schritt("T4 ×20 bis Spielende: Punkt am Plenum, „Gefecht beendet“ in Zielbearbeitung und Plenum", t4)
            schritt("T5 kein Neuladen beim Wechsel, Verweise auf die Reiter, kein neues Fenster", t5)
            schritt("T6 Neuladen: Reiter bleibt, Spiel steht wie vorher", t6)
            schritt("T7 Testraum „kraehe“ daneben unberührt", t7)
            schritt("T8 „Neues Spiel“ und „Testraum leeren“ wie gewohnt", t8)
        browser.close()

    fehler = [k for k in konsole if "pageerror" in k or k.startswith("error")]
    ok = sum(1 for e in ergebnis if e[1])
    print(f"\n{ok}/{len(ergebnis)} bestanden" + (f", Konsolenfehler: {fehler[:3]}" if fehler else ", keine Konsolenfehler"))
    if "t2" in st:
        t, n, eingang, zahl = st["t2"]
        print(f"  nach 10 s auf der Spielleitung (×5): Spielzeit {t} s, {n} Meldungen, Eingang {eingang}, Zahlen am Reiter {st['zahlen']}")
    print(f"  Bedingte Lagemeldungen (Höhe des Felds): {st.get('bedingt')}")
    print(f"  Leiste {st.get('leiste')} px · Karte der Zielbearbeitung: verdeckt {st.get('fps_verdeckt')} Bilder/s, vorn {st.get('fps_vorn')} Bilder/s")
    sys.exit(0 if ok == len(ergebnis) == 8 and not fehler else 1)


if __name__ == "__main__":
    main()
