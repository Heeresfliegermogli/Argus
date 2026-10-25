#!/usr/bin/env python3
"""Ende-zu-Ende-Test Schritt 7: das ganze Drehbuch mit 5 Teams à 3, zwei Spielleitern und Plenum (18 Fenster).

Die fünf Teams spielen die fünf Läufe von tools/referenz/simuliere_durchlauf.py (Referenz
tests/referenz_durchlauf.json): naiv, ideal, naiv + V-1…V-4, ideal + V-1…V-4, naiv + V-1…V-5.
tools/drehbuch_plan.ts spielt sie vorher im Prozess mit der echten Engine durch (dieselben Läufe prüft
tests/durchlauf.test.ts gegen die Python-Simulation) und liefert je Team die Aktionen der Modellpersonen
und das Protokoll, das dabei entsteht.

Hier laufen dieselben Aktionen durch die echten Browserfenster:
  1. Sitzung, Lobby und Teams nur über die Oberfläche (wie tools/e2e_teams.py), Plenum am „Smartboard“, eine
     zweite Spielleitung beobachtet die Kontrollkarte (Fotos); das Host-Fenster bleibt in der Übersicht.
  2. Spielleitung: „Spiel öffnen – alle Teams“, Tempo, „▶ Uhr starten – alle“.
  3. In jedem Teilnehmerfenster schickt eine Modellperson die Aktionen ihrer Rolle über die Sicht des Fensters
     (window.argus.senden) zur geplanten Spielzeit – also über denselben Weg wie ein Klick: Sync-Adapter →
     Host im SL-Fenster → Protokoll. Sie wartet, bis die Meldung bei ihr ist und ihre vorige Aktion bestätigt.
     Die Spielleitung spielt die Verstärkungen über die Sitzung ein (an einzelne Teams).
  4. Bis zum Spielende; unterwegs Bildschirmfotos (Feindartillerie, Nebel, LM im Flug, Achse NORD, E-01) und
     Messung der Bildrate der Karten (Kontrollkarte SL 2, G2, G3, Plenum). SL 2 notiert über „✎ Notiz“ eine
     Beobachtung zu S3 (der Fall ist vorgewählt).
  5. Auswertung (Schritt 8): Das Plenum schaltet nach Spielende in allen Teams selbst auf die Auswertung; sie wird wie
     am Smartboard Kapitel für Kapitel durchgegangen (tools/auswertung_probe.py): Ausgang je Team und Fall und
     Kennzahlen wie die Auswertung der Protokolle im Prozess, Replay je Schlüsselfall, Notiz der SL 2 bei S3, Export
     ohne Namen, alles in 1530 × 800. Die Spielleitung öffnet dieselbe Auswertung über „Auswertung ›“.
Geprüft wird:
  • alle fünf Teams erreichen das Spielende, keine Aktion abgelehnt, je Team gleicher Stand (seq, Fingerabdruck)
    in den vier Fenstern des Teams;
  • das Protokoll jedes Teams stimmt mit dem der Engine im Prozess überein: dieselben Meldungen, Entscheidungen,
    Einschläge (Zeit, Ort, bekämpftes Fahrzeug, Treffer, Verstöße), Meldungen entfallen, Injects, Hintergrund-
    gefecht, E-01, Verstärkungen, Spielende – Zeiten bis auf die Verzögerung der Klicks im Browser;
  • Endbestand und zerstörte Fahrzeuge wie im Prozess (und damit wie die Simulation);
  • alle 18 Fenster passen in 1530 × 800, keine Konsolenfehler.

Aufruf (nach `npm run build` und `npx vite preview --port 4173`):
  python3 tools/e2e_drehbuch.py http://localhost:4173/ --tempo 5 --bilder e2e-drehbuch
  python3 tools/e2e_drehbuch.py file://$PWD/dist/argus-offline.html --tempo 5        # Offline-Datei
  node tools/firebase-testserver/start.js &                                            # Firebase-Nachbildung
  python3 tools/e2e_drehbuch.py http://localhost:4173/ --tempo 5 --sync firebase --transport auto \
      --db "http://localhost:5555?ns=argus-test"
Ohne Grafikkarte laufen die Karten hier im Rückfall Canvas (--renderer canvas, Standard) mit höchstens 2 Bildern/s
(--fps): Mit Software-WebGL warten 18 Fenster an einem Rechner auf einen überlasteten GPU-Prozess, die Kartenfenster
stehen dann sekundenlang, und die Modellpersonen G2/G3 klicken zu spät. WebGL und Bildrate prüft
tools/livelage_probe.py.
"""
import argparse
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.parse

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from auswertung_probe import bericht as auswertung_bericht, pruefe_auswertung  # noqa: E402

