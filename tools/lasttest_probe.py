#!/usr/bin/env python3
"""Probe der Lasttest-Seite (public/lasttest.html, Quelle tools/lasttest/): startet sie in einem Browserfenster,
wartet bis zum Spielende und prüft das Ergebnis.

Die Seite selbst spielt eine Sitzung mit n Teams à 3 Bot-Spielern (je eigene Firebase-Verbindung) und einem Host
durch und misst den Weg Klick → Protokoll. Gegen die echte Datenbank startet man sie von Hand im Browser
(…/Argus/lasttest.html); hier läuft sie gegen die Firebase-Nachbildung (nur WebSocket, Regeln aktiv).

Geprüft wird: Spielende in allen Teams, je Team gleicher Stand in den drei Bot-Fenstern wie beim Host, Ausgang wie
ohne Netz, keine Aktion abgelehnt oder offen, jede geplante Aktion gesendet, Ergebnis passt in 1530 × 800,
keine Konsolenfehler.

Aufruf:
  npx vite build --config tools/lasttest/vite.config.ts        # baut public/lasttest.html
  node tools/firebase-testserver/start.js &                     # Nachbildung auf Port 5555
  python3 -m http.server 4180 --directory public &              # oder: npm run build && npx vite preview
  python3 tools/lasttest_probe.py http://localhost:4180/ --tempo 20 --bild lasttest.png
  python3 tools/lasttest_probe.py http://localhost:4180/ --tempo 20 --verteilt 2   # Host + Teams 1–2 auf Gerät A, Rest auf B
"""
import argparse
import json
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

W, H = 1530, 800


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("basis", help="Adresse, unter der lasttest.html liegt (mit / am Ende)")
    ap.add_argument("--db", default="http://localhost:5555?ns=argus-test")
    ap.add_argument("--transport", default="auto", help="lp oder auto (= WebSocket; die Nachbildung kann nur WebSocket)")
    ap.add_argument("--tempo", type=int, default=20)
    ap.add_argument("--teams", type=int, default=5)
    ap.add_argument("--beobachter", action="store_true")
    ap.add_argument("--bild", default="lasttest.png")
    ap.add_argument("--json", default=None, help="Auswertung als JSON speichern")
    ap.add_argument("--bild-mitte", default=None, help="Bildschirmfoto bei halber Spielzeit")
    ap.add_argument("--verteilt", type=int, default=0,
                    help="zwei „Geräte“ (getrennte Browserkontexte): A legt an, führt den Host und die Bots der Teams 1…n, "
                         "B tritt mit dem Code bei und spielt die übrigen Teams")
    a = ap.parse_args()

    q = {"db": a.db, "transport": a.transport, "tempo": a.tempo, "teams": a.teams, "start": 1}
    if a.beobachter:
        q["beobachter"] = 1
    if a.verteilt:
        q.update({"aufteilung": "host", "hier": ",".join(str(i) for i in range(1, a.verteilt + 1))})
    basis = f"{a.basis.rstrip('/')}/lasttest.html"
    fehler, konsole = [], []
    t0 = time.time()
    ZUSTAND = ("() => window.argusLasttest && { phase: window.argusLasttest.lauf.phase, status: window.argusLasttest.lauf.status,"
               " code: window.argusLasttest.lauf.code, t: window.argusLasttest.auswertung.spielzeit, n: window.argusLasttest.auswertung.gesamt.n }")
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-background-timer-throttling", "--disable-renderer-backgrounding",
                                          "--disable-backgrounding-occluded-windows"])

        def geraet(name, url):
            ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
            s = ctx.new_page()
            s.on("console", lambda m: konsole.append(f"{name}: {m.type}: {m.text}") if m.type in ("error", "warning") else None)
            s.on("pageerror", lambda e: konsole.append(f"{name}: pageerror: {e}"))
            s.goto(url)
            return s

        seiten = [("A", geraet("A", f"{basis}?{urllib.parse.urlencode(q)}"))]
        if a.verteilt:
            ende = time.time() + 120
            code = None
            while time.time() < ende and not code:
                st = seiten[0][1].evaluate(ZUSTAND)
                code = st and st["code"]
                time.sleep(0.3)
            if not code:
                raise SystemExit("Gerät A hat keine Sitzung angelegt")
            hier_b = ",".join(str(i) for i in range(a.verteilt + 1, a.teams + 1))
            qb = {"db": a.db, "transport": a.transport, "teams": a.teams, "code": code, "hier": hier_b, "start": 1}
            print(f"  Gerät B tritt {code.upper()} bei (Teams {hier_b})")
            seiten.append(("B", geraet("B", f"{basis}?{urllib.parse.urlencode(qb)}")))
        grenze = time.time() + 1500 / a.tempo + 600
        naechste = 0
        mitte = bool(a.bild_mitte)
        while True:
            st = {n: s.evaluate(ZUSTAND) for n, s in seiten}
            if all(x and x["phase"] in ("ende", "fehler", "abgebrochen") for x in st.values()):
                break
            if any(x and x["phase"] in ("fehler", "abgebrochen") for x in st.values()):
                fehler.append("ein Gerät mit Fehler: " + "; ".join(f"{n}: {x['status']}" for n, x in st.items() if x))
                break
            if mitte and st["A"] and st["A"]["t"] >= 750:
                seiten[0][1].screenshot(path=a.bild_mitte)
                mitte = False
            if time.time() > naechste:
                for n, x in st.items():
                    if x:
                        print(f"  {time.time() - t0:5.0f} s  {n} {x['phase']:<11} {x['status'][:64]:<64} Spielzeit {x['t']:6.0f} s, {x['n']} Messwerte")
                naechste = time.time() + 10
            if time.time() > grenze:
                fehler.append("Zeitüberschreitung")
                break
            time.sleep(0.5)
        time.sleep(1.5)
        auswertungen = []
        for n, s in seiten:
            aus = s.evaluate("() => window.argusLasttest.auswertung")
            lay = s.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]")
            bild = a.bild if n == "A" else a.bild.replace(".png", f"_{n}.png")
            s.screenshot(path=bild)
            auswertungen.append((n, aus, lay, bild))
        browser.close()

    for n, aus, lay, bild in auswertungen:
        print(f"===== Gerät {n}")
        fehler += pruefe(aus, lay, bild, n)
    relevante = [k for k in konsole if "FIREBASE WARNING" not in k and "favicon" not in k]
    if relevante:
        print("Konsole:", *relevante[:10], sep="\n  ")
        if any("pageerror" in k or ": error:" in k for k in relevante):
            fehler.append("Fehler in der Browserkonsole")
    print(f"Laufzeit {time.time() - t0:.0f} s")
    if a.json:
        with open(a.json, "w", encoding="utf-8") as f:
            json.dump([x[1] for x in auswertungen], f, ensure_ascii=False, indent=1)
    if fehler:
        print("FEHLER:", *fehler[:40], sep="\n  ")
        sys.exit(1)
    print("OK – Lasttest-Seite bis zum Spielende, alle Fenster gleich, Ausgang wie ohne Netz")


