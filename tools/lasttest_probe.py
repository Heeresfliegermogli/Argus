#!/usr/bin/env python3
"""Probe der Lasttest-Seite (public/lasttest.html, Quelle tools/lasttest/): startet sie in einem Browserfenster,
wartet bis zum Spielende und prüft das Ergebnis (seit 2.6, Nachweis H1.6).

Die Seite spielt eine Sitzung mit n Team-Laptops (je eigene Firebase-Verbindung, jeder rechnet sein Spiel selbst, ein Bot
entscheidet nach Plan), der Spielleitung und dem Plenum – wahlweise mit künstlichem Netzverzug und einer Trennung der
Team-Laptops. Gegen die echte Datenbank startet man sie von Hand im Browser (…/Argus/lasttest.html); hier läuft sie gegen
die Firebase-Nachbildung (nur WebSocket, Regeln aktiv).

Geprüft wird: Spielende in allen Teams; Spiel der Teams flüssig (Klick → eigener Stand ≤ 100 ms, auch mit Verzug und
Trennung); Spielleitung und Plenum haben am Ende jedes Protokoll vollständig (gleicher Stand wie am Laptop); Auswertung
der Spielleitung mit allen Teams und Spielende; Ausgang je Fall wie ohne Netz (Warnung); keine Entscheidung abgelehnt;
Ergebnis passt in 1530 × 800; keine Konsolenfehler.

Aufruf:
  npx vite build --config tools/lasttest/vite.config.ts        # baut public/lasttest.html
  node tools/firebase-testserver/start.js &                     # Nachbildung auf Port 5555
  python3 -m http.server 4180 --directory public &              # oder: npm run build && npx vite preview
  python3 tools/lasttest_probe.py http://localhost:4180/ --tempo 10 --bild lasttest.png
  python3 tools/lasttest_probe.py http://localhost:4180/ --tempo 10 --verzug 5 --trennen 30,20 --bild lasttest_5s.png
  python3 tools/lasttest_probe.py http://localhost:4180/ --tempo 10 --verzug 15 --trennen 30,60 --bild lasttest_15s.png
  python3 tools/lasttest_probe.py http://localhost:4180/ --tempo 10 --verteilt 2   # SL + Teams 1–2 auf Gerät A, Rest auf B
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
    ap.add_argument("--tempo", type=float, default=10)
    ap.add_argument("--teams", type=int, default=7)
    ap.add_argument("--verzug", type=float, default=0, help="künstlicher Netzverzug je Richtung in s")
    ap.add_argument("--trennen", default="", help="Team-Laptops trennen: ab,dauer in s Echtzeit nach dem Start, z. B. 30,20")
    ap.add_argument("--ohne-plenum", action="store_true")
    ap.add_argument("--bild", default="lasttest.png")
    ap.add_argument("--json", default=None, help="Auswertung als JSON speichern")
    ap.add_argument("--verteilt", type=int, default=0,
                    help="zwei „Geräte“ (getrennte Browserkontexte): A legt an, führt Spielleitung, Plenum und die Team-Laptops 1…n, "
                         "B tritt mit dem Code bei und führt die übrigen Team-Laptops")
    a = ap.parse_args()

    q = {"db": a.db, "transport": a.transport, "tempo": a.tempo, "teams": a.teams, "start": 1}
    if a.verzug:
        q["verzug"] = a.verzug
    if a.trennen:
        q["trennen"] = a.trennen
    if a.ohne_plenum:
        q["plenum"] = 0
    if a.verteilt:
        q.update({"aufteilung": "sl", "hier": ",".join(str(i) for i in range(1, a.verteilt + 1))})
    basis = f"{a.basis.rstrip('/')}/lasttest.html"
    fehler, warnungen, konsole = [], [], []
    t0 = time.time()
    ZUSTAND = ("() => window.argusLasttest && { phase: window.argusLasttest.lauf.phase, status: window.argusLasttest.lauf.status,"
               " code: window.argusLasttest.lauf.code, t: window.argusLasttest.auswertung.spielzeit,"
               " r: window.argusLasttest.auswertung.rueckstandMax, k: window.argusLasttest.auswertung.klick.max }")
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
            if a.verzug:
                qb["verzug"] = a.verzug
            if a.trennen:
                qb["trennen"] = a.trennen
            print(f"  Gerät B tritt {code.upper()} bei (Teams {hier_b})")
            seiten.append(("B", geraet("B", f"{basis}?{urllib.parse.urlencode(qb)}")))
        grenze = time.time() + 1500 / a.tempo + 600 + 10 * a.verzug
        naechste = 0
        while True:
            st = {n: s.evaluate(ZUSTAND) for n, s in seiten}
            if all(x and x["phase"] in ("ende", "fehler", "abgebrochen") for x in st.values()):
                break
            if time.time() > naechste:
                for n, x in st.items():
                    if x:
                        k = "–" if x["k"] is None else f"{x['k']:.0f} ms"
                        r = "–" if x["r"] is None else f"{x['r']:.1f} s"
                        print(f"  {time.time() - t0:5.0f} s  {n} {x['phase']:<11} {x['status'][:60]:<60} Spielzeit {x['t']:6.0f} s · Klick max {k} · Rückstand max {r}")
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
        f, w = pruefe(aus, lay, bild, n)
        fehler += f
        warnungen += w
    relevante = [k for k in konsole if "FIREBASE WARNING" not in k and "favicon" not in k]
    if relevante:
        print("Konsole:", *relevante[:10], sep="\n  ")
        if any("pageerror" in k or ": error:" in k for k in relevante):
            fehler.append("Fehler in der Browserkonsole")
    print(f"Laufzeit {time.time() - t0:.0f} s")
    if a.json:
        with open(a.json, "w", encoding="utf-8") as f:
            json.dump([x[1] for x in auswertungen], f, ensure_ascii=False, indent=1)
    if warnungen:
        print("WARNUNG:", *warnungen[:20], sep="\n  ")
    if fehler:
        print("FEHLER:", *fehler[:40], sep="\n  ")
        sys.exit(1)
    print("OK – Lasttest bis zum Spielende: Teams flüssig, Spielleitung und Plenum vollständig, Auswertung vollständig")


def pruefe(aus, lay, bild, geraet):
    fehler, warn = [], []
    ms = lambda x: "–" if x is None else f"{x:.0f} ms"  # noqa: E731
    s_ = lambda x: "–" if x is None else f"{x:.1f} s"  # noqa: E731
    print(f"Sitzung {aus['code']} · {aus['verbindungen']} Verbindungen · Tempo ×{aus['tempo']} · Verzug {aus['verzugS']} s · "
          f"Trennung {aus['trennung']} · Laufzeit {aus['laufzeitS']} s")
    k = aus["klick"]
    print(f"Klick → eigener Stand: Median {ms(k['median'])}, max {ms(k['max'])} (n = {k['n']}) → {aus['ampel']['spiel']}")
    print(f"Spielleitung: Rückstand max {s_(aus['rueckstandMax'])}, Status max {s_(aus['statusMax'])} alt, Upload Median "
          f"{ms(aus['upload']['median'])} max {ms(aus['upload']['max'])}, aufgeholt nach {s_(aus['aufholenS'])} → {aus['ampel']['sl']}")
    print(f"Auswertung: {aus['auswertungTeams']} → {aus['ampel']['auswertung']} · Startspanne {s_(aus['startSpanne'])}")
    for t in aus["teamsAus"]:
        ab = t["abschluss"] or {}
        print(f"  {t['name']:<22} {t['gesendet']:>3}/{t['geplant']:<3} Klick {ms(t['klick']['max']):>7}  Start {ms(t['startMs']):>8}  "
              f"Upload {ms(t['upload']['median'])}/{ms(t['upload']['max'])}  Status {s_(t['statusMax'])}  Rückstand {s_(t['rueckstandMax'])}  "
              f"Ende {ab.get('ende')} SL {ab.get('slGleich')} Plenum {ab.get('plenumGleich')} Fälle {ab.get('faelleGleich')} {ab.get('faelleAnders') or ''}")
        if not ab.get("ende"):
            fehler.append(f"{t['name']}: kein Spielende")
        if ab.get("slGleich") is False:
            fehler.append(f"{t['name']}: Spielleitung nicht vollständig")
        if ab.get("plenumGleich") is False:
            fehler.append(f"{t['name']}: Plenum nicht vollständig")
        if ab.get("faelleGleich") is False:
            warn.append(f"{t['name']}: Fälle anders als ohne Netz {ab.get('faelleAnders')}")
        if t["lokal"] and ab.get("ausgangGleich") is False:
            warn.append(f"{t['name']}: Bestand/Zerstörte anders als ohne Netz")
        if ab.get("abgelehnt"):
            fehler.append(f"{t['name']}: abgelehnt {ab['abgelehnt'][:3]}")
        warn += [f"{t['name']}: {f}" for f in t["botFehler"]]
        if t["lokal"] and (t["klick"]["max"] or 0) > 100:
            fehler.append(f"{t['name']}: Klick → eigener Stand {ms(t['klick']['max'])} (> 100 ms)")
    d = aus["diagnose"]
    print(f"Diagnose: Ereignisschleife max {d['schleifeMax']} ms, verdeckt {d['verdecktS']} s, Abbrüche {d['abbrueche']}, "
          f"nicht gesendet {d['nichtGesendet']}, abgelehnt {d['abgelehnt']}")
    if aus["phase"] != "ende":
        fehler.append(f"Phase {aus['phase']}: {d['fehler'][-3:]}")
    if aus["ampel"]["spiel"] == "rot":
        fehler.append("Spiel der Teams nicht flüssig")
    if aus["mitSl"] and aus["ampel"]["auswertung"] == "rot":
        fehler.append("Auswertung unvollständig")
    if aus["ampel"]["sl"] == "rot":
        fehler.append("Spielleitung hat nicht aufgeholt")
    if aus["startSpanne"] is not None and aus["startSpanne"] > 2:
        fehler.append(f"Spielzeiten nach dem Start {aus['startSpanne']:.2f} s auseinander (> 2 s)")
    if d["nichtGesendet"]:
        warn.append(f"{d['nichtGesendet']} geplante Klicks nicht gesendet")
    if lay[0] > W or lay[1] > H:
        fehler.append(f"Ergebnis {lay[0]}×{lay[1]} größer als {W}×{H}")
    print(f"Bild: {bild}")
    return [f"Gerät {geraet}: {f}" for f in fehler], [f"Gerät {geraet}: {w}" for w in warn]


if __name__ == "__main__":
    main()