W, H = 1530, 800
TEAMNAMEN = ["Falke Nord", "Löwe 2", "Team Ömer & Co", "Wega", "Kassiopeia-Süd-Ost 24 Zch"]
ROLLEN = ["g1", "g2", "g3"]
HIER = os.path.dirname(os.path.abspath(__file__))
VORLAUF_FT = 2.0

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
  for (const el of document.querySelectorAll('.stapel, .inhalt, main, .kopf, .kopf-links, .kopf-rechts')) {
    if (el.scrollHeight > el.clientHeight + 2) zuGross.push(`${el.className}: Höhe ${el.scrollHeight} > ${el.clientHeight}`);
    if (el.scrollWidth > el.clientWidth + 2) zuGross.push(`${el.className}: Breite ${el.scrollWidth} > ${el.clientWidth}`);
  }
  return { seite: [de.scrollWidth, de.scrollHeight], zuGross };
}
"""

# Modellperson im Teilnehmerfenster: schickt die Aktionen ihrer Rolle zur geplanten Spielzeit über die Sicht.
MODELL_JS = """
(plan) => {
  const log = [];
  window.__modell = { log, rest: plan.length, fehler: [] };
  let i = 0;
  const soll = { g1_entscheid: 'g1', g2_empfehlung: 'g2', g3_entscheid: 'g3' };
  const tick = () => {
    const s = window.argus;
    if (!s || !s.spiel || i >= plan.length) return;
    const t = s.spielzeit();
    if (t < plan[i].t) return;                            // billig: erst zur geplanten Zeit den Stand ansehen
    const st = s.stand;
    if (!st.lauf || st.zustand.ende) { window.__modell.rest = plan.length - i; return; }
    if (Object.keys(st.offen).length) return;            // vorige Aktion noch nicht bestätigt
    while (i < plan.length && t >= plan[i].t) {
      const a = plan[i];
      const m = a.daten.meldung;
      if (a.typ === 'inject_quittiert' && !st.zustand.injects[a.daten.inject]) break;   // Lagemeldung noch nicht da
      if (soll[a.typ]) {
        const ms = st.zustand.meldungen[m];
        if (!ms || ms.stufe !== soll[a.typ]) {
          if (ms && (ms.stufe === 'entfallen' || ms.stufe === 'erledigt') && t > a.t + 30) {
            window.__modell.fehler.push(`${a.typ} ${m}: Meldung ist ${ms.stufe}`); i++; continue;
          }
          break;                                          // Meldung noch nicht bei dieser Rolle
        }
      }
      const id = s.senden(a.typ, a.daten);
      log.push({ plan: a.t, ist: Math.round(t * 1000) / 1000, typ: a.typ, m: m ?? null, id });
      i++;
      window.__modell.rest = plan.length - i;
      return;                                             // erst Bestätigung abwarten
    }
  };
  window.__modell.timer = setInterval(tick, 8);
}
"""

# Spielleitung: Verstärkungen je Team zur geplanten Spielzeit einspielen.
SL_JS = """
(plaene) => {
  const S = window.argusSitzung;
  const log = [];
  window.__slModell = { log };
  for (const p of plaene) p.i = 0;
  window.__slModell.timer = setInterval(() => {
    for (const p of plaene) {
      if (p.i >= p.aktionen.length) continue;
      const sp = S.spiel(p.team);
      if (!sp || !sp.stand.lauf) continue;
      const t = sp.spielzeit();
      while (p.i < p.aktionen.length && t >= p.aktionen[p.i].t) {
        const a = p.aktionen[p.i++];
        S.sendenAn([p.team], a.typ, a.daten);
        log.push({ team: p.team, plan: a.t, ist: Math.round(t * 1000) / 1000, typ: a.typ, gruppe: a.daten.gruppe });
      }
    }
  }, 8);
}
"""

DIAGNOSE_JS = """
() => [...document.querySelectorAll('[data-testid] > .karte-leinwand')].filter((e) => e.argusKarte).map((e) => ({ id: e.parentElement.dataset.testid, ...e.argusKarte.diagnose }))
"""


def warte(bedingung, sek=15, text="Bedingung"):
    ende = time.time() + sek
    letzter = None
    while time.time() < ende:
        try:
            if bedingung():
                return
        except Exception as e:  # noqa: BLE001 – Seite lädt noch
            letzter = e
        time.sleep(0.1)
    raise AssertionError(f"{text} nicht erfüllt nach {sek} s" + (f" ({letzter})" if letzter else ""))


def startseite(basis, a, **extra):
    q = {"sync": a.sync, **({"fps": a.fps} if a.fps else {}), **({"db": a.db} if a.db else {}),
         **({"transport": a.transport} if a.transport else {}), **extra}
    sep = "&" if "?" in basis else "?"
    return f"{basis}{sep}{urllib.parse.urlencode(q)}"


# ---------------------------------------------------------------- Vergleich der Protokolle

UHRZEIT = re.compile(r"\s*–?\s*beim Einschlag \d{2}:\d{2}:\d{2}")
ABSTAND = re.compile(r"Abstand \d+ m")


def warnung_ohne_zahlen(v):
    """Warnung ohne Uhrzeit und Abstand: beide hängen von der Klickzeit ab (Ziel fährt weiter)."""
    return ABSTAND.sub("Abstand … m", UHRZEIT.sub("", v))


def schluessel(protokoll):
    """Ereignisse je fachlichem Schlüssel (Uhr, Laufbeginn und Notizen zählen nicht)."""
    aus, zaehler = {}, {}
    for e in protokoll:
        typ, d = e["typ"], e["daten"]
        if typ in ("uhr", "spiel_neu", "notiz"):
            continue
        if typ in ("g1_entscheid", "g2_empfehlung", "g3_entscheid"):
            k0 = (typ, d["meldung"])
            zaehler[k0] = zaehler.get(k0, 0) + 1
            k = (*k0, zaehler[k0])
        elif typ in ("meldung", "wirkung"):
            k = (typ, d["meldung"])
        elif typ == "meldung_entfaellt":
            k = (typ, d["meldung"])
        elif typ in ("inject", "inject_quittiert"):
            k = (typ, d["inject"])
        elif typ == "lagehinweis":
            k = (typ, len([x for x in aus if x[0] == typ]))
        elif typ == "hintergrund":
            k = (typ, d["id"])
        elif typ == "ereignis":
            k = (typ, d["ereignis"], "entfaellt" if d.get("entfaellt") else d.get("nr"))
        elif typ == "verstaerkung":
            k = (typ, d["gruppe"])
        elif typ == "fast_track":
            k = (typ, d["an"])
        elif typ == "aktion_abgelehnt":
            k = (typ, len([x for x in aus if x[0] == typ]))
        else:
            k = (typ,)
        aus[k] = e
    return aus


# schnellstes Fahrzeug im Szenario (Straße bis 30 km/h) in m/s – für den Vergleich der Einschlagorte
V_MAX = 8.5


def nah(a, b, tol):
    return a is not None and b is not None and abs(a - b) <= tol


# Ereignisse, deren Zeit von einem Klick abhängt (direkt oder über einen Einschlag): Entscheidungen, Einschläge,
# Verstärkungen, bedingte Injects (I-08a, I-09) und Meldungen, die entfallen, weil eine Wirkung das letzte Fahrzeug traf
AUS_AKTION = ("g1_entscheid", "g2_empfehlung", "g3_entscheid", "wirkung", "fast_track", "verstaerkung", "inject", "meldung_entfaellt",
              "inject_quittiert", "lagehinweis")


def vergleiche(name, soll, ist, tol_t, tol_klick):
    """Unterschiede zwischen dem Protokoll im Prozess (soll) und im Browser (ist).

    Ergebnisse müssen gleich sein (welche Meldung wie entschieden, Wirkmittel, bekämpftes Fahrzeug, Treffer, Verstöße,
    entfallene Meldungen, Injects, Hintergrundgefecht, E-01). Zeiten: Ereignisse des Zeitplans auf tol_t genau;
    was aus einem Klick folgt (Entscheidung, Einschlag), auf tol_klick – so viel Spielzeit, wie ein Klick im
    Browser höchstens später ankommen darf.
    """
    f = []
    s, i = schluessel(soll), schluessel(ist)
    for k in sorted(set(s) - set(i), key=str):
        f.append(f"{name}: fehlt im Browser {k}")
    for k in sorted(set(i) - set(s), key=str):
        f.append(f"{name}: zusätzlich im Browser {k} {json.dumps(i[k]['daten'], ensure_ascii=False)[:160]}")
    dt = []
    for k in set(s) & set(i):
        a, b = s[k], i[k]
        da, db = a["daten"], b["daten"]
        typ = a["typ"]
        # Meldungen einer Verstärkung kommen dt nach dem Einspielen – dessen Zeit ist ein Klick der Spielleitung
        klick = typ in AUS_AKTION or (typ == "meldung" and str(da.get("meldung", "")).startswith("V"))
        tol = tol_klick + (VORLAUF_FT if typ == "fast_track" else 0) if klick else tol_t
        if abs(a["t_s"] - b["t_s"]) > tol:
            f.append(f"{name}: {k} Zeit {a['t_s']} / Browser {b['t_s']}")
        if typ != "fast_track":
            dt.append(abs(a["t_s"] - b["t_s"]))
        if typ == "wirkung":
            if da.get("ziel") != db.get("ziel"):
                f.append(f"{name}: {k} bekämpftes Fahrzeug {da.get('ziel')} / {db.get('ziel')}")
            if not nah(da.get("t_einschlag"), db.get("t_einschlag"), tol_klick):
                f.append(f"{name}: {k} Einschlag {da.get('t_einschlag')} / {db.get('t_einschlag')}")
            # Ort: ein späterer Klick verschiebt den Einschlag auf einem fahrenden Ziel (bis ca. 30 km/h = 8,5 m/s)
            spaeter = max(abs(da["t_freigabe"] - db["t_freigabe"]), abs((da.get("t_einschlag") or 0) - (db.get("t_einschlag") or 0)))
            if math.dist(da["pos"], db["pos"]) > 1.0 + V_MAX * spaeter:
                f.append(f"{name}: {k} Einschlagort {da['pos']} / {db['pos']} (Klick {spaeter:.2f} s später)")
            ta = sorted((g["ziel"], g["was"], g["kategorie"], g.get("anzahl")) for g in da.get("getroffen", []))
            tb = sorted((g["ziel"], g["was"], g["kategorie"], g.get("anzahl")) for g in db.get("getroffen", []))
            if ta != tb:
                f.append(f"{name}: {k} Treffer {ta} / {tb}")
            if [warnung_ohne_zahlen(v) for v in da.get("verstoesse", [])] != [warnung_ohne_zahlen(v) for v in db.get("verstoesse", [])]:
                f.append(f"{name}: {k} Verstöße {da.get('verstoesse')} / {db.get('verstoesse')}")
        elif typ in ("g2_empfehlung", "g3_entscheid"):
            for feld in ("empfehlung", "entscheid", "wirkmittel"):
                if da.get(feld) != db.get(feld):
                    f.append(f"{name}: {k} {feld} {da.get(feld)} / {db.get(feld)}")
            if [warnung_ohne_zahlen(v) for v in da.get("warnungen", [])] != [warnung_ohne_zahlen(v) for v in db.get("warnungen", [])]:
                f.append(f"{name}: {k} Warnungen {da.get('warnungen')} / {db.get('warnungen')}")
            ea, eb = da.get("einschlag"), db.get("einschlag")
            if (ea is None) != (eb is None) or (ea and (ea["ziel"] != eb["ziel"] or not nah(ea["t"], eb["t"], tol_klick))):
                f.append(f"{name}: {k} Einschlag {ea} / {eb}")
        elif typ in ("meldung", "meldung_entfaellt", "hintergrund", "ereignis", "inject", "g1_entscheid", "verstaerkung", "inject_quittiert", "lagehinweis"):
            # t_ab der Verstärkung ist die Klickzeit der Spielleitung (geprüft über t_s mit tol_klick)
            ohne = lambda d: {x: y for x, y in d.items() if x not in ("t_ab", "grund", "manuell")}  # noqa: E731
            if ohne(da) != ohne(db):
                f.append(f"{name}: {k} Daten {da} / {db}")
    return f, (max(dt) if dt else 0.0)


# ---------------------------------------------------------------- Ablauf

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("basis")
    ap.add_argument("--sync", default="lokal")
    ap.add_argument("--db", default=None, help="Firebase-Datenbank (z. B. Nachbildung http://localhost:5555?ns=argus-test)")
    ap.add_argument("--transport", default=None)
    ap.add_argument("--tempo", type=int, default=5)
    ap.add_argument("--plan", default=None, help="Plan aus tools/drehbuch_plan.ts (sonst neu erzeugt)")
    ap.add_argument("--bilder", default="e2e-drehbuch")
    ap.add_argument("--teams", type=int, default=5, help="nur die ersten n Teams des Plans (Fehlersuche)")
    ap.add_argument("--debug", action="store_true", help="Stand der Modellpersonen ausgeben")
    ap.add_argument("--renderer", choices=["canvas", "webgl"], default="canvas",
                    help="Karten im Rückfall Canvas (Standard; ohne GPU-Prozess) oder WebGL über SwiftShader. Mit 18 Fenstern "
                         "an einem Rechner ohne Grafikkarte wartet WebGL auf den überlasteten GPU-Prozess und hält die Fenster an.")
    ap.add_argument("--fps", type=int, default=2,
                    help="höchste Bildrate der Karten (Adresszeile fps=…). 18 Fenster mit Software-WebGL an einem Rechner "
                         "lasten die CPU sonst so aus, dass die Modellpersonen G2/G3 zu spät klicken; 0 = ohne Grenze")
    ap.add_argument("--toleranz", type=float, default=0.5, help="Zeittoleranz für Ereignisse des Zeitplans (s Spielzeit)")
    ap.add_argument("--klick", type=float, default=1.0, help="so viele Sekunden Echtzeit darf ein Klick im Browser später ankommen")
    a = ap.parse_args()
    os.makedirs(a.bilder, exist_ok=True)
    tol_t = a.toleranz
    tol_klick = max(tol_t, a.klick * a.tempo)
    if not a.plan:
        a.plan = os.path.join(tempfile.mkdtemp(), "plan.json")
        subprocess.run(["npx", "vite-node", os.path.join(HIER, "drehbuch_plan.ts"), "--", a.plan], check=True, cwd=os.path.dirname(HIER))
    plan = json.load(open(a.plan, encoding="utf-8"))
    plan["teams"] = plan["teams"][:a.teams]
    fehler, konsole, fps = [], [], []
    t0 = time.time()

    with sync_playwright() as p:
        grafik = (["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] if a.renderer == "webgl"
                  else ["--disable-gpu", "--disable-software-rasterizer"])
        browser = p.chromium.launch(args=["--allow-file-access-from-files", *grafik,
                                          "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
                                          "--disable-backgrounding-occluded-windows"])
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
        if a.sync == "firebase" and a.transport == "auto":
            # Die Nachbildung (firebase-server) kann nur WebSocket; das SDK soll nicht auf Long-Polling ausweichen
            # (wie tools/e2e_teams.py).
            ctx.add_init_script("try { localStorage.removeItem('firebase:previous_websocket_failure') } catch (e) {}")

        def seite(name):
            s = ctx.new_page()
            s.on("console", lambda m, n=name: konsole.append(f"{n}: {m.type}: {m.text}") if m.type in ("error", "warning") else None)
            s.on("pageerror", lambda e, n=name: konsole.append(f"{n}: pageerror: {e}"))
            return s

        fotos_fehlt = []

        def foto(s, name):
            # Fotos sind Beiwerk: bei 18 Fenstern mit Software-WebGL kann eines länger dauern – dann ohne Foto weiter
            try:
                s.screenshot(path=os.path.join(a.bilder, f"{name}.png"), timeout=90000)
            except Exception as e:  # noqa: BLE001
                fotos_fehlt.append(f"{name}: {str(e).splitlines()[0]}")

        # 1. Sitzung, Lobby, Teams, Plenum
        sl = seite("SL")
        sl.goto(startseite(a.basis, a))
        sl.get_by_role("button", name="Spielleitung").click()
        sl.get_by_placeholder("Name, z. B. SL 1").fill("SL 1")
        sl.get_by_role("button", name="Neue Sitzung anlegen").click()
        warte(lambda: sl.locator(".rahmen[data-host='1'][data-ansicht=uebersicht]").count() == 1, 30, "SL steuert")
        code = sl.get_by_test_id("code").inner_text().strip()
        print(f"Sitzung {code} ({time.time() - t0:.1f} s)")
        pl = seite("Plenum")
        pl.goto(startseite(a.basis, a, sitzung=code, rolle="plenum"))

        teams = []
        for i, tp in enumerate(plan["teams"]):
            name = TEAMNAMEN[i % len(TEAMNAMEN)][:24]
            fenster = []
            for r in ROLLEN:
                s = seite(f"T{i + 1}/{r}")
                s.goto(startseite(a.basis, a))
                s.get_by_role("button", name="Ich spiele mit").click()
                s.get_by_label("Code der Sitzung").fill(code)
                s.get_by_role("button", name="Beitreten").click()
                warte(lambda: s.locator("[data-rolle=lobby]").count() == 1, 20, f"Lobby {name}/{r}")
                s.get_by_placeholder("z. B. Lt Müller (freiwillig)").fill(f"Lt {r.upper()}-{i + 1}")
                if r == "g1":
                    s.get_by_placeholder("Teamname").fill(name)
                    s.get_by_role("button", name="Aufklärung", exact=True).click()
                    warte(lambda: s.get_by_test_id("lobby-ich").count() == 1, 15, f"Team {name} erstellt")
                else:
                    karte = s.locator(f"section.team-karte[data-teamname='{name}']")
                    warte(lambda: karte.count() == 1, 20, f"Team {name} sichtbar")
                    karte.locator(f"[data-slot='{name}:{r}']").get_by_role("button", name="beitreten").click()
                    warte(lambda: s.get_by_test_id("lobby-ich").count() == 1, 15, f"{name}/{r} beigetreten")
                fenster.append(s)
            teams.append({"name": name, "fenster": fenster, "plan": tp})
            print(f"Team {i + 1} „{name}“ ({tp['modell']}{' + ' + ' '.join(f'{g}@{t}' for g, t in tp['einspielen'].items()) if tp['einspielen'] else ''})")

        def sl_teams():
            return sl.evaluate("() => window.argusTeams()")

        warte(lambda: len(sl_teams()) == len(teams) and all(len(t["spieler"]) == 3 and all(x["online"] for x in t["spieler"]) for t in sl_teams()),
              40, "alle Teams voll und verbunden")
        ids = {t["name"]: t["id"] for t in sl_teams()}
        for t in teams:
            t["id"] = ids[t["name"]]

        # 2. Spiel öffnen, Einweisung schließen, Tempo, Modellpersonen, Start für alle
        sl.get_by_test_id("alle-oeffnen").click()
        for t in teams:
            for r, s in zip(ROLLEN, t["fenster"]):
                warte(lambda: s.locator(f"[data-testid=einweisung-{r}]").count() == 1, 40, f"Einweisung {t['name']}/{r}")
                s.get_by_role("button", name="Überspringen").click()
        warte(lambda: all(x["seq"] >= 2 for x in sl_teams()), 20, "Spielstände angelegt")
        sl.get_by_role("button", name=f"×{a.tempo}", exact=True).click()
        warte(lambda: all(x["uhr"]["tempo"] == a.tempo for x in sl_teams()), 20, f"Tempo ×{a.tempo} überall")
        LANG_JS = """() => { window.__lang = { n: 0, summe: 0, max: 0, liste: [] };
            new PerformanceObserver((l) => { for (const e of l.getEntries()) { const x = window.__lang; x.n++; x.summe += e.duration; x.max = Math.max(x.max, e.duration);
              if (x.liste.length < 400) x.liste.push([Math.round(e.startTime), Math.round(e.duration)]); } }).observe({ entryTypes: ['longtask'] }); }"""
        if a.debug:
            for s in [sl, pl] + [f for t in teams for f in t["fenster"]]:
                s.evaluate(LANG_JS)
        for t in teams:
            # Fast-Track schaltet das Modell 0,05 s vor der ersten Meldung danach (Simulation: ab 10:14:30). Im Browser
            # kommt ein Klick um einige Zehntel später an; die Modellperson G3 schaltet deshalb VORLAUF_FT s früher – das
            # ändert nichts, solange in dieser Zeit keine Meldung erscheint (geprüft).
            meldezeiten = [e["t_s"] for e in t["plan"]["protokoll"] if e["typ"] == "meldung"]
            for x in t["plan"]["aktionen"]:
                if x["typ"] == "fast_track":
                    frueher = x["t"] - VORLAUF_FT
                    if any(frueher <= m <= x["t"] for m in meldezeiten):
                        fehler.append(f"{t['name']}: Meldung zwischen {frueher} und {x['t']} – Fast-Track nicht vorziehbar")
                    x["t"] = frueher
            for r, s in zip(ROLLEN, t["fenster"]):
                eigene = [x for x in t["plan"]["aktionen"] if x["rolle"] == r]
                s.evaluate(MODELL_JS, eigene)
        sl.evaluate(SL_JS, [{"team": t["id"], "aktionen": [x for x in t["plan"]["aktionen"] if x["rolle"] == "sl"]} for t in teams])
        # Zweite Spielleitung (beobachtet, wie im Hörsaal): Kontrollkarte von Team 1 für die Fotos. Das Host-Fenster
        # bleibt in der Übersicht. Alle Karten sind fertig aufgebaut, bevor die Uhr läuft.
        sl2 = seite("SL 2")
        sl2.goto(startseite(a.basis, a, sitzung=code, rolle="sl", name="SL 2"))
        warte(lambda: sl2.locator(f"[data-ansehen='{teams[0]['name']}']").count() == 1, 30, "SL 2 sieht die Teams")
        sl2.locator(f"[data-ansehen='{teams[0]['name']}']").click()
        warte(lambda: sl2.locator("[data-testid=kontrollkarte][data-bereit='1']").count() == 1, 30, "Kontrollkarte bei SL 2")
        for t in teams:
            for r, s in zip(ROLLEN[1:], t["fenster"][1:]):
                warte(lambda: s.locator("[data-testid=lagekarte][data-bereit='1']").count() == 1, 30, f"Karte {t['name']}/{r}")
        warte(lambda: pl.locator("[data-testid=lagekarte]").count() == 0 or pl.locator("[data-testid=lagekarte][data-bereit='1']").count() == 1, 20, "Plenum")
        start = sl.get_by_test_id("alle-start")
        try:
            warte(lambda: start.is_enabled(), 30, "„Uhr starten – alle“ bedienbar")
        except AssertionError:
            print("Teams:", [(x["name"], x["seq"], x["laeuft"], x["uhr"]) for x in sl_teams()])
            raise
        start.click()
        warte(lambda: all(x["laeuft"] for x in sl_teams()), 20, "alle Uhren laufen")
        starts = [x["uhr"]["ts"] for x in sl_teams()]
        print(f"Uhren gestartet ×{a.tempo}, Abstand der Startzeiten {max(starts) - min(starts)} ms ({time.time() - t0:.0f} s)")

        # 3. Lauf bis Spielende mit Fotos und Messung der Bildrate
        g1a, g2a, g3a = teams[0]["fenster"]
        lm1 = next((x["t"] for x in teams[0]["plan"]["aktionen"] if x["typ"] == "g3_entscheid" and x["daten"]["entscheid"] == "freigabe"
                    and any(y["typ"] == "g2_empfehlung" and y["daten"]["meldung"] == x["daten"]["meldung"] and y["daten"].get("wirkmittel") == "LM"
                            for y in teams[0]["plan"]["aktionen"])), None)
        fotos = [
            (304.5, "artillerie_h01", [("sl2", sl2), ("plenum", pl)]),
            (590, "nebel_h03_wrack_z11", [("sl2", sl2), ("g2", g2a), ("g3", g3a), ("plenum", pl)]),
            (900, "uebersicht_mitte", [("sl", sl)]),
            (1012, "achse_nord", [("sl2", sl2), ("g2", g2a)]),
        ]
        if lm1:
            fotos.append((lm1 + 20, "lm_im_flug", [("sl2", sl2), ("g2", g2a), ("g3", g3a)]))
        fotos.sort()
        team2_ansicht = False
        notiz_sl2 = False
        NOTIZ_TEXT = "SL 2: Führung hat I-04 gelesen, aber nicht weitergegeben (e2e)"
        naechste_messung = time.time() + 8
        naechste_debug = time.time()
        layout_mitte = False
        while True:
            st = sl_teams()
            if all(x["ende"] for x in st):
                break
            t_spiel = sl.evaluate("(id) => window.argusSitzung.spiel(id).spielzeit()", teams[0]["id"])
            while fotos and t_spiel >= fotos[0][0]:
                _, name, ziele = fotos.pop(0)
                for rn, s in ziele:
                    foto(s, f"{name}_{rn}")
                print(f"  Foto {name} bei {t_spiel:.0f} s")
            if not notiz_sl2 and t_spiel >= 1290:
                # SL 2 notiert zu Team 1 (Zuschauen in der Teamansicht): „✎ Notiz“, der laufende Fall S3 ist vorgewählt
                sl2.get_by_test_id("notiz-knopf").click()
                warte(lambda: sl2.get_by_test_id("notiz-menue").count() == 1, 10, "Notizfeld SL 2")
                gewaehlt = sl2.locator("[data-notiz-fall].an").get_attribute("data-notiz-fall")
                if gewaehlt != "S3":
                    fehler.append(f"Notiz SL 2: vorgewählter Fall {gewaehlt}, erwartet S3")
                    sl2.locator("[data-notiz-fall='S3']").click()
                sl2.get_by_test_id("notiz-text").fill(NOTIZ_TEXT)
                sl2.get_by_test_id("notiz-text").press("Enter")
                notiz_sl2 = True
                print(f"  Notiz SL 2 zu S3 bei {t_spiel:.0f} s")
            if not team2_ansicht and t_spiel >= 1380 and len(teams) > 1:
                sl2.get_by_test_id("sl-teamwahl").select_option(teams[1]["id"])
                team2_ansicht = True
            if team2_ansicht and t_spiel >= 1411 and not any(f.startswith("e01") for f in os.listdir(a.bilder)):
                foto(sl2, "e01_ideal_sl2")
                print(f"  Foto e01_ideal_sl bei {t_spiel:.0f} s")
            if not layout_mitte and t_spiel >= 900:
                for n, s in [("SL", sl), ("SL 2", sl2), ("Plenum", pl)] + [(f"T{k + 1}/{r}", f) for k, t in enumerate(teams) for r, f in zip(ROLLEN, t["fenster"])]:
                    lay = s.evaluate(LAYOUT_JS)
                    if lay["seite"][0] > W or lay["seite"][1] > H or lay["zuGross"]:
                        fehler.append(f"{n} (Mitte): Seite {lay['seite']} {lay['zuGross'][:2]}")
                layout_mitte = True
            if a.debug and time.time() >= naechste_debug:
                for k, t in enumerate(teams):
                    for r, s in zip(ROLLEN, t["fenster"]):
                        d = s.evaluate("() => ({ sicht: !!(window.argus && window.argus.spiel), t: window.argus && window.argus.spiel ? Math.round(window.argus.spielzeit()) : null, rest: window.__modell?.rest, offen: window.argus && window.argus.spiel ? Object.keys(window.argus.stand.offen).length : null, log: (window.__modell?.log || []).slice(-1) })")
                        print(f"    T{k + 1}/{r} {d}")
                naechste_debug = time.time() + 3
            if time.time() >= naechste_messung:
                for n, s in [("SL 2", sl2), ("T1/G2", g2a), ("T1/G3", g3a), ("Plenum", pl)]:
                    for d in s.evaluate(DIAGNOSE_JS):
                        fps.append({"fenster": n, "t": round(t_spiel), **{k: d[k] for k in ("id", "fps", "bildMs", "effekte", "renderer")}})
                naechste_messung = time.time() + 15
            if time.time() - t0 > 1500 / a.tempo + 900:
                fehler.append("Zeitüberschreitung")
                break
            time.sleep(0.1)
        print(f"Spielende in allen Teams ({time.time() - t0:.0f} s)")
        time.sleep(2)

        if a.debug:
            for n, s in [("SL", sl), ("Plenum", pl)] + [(f"T{k + 1}/{r}", f) for k, t in enumerate(teams) for r, f in zip(ROLLEN, t["fenster"])]:
                l = s.evaluate("() => window.__lang && { n: window.__lang.n, summe: Math.round(window.__lang.summe), max: Math.round(window.__lang.max), liste: window.__lang.liste.slice(-8) }")
                print(f"    lange Aufgaben {n}: {l}")
        # ---------------------------------------------------------------- Prüfungen
        endstand = sl_teams()
        nach_id = {x["id"]: x for x in endstand}
        for k, t in enumerate(teams):
            x = nach_id[t["id"]]
            for r, s in zip(ROLLEN, t["fenster"]):
                rahmen = s.locator(".rahmen[data-seq]").first
                stand = (rahmen.get_attribute("data-lauf"), int(rahmen.get_attribute("data-seq") or 0), rahmen.get_attribute("data-fp"))
                if stand != (x["lauf"], x["seq"], x["fp"]):
                    fehler.append(f"Team {k + 1}/{r}: Stand {stand}, SL {(x['lauf'], x['seq'], x['fp'])}")
                m = s.evaluate("() => window.__modell && { rest: window.__modell.rest, fehler: window.__modell.fehler, log: window.__modell.log }")
                if m["rest"]:
                    fehler.append(f"Team {k + 1}/{r}: {m['rest']} geplante Aktionen nicht gesendet")
                fehler += [f"Team {k + 1}/{r}: {f}" for f in m["fehler"]]
                verz = [l["ist"] - l["plan"] for l in m["log"]]
                t["verzug_" + r] = max(verz) if verz else 0
        maxdt = {}
        for k, t in enumerate(teams):
            ist = sl.evaluate("(id) => window.argusSitzung.spiel(id).stand.protokoll.map((e) => ({ seq: e.seq, typ: e.typ, t_s: e.t_s, ts: e.ts, ts_aktion: e.ts_aktion, rolle: e.von.rolle, daten: e.daten }))", t["id"])
            with open(os.path.join(a.bilder, f"protokoll_team{k + 1}.json"), "w", encoding="utf-8") as f:
                json.dump(ist, f, ensure_ascii=False, indent=0)
            unterschiede, maxdt[k] = vergleiche(f"Team {k + 1}", t["plan"]["protokoll"], ist, tol_t, tol_klick)
            fehler += unterschiede
            z = sl.evaluate("(id) => { const z = window.argusSitzung.spiel(id).stand.zustand; return { bestand: z.bestand, zerstoert: z.zerstoert, abgelehnt: z.abgelehnt, ende: z.ende } }", t["id"])
            if z["bestand"] != t["plan"]["ende"]["bestand"]:
                fehler.append(f"Team {k + 1}: Bestand {z['bestand']} / im Prozess {t['plan']['ende']['bestand']}")
            if sorted(z["zerstoert"]) != sorted(t["plan"]["ende"]["zerstoert"]):
                fehler.append(f"Team {k + 1}: zerstört {sorted(z['zerstoert'])} / {sorted(t['plan']['ende']['zerstoert'])}")
            for zid, tz in z["zerstoert"].items():
                soll = t["plan"]["ende"]["zerstoert"].get(zid)
                if soll is not None and abs(soll - tz) > tol_klick:
                    fehler.append(f"Team {k + 1}: {zid} zerstört um {tz} / {soll}")
            if z["abgelehnt"]:
                fehler.append(f"Team {k + 1}: {len(z['abgelehnt'])} Aktionen abgelehnt: {[x['grund'] for x in z['abgelehnt']][:3]}")
            # Weg einer Aktion: Klick (Serverzeit) → Ereignis im Protokoll (Serverzeit beim Schreiben durch den Host)
            weg = sorted(e["ts"] - e["ts_aktion"] for e in ist if e.get("ts_aktion"))
            weg_spaet = [e["ts"] - e["ts_aktion"] for e in ist if e.get("ts_aktion") and e["t_s"] >= 1080]
            t["weg"] = (weg[len(weg) // 2] if weg else 0, weg[-1] if weg else 0, max(weg_spaet) if weg_spaet else 0)
            nm = sum(1 for e in ist if e["typ"] == "meldung")
            nw = sum(1 for e in ist if e["typ"] == "wirkung")
            print(f"  Team {k + 1} {t['plan']['modell']:<5} seq {nach_id[t['id']]['seq']:>3}  {nm} Meldungen, {nw} Einschläge, "
                  f"zerstört {len(z['zerstoert'])}, Bestand {z['bestand']}, größte Zeitabweichung {maxdt[k]:.2f} s, "
                  f"Verzug G1/G2/G3 {t['verzug_g1']:.2f}/{t['verzug_g2']:.2f}/{t['verzug_g3']:.2f} s, "
                  f"Klick → Protokoll Median {t['weg'][0]:.0f} ms, max {t['weg'][1]:.0f} ms (ab 10:18 max {t['weg'][2]:.0f} ms)")

        for n, s in [("SL", sl), ("SL 2", sl2), ("Plenum", pl)] + [(f"T{k + 1}/{r}", f) for k, t in enumerate(teams) for r, f in zip(ROLLEN, t["fenster"])]:
            lay = s.evaluate(LAYOUT_JS)
            if lay["seite"][0] > W or lay["seite"][1] > H:
                fehler.append(f"{n}: Seite {lay['seite']} größer als {W}×{H}")
            if lay["zuGross"]:
                fehler.append(f"{n}: {lay['zuGross'][:3]}")
        with open(os.path.join(a.bilder, "bildrate.json"), "w", encoding="utf-8") as f:
            json.dump(fps, f, ensure_ascii=False, indent=1)
        if fps:
            for n in sorted({x["fenster"] for x in fps}):
                werte = [x for x in fps if x["fenster"] == n and x["fps"]]
                if werte:
                    print(f"  Bildrate {n:<7} {min(x['fps'] for x in werte)}–{max(x['fps'] for x in werte)} Bilder/s, "
                          f"Zeichenzeit Ø {sum(x['bildMs']['mittel'] for x in werte) / len(werte):.1f} ms, max {max(x['bildMs']['max'] for x in werte):.0f} ms "
                          f"({werte[0]['renderer']}, {len(werte)} Messungen)")
        # ---------------------------------------------------------------- Auswertung (Schritt 8)
        # Notiz der SL 2 im Protokoll von Team 1, mit Fall
        notizen = sl.evaluate("(id) => window.argusSitzung.spiel(id).stand.protokoll.filter((e) => e.typ === 'notiz').map((e) => e.daten)", teams[0]["id"])
        if not any(n.get("fall") == "S3" and n.get("text") == NOTIZ_TEXT for n in notizen):
            fehler.append(f"Notiz SL 2 nicht im Protokoll von Team 1: {notizen}")
        try:
            warte(lambda: pl.locator("[data-ansicht=auswertung] [data-testid=teamvergleich]").count() == 1, 30, "Plenum schaltet auf die Auswertung")
            pl.wait_for_timeout(1000)
            plan_teams = {"teams": plan["teams"]} if all("auswertung" in t for t in plan["teams"]) else None
            if not plan_teams:
                fehler.append("Plan ohne Auswertung (tools/drehbuch_plan.ts neu erzeugen)")
            ab = os.path.join(a.bilder, "auswertung")
            os.makedirs(ab, exist_ok=True)
            t_aw = time.time()
            f_aw, prot_aw, schritte_aw = pruefe_auswertung(pl, plan_teams, ab, False)
            fehler += [f"Auswertung: {f}" for f in f_aw]
            # Notiz der SL 2 erscheint bei S3
            pl.keyboard.press("Home")
            for _ in range(3):
                pl.keyboard.press("PageDown")
            warte(lambda: pl.locator("section.replay[data-fall='S3']").count() == 1, 10, "Replay S3")
            if NOTIZ_TEXT not in pl.get_by_test_id("notizen-sl").inner_text():
                fehler.append("Auswertung S3: Notiz der SL 2 fehlt")
            auswertung_bericht(prot_aw, schritte_aw)
            print(f"  Auswertung im Plenum durchgegangen in {time.time() - t_aw:.0f} s (mit Prüfungen)")
            # Spielleitung: dieselbe Auswertung über „Auswertung ›“ und zurück
            sl.get_by_test_id("auswertung-knopf").click()
            warte(lambda: sl.locator("[data-ansicht=auswertung] [data-testid=teamvergleich]").count() == 1, 20, "Auswertung bei der Spielleitung")
            n_sl = sl.locator("[data-testid=teamvergleich] td[data-fall]").count()
            if n_sl != len(teams) * 8:
                fehler.append(f"Auswertung SL: {n_sl} Zellen, erwartet {len(teams) * 8}")
            foto(sl, "sl_auswertung")
            sl.get_by_test_id("auswertung-zurueck").click()
            warte(lambda: sl.locator("[data-testid=uebersicht]").count() == 1, 10, "zurück zur Übersicht")
        except AssertionError as e:
            fehler.append(f"Auswertung: {e}")
            foto(pl, "auswertung_fehler")

        # Fotos zum Schluss (nach den Prüfungen)
        pl.get_by_test_id("auswertung-zurueck").click()
        pl.wait_for_timeout(1500)
        foto(pl, "plenum_aufloesung")
        if len(teams) > 1:
            sl2.get_by_test_id("sl-teamwahl").select_option(teams[0]["id"])
        sl2.wait_for_timeout(800)
        foto(sl2, "sl2_ende_team1")
        foto(sl, "sl_uebersicht_ende")
        for r, s in zip(ROLLEN, teams[0]["fenster"]):
            foto(s, f"team1_{r}_ende")

        if fotos_fehlt:
            print("Ohne Foto (Zeitüberschreitung beim Bildschirmfoto):", *fotos_fehlt, sep="\n  ")
        relevante = [k for k in konsole if "favicon" not in k and "GPU stall" not in k and "WebGL" not in k and "FIREBASE WARNING" not in k]
        if relevante:
            print("Konsole:", *relevante[:15], sep="\n  ")
            if any("pageerror" in k or ": error:" in k for k in relevante):
                fehler.append("Fehler in der Browserkonsole")
        browser.close()

    print(f"Laufzeit {time.time() - t0:.0f} s")
    if fehler:
        print("FEHLER:", *fehler[:60], sep="\n  ")
        sys.exit(1)
    print(f"OK – Drehbuch mit {len(plan['teams'])} Teams vollständig durchgespielt, Protokolle wie die Engine im Prozess "
          f"(= simuliere_durchlauf.py naiv/ideal), alle Fenster in {W}×{H}")


if __name__ == "__main__":
    main()