def pruefe(aus, lay, bild, geraet):
    fehler = []
    ms = lambda x: "–" if x is None else f"{x:.0f} ms"  # noqa: E731
    g = aus["gesamt"]
    print(f"Sitzung {aus['code']} · {aus['verbindungen']} Verbindungen · Tempo ×{aus['tempo']} · Laufzeit {aus['laufzeitS']} s")
    print(f"Klick → Protokoll gesamt: Median {ms(g['median'])}, 95 % {ms(g['p95'])}, max {ms(g['max'])} (n = {g['n']}) → {aus['ampel']}")
    for t in aus["teamsAus"]:
        k = t["klick"]
        ab = t["abschluss"] or {}
        fenster = " | ".join(f"{ms(f['median'])}/{ms(f['max'])}" for f in t["fenster"])
        print(f"  {t['name']:<22} {t['imProtokoll']:>3}/{t['geplant']:<3} Median {ms(k['median']):>7}  max {ms(k['max']):>7}  [{fenster}]  "
              f"{'' if t['lokal'] else '(anderes Gerät) '}Ende {ab.get('ende')}  Fenster gleich {ab.get('fensterGleich')}  Ausgang {ab.get('ausgangGleich')}")
        if not ab.get("ende"):
            fehler.append(f"{t['name']}: kein Spielende")
        if t["lokal"] and not ab.get("fensterGleich"):
            fehler.append(f"{t['name']}: Bot-Fenster mit anderem Stand als der Host")
        if not ab.get("ausgangGleich"):
            fehler.append(f"{t['name']}: Ausgang anders als ohne Netz")
        if ab.get("abgelehnt"):
            fehler.append(f"{t['name']}: abgelehnt {ab['abgelehnt'][:3]}")
        fehler += [f"{t['name']}: {f}" for f in t["botFehler"]]
    for s_ in aus["teilstrecken"]:
        print(f"  {s_['name']:<34} Median {ms(s_['k']['median']):>7}  max {ms(s_['k']['max']):>7}  n = {s_['k']['n']}")
    d = aus["diagnose"]
    print(f"Diagnose: Ereignisschleife max {d['schleifeMax']} ms, verdeckt {d['verdecktS']} s, Abbrüche {d['abbrueche']}, "
          f"Protokolle {d['protokolle']}, nicht gesendet {d['nichtGesendet']}, offen {d['offen']}, abgelehnt {d['abgelehnt']}")
    if aus["phase"] != "ende":
        fehler.append(f"Phase {aus['phase']}: {d['fehler'][-3:]}")
    if d["nichtGesendet"]:
        fehler.append(f"{d['nichtGesendet']} geplante Aktionen nicht gesendet")
    if d["offen"]:
        fehler.append(f"{d['offen']} Aktionen ohne Ereignis im eigenen Fenster")
    if d["abgelehnt"]:
        fehler.append(f"{d['abgelehnt']} Aktionen abgelehnt")
    fehler += [f"Hinweis: {h}" for h in d["hinweise"] if "nicht" in h.lower() or "fehl" in h.lower()]
    if lay[0] > W or lay[1] > H:
        fehler.append(f"Ergebnis {lay[0]}×{lay[1]} größer als {W}×{H}")
    print(f"Bild: {bild}")
    return [f"Gerät {geraet}: {f}" for f in fehler]


if __name__ == "__main__":
    main()
