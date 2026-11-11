#!/usr/bin/env python3
"""Probe Liste K (11.11.2026): Spiele sauber schließen und wieder öffnen, keine hängenden Aktionen – über die Oberfläche, mit dem,
was auf dem Bildschirm steht (Knopftexte, Hinweise), wie eine Testperson es täte.

Nachgestellt wird der Befund vom 11.11. (Team-Tab ohne „Team verlassen“ geschlossen, über Startseite und Code neu geöffnet) und
alles, was Liste K dazu festlegt:

  K1   Tab schließen und neu öffnen: Startseite + Code, „Zurück zu Team …“, Lesezeichen; (Firebase) neuer Browserkontext mit
       gleichem Speicher = Browser neu gestartet. Dasselbe Team rechnet sofort weiter, ohne Zutun der Spielleitung.
       Zwei Tabs im selben Browser: der zweite sieht nur zu; „hierher holen“.
  K2   Anderes Gerät übernimmt ein verwaistes Team („Spiel hier weiterführen“, erst nach 20 s), der alte Laptop kommt zurück
       („wird an einem anderen Laptop weitergeführt“) – nie zwei rechnende Fenster. Spielleitung: „Laptop freigeben“.
  K3   „▶ Start für alle“ mit einem fehlenden Team („Start wartet auf Laptop“, Start kommt beim Wiederverbinden an); kein Knopf
       länger als 10 s auf „gesendet …“; „Neues Spiel“ ohne Laptop mit Hinweis.
  K4   „Team verlassen“ im Lauf, „Sitzung beenden“, neue Sitzung ohne Reste.

Geräte: Im lokalen Sync teilen sich alle Fenster einen Browser (ein localStorage) – ein „Gerät“ ist dort ein eigener Merkbereich
(…&geraet=a). Gegen die Firebase-Nachbildung ist jedes Gerät ein eigener Browserkontext (eigener Speicher).

Aufruf (nach `npm run build` und `npx vite preview --port 4173`):
  python3 tools/neuoeffnen_probe.py http://localhost:4173/                      # lokaler Sync
  node tools/firebase-testserver/start.js 5555 &
  python3 tools/neuoeffnen_probe.py http://localhost:4173/ --sync firebase --transport auto --db "http://localhost:5555?ns=argus-k"
"""
import argparse
import os
import re
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

from pruefgroessen import groessen_argument, lies_groesse, pruefe_layout

