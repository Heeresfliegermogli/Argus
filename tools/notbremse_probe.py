#!/usr/bin/env python3
"""Probe Liste L (14.11.2026): Testraum entschärfen, Laptop abmelden, Notbremse – über die Oberfläche.

Nachgestellt wird der Befund aus dem Export der Datenbank vom 12.11. (Aenderungen_Notbremse_12-11.md, Befund 5): Test ohne Lobby,
Laptop A rechnet, A wird geschlossen, PC B öffnet denselben Link, Spielleitung „Neues Spiel“ → „▶ Start“. Bis Stand K: 10 s
„gesendet …“, dann wieder „▶ Start“, ohne bleibenden Grund; B sah nur zu.

  L1   Testraum mit vier alten Einträgen (alle „Zielbearbeitung“, wie im Export): Öffnen rechnet sofort (älter als 2 h) bzw. nach
       „Testraum leeren“ (jünger). Gerätenamen („Laptop SU2A“) im Team-Fenster und bei der Spielleitung.
  L2   Befund 5 im Testraum und in einer Lobby-Sitzung: Die Spielleitung zeigt den Grund dauerhaft und nennt den Laptop;
       „Laptop abmelden“ bzw. „Testraum leeren“ → B rechnet, Uhr läuft ≤ 10 s nach Start. Laptop abmelden, während er verbunden
       ist: nie zwei rechnende Fenster. Zwei Verläufe in einem Lauf.
  L3   „Alle Sitzungen beenden“ mit 2 Lobby-Sitzungen, Testraum und 7 Fenstern: alle ≤ 10 s auf der Startseite, danach neue
       Sitzung, Start, Uhr läuft.
  L4   Banner „Neue Version“ (version.json ändern, --dist), Programmstand je Laptop.  L6.1 „Diagnose kopieren“.

Mit --alte-regeln (Firebase-Nachbildung mit den Regeln von Stand H–K gestartet): Die Notbremse meldet den Regelfehler, sonst läuft
alles normal.

Aufruf (nach `npm run build` und `npx vite preview --port 4173`):
  python3 tools/notbremse_probe.py http://localhost:4173/ --dist dist                       # lokaler Sync
  node tools/firebase-testserver/start.js 5555 &
  python3 tools/notbremse_probe.py http://localhost:4173/ --dist dist --sync firebase --transport auto --db "http://localhost:5555?ns=argus-l"
  REGELN=tests/regeln_stand_h.json node tools/firebase-testserver/start.js 5556 &
  python3 tools/notbremse_probe.py http://localhost:4173/ --sync firebase --transport auto --db "http://localhost:5556?ns=argus-alt" --alte-regeln
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

from pruefgroessen import groessen_argument, lies_groesse, pruefe_layout

OHNE_TEAM = "Team anlegen oder beitreten"


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
    ap.add_argument("--sync", default="lokal")
    ap.add_argument("--db", default=None)
    ap.add_argument("--transport", default=None)
    ap.add_argument("--bilder", default="notbremse-bilder")
    ap.add_argument("--dist", default=None, help="Verzeichnis des Builds (für die Aufgabe „Neue Version“: version.json wird kurz geändert)")
    ap.add_argument("--alte-regeln", action="store_true", help="die Nachbildung läuft mit den Regeln von Stand H–K (ohne argus/v1/reset)")
    ap.add_argument("--fps", type=int, default=2)
    groessen_argument(ap)
    a = ap.parse_args()
    W, H = lies_groesse(a.groesse)
    os.makedirs(a.bilder, exist_ok=True)
    firebase = a.sync == "firebase"
    # Die Firebase-Nachbildung kennt kein onDisconnect: Ein geschlossenes Fenster gilt dort erst nach 20 s als nicht verbunden.
    WEG = 45

    def url(geraet=None, verzug=0, **extra):
        q = {"sync": a.sync, "fps": a.fps}
        if verzug:
            q["verzug"] = verzug
        if a.db:
            q["db"] = a.db
        if a.transport:
            q["transport"] = a.transport
        if geraet and not firebase:
            q["geraet"] = geraet
        q.update(extra)
        return f"{a.basis}{'&' if '?' in a.basis else '?'}{urllib.parse.urlencode(q)}"

    ergebnis = []
    konsole = []

    def aufgabe(name, f):
        t0 = time.time()
        try:
            f()
            ergebnis.append((name, True, time.time() - t0, ""))
            print(f"  ✓ {name} ({time.time() - t0:.1f} s)", flush=True)
        except Exception as e:  # noqa: BLE001
            import traceback
            zeile_nr = [fr.lineno for fr in traceback.extract_tb(e.__traceback__) if fr.filename == __file__][-1:]
            text = f"{(str(e) or type(e).__name__).splitlines()[0][:900]} (Zeile {zeile_nr[0] if zeile_nr else '?'})"
            ergebnis.append((name, False, time.time() - t0, text))
            print(f"  ✗ {name}: {text}", flush=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-gpu", "--disable-software-rasterizer", "--disable-background-timer-throttling",
                                          "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"])

        # Das Firebase-SDK merkt sich im localStorage, wenn ein WebSocket einmal vor dem Verbinden abbrach (z. B. weil die Seite gerade
        # neu lud), und nimmt danach Long-Polling – das die Nachbildung nicht kann (HTTP 426): Das Fenster bliebe ohne Verbindung.
        # Im Spiel ist Long-Polling ohnehin der Standard; hier wird der Merker vor jedem Laden entfernt.
        WS_MERKER = "try { localStorage.removeItem('firebase:previous_websocket_failure'); } catch (e) {}"

        def horche(ctx):
            ctx.add_init_script(WS_MERKER)
            ctx.on("page", lambda pg: (pg.on("pageerror", lambda e: konsole.append(f"pageerror: {e}")),
                                       pg.on("console", lambda m: konsole.append(f"{m.type}: {m.text} [{pg.url[-80:]}]") if m.type == "error" else None)))
            return ctx

        haupt = horche(browser.new_context(viewport={"width": W, "height": H}))
        haupt.grant_permissions(["clipboard-read", "clipboard-write"])
        kontexte = {}

        def kontext(geraet):
            """Firebase: je Gerät ein eigener Browserkontext (eigener Speicher); lokal: alle im selben, getrennt über geraet=…"""
            if not firebase:
                return haupt
            if geraet not in kontexte:
                kontexte[geraet] = horche(browser.new_context(viewport={"width": W, "height": H}))
                kontexte[geraet].grant_permissions(["clipboard-read", "clipboard-write"])
            return kontexte[geraet]

        bild = lambda pg, n: pg.screenshot(path=os.path.join(a.bilder, f"{n}.png"))  # noqa: E731

        def layout(pg, name):
            fehler, _ = pruefe_layout(pg, karte_ganz=False)
            assert not fehler, f"Layout {name}: {fehler[:3]}"

        # ---------------------------------------------------------------- Helfer
        def rechnet(pg):
            return pg.locator(".rahmen[data-rolle=zb][data-rechnet='1']").count() == 1

        def sieht_zu(pg):
            return pg.locator(".rahmen[data-rolle=zb][data-rechnet='0']").count() == 1 and pg.get_by_test_id("nur-lesen").count() == 1

        def uhr_laeuft(pg):
            return pg.locator(".uhr .uhr-info").first.inner_text().startswith("läuft")

        def host_zahl(*seiten):
            n = 0
            for pg in seiten:
                if pg.is_closed():
                    continue
                try:
                    n += pg.evaluate("() => (window.argusTeams ? window.argusTeams().filter((t) => t.host).length : 0)")
                except Exception:  # noqa: BLE001  (Seite lädt gerade neu)
                    pass
            return n

        def einweisung_weg(pg):
            warte(lambda: pg.get_by_role("button", name="Übersicht überspringen").count() == 1, 15, "Übersicht auf der Oberfläche")
            pg.get_by_role("button", name="Übersicht überspringen").click()
            warte(lambda: pg.get_by_role("button", name="Überspringen").count() == 1, 10, "Folien der Einweisung")
            pg.get_by_role("button", name="Überspringen").click()

        def einweisung_falls(pg):
            """Einweisung schließen, falls sie erscheint (im lokalen Sync teilen sich die „Geräte“ den Merker „schon gesehen“)."""
            try:
                warte(lambda: pg.get_by_role("button", name="Übersicht überspringen").count() == 1, 4, "Einweisung")
            except AssertionError:
                return
            einweisung_weg(pg)

        def bestaetige(knopf, frage):
            knopf.click()
            warte(lambda: knopf.get_attribute("data-scharf") == "1", 3, f"Nachfrage „{frage}“")
            assert re.search(frage, knopf.inner_text()), f"Nachfrage „{knopf.inner_text()}“"
            knopf.click()

        def geraet_name(pg):
            return pg.get_by_test_id("geraet").inner_text().strip()

        def auf_startseite(pg, meldung=True):
            if pg.is_closed():
                return True
            ok = pg.locator(".start-rahmen").count() == 1
            return ok and (not meldung or pg.get_by_test_id("reset-meldung").count() == 1)

        def neue_sitzung(ctx, name="SL 1"):
            sl = ctx.new_page()
            sl.goto(url() + "#spielleitung")
            warte(lambda: sl.get_by_test_id("sitzung-anlegen").count() == 1 and sl.get_by_test_id("sitzung-anlegen").is_enabled(), 15, "Startseite Spielleitung")
            sl.get_by_placeholder("Name, z. B. SL 1").fill(name)
            sl.get_by_test_id("sitzung-anlegen").click()
            warte(lambda: sl.get_by_text("steuert alle Teams").count() == 1, 20, "SL steuert")
            c = sl.get_by_test_id("code").inner_text().strip()
            assert re.fullmatch(r"[ACEFHJKMNPRTVWXY34679]{3}", c), f"Code „{c}“"
            return sl, c

        def ueber_code(geraet, code):
            pg = kontext(geraet).new_page()
            pg.goto(url(geraet) + "#mitspielen")
            warte(lambda: pg.get_by_label("Code der Sitzung").count() == 1, 15, "Mitspielen")
            pg.get_by_label("Code der Sitzung").fill(code)
            pg.get_by_role("button", name="Beitreten").click()
            return pg

        def anlegen(pg, name, team):
            warte(lambda: pg.get_by_text(OHNE_TEAM).count() == 1, 15, f"Lobby {name}")
            feld = pg.get_by_placeholder("z. B. Lt Müller, Lt Schmidt (freiwillig)")
            feld.fill(name)
            feld.press("Enter")
            pg.get_by_placeholder("Teamname").fill(team)
            pg.get_by_role("button", name="Team anlegen").click()
            warte(lambda: pg.get_by_test_id("lobby-ich").get_by_text(team, exact=True).count() == 1, 10, f"Team {team} angelegt")

        def zeile(sl, team):
            return sl.locator("tr[data-team-zeile]", has=sl.get_by_text(team, exact=True))

        def status(sl, team):
            return zeile(sl, team).get_by_test_id("team-status").inner_text().strip()

        def team_id(sl, team):
            return zeile(sl, team).get_attribute("data-team")

        def raum_fenster(raum, rolle, geraet):
            pg = kontext(geraet).new_page()
            pg.goto(url(geraet, rolle=rolle, raum=raum))
            return pg

        def alte_eintraege(sl, alter_ms, nach_marke=False):
            """Vier Laptop-Einträge wie im Export vom 12.11. (alle heißen „Zielbearbeitung“), über den Adapter eines Fensters.
            nach_marke: jünger als die Marke „Alle Sitzungen beendet“ eines früheren Laufs (die Nachbildung hat EINE Datenbank für alle
            Namensräume) und als das letzte „Testraum leeren“ – sonst zählten sie von vornherein nicht."""
            sl.evaluate("""async ([alter, nachMarke]) => {
              const s = window.argusSitzung;
              const jetzt = s.adapter.serverJetzt();
              const grenze = Math.max(s.stand.reset.ts ?? 0, s.rohTeams?.traum?.erstellt ?? 0);
              const seit = Math.round(nachMarke ? Math.max(jetzt - alter, grenze + (jetzt - grenze) / 2) : jetzt - alter);
              const liste = ["su2a26", "faj4jn", "hevmvq", "s6cahd"];
              for (let i = 0; i < liste.length; i++) await s.adapter.setzeSpieler("traum", liste[i], { name: "Zielbearbeitung", rollen: "zb", seit: seit + i }, []);
            }""", [alter_ms, nach_marke])

        def eintraege(sl):
            return sl.evaluate("() => (window.argusTeams()[0]?.spieler ?? []).map((x) => x.client)")

        def grund(sl):
            g = sl.get_by_test_id("uhr-grund")
            return g.inner_text().strip() if g.count() else ""

        GRUND = r"^Start nicht ausgeführt – Laptop [A-Z0-9]{4} (rechnet nicht \((zuletzt vor \d+:\d\d|noch kein Lebenszeichen)\)\. Fenster an einem Laptop öffnen oder hier „Laptop abmelden“\.|ist verbunden, antwortet aber nicht \(.*\)\. Dort neu laden oder hier „Laptop abmelden“\.)$"

        merke = {}

        # ================================================================ L1 + L2 im Testraum
        def l1_alte_eintraege():
            """Testraum mit vier Einträgen, die Tage alt sind: Wer öffnet, rechnet sofort – und heißt nicht „Zielbearbeitung“."""
            raum = f"l-{int(time.time()) % 1000000}"
            merke["raum"] = raum
            # Raum anlegen (Spielleitung), dann ist niemand mehr da – wie der Testraum, der seit dem 24.10. bestand
            sl = raum_fenster(raum, "sl", "sl")
            warte(lambda: sl.get_by_test_id("host").count() == 1 and sl.get_by_test_id("sl-rechnet").count() == 1, 20, "Spielleitung im Testraum steuert")
            assert "kein Team-Laptop da" in sl.get_by_test_id("sl-rechnet").inner_text()
            sl.close()
            # vier alte Einträge über ein Fenster, das nicht aufräumt (Plenum)
            pl = raum_fenster(raum, "plenum", "pl")
            warte(lambda: pl.evaluate("() => !!window.argusSitzung && window.argusSitzung.stand.teamsGeladen"), 20, "Plenum im Raum")
            alte_eintraege(pl, 4 * 24 * 3600 * 1000)
            roh = lambda pg: pg.evaluate("() => Object.keys(window.argusSitzung.rohTeams?.traum?.spieler ?? {})")  # noqa: E731
            warte(lambda: len(roh(pl)) == 4, 10, "vier alte Einträge angelegt")
            assert pl.evaluate("() => Object.values(window.argusSitzung.rohTeams.traum.spieler).every((e) => e.name === 'Zielbearbeitung')")
            pa = raum_fenster(raum, "zb", "a")
            merke["a"] = pa
            t0 = time.time()
            warte(lambda: rechnet(pa), 15, "das neue Fenster rechnet sofort, ohne Klick")
            merke["oeffnen_s"] = time.time() - t0
            einweisung_weg(pa)
            name = geraet_name(pa)
            assert re.fullmatch(r"Laptop [A-Z0-9]{4}", name), f"Gerätename „{name}“"
            merke["a_name"] = name
            # die verfallenen Einträge sind auch aus der Datenbank verschwunden
            warte(lambda: roh(pl) == roh(pl)[:1] and len(roh(pl)) == 1, 10, "alte Einträge entfernt")
            pl.close()
            sl = raum_fenster(raum, "sl", "sl")
            merke["rsl"] = sl
            warte(lambda: sl.get_by_test_id("host").count() == 1 and sl.get_by_test_id("sl-rechnet").count() == 1, 45, "Spielleitung wieder im Testraum (übernimmt die Steuerung)")
            warte(lambda: name in sl.get_by_test_id("sl-rechnet").inner_text() and "verbunden" in sl.get_by_test_id("sl-rechnet").inner_text(), 10, f"SL: rechnet: {name}")
            assert "Zielbearbeitung" not in sl.get_by_test_id("sl-rechnet").inner_text()
            layout(sl, "Steuerung im Testraum")
            bild(sl, "l1-testraum-steuerung")
            bild(pa, "l1-teamfenster-geraetename")

        def l2_befund5_testraum():
            """Befund 5: A rechnet, A zu, B öffnet denselben Link, SL „Neues Spiel“ → „▶ Start“."""
            sl, pa, raum = merke["rsl"], merke["a"], merke["raum"]
            pa.close()
            pb = raum_fenster(raum, "zb", "b")
            merke["b"] = pb
            warte(lambda: sieht_zu(pb), 20, "B: nur zuschauen")
            warte(lambda: merke["a_name"] in pb.get_by_test_id("zuschau-banner").inner_text(), 10, "B nennt den Laptop, der rechnet")
            bestaetige(sl.get_by_role("button", name="Neues Spiel"), "Wirklich")
            warte(lambda: sl.locator(".rahmen").get_attribute("data-seq") == "0", 15, "neuer Lauf")
            start = sl.get_by_role("button", name="▶ Start")
            warte(lambda: start.count() == 1 and start.is_enabled(), 10, "▶ Start")
            start.click()
            t0 = time.time()
            warte(lambda: sl.get_by_role("button", name="gesendet …").count() == 1, 3, "gesendet …")
            warte(lambda: sl.get_by_role("button", name="gesendet …").count() == 0, 13, "„gesendet …“ verschwindet nach 10 s")
            assert time.time() - t0 < 12.5, f"„gesendet …“ blieb {time.time() - t0:.1f} s"
            warte(lambda: re.search(GRUND, grund(sl)) is not None, 3, f"Grund am Knopf („{grund(sl)}“)")
            assert merke["a_name"] in grund(sl), f"Grund nennt den Laptop nicht: {grund(sl)}"
            bild(sl, "l2-grund-bleibt-testraum")
            # … und bleibt stehen (bis Stand K: nur ein kurzer Hinweis)
            time.sleep(8)
            g8 = grund(sl)
            assert re.search(GRUND, g8), f"Grund ist nach 8 s weg oder anders: „{g8}“"
            assert not uhr_laeuft(sl)
            # spätestens 20 s nach dem letzten Puls gilt der Laptop als nicht verbunden – der Text sagt es, mit „zuletzt vor …“
            warte(lambda: "rechnet nicht (zuletzt vor" in grund(sl) and "nicht verbunden" in sl.get_by_test_id("sl-rechnet").inner_text(), 30, f"Grund: rechnet nicht („{grund(sl)}“)")
            bild(sl, "l2-grund-bleibt-testraum")
            layout(sl, "Steuerung mit Grund")
            # Spielleitung greift ein: Laptop abmelden → B rechnet, der wartende Start läuft
            bestaetige(sl.get_by_test_id("laptop-abmelden"), "abmelden")
            t1 = time.time()
            warte(lambda: rechnet(pb), 10, "B rechnet")
            warte(lambda: uhr_laeuft(sl) and uhr_laeuft(pb), 10, "Uhr läuft")
            merke["abmelden_s"] = time.time() - t1
            assert merke["abmelden_s"] <= 10, f"Uhr erst nach {merke['abmelden_s']:.1f} s"
            warte(lambda: grund(sl) == "", 5, "Grund verschwindet")
            assert host_zahl(pb) == 1
            name_b = geraet_name(pb)
            warte(lambda: name_b in sl.get_by_test_id("sl-rechnet").inner_text(), 10, f"SL: rechnet: {name_b}")
            merke["b_name"] = name_b

        def l1_testraum_leeren():
            """Vier Einträge, die noch gelten (30 min alt, früher als B): B ist nicht mehr der Laptop – „Testraum leeren“ löst es."""
            sl, pb, raum = merke["rsl"], merke["b"], merke["raum"]
            einweisung_weg(pb)
            alte_eintraege(sl, 30 * 60 * 1000, nach_marke=True)
            warte(lambda: not rechnet(pb), 15, "B rechnet nicht mehr (ein früherer Eintrag gilt)")
            warte(lambda: "Laptop SU2A" in sl.get_by_test_id("sl-rechnet").inner_text(), 15, "SL: rechnet: Laptop SU2A")
            bild(sl, "l1-testraum-alte-eintraege")
            lauf_alt = sl.locator(".rahmen").get_attribute("data-lauf")
            bestaetige(sl.get_by_test_id("testraum-leeren"), "Wirklich")
            warte(lambda: pb.get_by_test_id("entfernt").count() == 1 and pb.get_by_test_id("entfernt").get_attribute("data-art") == "geleert", 10, "B: Testraum geleert – neu laden")
            assert "Testraum geleert – neu laden" in pb.get_by_test_id("entfernt").inner_text()
            bild(pb, "l1-testraum-geleert")
            warte(lambda: sl.locator(".rahmen").get_attribute("data-lauf") not in (lauf_alt, ""), 10, "neuer Lauf")
            warte(lambda: "kein Team-Laptop da" in sl.get_by_test_id("sl-rechnet").inner_text(), 10, "keine Laptop-Einträge mehr")
            assert host_zahl(pb) == 0
            pb.get_by_test_id("neu-beitreten").click()
            warte(lambda: rechnet(pb), 15, "nach dem Neuladen rechnet B")
            start = sl.get_by_role("button", name="▶ Start")
            warte(lambda: start.count() == 1 and start.is_enabled(), 10, "▶ Start")
            start.click()
            t0 = time.time()
            warte(lambda: uhr_laeuft(sl) and uhr_laeuft(pb), 10, "Uhr läuft ≤ 10 s nach Start")
            merke["leeren_s"] = time.time() - t0
            assert grund(sl) == ""

        def l6_diagnose_testraum():
            sl = merke["rsl"]
            sl.get_by_test_id("diagnose").click()
            warte(lambda: sl.evaluate("() => typeof window.argusDiagnose === 'string'"), 5, "Diagnose erzeugt")
            text = sl.evaluate("() => window.argusDiagnose")
            for muster in [r"ARGUS Diagnose", r"Test ohne Lobby", r"Transport: ", r"Serverzeit − Uhr dieses Rechners: -?\d+ ms", r"Fenster \(\d+ verbunden\):",
                           r"- Team Laptop [A-Z0-9]{4} · Team Team 1 · Stand \S+ · Fenster \d+x\d+.* · Puls vor \d+:\d\d · rechnet ja",
                           r"Lauf \d{8}-\d{4}-[a-z0-9]{4}", r"Protokoll: im Netz bis \d+ · Laptop meldet seq \d+, hoch \d+", r"Ausstehend: "]:
                assert re.search(muster, text), f"Diagnose ohne „{muster}“:\n{text}"
            warte(lambda: sl.get_by_test_id("diagnose").get_attribute("data-stand") in ("kopiert", "zeigen"), 5, "kopiert")
            if sl.get_by_test_id("diagnose").get_attribute("data-stand") == "kopiert":
                assert sl.evaluate("() => navigator.clipboard.readText()") == text
            merke["diagnose"] = text

        def l2_zwei_verlaeufe():
            """Zwei Fenster haben denselben Lauf gerechnet (Befund 3): Der Laptop spielt ohne Netz weiter, ein anderes Fenster belegt
            inzwischen einen Platz im Netz. Beim Wiederverbinden: „Lauf hat zwei Verläufe – Neues Spiel empfohlen“ an beiden."""
            raum = f"z-{int(time.time()) % 1000000}"
            sl = raum_fenster(raum, "sl", "sl")
            warte(lambda: sl.get_by_test_id("host").count() == 1, 20, "SL steuert")
            pg = kontext("z").new_page()
            pg.goto(url("z", verzug=50, rolle="zb", raum=raum))
            einweisung_weg(pg)
            warte(lambda: rechnet(pg), 15, "Team-Laptop rechnet")
            warte(lambda: int(sl.locator(".rahmen").get_attribute("data-seq") or 0) >= 2, 15, "Protokoll bei der SL")
            warte(lambda: pg.locator(".rahmen").get_attribute("data-hoch") == pg.locator(".rahmen").get_attribute("data-seq"), 15, "alles hochgeladen")
            n = int(pg.locator(".rahmen").get_attribute("data-seq"))
            pg.evaluate("() => window.argusVerzug.trennenSimuliert(true)")
            pg.get_by_test_id("test-start").click()
            warte(lambda: uhr_laeuft(pg), 5, "Uhr läuft ohne Netz")
            pg.get_by_role("button", name="×5", exact=True).click()
            pg.get_by_role("button", name="×1", exact=True).click()
            warte(lambda: int(pg.locator(".rahmen").get_attribute("data-seq")) >= n + 3, 10, "drei Einträge ohne Netz")
            # ein anderes Fenster schreibt in denselben Lauf, zwei Plätze weiter
            sl.evaluate("""async (n) => {
              const s = window.argusSitzung;
              const sp = s.spiel("traum");
              const e = { ...sp.stand.protokoll[sp.stand.protokoll.length - 1], seq: n + 3, typ: "notiz", ts: Math.round(s.adapter.serverJetzt()), daten: { text: "anderes Fenster" } };
              delete e.aktion;
              await s.adapter.schreibeEreignis("traum", s.team("traum").lauf, e);
            }""", n)
            pg.evaluate("() => window.argusVerzug.trennenSimuliert(false)")
            warte(lambda: pg.get_by_test_id("zwei-banner").count() == 1, 45, "Team-Fenster: Lauf hat zwei Verläufe")
            assert "Lauf hat zwei Verläufe – Neues Spiel empfohlen." in pg.get_by_test_id("zwei-banner").inner_text()
            assert rechnet(pg), "der Laptop spielt weiter"
            warte(lambda: sl.get_by_test_id("zwei-hinweis").count() == 1, 20, "Spielleitung: Lauf hat zwei Verläufe")
            bild(sl, "l2-zwei-verlaeufe-sl")
            bild(pg, "l2-zwei-verlaeufe-team")
            # Abhilfe: Neues Spiel
            bestaetige(sl.get_by_role("button", name="Neues Spiel"), "Wirklich")
            warte(lambda: pg.get_by_test_id("zwei-banner").count() == 0 and rechnet(pg), 20, "neuer Lauf ohne Hinweis")
            warte(lambda: sl.get_by_test_id("zwei-hinweis").count() == 0, 20, "SL: Hinweis weg")
            pg.close()
            sl.close()

        # ================================================================ Lobby-Sitzung
        def l2_befund5_lobby():
            sl, code = neue_sitzung(haupt)
            merke["sl1"], merke["code1"] = sl, code
            pa = ueber_code("la", code)
            anlegen(pa, "Lt Anders", "Adler")
            warte(lambda: zeile(sl, "Adler").count() == 1, 10, "Team bei der SL")
            sl.get_by_test_id("alle-oeffnen").click()
            einweisung_weg(pa)
            warte(lambda: rechnet(pa), 15, "A rechnet")
            name_a = geraet_name(pa)
            kurz = name_a.split()[-1]
            warte(lambda: zeile(sl, "Adler").locator(f"[data-geraet='{kurz}']").count() == 1, 10, "SL zeigt den Gerätenamen")
            # Programmstand je Laptop (L4.2)
            warte(lambda: zeile(sl, "Adler").get_by_test_id("laptop-version").count() == 1, 15, "Programmstand je Laptop")
            assert zeile(sl, "Adler").get_by_test_id("laptop-version").get_attribute("data-abweichung") == "0"
            layout(sl, "Übersicht")
            bild(sl, "l4-uebersicht-programmstand")
            pa.close()
            pb = ueber_code("lb", code)
            warte(lambda: pb.locator("[data-beitreten='Adler']").count() == 1, 15, "Lobby B")
            pb.locator("[data-beitreten='Adler']").click()
            warte(lambda: sieht_zu(pb), 20, "B sieht zu")
            warte(lambda: zeile(sl, "Adler").locator("[data-laptop-weg]").count() == 1, WEG, "SL: Laptop nicht verbunden")
            sl.get_by_test_id("alle-start").click()
            warte(lambda: re.fullmatch(rf"Start wartet auf {name_a}", status(sl, "Adler").splitlines()[0]) is not None, 16, f"Übersicht: Start wartet auf {name_a} („{status(sl, 'Adler')}“)")
            time.sleep(6)
            assert status(sl, "Adler").splitlines()[0] == f"Start wartet auf {name_a}", status(sl, "Adler")
            bild(sl, "l2-uebersicht-start-wartet")
            # Teamansicht: der Grund am Knopf
            zeile(sl, "Adler").locator("[data-ansehen='Adler']").click()
            warte(lambda: re.search(GRUND, grund(sl)) is not None and name_a in grund(sl), 10, f"Grund in der Teamansicht („{grund(sl)}“)")
            bild(sl, "l2-grund-bleibt-lobby")
            sl.get_by_test_id("zur-uebersicht").click()
            tid = team_id(sl, "Adler")
            bestaetige(sl.get_by_test_id(f"freigeben-{tid}"), "abmelden")
            t1 = time.time()
            warte(lambda: rechnet(pb), 10, "B rechnet")
            warte(lambda: uhr_laeuft(pb) and status(sl, "Adler").startswith("läuft"), 10, "Uhr läuft")
            merke["lobby_s"] = time.time() - t1
            merke["lb"] = pb

        def l2_abmelden_verbunden():
            """Laptop abmelden, während er verbunden ist und rechnet: nie zwei rechnende Fenster."""
            sl, code, pb = merke["sl1"], merke["code1"], merke["lb"]
            einweisung_falls(pb)
            pc = ueber_code("lc", code)
            warte(lambda: pc.locator("[data-beitreten='Adler']").count() == 1, 15, "Lobby C")
            pc.locator("[data-beitreten='Adler']").click()
            warte(lambda: sieht_zu(pc), 20, "C sieht zu")
            tid = team_id(sl, "Adler")
            knopf = sl.get_by_test_id(f"abmelden-{tid}")
            warte(lambda: knopf.count() == 1, 15, "„Laptop abmelden“ bei verbundenem Laptop")
            seq_vorher = int(pb.locator(".rahmen").get_attribute("data-seq"))
            knopf.click()
            warte(lambda: knopf.get_attribute("data-scharf") == "1", 3, "Nachfrage")
            assert re.search(r"verbunden und rechnet – wirklich abmelden\?", knopf.inner_text()), knopf.inner_text()
            bild(sl, "l2-abmelden-nachfrage")
            knopf.click()
            hoechst = 0
            ende = time.time() + 10
            while time.time() < ende and not (rechnet(pc) and pb.get_by_test_id("entfernt").count() == 1):
                hoechst = max(hoechst, host_zahl(pb, pc))
                time.sleep(0.03)
            for _ in range(20):
                hoechst = max(hoechst, host_zahl(pb, pc))
                time.sleep(0.05)
            assert pb.get_by_test_id("entfernt").count() == 1 and pb.get_by_test_id("entfernt").get_attribute("data-art") == "abgemeldet", "B zeigt nicht „abgemeldet“"
            assert "Von der Spielleitung abgemeldet" in pb.get_by_test_id("entfernt").inner_text()
            bild(pb, "l2-von-der-spielleitung-abgemeldet")
            assert rechnet(pc), "C rechnet nicht"
            assert hoechst <= 1, f"zeitweise {hoechst} rechnende Fenster"
            assert host_zahl(pb, pc) == 1
            einweisung_falls(pc)
            assert int(pc.locator(".rahmen").get_attribute("data-seq")) >= seq_vorher and uhr_laeuft(pc), "C rechnet nicht ab dem hochgeladenen Protokoll weiter"
            warte(lambda: status(sl, "Adler").startswith("läuft"), 10, "SL: läuft")
            # „neu beitreten“ führt in die Lobby
            pb.get_by_test_id("neu-beitreten").click()
            warte(lambda: pb.locator(".rahmen.lobby").count() == 1, 10, "B wieder in der Lobby")
            merke["lb"], merke["lc"] = pb, pc

        def l6_diagnose_uebersicht():
            sl = merke["sl1"]
            sl.get_by_test_id("diagnose").click()
            warte(lambda: sl.evaluate("() => typeof window.argusDiagnose === 'string' && window.argusDiagnose.includes('Adler')"), 5, "Diagnose erzeugt")
            text = sl.evaluate("() => window.argusDiagnose")
            for muster in [rf"Sitzung {merke['code1']} ", r"steuert", r"- SL \w{6} ", r"- Adler \(t\w+\) · Lauf \S+ · rechnet: Laptop [A-Z0-9]{4} verbunden", r"Uhr läuft bei \d+:\d\d"]:
                assert re.search(muster, text), f"Diagnose ohne „{muster}“:\n{text}"
            assert "Lt Anders" not in text, "Diagnose enthält Namen"

        def l4_neue_version():
            """version.json ändern: jedes offene Fenster zeigt „Neue Version – bitte neu laden“; die Startseite lädt selbst neu."""
            assert a.dist, "--dist fehlt"
            datei = os.path.join(a.dist, "version.json")
            alt = open(datei, encoding="utf-8").read()
            eigener = json.loads(alt)["commit"]
            sl, pc = merke["sl1"], merke["lc"]
            st = haupt.new_page()
            st.goto(url() + "#spielleitung")
            warte(lambda: st.get_by_test_id("sitzung-anlegen").count() == 1, 15, "Startseite")
            assert sl.get_by_test_id("versions-banner").count() == 0 and pc.get_by_test_id("versions-banner").count() == 0
            st.evaluate("() => { window.__geladen = 1; }")
            try:
                open(datei, "w", encoding="utf-8").write(json.dumps({"commit": "neu1234", "zeit": "2026-11-15 08:00"}) + "\n")
                for pg in (sl, pc, st):
                    pg.evaluate("() => window.dispatchEvent(new Event('focus'))")
                warte(lambda: sl.get_by_test_id("versions-banner").count() == 1 and pc.get_by_test_id("versions-banner").count() == 1, 15, "Banner bei Spielleitung und Team")
                assert "Neue Version – bitte neu laden." in pc.get_by_test_id("versions-banner").inner_text()
                assert sl.get_by_test_id("versions-banner").get_attribute("data-neu") == "neu1234" and eigener in sl.get_by_test_id("versions-banner").inner_text()
                bild(pc, "l4-neue-version-team")
                bild(sl, "l4-neue-version-sl")
                # Startseite: lädt selbst neu (einmal je Version), danach steht dort das Banner, weil der Build derselbe ist
                warte(lambda: st.evaluate("() => window.__geladen === undefined"), 15, "Startseite hat selbst neu geladen")
                st.evaluate("() => window.dispatchEvent(new Event('focus'))")
                warte(lambda: st.get_by_test_id("versions-banner").count() == 1, 15, "Startseite: Banner (kein Neulade-Kreis)")
            finally:
                open(datei, "w", encoding="utf-8").write(alt)
            # Team-Fenster neu laden: rechnet an derselben Stelle weiter
            seq_vorher = int(pc.locator(".rahmen").get_attribute("data-seq"))
            pc.get_by_test_id("neu-laden").click()
            warte(lambda: rechnet(pc) and int(pc.locator(".rahmen").get_attribute("data-seq")) >= seq_vorher and uhr_laeuft(pc), 20, "Team rechnet nach dem Neuladen weiter")
            sl.evaluate("() => window.dispatchEvent(new Event('focus'))")
            warte(lambda: sl.get_by_test_id("versions-banner").count() == 0, 15, "Banner verschwindet, wenn der Stand wieder passt")
            st.close()

        def l5_startseite():
            """L1.4, L5.2: Hinweis am Test ohne Lobby, Empfehlung „neue Sitzung je Durchgang“, „Zuletzt genutzt“ als kleiner Link."""
            st = haupt.new_page()
            st.goto(url() + "#spielleitung")
            warte(lambda: st.get_by_test_id("neu-empfehlung").count() == 1, 15, "Startseite Spielleitung")
            assert "Für jeden Durchgang eine neue Sitzung anlegen" in st.get_by_test_id("neu-empfehlung").inner_text()
            warte(lambda: st.get_by_test_id("letzte-sitzung").count() == 1, 15, "Zuletzt genutzt")
            assert st.get_by_test_id("fortsetzen").evaluate("(el) => el.classList.contains('link-knopf')"), "„Zuletzt genutzt“ ist kein kleiner Link"
            st.locator("details.start-test summary").click()
            hinweis = st.get_by_test_id("test-hinweis").inner_text()
            assert "Nur für einen PC allein." in hinweis and "Spielleitung → Neue Sitzung" in hinweis, hinweis
            assert st.get_by_test_id("notbremse").count() == 1
            layout(st, "Startseite Spielleitung")
            bild(st, "l5-startseite-spielleitung")
            # L4.3: der Wechsel der Seite lädt neu
            st.evaluate("() => { window.__geladen = 1; }")
            st.get_by_role("button", name="◂ zurück").click()
            warte(lambda: st.get_by_test_id("ich-spiele-mit").count() == 1 and st.evaluate("() => window.__geladen === undefined"), 15, "Wechsel zur Startseite lädt neu")
            st.evaluate("() => { window.__geladen = 1; }")
            st.get_by_test_id("zur-spielleitung").click()
            warte(lambda: st.get_by_test_id("sitzung-anlegen").count() == 1 and st.evaluate("() => window.__geladen === undefined"), 15, "Wechsel zur Spielleitung lädt neu")
            st.close()

        # ================================================================ L3 Notbremse
        def l3_alle_beenden():
            sl1, code1 = merke["sl1"], merke["code1"]
            sl2, code2 = neue_sitzung(kontext("sl2") if firebase else haupt, "SL 2")
            pd = ueber_code("ld", code2)
            anlegen(pd, "Lt Dorn", "Dachs")
            sl2.get_by_test_id("alle-oeffnen").click()
            einweisung_weg(pd)
            warte(lambda: rechnet(pd), 15, "Team Dachs rechnet")
            plenum = haupt.new_page()
            plenum.goto(url(sitzung=code1, rolle="plenum"))
            warte(lambda: plenum.locator(".rahmen[data-rolle=plenum]").count() == 1, 20, "Plenum")
            rsl, rb, pc = merke["rsl"], merke["b"], merke["lc"]
            assert rechnet(rb) and rechnet(pc) and rechnet(pd)
            fenster = [sl1, pc, plenum, sl2, pd, rsl, rb]
            alter_lauf = rsl.locator(".rahmen").get_attribute("data-lauf")
            # Notbremse neben „Sitzung beenden“ (Übersicht der zweiten Sitzung); erst mit RESET wird der Knopf scharf
            sl2.get_by_test_id("notbremse").click()
            los = sl2.get_by_test_id("notbremse-los")
            assert los.is_disabled()
            sl2.get_by_test_id("notbremse-wort").fill("reset")
            warte(lambda: los.is_enabled(), 3, "RESET eingetippt")
            bild(sl2, "l3-notbremse-reset")
            los.click()
            t0 = time.time()
            try:
                warte(lambda: all(auf_startseite(pg) for pg in fenster), 12, "alle Fenster auf der Startseite mit Meldung")
            except AssertionError as e:
                offen = [(pg.url[-90:], pg.evaluate("() => window.argusSitzung ? JSON.stringify({ r: window.argusSitzung.stand.reset, a: window.argusSitzung.stand.alleBeendet, b: window.argusSitzung.stand.beendet }) : 'ohne Sitzung'")) for pg in fenster if not auf_startseite(pg)]
                raise AssertionError(f"{e}: {offen}") from e
            merke["reset_s"] = time.time() - t0
            assert merke["reset_s"] <= 10, f"erst nach {merke['reset_s']:.1f} s"
            assert "Die Spielleitung hat alle Sitzungen beendet." in pc.get_by_test_id("reset-meldung").inner_text()
            bild(pc, "l3-alle-sitzungen-beendet")
            assert host_zahl(*fenster) == 0
            # nichts gemerkt: kein „Zurück zu Team“, kein „Zuletzt genutzt“; alter Code abgewiesen
            sl1.goto(url() + "#spielleitung")
            warte(lambda: sl1.get_by_test_id("sitzung-anlegen").count() == 1, 15, "Startseite Spielleitung")
            time.sleep(3)
            assert sl1.get_by_test_id("letzte-sitzung").count() == 0, "„Zuletzt genutzt“ steht noch da"
            pc.goto(url("lc") + "#mitspielen")
            warte(lambda: pc.get_by_label("Code der Sitzung").count() == 1, 15, "Mitspielen")
            time.sleep(3)
            assert pc.get_by_test_id("zurueck-zum-team").count() == 0, "„Zurück zu Team“ steht noch da"
            pc.get_by_label("Code der Sitzung").fill(code1)
            pc.get_by_role("button", name="Beitreten").click()
            warte(lambda: pc.get_by_test_id("code-fehler").count() == 1 and "ist beendet" in pc.get_by_test_id("code-fehler").inner_text(), 15, "alter Code abgewiesen")
            # die Spielleitung kommt noch an die Auswertung der alten Sitzung
            sl2.goto(url(sitzung=code1, rolle="sl", name="SL 1"))
            warte(lambda: sl2.get_by_test_id("ende-banner").count() == 1, 20, "alte Sitzung: beendet, Auswertung erreichbar")
            warte(lambda: sl2.get_by_test_id("auswertung-knopf").count() >= 1, 15, "Auswertung der alten Sitzung erreichbar")
            sl2.close()
            # danach: neue Sitzung, Start, Uhr läuft
            sl1.close()
            sl3, code3 = neue_sitzung(haupt, "SL 1")
            pc.get_by_label("Code der Sitzung").fill(code3)
            pc.get_by_role("button", name="Beitreten").click()
            anlegen(pc, "Lt Clausen", "Condor")
            sl3.get_by_test_id("alle-oeffnen").click()
            einweisung_weg(pc)
            warte(lambda: rechnet(pc), 15, "neues Team rechnet")
            sl3.get_by_test_id("alle-start").click()
            t1 = time.time()
            warte(lambda: uhr_laeuft(pc) and status(sl3, "Condor").startswith("läuft"), 10, "neue Sitzung: Uhr läuft")
            merke["neu_s"] = time.time() - t1
            # Testraum nach der Notbremse: neu öffnen rechnet sofort, neuer Lauf
            rb.goto(url("b", rolle="zb", raum=merke["raum"]))
            warte(lambda: rechnet(rb), 15, "Testraum: neues Fenster rechnet")
            warte(lambda: rb.locator(".rahmen").get_attribute("data-lauf") not in (alter_lauf, ""), 10, "Testraum: neuer Lauf")
            merke["sl3"] = sl3

        # ================================================================ alte Regeln
        def alte_regeln():
            """Regeln von Stand H–K (ohne argus/v1/reset): Die Notbremse meldet den Regelfehler, sonst läuft alles normal."""
            sl, code = neue_sitzung(haupt)
            pa = ueber_code("ra", code)
            anlegen(pa, "Lt Anders", "Adler")
            sl.get_by_test_id("alle-oeffnen").click()
            einweisung_weg(pa)
            warte(lambda: rechnet(pa), 15, "A rechnet")
            sl.get_by_test_id("alle-start").click()
            warte(lambda: uhr_laeuft(pa) and status(sl, "Adler").startswith("läuft"), 10, "Uhr läuft mit den alten Regeln")
            sl.get_by_test_id("notbremse").click()
            sl.get_by_test_id("notbremse-wort").fill("RESET")
            sl.get_by_test_id("notbremse-los").click()
            warte(lambda: sl.get_by_test_id("notbremse-regeln").count() == 1, 10, "Knopf meldet den Regelfehler")
            assert "Firebase-Regeln veraltet – bitte veröffentlichen." in sl.get_by_test_id("notbremse-regeln").inner_text()
            bild(sl, "l3-alte-regeln")
            time.sleep(3)
            # sonst bricht nichts: kein roter Balken, kein Fenster beendet, das Spiel läuft, Abmelden und Diagnose gehen
            assert sl.get_by_test_id("regel-banner").count() == 0 and pa.get_by_test_id("regel-banner").count() == 0, "roter Balken wegen der Marke"
            assert rechnet(pa) and uhr_laeuft(pa) and status(sl, "Adler").startswith("läuft")
            sl.get_by_test_id("diagnose").click()
            warte(lambda: "nicht lesbar (Firebase-Regeln ohne argus/v1/reset)" in (sl.evaluate("() => window.argusDiagnose") or ""), 5, "Diagnose nennt die alten Regeln")
            pb = ueber_code("rb", code)
            warte(lambda: pb.locator("[data-beitreten='Adler']").count() == 1, 15, "Lobby B")
            pb.locator("[data-beitreten='Adler']").click()
            warte(lambda: sieht_zu(pb), 20, "B sieht zu")
            tid = team_id(sl, "Adler")
            bestaetige(sl.get_by_test_id(f"abmelden-{tid}"), "abmelden")
            warte(lambda: rechnet(pb) and pa.get_by_test_id("entfernt").count() == 1, 10, "Laptop abmelden geht mit den alten Regeln")
            assert host_zahl(pa, pb) == 1
            # Testraum mit den alten Regeln: rechnen, leeren
            raum = f"r-{int(time.time()) % 1000000}"
            rsl = raum_fenster(raum, "sl", "sl")
            rt = raum_fenster(raum, "zb", "rt")
            einweisung_weg(rt)
            warte(lambda: rechnet(rt) and rsl.get_by_test_id("host").count() == 1, 20, "Testraum rechnet")
            bestaetige(rsl.get_by_test_id("testraum-leeren"), "Wirklich")
            warte(lambda: rt.get_by_test_id("entfernt").count() == 1, 10, "Testraum leeren geht mit den alten Regeln")
            rt.get_by_test_id("neu-beitreten").click()
            warte(lambda: rechnet(rt), 15, "nach dem Neuladen rechnet das Fenster")
            rsl.get_by_role("button", name="▶ Start").click()
            warte(lambda: uhr_laeuft(rt) and uhr_laeuft(rsl), 10, "Uhr läuft")
            # „Sitzung beenden“ (K4.1) geht weiter
            bestaetige(sl.get_by_test_id("sitzung-beenden"), "Wirklich")
            warte(lambda: pb.get_by_test_id("sitzung-beendet").count() == 1, 10, "Sitzung beenden geht mit den alten Regeln")
            # Startseite: Notbremse meldet den Regelfehler ebenfalls
            st = haupt.new_page()
            st.goto(url() + "#spielleitung")
            warte(lambda: st.get_by_test_id("notbremse").count() == 1, 15, "Startseite")
            st.get_by_test_id("notbremse").click()
            st.get_by_test_id("notbremse-wort").fill("RESET")
            st.get_by_test_id("notbremse-los").click()
            warte(lambda: st.get_by_test_id("notbremse-regeln").count() == 1, 15, "Startseite: Knopf meldet den Regelfehler")

        print(f"Probe Liste L – Sync {a.sync}{' (' + a.db + ')' if a.db else ''}{' · ALTE REGELN' if a.alte_regeln else ''}, Fenster {W} × {H}", flush=True)
        if a.alte_regeln:
            aufgabe("Alte Regeln: Notbremse meldet den Regelfehler, sonst läuft alles normal", alte_regeln)
        else:
            aufgabe("L1.2/L1.3 Testraum mit vier alten Einträgen: Öffnen rechnet sofort; Gerätename statt „Zielbearbeitung“", l1_alte_eintraege)
            aufgabe("L2.1/L2.2 Befund 5 im Testraum: Grund bleibt am Knopf, „Laptop abmelden“ → B rechnet, Uhr läuft", l2_befund5_testraum)
            aufgabe("L1.1 „Testraum leeren“: geltende alte Einträge blockieren, leeren → neu laden → rechnet, Start → Uhr läuft", l1_testraum_leeren)
            aufgabe("L6.1 „Diagnose kopieren“ im Testraum", l6_diagnose_testraum)
            aufgabe("L2.4 zwei Verläufe in einem Lauf: Hinweis am Team-Fenster und bei der Spielleitung", l2_zwei_verlaeufe)
            aufgabe("L2.1/L2.2 Befund 5 in der Lobby: „Start wartet auf Laptop XXXX“, Grund in der Teamansicht, abmelden → B rechnet", l2_befund5_lobby)
            aufgabe("L2.2/L2.3 Laptop abmelden, während er verbunden ist: „Von der Spielleitung abgemeldet“, nie zwei rechnende Fenster", l2_abmelden_verbunden)
            aufgabe("L6.1 „Diagnose kopieren“ in der Übersicht", l6_diagnose_uebersicht)
            if a.dist:
                aufgabe("L4.1 Banner „Neue Version – bitte neu laden“, Startseite lädt selbst neu", l4_neue_version)
            aufgabe("L1.4/L5.2/L4.3 Startseite: Hinweise, „Zuletzt genutzt“ klein, Wechsel lädt neu", l5_startseite)
            aufgabe("L3 „Alle Sitzungen beenden“: 2 Lobby-Sitzungen, Testraum, 7 Fenster ≤ 10 s auf der Startseite; neue Sitzung läuft", l3_alle_beenden)
        browser.close()

    print()
    ok = sum(1 for _, gut, _, _ in ergebnis if gut)
    for name, gut, dauer, text in ergebnis:
        print(f"{'bestanden' if gut else 'NICHT   '}  {dauer:5.1f} s  {name}{'  – ' + text if text else ''}")
    zeiten = {k: round(v, 1) for k, v in merke.items() if k.endswith("_s")}
    print(f"\nZeiten (s): {zeiten}")
    stoerend = [k for k in konsole if "favicon" not in k and "ERR_CONNECTION" not in k]
    print(f"{ok}/{len(ergebnis)} Aufgaben gelöst · Konsolenfehler: {len(stoerend)}")
    for k in stoerend[:10]:
        print("  ", k[:300])
    sys.exit(0 if ok == len(ergebnis) and not stoerend else 1)


if __name__ == "__main__":
    main()