RECHNET = "Dieser Laptop spielt für das Team."
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
    ap.add_argument("--db", default=None, help="Firebase-Adresse, z. B. http://localhost:5555?ns=argus-k")
    ap.add_argument("--transport", default=None)
    ap.add_argument("--bilder", default="neuoeffnen-bilder")
    ap.add_argument("--fps", type=int, default=2)
    groessen_argument(ap)
    a = ap.parse_args()
    W, H = lies_groesse(a.groesse)
    os.makedirs(a.bilder, exist_ok=True)
    firebase = a.sync == "firebase"
    # So lange braucht die Spielleitung, bis ein geschlossenes Fenster als „nicht verbunden“ gilt: lokal sofort; die Firebase-Nachbildung
    # kennt kein onDisconnect – dort erst, wenn der Puls 20 s alt ist (die echte Datenbank meldet ein geschlossenes Fenster sofort ab).
    WEG = 40 if firebase else 15

    def start_url(geraet=None, verzug=0):
        q = {"sync": a.sync, "fps": a.fps}
        if verzug:
            q["verzug"] = verzug
        if a.db:
            q["db"] = a.db
        if a.transport:
            q["transport"] = a.transport
        if geraet and not firebase:
            q["geraet"] = geraet
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
            text = (str(e) or type(e).__name__).splitlines()[0][:200]
            ergebnis.append((name, False, time.time() - t0, text))
            print(f"  ✗ {name}: {text}", flush=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-gpu", "--disable-software-rasterizer", "--disable-background-timer-throttling",
                                          "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"])

        def horche(ctx):
            ctx.on("page", lambda pg: (pg.on("pageerror", lambda e: konsole.append(f"pageerror: {e}")),
                                       pg.on("console", lambda m: konsole.append(f"{m.type}: {m.text}") if m.type == "error" else None)))
            return ctx

        haupt = horche(browser.new_context(viewport={"width": W, "height": H}))
        kontexte = {}

        def kontext(geraet):
            """Firebase: je Gerät ein eigener Browserkontext; lokal: alle im selben (ein localStorage), getrennt über geraet=…"""
            if not firebase:
                return haupt
            if geraet not in kontexte:
                kontexte[geraet] = horche(browser.new_context(viewport={"width": W, "height": H}))
            return kontexte[geraet]

        bild = lambda pg, n: pg.screenshot(path=os.path.join(a.bilder, f"{n}.png"))  # noqa: E731

        def layout(pg, name):
            fehler, _ = pruefe_layout(pg, karte_ganz=False)
            assert not fehler, f"Layout {name}: {fehler[:3]}"

        # ---------------------------------------------------------------- Spielleitung
        def neue_sitzung(sl):
            sl.goto(start_url() + "#spielleitung")
            warte(lambda: sl.get_by_role("button", name="Neue Sitzung anlegen").count() == 1, 15, "Startseite Spielleitung")
            sl.get_by_placeholder("Name, z. B. SL 1").fill("SL 1")
            sl.get_by_role("button", name="Neue Sitzung anlegen").click()
            warte(lambda: sl.get_by_text("steuert alle Teams").count() == 1, 20, "SL steuert")
            c = sl.get_by_test_id("code").inner_text().strip()
            assert re.fullmatch(r"[ACEFHJKMNPRTVWXY34679]{3}", c), f"Code „{c}“"
            return c

        sl = haupt.new_page()
        zustand = {"code": neue_sitzung(sl)}
        code = lambda: zustand["code"]  # noqa: E731
        with haupt.expect_page() as neu:
            sl.get_by_role("button", name="Plenum öffnen").click()
        plenum = neu.value

        def zeile(team):
            return sl.locator("tr[data-team-zeile]", has=sl.get_by_text(team, exact=True))

        def status(team):
            return zeile(team).get_by_test_id("team-status").inner_text().strip()

        def hinweis(pg, muster):
            return pg.locator(".hinweise .hinweis", has_text=re.compile(muster)).count() >= 1

        # ---------------------------------------------------------------- Team-Fenster
        def startseite(geraet, ctx=None, verzug=0):
            pg = (ctx or kontext(geraet)).new_page()
            pg.goto(start_url(geraet, verzug))
            pg.get_by_role("button", name="Ich spiele mit").click()
            warte(lambda: pg.get_by_label("Code der Sitzung").count() == 1, 15, "Mitspielen")
            return pg

        def ueber_code(geraet, ctx=None, verzug=0):
            pg = startseite(geraet, ctx, verzug)
            pg.get_by_label("Code der Sitzung").fill(code())
            pg.get_by_role("button", name="Beitreten").click()
            return pg

        def ueber_knopf(geraet, team):
            pg = startseite(geraet)
            knopf = pg.get_by_test_id("zurueck-zum-team")
            warte(lambda: knopf.count() == 1, 15, f"Knopf „Zurück zu Team {team}“")
            text = knopf.inner_text()
            assert f"Zurück zu Team {team} (Code {code()})" in text, f"Knopftext „{text}“"
            layout(pg, "Startseite mit Zurück-Knopf")
            bild(pg, f"start-zurueck-{team}")
            knopf.click()
            return pg

        def ich(pg):
            return urllib.parse.parse_qs(urllib.parse.urlparse(pg.url).query).get("ich", [""])[0]

        def karte(pg, team):
            return pg.locator("section.team-karte", has=pg.get_by_text(team, exact=True))

        def in_lobby_rechnet(pg, team):
            i = pg.get_by_test_id("lobby-ich")
            return i.get_by_text(team, exact=True).count() == 1 and i.get_by_text(RECHNET).count() == 1

        def anlegen(pg, name, team):
            warte(lambda: pg.get_by_text(OHNE_TEAM).count() == 1, 15, f"Lobby {name}")
            feld = pg.get_by_placeholder("z. B. Lt Müller, Lt Schmidt (freiwillig)")
            feld.fill(name)
            feld.press("Enter")
            pg.get_by_placeholder("Teamname").fill(team)
            pg.get_by_role("button", name="Team anlegen").click()
            warte(lambda: in_lobby_rechnet(pg, team), 10, f"Team {team} angelegt")

        def rechnet(pg):
            return pg.locator(".rahmen[data-rolle=zb][data-rechnet='1']").count() == 1

        def sieht_zu(pg):
            return pg.locator(".rahmen[data-rolle=zb][data-rechnet='0']").count() == 1 and pg.get_by_test_id("nur-lesen").count() == 1

        def seq(pg):
            return int(pg.locator(".rahmen[data-rolle=zb]").get_attribute("data-seq") or 0)

        def lauf(pg):
            return pg.locator(".rahmen[data-rolle=zb]").get_attribute("data-lauf") or ""

        def uhr_laeuft(pg):
            return pg.locator(".uhr .uhr-info").first.inner_text().startswith("läuft")

        def host_zahl(*seiten):
            """Wie viele dieser Fenster rechnen gerade ein Spiel (Host aktiv)?"""
            n = 0
            for pg in seiten:
                if pg.is_closed():
                    continue
                n += pg.evaluate("() => (window.argusTeams ? window.argusTeams().filter((t) => t.host).length : 0)")
            return n

        def einweisung_weg(pg):
            warte(lambda: pg.get_by_role("button", name="Übersicht überspringen").count() == 1, 15, "Übersicht auf der Oberfläche")
            pg.get_by_role("button", name="Übersicht überspringen").click()
            warte(lambda: pg.get_by_role("button", name="Überspringen").count() == 1, 10, "Folien der Einweisung")
            pg.get_by_role("button", name="Überspringen").click()

        def bestaetige(knopf, frage):
            """Knopf mit Nachfrage im Knopf: erst klicken, dann die Frage bestätigen."""
            knopf.click()
            warte(lambda: knopf.get_attribute("data-scharf") == "1", 3, f"Nachfrage „{frage}“")
            assert re.search(frage, knopf.inner_text()), f"Nachfrage „{knopf.inner_text()}“"
            knopf.click()

        f = {}  # offene Fenster: f["a"] Team Adler (Gerät a), f["b"] zweites Gerät, f["c"] Team Bussard (Gerät c)
        merke = {}

        # ================================================================ K1
        def k1_befund():
            """Der Befund vom 11.11.: Team anlegen, Tab schließen, über Startseite + Code neu öffnen."""
            pg = ueber_code("a")
            anlegen(pg, "Lt Anders", "Adler")
            merke["ich_a"] = ich(pg)
            assert re.fullmatch(r"[a-z0-9]{6}", merke["ich_a"]), "Kennung in der Adresse"
            warte(lambda: zeile("Adler").count() == 1, 10, "Adler bei der SL")
            pg.close()  # ohne „Team verlassen“
            warte(lambda: zeile("Adler").locator("[data-laptop-weg]").count() == 1, WEG, "SL: Laptop nicht verbunden seit …")
            assert "nicht verbunden seit" in zeile("Adler").locator("[data-laptop-weg]").inner_text()
            assert zeile("Adler").get_by_role("button", name="Laptop freigeben").count() == 1, "Knopf „Laptop freigeben“ fehlt"
            layout(sl, "SL-Übersicht mit „Laptop freigeben“")
            bild(sl, "sl-laptop-weg")
            pg = ueber_code("a")
            warte(lambda: in_lobby_rechnet(pg, "Adler"), 10, "nach Neuöffnen sofort wieder der Laptop von Adler (nicht „nur zuschauen“)")
            assert ich(pg) == merke["ich_a"], f"andere Kennung nach Neuöffnen: {ich(pg)} statt {merke['ich_a']}"
            assert pg.get_by_text("hier nur zuschauen").count() == 0
            warte(lambda: zeile("Adler").locator("[data-laptop-weg]").count() == 0, 10, "SL: Laptop wieder verbunden")
            f["a"] = pg

        def k1_im_lauf():
            """Spiel offen und gestartet; Tab schließen; „Zurück zu Team Adler“ – rechnet sofort weiter, ohne Zutun der Spielleitung."""
            sl.get_by_role("button", name=re.compile("Spiel öffnen – alle Teams")).click()
            einweisung_weg(f["a"])
            sl.get_by_role("button", name="▶ Start für alle").click()
            warte(lambda: uhr_laeuft(f["a"]) and "läuft" in status("Adler"), 15, "Uhr Adler läuft")
            time.sleep(1.5)
            vorher, lauf_vorher = seq(f["a"]), lauf(f["a"])
            f["a"].close()
            warte(lambda: zeile("Adler").locator("[data-laptop-weg]").count() == 1, WEG, "SL sieht: nicht verbunden")
            pg = ueber_knopf("a", "Adler")
            warte(lambda: rechnet(pg), 15, "rechnet nach „Zurück zu Team Adler“")
            assert ich(pg) == merke["ich_a"]
            assert lauf(pg) == lauf_vorher, "anderer Lauf nach Neuöffnen"
            warte(lambda: seq(pg) >= vorher and uhr_laeuft(pg), 10, "Protokoll und laufende Uhr wieder da")
            assert pg.get_by_role("button", name="Übersicht überspringen").count() == 0, "Einweisung nach Neuöffnen erneut"
            assert pg.get_by_test_id("zuschau-banner").count() == 0, "Banner „nur zuschauen“ am eigenen Laptop"
            warte(lambda: zeile("Adler").locator("[data-laptop-weg]").count() == 0 and "läuft" in status("Adler"), 15, "SL: Adler läuft wieder")
            layout(pg, "Zielbearbeitung nach Neuöffnen")
            f["a"] = pg

        def k1_lesezeichen():
            adresse = f["a"].url
            assert "ich=" + merke["ich_a"] in adresse
            vorher = seq(f["a"])
            f["a"].close()
            pg = kontext("a").new_page()
            pg.goto(adresse)
            warte(lambda: rechnet(pg) and seq(pg) >= vorher, 15, "über das Lesezeichen wieder der Team-Laptop")
            f["a"] = pg

        def k1_neuer_kontext():
            """Browser neu gestartet: neuer Browserkontext mit gleichem Speicher (nur Firebase – lokal lebt der Sync im selben Speicher)."""
            alt = kontexte["a"]
            vorher = seq(f["a"])
            speicher = alt.storage_state()
            f["a"].close()
            alt.close()
            kontexte["a"] = horche(browser.new_context(viewport={"width": W, "height": H}, storage_state=speicher))
            pg = ueber_code("a")
            warte(lambda: rechnet(pg) and seq(pg) >= vorher, 20, "nach Browser-Neustart wieder der Team-Laptop")
            assert ich(pg) == merke["ich_a"]
            f["a"] = pg

        def k1_zwei_tabs():
            zwei = ueber_code("a")
            warte(lambda: zwei.get_by_test_id("zuschau-banner").count() == 1, 15, "zweiter Tab: Hinweis")
            assert "Das Spiel läuft schon in einem anderen Tab dieses Browsers" in zwei.get_by_test_id("zuschau-banner").inner_text()
            assert sieht_zu(zwei), "zweiter Tab sieht nicht nur zu"
            assert rechnet(f["a"]), "erster Tab rechnet nicht mehr"
            assert host_zahl(f["a"], zwei) == 1, "nicht genau ein rechnendes Fenster"
            assert zeile("Adler").locator(".spieler-chip").count() == 1, "zweiter Tab steht als Fenster im Team"
            layout(zwei, "zweiter Tab")
            bild(zwei, "zweiter-tab")
            vorher = seq(f["a"])
            zwei.get_by_test_id("zuschau-banner").get_by_role("button", name="hierher holen").click()
            warte(lambda: f["a"].get_by_test_id("tab-abgegeben").count() == 1, 10, "erster Tab hat abgegeben")
            warte(lambda: rechnet(zwei) and seq(zwei) >= vorher, 15, "zweiter Tab rechnet nach „hierher holen“")
            assert host_zahl(f["a"], zwei) == 1
            assert ich(zwei) == merke["ich_a"]
            f["a"].close()
            f["a"] = zwei

        # ================================================================ K2
        def k2_uebernehmen():
            """Laptop a ist weg (Tab zu). Ein anderes Gerät übernimmt das verwaiste Team – sichtbar, nach 20 s."""
            vorher = seq(f["a"])
            t0 = time.time()
            f["a"].close()
            b = ueber_code("b")
            warte(lambda: karte(b, "Adler").count() == 1, 15, "Lobby am zweiten Gerät")
            warte(lambda: "Laptop nicht verbunden" in karte(b, "Adler").get_by_test_id("karte-stand").inner_text(), WEG, "Karte: Laptop nicht verbunden")
            assert karte(b, "Adler").get_by_role("button", name="zuschauen").count() == 1
            knopf = karte(b, "Adler").get_by_role("button", name="Spiel hier weiterführen")
            if knopf.count() == 0:
                assert "Weiterführen hier in" in karte(b, "Adler").get_by_test_id("karte-warten").inner_text(), "weder Knopf noch Wartezeit"
            warte(lambda: knopf.count() == 1, 30, "Knopf „Spiel hier weiterführen“ (nach 20 s)")
            assert time.time() - t0 >= 14, f"Übernahme schon nach {time.time() - t0:.0f} s angeboten (soll 20 s nicht verbunden sein)"
            layout(b, "Lobby mit „Spiel hier weiterführen“")
            bild(b, "lobby-weiterfuehren")
            bestaetige(karte(b, "Adler").locator("button[data-testid^=weiterfuehren]"), "Nur wenn der andere Laptop aus ist")
            warte(lambda: rechnet(b), 15, "zweites Gerät rechnet")
            warte(lambda: seq(b) >= vorher - 5 and uhr_laeuft(b), 10, "ab dem hochgeladenen Protokoll, Uhr läuft")
            if b.get_by_role("button", name="Übersicht überspringen").count() == 1:
                einweisung_weg(b)
            warte(lambda: zeile("Adler").locator("[data-laptop-weg]").count() == 0 and "läuft" in status("Adler"), 15, "SL: Adler hat wieder einen Laptop")
            f["b"] = b

        def k2_alter_kommt_zurueck():
            pg = ueber_knopf("a", "Adler")
            warte(lambda: pg.get_by_test_id("zuschau-banner").count() == 1, 15, "alter Laptop: Hinweis")
            warte(lambda: pg.get_by_test_id("zuschau-banner").get_attribute("data-art") == "abgeloest", 10, "Hinweis „abgelöst“")
            assert "Das Spiel wird an einem anderen Laptop weitergeführt" in pg.get_by_test_id("zuschau-banner").inner_text()
            assert pg.get_by_test_id("eigenes-protokoll").count() == 1, "Protokoll als Datei fehlt"
            assert sieht_zu(pg) and rechnet(f["b"])
            for _ in range(10):  # nie zwei rechnende Fenster
                assert host_zahl(pg, f["b"]) == 1, "zwei rechnende Fenster"
                time.sleep(0.3)
            warte(lambda: abs(seq(pg) - seq(f["b"])) <= 3, 10, "alter Laptop folgt dem neuen")
            layout(pg, "abgelöster Laptop")
            bild(pg, "abgeloest")
            f["a"] = pg

        def k2_freigeben():
            """Der neue Laptop (b) fällt aus; die Spielleitung gibt ihn frei – das nächste Fenster des Teams (a) rechnet."""
            f["b"].close()
            weg = zeile("Adler").locator("[data-laptop-weg]")
            warte(lambda: weg.count() == 1, WEG, "SL: nicht verbunden seit …")
            warte(lambda: re.search(r"nicht verbunden seit \d+:\d\d", weg.inner_text()) is not None, 5, "Zeitangabe m:ss")
            assert sieht_zu(f["a"]), "a rechnet schon vor der Freigabe (nichts von selbst)"
            bestaetige(weg.get_by_role("button"), "freigeben\\?")
            warte(lambda: rechnet(f["a"]), 15, "nach der Freigabe rechnet das nächste Fenster")
            warte(lambda: zeile("Adler").locator(".spieler-chip").count() == 1 and weg.count() == 0, 10, "SL: ein Laptop, verbunden")
            assert host_zahl(f["a"]) == 1

        # ================================================================ K3
        def k3_start_mit_fehlendem_team():
            c = ueber_code("c")
            anlegen(c, "Lt Claus", "Bussard")
            sl.get_by_role("button", name=re.compile("Spiel öffnen – 1 Team")).click()
            einweisung_weg(c)
            sl.get_by_role("button", name="❚❚ Anhalten – alle").click()
            warte(lambda: "angehalten" in status("Adler") and not uhr_laeuft(f["a"]), 15, "alle angehalten")
            merke["lauf_c"] = lauf(c)
            c.close()
            warte(lambda: zeile("Bussard").locator("[data-laptop-weg]").count() == 1, WEG, "Bussard: Laptop nicht verbunden")
            t0 = time.time()
            sl.get_by_role("button", name="▶ Start für alle").click()
            warte(lambda: "läuft" in status("Adler") and uhr_laeuft(f["a"]), 15, "Adler läuft")
            warte(lambda: status("Bussard") == "Start wartet auf Laptop", 5, f"Bussard: „Start wartet auf Laptop“ (ist „{status('Bussard')}“)")
            warte(lambda: hinweis(sl, "Team Bussard antwortet nicht – Laptop nicht verbunden"), 14, "Hinweis „antwortet nicht“ nach 10 s")
            assert 8 <= time.time() - t0 <= 13, f"Hinweis nach {time.time() - t0:.1f} s (soll 10 s)"
            layout(sl, "SL-Übersicht „wartet auf Laptop“")
            bild(sl, "sl-start-wartet")
            # „❚❚ Anhalten – alle“ gilt auch für Bussard (Start steht noch aus), danach wieder Start
            assert sl.get_by_role("button", name="▶ Start für alle").is_disabled(), "Start für alle noch frei, obwohl alle laufen/gestartet sind"
            # spät verbundener Laptop: der Start kommt an, die Uhr läuft
            c = ueber_knopf("c", "Bussard")
            warte(lambda: rechnet(c) and uhr_laeuft(c), 15, "Start erreicht den spät verbundenen Laptop")
            assert lauf(c) == merke["lauf_c"]
            warte(lambda: status("Bussard").startswith("läuft"), 15, f"SL: Bussard läuft (ist „{status('Bussard')}“)")
            f["c"] = c

        def k3_gesendet_hoechstens_10s():
            """Teamansicht der Spielleitung: Der Knopf zeigt „gesendet …“ – ohne Laptop höchstens 10 s."""
            f["c"].close()
            warte(lambda: zeile("Bussard").locator("[data-laptop-weg]").count() == 1, WEG, "Bussard wieder ohne Laptop")
            zeile("Bussard").get_by_role("button", name="ansehen ›").click()
            knopf = sl.get_by_role("button", name=re.compile("Anhalten|Start|gesendet")).first
            warte(lambda: sl.get_by_role("button", name="❚❚ Anhalten").count() == 1, 10, "Steuerung Bussard")
            sl.get_by_role("button", name="❚❚ Anhalten").click()
            t0 = time.time()
            warte(lambda: sl.get_by_role("button", name="gesendet …").count() == 1, 3, "„gesendet …“ erscheint")
            warte(lambda: sl.get_by_role("button", name="gesendet …").count() == 0, 13, "„gesendet …“ verschwindet")
            dauer = time.time() - t0
            assert dauer <= 11.5, f"„gesendet …“ stand {dauer:.1f} s"
            warte(lambda: hinweis(sl, "Team Bussard antwortet nicht"), 3, "Hinweis statt „gesendet …“")
            del knopf
            sl.get_by_role("button", name="◂ Übersicht").click()
            warte(lambda: sl.get_by_test_id("team-tabelle").count() == 1, 10, "zurück zur Übersicht")
            warte(lambda: status("Bussard") == "Anhalten wartet auf Laptop", 5, f"Bussard: „Anhalten wartet auf Laptop“ (ist „{status('Bussard')}“)")
            # Laptop kommt wieder: das Anhalten wird ausgeführt
            c = ueber_knopf("c", "Bussard")
            warte(lambda: rechnet(c) and not uhr_laeuft(c), 15, "Anhalten kommt beim Wiederverbinden an")
            warte(lambda: status("Bussard") == "angehalten", 15, f"SL: Bussard angehalten (ist „{status('Bussard')}“)")
            f["c"] = c

        def k3_neues_spiel():
            """Neues Spiel nach Neuöffnen: alle bekommen einen neuen Lauf; ohne Laptop mit Hinweis, das Spiel startet beim Beitritt."""
            alt_a, alt_c = lauf(f["a"]), lauf(f["c"])
            f["c"].close()
            warte(lambda: zeile("Bussard").locator("[data-laptop-weg]").count() == 1, WEG, "Bussard ohne Laptop")
            assert sl.get_by_role("button", name="Neues Spiel – alle").count() == 1
            bestaetige(sl.get_by_test_id("neues-spiel-alle"), "neues Spiel für alle")
            warte(lambda: lauf(f["a"]) not in ("", alt_a) and rechnet(f["a"]), 15, "Adler: neuer Lauf, rechnet")
            warte(lambda: hinweis(sl, "Team Bussard: kein Laptop verbunden – das Spiel startet, sobald einer beitritt"), 5, "Hinweis „kein Laptop verbunden“")
            if f["a"].get_by_role("button", name="Übersicht überspringen").count() == 1:
                einweisung_weg(f["a"])
            sl.get_by_role("button", name="▶ Start für alle").click()
            warte(lambda: uhr_laeuft(f["a"]), 15, "Adler läuft im neuen Spiel")
            c = ueber_knopf("c", "Bussard")
            warte(lambda: rechnet(c) and lauf(c) not in ("", alt_c), 15, "Bussard: neues Spiel beim Wiederkommen")
            if c.get_by_role("button", name="Übersicht überspringen").count() == 1:
                einweisung_weg(c)
            warte(lambda: uhr_laeuft(c), 15, "Start (stand im Kanal) erreicht Bussard im neuen Spiel")
            f["c"] = c

        # ================================================================ K4
        def k4_team_verlassen():
            c = f["c"]
            knopf = c.get_by_test_id("team-verlassen")
            assert knopf.count() == 1, "„Team verlassen“ fehlt in der Ansicht"
            layout(c, "Zielbearbeitung mit „Team verlassen“")
            bestaetige(knopf, "Spiel hält hier an")
            warte(lambda: c.get_by_text(OHNE_TEAM).count() == 1, 15, "zurück in der Lobby")
            warte(lambda: zeile("Bussard").locator(".spieler-chip.frei").count() == 1, 15, "SL: Bussard ohne Laptop („frei“)")
            # ein anderes Gerät tritt bei und führt weiter
            b = ueber_code("b")
            warte(lambda: karte(b, "Bussard").get_by_role("button", name="beitreten").count() == 1, 15, "Bussard: beitreten")
            karte(b, "Bussard").get_by_role("button", name="beitreten").click()
            warte(lambda: rechnet(b), 15, "anderes Gerät führt Bussard weiter")
            if b.get_by_role("button", name="Übersicht überspringen").count() == 1:
                einweisung_weg(b)
            assert host_zahl(c, b) == 1
            f["b"] = b

        def k4_sitzung_beenden():
            alt = code()
            knopf = sl.get_by_test_id("sitzung-beenden")
            assert knopf.count() == 1, "„Sitzung beenden“ fehlt"
            bestaetige(knopf, "Wirklich beenden")
            for name in ("a", "b", "c"):
                pg = f[name]
                warte(lambda: pg.get_by_test_id("sitzung-beendet").count() == 1, 15, f"Fenster {name}: „Sitzung beendet – danke“")
                assert "Sitzung beendet – danke" in pg.get_by_test_id("sitzung-beendet").inner_text()
            assert host_zahl(f["a"], f["b"], f["c"]) == 0, "nach dem Ende rechnet noch ein Fenster"
            warte(lambda: sl.get_by_test_id("ende-banner").count() == 1, 10, "SL: Sitzung beendet")
            assert sl.get_by_test_id("sitzung-beenden").count() == 0
            assert sl.get_by_role("button", name="▶ Start für alle").is_disabled()
            assert sl.get_by_role("button", name="Auswertung ›").count() >= 1, "Auswertung nach dem Ende nicht erreichbar"
            layout(sl, "SL-Übersicht beendet")
            bild(sl, "sl-beendet")
            warte(lambda: plenum.get_by_role("button", name="Ich spiele mit").count() == 1, 15, "Plenum auf der Startseite")
            # Reste? Startseite der Teilnehmer: kein „Zurück zu Team …“, alter Code abgewiesen
            pg = startseite("a")
            time.sleep(2.5)
            assert pg.get_by_test_id("zurueck-zum-team").count() == 0, "„Zurück zu Team“ nach dem Ende noch da"
            pg.get_by_label("Code der Sitzung").fill(alt)
            pg.get_by_role("button", name="Beitreten").click()
            warte(lambda: pg.get_by_test_id("code-fehler").count() == 1, 15, "alter Code wird abgewiesen")
            assert "ist beendet" in pg.get_by_test_id("code-fehler").inner_text()
            pg.close()
            # Startseite der Spielleitung: beendete Sitzung nicht mehr unter „Zuletzt genutzt“
            sl.get_by_test_id("neue-sitzung").click()
            warte(lambda: sl.get_by_role("button", name="Neue Sitzung anlegen").count() == 1, 15, "Startseite Spielleitung")
            time.sleep(1.5)
            assert sl.get_by_test_id("letzte-sitzung").count() == 0, "beendete Sitzung wird noch zum Fortsetzen angeboten"
            for name in ("a", "b", "c"):
                f[name].close()
            merke["alt"] = alt

        def k4_neue_sitzung():
            zustand["code"] = neue_sitzung(sl)
            assert code() != merke["alt"], "gleicher Code wie die beendete Sitzung"
            assert sl.locator("tr[data-team-zeile]").count() == 0, "Teams aus der alten Sitzung"
            pg = ueber_code("a")
            anlegen(pg, "Lt Anders", "Adler")
            assert ich(pg) != "", "keine Kennung"
            sl.get_by_role("button", name=re.compile("Spiel öffnen – alle Teams")).click()
            einweisung_weg(pg)
            assert seq(pg) <= 3, f"Protokoll nicht leer in der neuen Sitzung (seq {seq(pg)})"
            sl.get_by_role("button", name="▶ Start für alle").click()
            warte(lambda: uhr_laeuft(pg) and "läuft" in status("Adler"), 15, "neue Sitzung läuft")
            # Startseite der Spielleitung zeigt die neue Sitzung mit Datum und Zahl der Teams (K4.3)
            s2 = haupt.new_page()
            s2.goto(start_url() + "#spielleitung")
            warte(lambda: s2.get_by_test_id("letzte-sitzung").count() == 1, 15, "Zuletzt genutzte Sitzung")
            warte(lambda: "1 Team" in s2.get_by_test_id("letzte-info").inner_text(), 10, "Zahl der Teams")
            assert code() in s2.get_by_test_id("letzte-sitzung").inner_text()
            assert re.search(r"angelegt \d\d\.\d\d\.", s2.get_by_test_id("letzte-info").inner_text()), "Datum fehlt"
            layout(s2, "Startseite Spielleitung")
            bild(s2, "start-letzte-sitzung")
            s2.close()
            f["a"] = pg

        def k2_trennung():
            """Test mit Trennung (K2.2): Der Laptop verliert das Netz und spielt weiter (H1.3); ein anderes Gerät übernimmt; sobald der
            alte wieder Netz hat, stoppt er – nie zwei verbundene rechnende Fenster."""
            t = ueber_code("t", verzug=50)
            anlegen(t, "Lt Tross", "Taube")
            sl.get_by_role("button", name=re.compile("Spiel öffnen – 1 Team")).click()
            einweisung_weg(t)
            zeile("Taube").get_by_title("Uhr von Taube starten").click()
            warte(lambda: uhr_laeuft(t), 15, "Taube läuft")
            t.evaluate("() => window.argusVerzug.trennenSimuliert(true)")
            warte(lambda: zeile("Taube").locator("[data-laptop-weg]").count() == 1, WEG, "SL: Taube nicht verbunden")
            assert rechnet(t) and host_zahl(t) == 1, "getrennter Laptop spielt nicht weiter"
            assert t.get_by_test_id("verbindung").inner_text().strip() == "offline – Spiel läuft"
            u = ueber_code("u")
            knopf = karte(u, "Taube").get_by_role("button", name="Spiel hier weiterführen")
            warte(lambda: knopf.count() == 1, 40, "„Spiel hier weiterführen“ für Taube")
            bestaetige(karte(u, "Taube").locator("button[data-testid^=weiterfuehren]"), "Nur wenn der andere Laptop aus ist")
            warte(lambda: rechnet(u), 15, "anderes Gerät rechnet Taube")
            if u.get_by_role("button", name="Übersicht überspringen").count() == 1:
                einweisung_weg(u)
            # Netz kommt zurück: der alte Laptop stoppt und zeigt den Hinweis
            t.evaluate("() => window.argusVerzug.trennenSimuliert(false)")
            warte(lambda: sieht_zu(t) and t.get_by_test_id("zuschau-banner").get_attribute("data-art") == "abgeloest", 15, "alter Laptop stoppt beim Wiederverbinden")
            for _ in range(10):
                assert host_zahl(t, u) == 1, "zwei rechnende Fenster nach dem Wiederverbinden"
                time.sleep(0.3)
            # der neue Laptop lädt weiter hoch; die Spielleitung folgt ihm
            warte(lambda: zeile("Taube").get_attribute("data-netz-seq") == str(seq(u)) and "läuft" in status("Taube"), 20, "SL folgt dem neuen Laptop")
            assert u.get_by_test_id("verbindung").inner_text().strip().startswith("verbunden")
            t.close()
            u.close()

        def k1_ohne_lobby():
            """Test ohne Lobby (…?rolle=zb&raum=…): Wer den Tab schließt und neu öffnet, ist wieder der Team-Laptop; ein zweites Fenster
            sieht wie bisher als eigenes Fenster des Teams zu."""
            raum = f"k-{int(time.time()) % 100000}"
            adresse = start_url("d") + "&" + urllib.parse.urlencode({"rolle": "zb", "raum": raum})
            ctx = kontext("d")
            pg = ctx.new_page()
            pg.goto(adresse)
            einweisung_weg(pg)
            warte(lambda: rechnet(pg), 15, "Team-Laptop rechnet (ohne Lobby)")
            pg.get_by_test_id("test-start").click()
            warte(lambda: uhr_laeuft(pg), 10, "Uhr läuft")
            time.sleep(1)
            vorher = seq(pg)
            pg.close()
            pg = ctx.new_page()
            pg.goto(adresse)
            warte(lambda: rechnet(pg) and seq(pg) >= vorher and uhr_laeuft(pg), 15, "nach Neuöffnen wieder der Team-Laptop (nicht „nur zuschauen“)")
            assert pg.get_by_test_id("zuschau-banner").count() == 0
            zu = ctx.new_page()
            zu.goto(adresse)
            warte(lambda: sieht_zu(zu) and zu.get_by_test_id("zuschau-banner").get_attribute("data-art") == "zuschauen", 15, "zweites Fenster sieht zu")
            assert rechnet(pg) and host_zahl(pg, zu) == 1
            pg.close()
            zu.close()

        print(f"Probe Liste K – Sync {a.sync}{' (' + a.db + ')' if a.db else ''}, Fenster {W} × {H}, Sitzung {code()}", flush=True)
        aufgabe("K1 Befund 11.11.: Tab schließen, Startseite + Code – sofort wieder der Laptop des Teams", k1_befund)
        aufgabe("K1 im laufenden Spiel: „Zurück zu Team Adler (Code …)“ – rechnet weiter, ohne Zutun der SL", k1_im_lauf)
        aufgabe("K1 Lesezeichen (Adresse mit ich=…)", k1_lesezeichen)
        if firebase:
            aufgabe("K1 Browser neu gestartet: neuer Browserkontext mit gleichem Speicher", k1_neuer_kontext)
        aufgabe("K1.3 zwei Tabs im selben Browser: der zweite sieht zu, „hierher holen“", k1_zwei_tabs)
        aufgabe("K2.1 anderes Gerät übernimmt das verwaiste Team („Spiel hier weiterführen“ nach 20 s)", k2_uebernehmen)
        aufgabe("K2.2 alter Laptop kommt zurück: „wird an einem anderen Laptop weitergeführt“, nie zwei Hosts", k2_alter_kommt_zurueck)
        aufgabe("K2.3 Spielleitung: „nicht verbunden seit …“, „Laptop freigeben“ – das nächste Fenster rechnet", k2_freigeben)
        aufgabe("K3.2 „▶ Start für alle“ mit einem fehlenden Team: „Start wartet auf Laptop“, Start kommt beim Wiederverbinden an", k3_start_mit_fehlendem_team)
        aufgabe("K3.1 kein Knopf länger als 10 s auf „gesendet …“", k3_gesendet_hoechstens_10s)
        aufgabe("K3.3 neues Spiel nach Neuöffnen, ohne Laptop mit Hinweis", k3_neues_spiel)
        aufgabe("K4.2 „Team verlassen“ im Lauf, anderes Gerät führt weiter", k4_team_verlassen)
        aufgabe("K4.1 „Sitzung beenden“: Team-Fenster, Plenum, Startseiten ohne Reste", k4_sitzung_beenden)
        aufgabe("K4 neue Sitzung anlegen und spielen (K4.3 Datum und Zahl der Teams)", k4_neue_sitzung)
        aufgabe("K1 Test ohne Lobby: Tab schließen und neu öffnen; zweites Fenster sieht zu", k1_ohne_lobby)
        aufgabe("K2.2 Test mit Trennung: Laptop spielt ohne Netz weiter, anderes Gerät übernimmt, beim Wiederverbinden stoppt der alte", k2_trennung)
        browser.close()

    print()
    ok = sum(1 for _, gut, _, _ in ergebnis if gut)
    for name, gut, dauer, text in ergebnis:
        print(f"{'bestanden' if gut else 'NICHT   '}  {dauer:5.1f} s  {name}{'  – ' + text if text else ''}")
    stoerend = [k for k in konsole if "favicon" not in k and "ERR_CONNECTION" not in k]
    print(f"\n{ok}/{len(ergebnis)} Aufgaben gelöst · Konsolenfehler: {len(stoerend)}")
    for k in stoerend[:10]:
        print("  ", k[:200])
    sys.exit(0 if ok == len(ergebnis) and not stoerend else 1)


if __name__ == "__main__":
    main()
