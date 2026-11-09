#!/usr/bin/env python3
"""Erzeugt das Drehbuch (Markdown) aus den Szenariodaten.

Aufruf: python3 gen_drehbuch.py [OUT.md]
Alle Inhalte stammen aus daten/*.json; Änderungen dort vornehmen und neu erzeugen.
Seit Szenario 2.0: Teams, Gefecht in Phasen, Bewegung, Trefferregel nach der Lage beim Einschlag,
Hintergrundgefecht, Verstärkungen, Probelauf mit Robustheit.
Seit Szenario 2.1: Zonen mit sichtbaren Namen (Schule, Ortschaft), nur die 2. Kompanie, Durchbruch nicht aufgehaltener
Gruppen (Abschnitt 8), Feuer mit Schussrhythmus.
Seit 26.10.2026 (Änderungen B3, B4, B6, B7): Texte wie in der Anzeige (argus_lib.anzeige_*): Spieluhr 00:00–25:00, Meldungen als
„Ziel n“ mit der internen Kennung daneben.
Seit Szenario 2.2 (28.10.2026, Änderungen C1–C9): Kontakte (jedes Fahrzeug ab der Einfahrt sichtbar), Meldedichte
(größte Lücken), LM trifft genau ein Fahrzeug (wirkung.praezision), neue Meldungen M28–M30.
Seit Szenario 2.3 (01.11.2026, Änderungen D1–D5): eigene Kräfte am Westrand, Verlustmodell und Druckmeldungen (Abschnitt 9),
kürzere Lagemeldungen, Auswertung „Preis des Abwartens“.
Seit Szenario 2.4 (01.11.2026, Änderungen E1–E8, „Ethik“): BEKÄMPFEN wirkt auf den ganzen Zug (Wirkmittel-Tabelle), EloKa stört
global (Zeitleiste: gestörte Meldungen), drei ARGUS-Klassen, Merkmale im Bild statt Sensordaten (Abschnitt 5), Schlüsselfälle
S5–S8 (zuschaltbar im Replay), Verstärkungsmenü per Schalter aus (E1), Replay-Plan mit 12 min.
Seit Szenario 2.5 (02.11.2026, Änderungen F „Panzerzug“): eigene Truppe mit vier Leopard 2A7V (1/1–1/4), Feindfeuer mit
Einschießen und Zustand je Panzer, Druckmeldungen je Panzer, Kalibrierung F2.9 (Abschnitt 9), Wirkmittel Kanone 120 mm, Zone
„Schule“; seit F5 „1./PzBtl 613“, Absender und Kopfzeile „1. Kp“ (aus szenario.eigene_truppe).
Seit Szenario 2.6 (09.11.2026, Änderungen H): eine Rolle je Team (Zielbearbeitung, 7 Teams, 2–3 Personen an einem Laptop), eine
Entscheidung je Meldung (Lösung je Meldung: loesung.entscheid), Tempo statt Arbeitsteilung (Modellzeiten naiv 20 s, ideal 35 s
je Entscheidung, Robustheit nach Sekunden je Entscheidung), Fast-Track entfällt, Phase 5 „Krise“, Lagemeldungen an das Team
(Feed), weniger Artilleriemeldungen (H3.3), jeder Team-Laptop rechnet sein Spiel selbst.
"""
import sys

import argus_lib as L
from pruefe_szenario import pruefe, FREIGABE_RICHTWERT_S
import simuliere_durchlauf as SIM
import verluste as V

SCHUTZ, GT_TEXT, zahl = L.SCHUTZ, L.GT_TEXT, L.zahl
SICHT_TEXT = {"wolke": "Wolke", "rauch": "Rauch", "dunst": "Dunst", "baeume": "Bäume", "tarnnetz": "Tarnnetz",
              "stoerung": "Bildstörung", "unschaerfe": "Unschärfe"}
ART_TEXT = {"feindartillerie": "Feindartillerie", "panzerabwehr": "Kanone 1. Kp", "rauch": "Rauch (Feind)"}
STUFE = V.STUFE_TEXT
VERLUST_ART = {"direkt": "direktes Feuer (KPz/SPz im Halt)", "steil": "Mörser", "artillerie": "Feindartillerie",
               "attrappe": "Feindartillerie nach Treffer auf die Attrappe", "durchbruch": "Durchbruch",
               "beobachter": "Artillerie, gelenkt vom Beobachter im Kirchturm"}
ROLLE = L.ROLLE
# Replay der Auswertung (wie src/kern/auswertung.ts replayPlan): feste Kapitel 45 + 45 + 30 s, Preis des Abwartens 60 s
REPLAY_FEST_S, REPLAY_PREIS_S = 120, 60


def verw(n):
    return V.verw_text(n)


def rolle(k):
    return ROLLE.get(k, k)


def an_text(an):
    """Empfänger einer Lagemeldung (seit 2.6 das Team)."""
    return "Team" if an in ("Team", "team", "zb") else rolle(an)


def zl(ids):
    """Ziel-IDs kurz: Z-01, Z-02 oder Z-30–32."""
    if len(ids) < 3:
        return ", ".join(ids)
    return f"{ids[0]}–{ids[-1].split('-')[-1]}"


def klasse(m, a=None):
    a = a or m["argus"]
    n = len(m["ziele"])
    k = f"{n}× {a['klasse']}" if n > 1 else a["klasse"]
    if a.get("zugehoerigkeit"):
        k += f" · {a['zugehoerigkeit']}"
    konf = " / ".join(str(x) for x in a["einzeln"]) if a.get("einzeln") else str(a["konfidenz"])
    return k, konf


def loesung_text(m):
    """Lösung einer Meldung (seit 2.6 eine Entscheidung)."""
    lo = m["loesung"]
    wm = f" *(nur {', '.join(lo['wirkmittel'])})*" if lo.get("wirkmittel") else ""
    return f"**{lo['entscheid']}**{wm}" + (f" – {lo['text']}" if lo.get("text") else "")


def tempo(z):
    """Spanne der Fahrgeschwindigkeiten (km/h) entlang der Route, ohne Halte."""
    r = (z.get("bewegung") or {}).get("route") or []
    v = []
    for (t0, x0, y0), (t1, x1, y1) in zip(r, r[1:]):
        s = L.dist((x0, y0), (x1, y1))
        if s > 0.5 and t1 > t0:
            v.append(s / (t1 - t0) * 3.6)
    if not v:
        return "steht"
    lo, hi = round(min(v)), round(max(v))
    return f"{lo} km/h" if hi - lo < 3 else f"{lo}–{hi} km/h"


def bedingung_text(bed, uhr, kurz=False):
    if bed["typ"] == "freigabe":
        return f"wenn bekämpft: {bed['verzoegerung_s']} s danach" if kurz else f"bedingt: {bed['verzoegerung_s']} s nach BEKÄMPFEN {'/'.join(bed['ziele'])}"
    if bed["typ"] == "freigabe_mit_zivil":
        return (f"wenn beim Einschlag Zivilpersonen im Wirkradius sind: {bed['verzoegerung_s']} s nach BEKÄMPFEN" if kurz else
                f"bedingt: {bed['verzoegerung_s']} s nach BEKÄMPFEN {'/'.join(bed['ziele'])}, wenn beim Einschlag Zivilpersonen im Wirkradius")
    if bed["typ"] == "treffer":
        return (f"wenn getroffen: {bed['verzoegerung_s']} s nach dem Einschlag" if kurz else
                f"bedingt: {bed['verzoegerung_s']} s nach dem ersten Treffer auf {'/'.join(bed['ziele'])}")
    if bed["typ"] == "durchbruch":
        return f"bedingt: {bed['verzoegerung_s']} s nach dem ersten Fahrzeug einer nicht aufgehaltenen Feindgruppe über dem Bach"
    return f"wenn bis {uhr(bed['t_s'])} nicht bekämpft: um {uhr(bed['t_s'])}" if kurz else \
        f"bedingt: {uhr(bed['t_s'])}, wenn {'/'.join(bed['ziele'])} nicht bekämpft"


def zug_text(x):
    """Wie BEKÄMPFEN mit diesem Wirkmittel auf eine Meldung mit mehreren Fahrzeugen wirkt (seit 2.4, E3)."""
    z = x.get("zug") or {}
    if z.get("art") == "je_fahrzeug":
        was = "eine LM" if x["id"] == "LM" else "ein Schuss der Kanone" if x["id"] == "PZA" else f"ein {x['kurz']}"
        return f"je stehendem Fahrzeug {was}, nacheinander im Abstand {z.get('abstand_s', 0)} s"
    if z.get("art") == "flaeche":
        return "ein Einschlag am ersten Fahrzeug, alles im Wirkradius"
    return "ein Einschlag"


def replay_plan(sz, auswahl=None, mit_preis=True):
    """Wie src/kern/auswertung.ts replayPlan: (Fälle, Sekunden je Fall, Summe)."""
    rp = (sz.get("auswertung") or {}).get("replay") or {}
    budget = rp.get("budget_s", 720)
    ids = auswahl or rp.get("standard") or [f["id"] for f in sorted(sz["schluesselfaelle"], key=lambda f: f["reihenfolge"]) if not f.get("zuschaltbar")]
    preis = REPLAY_PREIS_S if mit_preis else 0
    je = (budget - REPLAY_FEST_S - preis) // len(ids) // 5 * 5 if ids else 0
    return ids, je, REPLAY_FEST_S + preis + je * len(ids)


def verluste_abschnitt(d, w, uhr, zn):
    """Abschnitt 9 (seit 2.3; seit 2.5 je Panzer, F1/F2): eigene Truppe, Feindfeuer mit Einschießen, Druckmeldungen, Kalibrierung."""
    sz, vr = d["szenario"], d["regeln"].get("verluste")
    et, vs = sz.get("eigene_truppe"), sz.get("verluste") or {}
    if not et or not vr or not et.get("panzer"):
        return
    pl = V.panzer(sz)
    pname = {p["id"]: p["name"] for p in pl}
    fz = d["fahrzeuge"]
    hg = (sz.get("hintergrund") or {}).get("ereignisse", [])
    w("## 9 Eigene Truppe, Feindfeuer und Druckmeldungen")
    w("")
    w(et["hinweis"])
    w("")
    drehbuch = {}
    for z in sz["ziele"]:
        for f in z.get("feuert") or []:
            if f.get("auf"):
                drehbuch.setdefault(f["auf"], set()).add(z["id"])
    rad = vr["feindartillerie"]["radius_m"]
    w(f"| Panzer | Ort | Position (PQ) | Feuer nach Drehbuch (feuert.auf) | Feindartillerie im Ziel (≤ {rad} m) | Kanone im Hintergrundgefecht |")
    w("|---|---|---|---|---|---|")
    for p in pl:
        art = []
        for h in hg:
            if h["art"] != "feindartillerie":
                continue
            n = sum(1 for _, x, y in h["einschlaege"] if L.dist(p["pos"], (x, y)) <= rad)
            if n:
                art.append(f"{h['id']} ({n}×)")
        pza = [h["id"] for h in hg if h["art"] == "panzerabwehr" and h.get("von") == p["id"]]
        rolle_ = f" ({p['rolle']})" if p.get("rolle") else ""
        w(f"| **{p['name']}**{rolle_} | {p['ort']} | {L.pq(p['pos'], d['karte'])} ({p['pos'][0]}, {p['pos'][1]}) | "
          f"{', '.join(sorted(drehbuch.get(p['id'], []))) or '–'} | {', '.join(art) or '–'} | {', '.join(pza) or '–'} |")
    w("")
    at = vs.get("attrappe") or {}
    db = vs.get("durchbruch") or {}
    w(f"Das Team und das Plenum sehen die vier Panzer (Zeichen Kampfpanzer blau mit Kennung und Zustandsbalken, beim Hineinzoomen der "
      "Leopard in Stellung; eingeschränkt gelb, ausgefallen grau mit Schrägstrich und Rauch) und in der Kopfzeile je Panzer eine Kachel mit "
      f"dem Zustand (SL und Plenum: „{et['name']}: 3/4 einsatzbereit · 4 Verwundete“). Feuer auf die Panzer ist seit 2.6 (H5.7) deutlich: "
      "Mündungsblitz am Schützen, Leuchtspur zum Panzer, Einschlag mit Staub daneben oder Treffer-Funken am Panzer; die Kachel des "
      "getroffenen Panzers blinkt rot, kurz ein roter Rand am Bildschirm; der erste Beschuss jedes Panzers kommt als Lagemeldung. Keine "
      f"Personen. Die Attrappe Z-07 steht westlich des Bachs („scheinbar durchgebrochen“); wird sie getroffen, liegt Feindartillerie auf "
      f"{pname.get(at.get('panzer'), '–')}. Ein Durchbruch trifft "
      + "; ".join(f"über {k} {' und '.join(pname[x] for x in v)}{' im Wechsel' if len(v) > 1 else ''}" for k, v in db.items()) + ".")
    w("")
    w("### Feindfeuer (Spielwerte, F2)")
    w("")
    w(vr["hinweis"])
    w("")
    w("| Schütze | Art | Takt | wann er schießt | Einschießen | Treffer kostet |")
    w("|---|---|---|---|---|---|")
    ei = vr["einschiessen"]
    ed, es = ei["direkt"], ei["steil"]
    t_direkt = (f"Schuss 1–{ed['daneben']} daneben ({vr['ablage_m']['daneben'][0]}–{vr['ablage_m']['daneben'][1]} m vor/hinter dem Panzer), "
                f"{ed['daneben'] + 1} nah (≤ {vr['ablage_m']['nah'][1]} m, nur Splitter), ab {ed['jeder_zweite_ab']} jeder zweite, ab {ed['jeder_ab']} jeder")
    t_steil = (f"Salve 1–{es['daneben']} daneben ({vr['ablage_m']['steil_daneben'][0]}–{vr['ablage_m']['steil_daneben'][1]} m), "
               f"ab {es['daneben'] + 1} im Ziel")
    for typ, x in vr["waffen"].items():
        name = fz[typ]["name"]
        if x["art"] == "steil":
            w(f"| {name} | Steilfeuer | eine Salve alle 30 s (feuert) | nach Drehbuch, solange er steht, auf feuert.auf | {t_steil} | {x['treffer_prozent']} % |")
        elif x["art"] == "beobachter":
            w(f"| {name} | gelenktes Feuer | ein Feuerkommando alle 35 s (feuert) | nach Drehbuch, solange er nicht bekämpft ist, auf feuert.auf | "
              f"{t_steil} | {x['treffer_prozent']} % |")
        else:
            w(f"| {name} | direkt | alle {x['takt_s']} s | ab x ≤ {vr['feuer_ab_x']} m (Ostufer, Brücke Ost) und {x['feuerbereit_s']} s im Halt, "
              f"auf den nächsten voll einsatzbereiten Panzer | {t_direkt} | {x['treffer_prozent']} % |")
    w(f"| Feindartillerie (H-01, H-04, H-12) | Artillerie | je Einschlag | nach Drehbuch | trifft nur im Umkreis {rad} m eines Panzers | "
      f"{vr['feindartillerie']['treffer_prozent']} % |")
    if at:
        w(f"| Attrappe getroffen (S1) | Artillerie | {len(at['einschlaege'])} Einschläge ab {at['verzoegerung_s']} s nach dem Einschlag auf Z-07 | "
          f"verrät die Stellung von {pname.get(at['panzer'])} | die ersten beiden daneben, im Ziel nur im Umkreis {vr['attrappe']['radius_m']} m | "
          f"{vr['attrappe']['treffer_prozent']} % |")
    w(f"| Durchbruch (A4) | aus nächster Nähe | je Fahrzeug beim Übergang | nur wenn nicht aufgehalten | – | {vr['durchbruch']['treffer_prozent']} % |")
    w("")
    st = vr["stufen"]
    w(f"Zustand je Panzer, Start {vr['zustand_start']} %: ab {st['einsatzbereit_ab']} % **einsatzbereit**, {vr['untergrenze_prozent']}–"
      f"{st['einsatzbereit_ab'] - 1} % **eingeschränkt** (Optik oder Kette beschädigt, schießt weiter), unter {st['ausgefallen_unter']} % "
      f"**ausgefallen** (bewegungs- und kampfunfähig, Besatzung verwundet, Bergung; danach kein Schaden mehr, seine Kanone schießt nicht). "
      f"**Untergrenze:** höchstens {vr['hoechstens_ausgefallen']} Panzer fallen aus, die übrigen bleiben bei mindestens "
      f"{vr['untergrenze_prozent']} % – die Kp hält immer. Verwundete je Stufe fest ("
      + ", ".join(f"{STUFE.get(k, k)} {v}" for k, v in vr["verwundete"].items())
      + "), keine Gefallenen, keine Darstellung getöteter Menschen. Zwei T-72-Treffer kosten 50 %: Ein Panzer bricht nie beim ersten Schuss "
      "auseinander, ein T-72 braucht drei Treffer. Der Schaden kommt " + ", ".join(f"{k} {v} s" for k, v in vr["verzug_s"].items())
      + " nach dem Schuss an. Bekämpfen stoppt das Feuer ab dem Einschlag; ohne E-01 feuern die Feinde an der Brücke Ost weiter. "
      "Deterministisch: gleiche Entscheidungen ⇒ gleiche Schüsse, gleiche Treffer, gleiche Verluste.")
    w("")
    feuer = [z for z in sz["ziele"] if z.get("feuert")]
    if feuer:
        w("**Schützen nach Drehbuch (F2.8):** " + "; ".join(
            f"{z['id']} ({fz[z['typ']]['name']}) " + ", ".join(f"{uhr(f['von_s'])}–{uhr(f['bis_s'])}" for f in z["feuert"])
            + (f" → {pname.get(z['feuert'][0]['auf'], z['feuert'][0]['auf'])}" if z["feuert"][0].get("auf") else " → nächster Panzer")
            for z in feuer) + ". Ist der Panzer ausgefallen, geht das Feuer auf den nächsten.")
        w("")
    bs = [z["id"] for z in sz["ziele"] if z.get("bereitstellung")]
    if bs:
        w(f"**Bereitstellung:** {', '.join(bs)} sammeln an der Brücke Ost für den Angriff über den Bach und schießen nicht direkt.")
        w("")
    vm = vs.get("meldungen")
    if vm:
        r = vr["meldungen"]
        w("### Druckmeldungen je Panzer (F2.7, seit 2.6 mit H3.3 und H5.7)")
        w("")
        w(f"Die {et['name']} meldet Feuer und Treffer automatisch an das Team (Feed der Lagemeldungen, im Protokoll als Lagemeldung "
          f"{vm['kennung']}01 …, höchstens 140 Zeichen mit Absender „{vm['von']}“). Sofort: ein Panzer fällt aus, wird eingeschränkt oder bekommt "
          f"den ersten Treffer nach der Attrappe; seit 2.6 immer auch der **erste Beschuss** jedes Panzers. Sonst mit Abstand "
          f"({r['abstand_alle_s']} s seit der letzten Meldung der Kp, {r['abstand_panzer_s']} s je Panzer): ein Treffer an einem einsatzbereiten "
          f"Panzer, der erste Schuss eines neuen Schützen („Einschläge noch daneben“); ein weiterer Treffer an einem eingeschränkten höchstens "
          f"alle {r['abstand_limit_s']} s. **Weniger Artilleriemeldungen (H3.3):** Artillerie und Mörser höchstens einmal je Panzer, Schütze "
          f"und Stufe und insgesamt höchstens eine je {r.get('artillerie_abstand_s', 120)} s (ausgefallen immer); die Feindartillerie des "
          "Hintergrunds (H-01, H-04, H-12) meldet sich nicht mehr einzeln, nur beim Stufenwechsel eines Panzers.")
        w("")
        anlass = {"beschuss": "neuer Schütze, erst daneben (Stufe 0)", "treffer": "Treffer, Panzer einsatzbereit (1)", "sofort": "erster Treffer nach der Attrappe",
                  "eingeschraenkt": "Panzer wird eingeschränkt (2)", "erneut": "weiterer Treffer, eingeschränkt (2)",
                  "ausgefallen": "Panzer fällt aus (3)", "limit": "zweiter Ausfall, Untergrenze (3)"}
        w("| Anlass | Vorlage |")
        w("|---|---|")
        for k, t in vm["texte"].items():
            w(f"| {anlass.get(k, k)} | „{vm['von']}: {t}“ |")
        w("")
        w("Waffen: " + "; ".join(f"{k}: {v} – „{vm['forderung'][k]}“" for k, v in vm["waffe"].items()) + ". "
          "I-07 (S4) nennt den beschossenen Panzer 1/4, I-06 (S3) den Stand der Kp, I-13 den zuletzt durch den Durchbruch getroffenen Panzer.")
        w("")
    # Kalibrierung
    kal = SIM.kalibrierung(d)
    w("### Kalibrierung mit der Simulation (F2.9, seit 2.6 mit einer Rolle neu gerechnet, H2.5)")
    w("")
    w(f"Modellteam *ideal* ({SIM.T_IDEAL} s je Entscheidung; wartet bei S4, S5 und N4, lehnt S3, S6 und die Presse in S8 ab) soll spürbar "
      f"**schlechter** enden als *naiv* ({SIM.T_NAIV} s je Entscheidung), das ARGUS folgt – Vorschlag: ideal 1 Panzer ausgefallen, naiv "
      f"keiner. In keinem der fünf Läufe fallen mehr als {vr['hoechstens_ausgefallen']} Panzer aus, keiner fällt vor seinem dritten Treffer aus.")
    w("")
    w("| Lauf | einsatzbereit | eingeschränkt | ausgefallen | Verwundete | " + " | ".join(p["name"] for p in pl) + " | Druckmeldungen |")
    w("|---|---|---|---|---|" + "---|" * len(pl) + "---|")
    for name, zg, pz, nm in kal["laeufe"]:
        w(f"| {name} | **{zg['bereit']}/{zg['gesamt']}** | {zg['eingeschraenkt']} | {zg['ausgefallen']} | {zg['verwundete']} | "
          + " | ".join(f"{pz[p['id']][0]} % {STUFE.get(pz[p['id']][1], pz[p['id']][1])} ({pz[p['id']][2]} Tr.)" for p in pl) + f" | {nm} |")
    w("")
    w(kal["text"][0].split(": ", 1)[1].join(["**Ergebnis:** ", "."]))
    w("")
    for team in ("naiv", "ideal"):
        v = SIM.verluste_lauf(d, team)
        quelle = {}
        for e in v["zeitlinie"]:
            if e["schaden"]:
                quelle.setdefault(e["panzer"], {}).setdefault(e["quelle"], 0)
                quelle[e["panzer"]][e["quelle"]] += e["schaden"]
        w(f"*Woher der Schaden kommt – {team}:* " + "; ".join(
            f"{pname[p['id']]} " + ", ".join(f"{q} {s} %" for q, s in sorted(quelle.get(p["id"], {}).items(), key=lambda x: -x[1]))
            for p in pl if quelle.get(p["id"])) + ".")
        w("")
    w("Wer ARGUS folgt (*naiv*), verrät mit der Attrappe 1/2 an die Feindartillerie und verliert mit BEKÄMPFEN auf die PT-91 (S3) E-01; "
      "*ideal* zahlt mit 1/1 (S5) und 1/4 (S4) – das ist der Preis des Abwartens.")
    w("")
    extra = [g for g in sz.get("verstaerkungen", {}).get("gruppen", []) if g["id"] in SIM.VERSTAERKUNG_ZU_SPAET
             and g["id"] not in SIM.VERSTAERKUNG_STANDARD]
    for g in extra:
        typen = {z["typ"] for z in g.get("ziele", [])}
        if typen and not typen & set(vr["waffen"]):
            w(f"{g['id']} ({g['kurz']}) hat keine Waffe: Die Verstärkung macht Arbeit, ändert aber die Verluste nicht.")
            w("")
    # S4 im Detail
    z19 = next((z for z in sz["ziele"] if z["id"] == "Z-19"), None)
    m18 = next((m for m in sz["meldungen"] if m.get("fall") == "S4" and not m.get("folge_von")), None)
    m23 = next((m for m in sz["meldungen"] if m.get("fall") == "S4" and m.get("folge_von")), None)
    if z19 and m18 and m23 and z19.get("feuert"):
        dauer = sz["spieluhr"]["dauer_s"]
        f0 = z19["feuert"][0]
        pz19 = f0.get("auf")
        teile, warten = [], None
        for team in ("naiv", "ideal"):
            det = []
            SIM.lauf(d, team, det)
            e = next((x for x in det if x.get("ziel") == "Z-19" and x.get("t_wirkung")), None)
            v = SIM.verluste_lauf(d, team)
            s_end = v["verluste"][pz19]
            ende_txt = f"{pname[pz19]} bei Spielende {s_end['zustand']} % {STUFE[s_end['stufe']]} ({V.treffer_text(s_end['treffer'])})"
            if e and e["m"] == m18["id"] and e["t_wirkung"] < dauer:
                zivil = " – mit den Zivilpersonen im Hof, daher I-09" if e.get("schutz") else ""
                teile.append(f"*{team}* bekämpft schon {zn(e['m'])} ({e['m']}), Einschlag {uhr(e['t_wirkung'])}{zivil}; {ende_txt}")
            else:
                bei = f"erst {zn(e['m'])} ({e['m']})" if e else "nicht"
                ende = (f"Einschlag {uhr(e['t_wirkung'])}" if e and e["t_wirkung"] < dauer else
                        "der Einschlag käme nach Spielende" if e else "der Mörser bleibt stehen")
                teile.append(f"*{team}* wartet und bekämpft {bei}, {ende}; {ende_txt}")
                warten = (V.stand(d, v["zeitlinie"], m18["t_s"])[pz19], V.stand(d, v["zeitlinie"], m23["t_s"])[pz19])
        w(f"**S4 – der Preis des Abwartens:** Der Mörser im Hof RABE (Z-19) schießt ab {uhr(f0['von_s'])} auf {pname[pz19]} und schießt sich "
          "ein (zwei Salven daneben, dann im Ziel); er hört erst auf, wenn er bekämpft ist. "
          + (f"Zur Meldung um {uhr(m18['t_s'])} hat {pname[pz19]} {warten[0]['zustand']} %; bis zur Folgemeldung um {uhr(m23['t_s'])} sinkt er auf "
             f"{warten[1]['zustand']} % ({V.treffer_text(warten[1]['treffer'])}) – das ist die Wartezeit. " if warten else "")
          + "; ".join(teile) + ".")
        w("")
    # S5 und S7: Feuer, solange sie stehen
    quellen = {"Z-41": "S5 (SPz hinter den Schutzschilden)", "Z-42": "S7 (Beobachter im Kirchturm)"}
    zmap = {z["id"]: z for z in sz["ziele"]}
    if all(q in zmap and zmap[q].get("feuert") for q in quellen):
        teile = []
        for team in ("naiv", "ideal"):
            v = SIM.verluste_lauf(d, team)
            je = []
            for q in quellen:
                ev = [e for e in v["zeitlinie"] if e.get("quelle") == q]
                tr = [e for e in ev if e["ergebnis"] == "treffer"]
                je.append(f"{q} {len(ev)} Schüsse, {len(tr)} Treffer, {sum(e['schaden'] for e in ev)} %" + (f" bis {uhr(max(e['t'] for e in ev))}" if ev else ""))
            teile.append(f"*{team}*: " + ", ".join(je))
        a41, a42 = zmap["Z-41"]["feuert"][0], zmap["Z-42"]["feuert"][0]
        w(f"**S5 und S7 – Feuer, solange sie stehen:** Der SPz Z-41 vor dem Wohnhaus (S5) feuert ab {uhr(a41['von_s'])} auf "
          f"{pname.get(a41.get('auf'), '–')}, der Beobachter Z-42 im Kirchturm (S7) lenkt ab {uhr(a42['von_s'])} Artillerie auf "
          f"{pname.get(a42.get('auf'), '–')}. Beides hört erst auf, wenn das Ziel bekämpft ist: " + "; ".join(teile) + ".")
        w("")
    for team in ("naiv", "ideal"):
        v = SIM.verluste_lauf(d, team)
        w(f"**Lagemeldungen mit dem Stand der Kp – Modellteam {team}:** "
          + "; ".join(f"{i} „{t}“" for i, t in v["injects_text"].items()) + ".")
        w("")
        w("| Uhr | Nr | Panzer | Stufe | Text |")
        w("|---|---|---|---|---|")
        for k in v["meldungen"]:
            w(f"| {uhr(k['t'])} | {k['inject']} | {pname.get(k['zug'], k['zug'])} | {k['stufe']} | {k['text']} |")
        w("")


def md(d, r):
    sz0 = d["szenario"]
    # Texte wie in der Anzeige (Spieluhr, Zielnummern); Kennungen und Zahlen bleiben, gerechnet wird mit d.
    sz = L.anzeige_szenario(sz0)
    regeln = L.anzeige_daten(d["regeln"], sz0)
    wm = L.anzeige_daten(d["wirkmittel"], sz0)
    karte, fz = d["karte"], d["fahrzeuge"]
    basis = L.basis_nummern(sz0)
    uhr = lambda t: L.uhrzeit(None, t)
    # Texte, die schon in Spieluhr-Zeit stehen (Simulation, Lösungshilfe): nur Rollen und Zielnummern
    AT = lambda s: L.meldungen_im_text(L.rollen_im_text(s), basis)
    zn = lambda mid: f"Ziel {basis[mid]}" if mid in basis else mid
    znm = lambda mid: f"Ziel {basis[mid]} ({mid})" if mid in basis else mid
    dauer = sz0["spieluhr"]["dauer_s"]
    W_, H_ = karte["ausdehnung_m"]["breite"], karte["ausdehnung_m"]["hoehe"]
    pqk = lambda p: L.pq((min(max(p[0], 0), W_ - 1), min(max(p[1], 0), H_ - 1)), karte)   # Planquadrat, am Kartenrand geklemmt
    ziele = {z["id"]: z for z in sz["ziele"]}
    hilfe = {h["meldung"]: h for h in r["meldungen"]}
    kz = r["kennzahlen"]
    meld = {m["id"]: m for m in sz["meldungen"]}
    hg = (sz.get("hintergrund") or {}).get("ereignisse", [])
    vg = (sz.get("verstaerkungen") or {}).get("gruppen", [])
    dbg = (sz.get("durchbruch") or {}).get("gruppen", [])
    n_neben = len(sz.get("nebenfaelle", []))
    n_schluessel = len(sz["schluesselfaelle"])
    neu = [f["id"] for f in sz["schluesselfaelle"] if f.get("zuschaltbar")]
    eloka = sz0.get("eloka")
    et0 = sz0.get("eigene_truppe") or {}
    etn = et0.get("name", "eigene Truppe")            # seit F5 „1. Kp“ (Absender, Kopfzeile)
    ete = et0.get("einheit", etn)                     # seit F5 „1./PzBtl 613“
    # Hintergrundgefecht vernichtet ohne Zutun der Teams (für die EloKa-Zeit ohne Bekämpfung)
    zerst_hg = {h["ziel"]: h["t_s"] for h in hg if h["art"] == "panzerabwehr" and h.get("folge") == "zerstoert"}
    gestoert = lambda m: bool(eloka) and L.eloka_aktiv(sz0, zerst_hg, m["t_s"])
    # Probelauf einmal rechnen (Abschnitte 8 und 14)
    lauf = {}
    for team in ("naiv", "ideal"):
        det = []
        log, ts, inj, rest, ende = SIM.lauf(d, team, det)
        durch = next((e["durchgebrochen"] for e in det if "durchgebrochen" in e), [])
        verl = next((e for e in det if "verluste" in e), None)
        lauf[team] = {"log": log, "ts": ts, "inj": inj, "rest": rest, "ende": ende, "durch": durch, "verluste": verl}
    o = []
    w = o.append

    # ------------------------------------------------------------------ Kopf
    w(f"# Drehbuch Planspiel ARGUS · Szenario {sz.get('anzeige', sz['id'])}")
    w("")
    w(f"**{sz['titel']}** · Version {sz['version']} · Stand {sz['stand']}  ")
    w("Erzeugt aus `claude/daten/` mit `claude/tools/gen_drehbuch.py`. Inhalte in den JSON-Dateien ändern, nicht hier.  ")
    w(f"*{sz['fiktiv']}*")
    w("")
    w("## 1 Überblick")
    w("")
    w("Das Planspiel ist Teil des Teilblocks „Auswirkungen von KI auf die Entscheidungsfindung“ im Seminar Militärethik. "
      "Teilziel: Die TT kennen die grundlegende Funktionsweise von KI in einer Entscheidungskette und verstehen die ethischen "
      "Herausforderungen im Umgang mit KI im militärischen Kontext.")
    w("")
    w("| Phase | Dauer | Inhalt |")
    w("|---|---|---|")
    for a in sz["ablauf_unterricht"]:
        w(f"| {a['phase']} | {a['dauer_min']} min | {a['inhalt']} |")
    w("")
    w("**Spielform (seit 2.6):** 15 TT in **7 Teams** (sechs zu zweit, eines zu dritt). Jedes Team ist die Zielbearbeitung des Bataillons: "
      "2–3 Personen an **einem Laptop**, **eine Entscheidung je Meldung** – BEKÄMPFEN mit Mörser, Loitering Munition oder Kanone, ZURÜCKSTELLEN "
      "oder ABLEHNEN. Der Fokus liegt auf dem **Tempo**: Wie lange schaut ein Team auf eine Meldung, bevor es entscheidet? (Bezug „Lavender“: "
      "20 s je Ziel, der Mensch als Stempel.) Alle Teams spielen dieselbe Lage parallel; **jeder Team-Laptop rechnet sein Spiel selbst**, das "
      "Netz trägt nur Lobby, Start, Status an die Spielleitung und den Upload des Protokolls. Spielleitung 2 Personen. Bis 2.5 gab es drei "
      "Rollen (Aufklärung, Zielprüfung, Führung) an drei Rechnern.  ")
    w(f"**Umfang je Team:** {kz['meldungen']} ARGUS-Meldungen ({len(kz['zugmeldungen'])} davon zugweise) zu {kz['fahrzeuge_gemeldet']} "
      f"gemeldeten Fahrzeugen und Stellungen, {kz['zielobjekte']} Zielobjekte im Raum, {len(sz['injects'])} Lagemeldungen an das Team "
      f"(davon {sum(1 for i in sz['injects'] if i.get('bedingung'))} bedingt) und die Druckmeldungen der eigenen Kp, {n_schluessel} Schlüsselfälle"
      f"{f' (davon {len(neu)} im Replay zuschaltbar: ' + ', '.join(neu) + ')' if neu else ''}, {n_neben} Nebenfälle. "
      f"Dazu {len(hg)} Ereignisse im Hintergrundgefecht, {len(dbg)} Feindgruppen, die durchbrechen, wenn sie nicht aufgehalten werden, und "
      f"{len(vg)} vorbereitete Verstärkungen.  ")
    w(f"**ARGUS-Bilanz:** {kz['argus_richtig']} Empfehlungen richtig, {kz['argus_falsch']} falsch "
      f"({', '.join(znm(x) for x in kz['falsch_meldungen'])}). Mittlere Konfidenz bei falschen Empfehlungen {zahl(kz['konfidenz_falsch_mittel'])} %, "
      f"bei richtigen BEKÄMPFEN-Empfehlungen {zahl(kz['konfidenz_richtig_bekaempfen_mittel'])} % (Werte der Daten, ohne EloKa-Störung).  ")
    w(f"**Lösung je Meldung (seit 2.6 eine Entscheidung):** " + ", ".join(f"{e} {len(v)}" for e, v in kz["loesung"].items()) + ".  ")
    w("**Zielnummern:** Die Spieler sehen jede Meldung als „Ziel n“, nummeriert in der Reihenfolge, in der ARGUS meldet "
      "(Gruppen als „Ziel n (3 Fz)“). Die Nummern sind in allen Teams gleich; Verstärkungen bekommen Buchstaben (8a, 8b …). "
      "In diesem Drehbuch steht die interne Kennung (M07) in Klammern dahinter; die Spielleitung sieht sie auch in der Software klein daneben.  ")
    w("**Kontakte (seit 2.2):** Jedes Fahrzeug, das die Drohne fahren sieht, steht auf der Karte des Teams ab der Einfahrt am Kartenrand als "
      "gelber Kontakt (APP-6 unbekannt), bis seine Meldung kommt – im Wald nicht, ungemeldete Ziele nie. So taucht kein Fahrzeug mitten im "
      "Bild auf. Zugweise Meldungen tragen die Größenangabe nach APP-6 (●● Halbzug/Trupp, ●●● Zug).  ")
    w(f"**Druck (seit 2.3, seit 2.5 mit vier eigenen Kampfpanzern):** Die eigene {etn} ({ete}) steht mit vier Kampfpanzern sichtbar am Westrand und "
      "liegt unter Feuer, solange feuernde Feinde stehen – erst Fehlschüsse, dann Treffer. Wer aus ethischen Gründen wartet (S4, S5, N4, S3), sieht "
      "eigene Panzer getroffen werden und bekommt dringlicher werdende Meldungen der Panzer – das ist gewollt und wird in der Auswertung offengelegt "
      "(„Preis des Abwartens“). Verluste sind Lage, keine Punkte; die Kp hält immer (Abschnitt 9).  ")
    w("**Ethik (seit 2.4, E1–E8):** Die Spieler sehen keine Sensordaten – was zählt, steht im Drohnenbild (Rotes Kreuz, PRESS, Verbände, "
      "Kinder, weißes Tuch, Beobachter mit Fernglas; Abschnitt 5). ARGUS kennt nur drei Klassen (Panzer, Fahrzeug, Infanterie) und meldet "
      "Feind oder unbekannt. BEKÄMPFEN wirkt auf den ganzen Zug. Solange das EloKa-Fahrzeug steht, ist jedes Bild gestört und ARGUS unsicherer. "
      "Schlüsselfälle S5–S8: Schutzschilde (S5), Verwundete am Wrack (S6), Kirchturm-Beobachter (S7), Presse und Familie (S8).")
    w("")
    if sz.get("vorbild"):
        w(f"**Vorbild:** {sz['vorbild']['text']}  ")
        w("Quellen: " + "; ".join(sz["vorbild"]["quellen"]) + ".")
        w("")

    # ------------------------------------------------------------------ Lage
    w("## 2 Lage und Einweisung")
    w("")
    w("Die Lage für alle liest die Spielleitung im Plenum vor; am Team-Laptop öffnet sich danach die Einweisung (Übersicht der Ansicht "
      "mit Pfeilen, dann vier Folien: Phasen, Klassen, Wirkmittel, Los geht’s – ohne Kleingedrucktes, ohne Regelblock, ohne Gegenangriff).")
    w("")
    for key in ("plenum", "team", "spielleitung"):
        l = sz["lage"].get(key)
        if not l:
            continue
        w(f"### {l['titel']}")
        w("")
        for a in l["absaetze"]:
            w(a)
            w("")
    a = sz["argus_system"]
    w(f"### Das System {a['name']}")
    w("")
    w(a["beschreibung"] + " " + a["herstellerangabe"])
    w("")
    w(f"> Kleingedrucktes (im Befehl; im Spiel hinter dem kleinen „i“ an jeder Meldung; in der Auswertung): *{a['kleingedrucktes']}*")
    if a.get("kleingedrucktes_kurz"):
        w(">")
        w(f"> Kurzfassung: *{a['kleingedrucktes_kurz']}*")
    w("")
    w("Empfehlungslogik: " + "; ".join(f"**{k}** {v}" for k, v in regeln["argus"]["empfehlungen"].items()) + ".")
    w("")
    if regeln["argus"].get("klassen"):
        w(f"**Klassen (E6.2):** {regeln['argus']['klassen']}")
        w("")
    if regeln["argus"].get("eloka"):
        w(f"**EloKa (E4):** {regeln['argus']['eloka']}")
        w("")

    # ------------------------------------------------------------------ Regeln
    w("## 3 Spielregeln")
    w("")
    w("### Ablauf je Meldung")
    w("")
    w("| Stufe | Entscheidung | sieht |")
    w("|---|---|---|")
    for st in regeln["ablauf"]:
        akt = " / ".join(st.get("aktionen", [])) or st.get("aktion", "")
        if st.get("zusatz"):
            akt += f" · {st['zusatz']}"
        w(f"| {rolle(st['stufe'])} | {akt} | {', '.join(st.get('sieht', [])) or '–'} |")
    w("")
    w("### Einsatzregeln (RoE)")
    w("")
    for e in regeln["einsatzregeln"]["regeln"]:
        w(f"- **{e['id']}** {e['text']} *(prüft {rolle(e['prueft'])})*")
    w(f"- {regeln['einsatzregeln']['verstoss']}")
    w("")
    w("### Wirkmittel (Spielwerte)")
    w("")
    w("| Wirkmittel | Wirkradius | Zeit bis zum Einschlag | Bestand je Team | BEKÄMPFEN auf einen Zug | Einsatzbereich |")
    w("|---|---|---|---|---|---|")
    for x in wm.values():
        w(f"| {x['name']} ({x['kurz']}) | {x['wirkradius_m']} m{' (trifft nur das bekämpfte Fahrzeug)' if x.get('nur_zielfahrzeug') else ''} | "
          f"{x.get('vorlauf_text') or L.mmss(x['vorlauf_s']) + ' min'} | "
          f"{x['bestand'] if x['bestand'] is not None else 'unbegrenzt'} | {zug_text(x)} | {(x['einsatzbereich'] or {}).get('text', 'ganzer Raum')} |")
    w("")
    w("*Spielwerte, keine Leistungsdaten. Alle Wirkmittel wirken gegen alle Zielarten.*")
    w("")
    w("### Weitere Regeln")
    w("")
    wr = regeln["wirkung"]
    w("- **Tempo (seit 2.6, H2.4):** Jede Entscheidung trägt die Sekunden ab Eingang und ab Öffnen ins Protokoll; die Auswertung fragt "
      "„Wie lange habt ihr hingeschaut?“. Die Meldungen kommen weiter nach Zeitplan, auch wenn der Eingang voll ist. Fast-Track gibt es "
      "seit 2.6 nicht mehr (ohne getrennte Aufklärung hätte er keine Wirkung); der Vergleich mit der Automatik kommt mit Liste G.")
    w(f"- **Treffer:** {wr['trefferregel']} {wr['begruendung']}")
    if wr.get("zug"):
        w(f"- **Zug (E3):** {wr['zug']}")
    if wr.get("praezision"):
        w(f"- **Präzision:** {wr['praezision']}")
    if wr.get("vorhersage"):
        w(f"- **Warnung mit Vorhalt:** {wr['vorhersage']}")
    if wr.get("bewegung"):
        w(f"- **Bewegung und Spuren:** {wr['bewegung']}")
    if wr.get("hintergrund"):
        w(f"- **Hintergrundgefecht:** {wr['hintergrund']}")
    if wr.get("durchbruch"):
        w(f"- **Durchbruch:** {wr['durchbruch']}")
    if regeln.get("verluste"):
        w(f"- **Eigene Verluste (seit 2.3, seit 2.5 je Panzer):** Feuernde Feinde, die noch stehen, schießen sich auf die vier Panzer der {etn} ein "
          "(erst daneben, dann Treffer); Bekämpfen stoppt das Feuer. Die Panzer stehen mit Zustand in der Kopfzeile des Teams und melden Feuer "
          "und Treffer im Feed (Abschnitt 9).")
    if regeln.get("sensordaten"):
        w(f"- **Sensordaten (E6.3):** {regeln['sensordaten']}")
    if regeln.get("spielleitung"):
        w(f"- **Spielleitung (E1):** {regeln['spielleitung']['hinweis']}")
    w(f"- **Eingang:** {wr['unbearbeitet']}")
    w("")
    w("### Zonen und eigene Kräfte")
    w("")
    for z in sz["zonen"]:
        extra = f", nur Wirkradius ≤ {z['max_wirkradius_m']} m" if z["typ"] == "einschraenkung" else ", kein Wirkradius darf sie berühren"
        art = "No-Strike-Zone" if z["typ"] == "no_strike" else "Einschränkungsgebiet"
        w(f"- **{L.zonen_name(z)}** ({art}: {z['name']}){extra} (Regel {z['regel']}, intern {z['id']})")
    for k in sz["kraefte"]:
        if k.get("ausserhalb"):
            w(f"- **{k['name']}** westlich außerhalb der Karte ({k['text']}), auf der Karte nur als Pfeil am Westrand")
        else:
            et_ = sz.get("eigene_truppe") or {}
            ueb = et_.get("uebergeordnet", "")
            ueb = f" (übergeordnet {ueb})" if ueb and ueb not in k["name"] else ""
            txt = k.get("text", "")
            txt = txt[len(k["name"]):] if txt.startswith(k["name"]) else f"{ueb}: {txt}"      # Text beginnt mit dem Namen: nicht doppeln
            w(f"- **{k['name']}**{txt}" if et_.get("panzer") else
              f"- **{k['name']}** {k.get('text', '')} (Gefechtsstand bei {L.pq(k['pos'], karte)})")
    et_ = sz.get("eigene_truppe") or {}
    for pz in et_.get("panzer", []):
        w(f"  - {pz['name']}{' (' + pz['rolle'] + ')' if pz.get('rolle') else ''} {pz['ort']}: Kampfpanzer Leopard 2A7V bei "
          f"{L.pq(pz['pos'], karte)} ({pz['pos'][0]}, {pz['pos'][1]}), Blick nach Osten")
    if regeln.get("eigene_kraefte"):
        w(f"- {regeln['eigene_kraefte']}")
    w("")

    # ------------------------------------------------------------------ Gefechtsablauf
    w(f"## 4 Gefechtsablauf und Zeitleiste (Spieluhr {uhr(0)}–{uhr(dauer)})")
    w("")
    w("### Phasen")
    w("")
    w("Phase 5 heißt seit 2.6 „Krise“ (H3.2): Der polnische Gegenangriff darf vorher nirgends sichtbar sein – nicht im Phasennamen, nicht "
      "in der Einweisung, nicht im Plenum, nicht in der Zeitleiste der Teams. Die Teams erfahren davon nur aus der Lagemeldung im Feed (S3).")
    w("")
    w("| Zeit | Phase | Feind und Gefecht | Meldungen | Fälle |")
    w("|---|---|---|---|---|")
    for p in sz.get("phasen", []):
        ms = [m for m in sz["meldungen"] if m.get("phase") == p["nr"]]
        faelle = sorted({m["fall"] for m in ms if m.get("fall")})
        w(f"| {uhr(p['von_s'])}–{uhr(p['bis_s'])} | {p['nr']} {p['name']} | {p['absicht']} | {len(ms)} | {', '.join(faelle) or '–'} |")
    w("")
    if kz.get("groesste_luecken"):
        w("**Meldedichte:** im Hauptangriff etwa alle 30 s eine Meldung; die größten Pausen ohne neue Meldung sind "
          + ", ".join(f"{g['s']:.0f} s ab {g['von']}" for g in kz["groesste_luecken"])
          + " (höchstens 60 s, sonst mit Absicht im Szenario vermerkt). Folgemeldungen entfallen, wenn ein Team das Fahrzeug vorher "
          "bekämpft hat; dann ist die Pause bei diesem Team länger.")
        w("")
    if eloka:
        z23 = ziele[eloka["ziel"]]
        gm = [m for m in sz0["meldungen"] if gestoert(m)]
        w(f"**EloKa (E4.2):** Das EloKa-Fahrzeug {eloka['ziel']} steht von {uhr(L.ab_s(z23))} bis {uhr(z23['bis_s'])} im Raum (wenn niemand es "
          f"bekämpft). In dieser Zeit sind die Bilder gestört und ARGUS meldet um {eloka['konfidenz_minus']} Punkte unsicherer, unter "
          f"{eloka['unbekannt_unter']} % „unbekannt“. Bewusst zwischen S1 und S2 gelegt: Gestört sind nur "
          f"{', '.join(znm(m['id']) for m in gm)} – kein Schlüssel- oder Nebenfall, die Merkmale der Fälle bleiben klar. Wer das Fahrzeug früh "
          f"bekämpft ({znm(next(m['id'] for m in sz0['meldungen'] if eloka['ziel'] in m['ziele']))}), hat sofort wieder klare Bilder.")
        w("")
    w("### Zeitleiste")
    w("")
    w("Feste Ereignisse in zeitlicher Reihenfolge (Spieluhr). **Fett** = Schlüsselfall. Bedingte Injects stehen bei ihrem Auslöser. "
      "H = Hintergrundgefecht (läuft von selbst, für alle Teams gleich). D = Durchbruch, wenn die Gruppe bis dahin nicht aufgehalten ist. "
      "Die Druckmeldungen der Panzer hängen vom Team ab (Abschnitt 9). „EloKa:“ = so meldet ARGUS, solange das EloKa-Fahrzeug steht.")
    w("")
    ev = [(m["t_s"], "M", m) for m in sz["meldungen"]] + [(i["t_s"], "I", i) for i in sz["injects"] if "t_s" in i]
    ev += [(e["wirkungen"][0]["t_s"], "E", e) for e in sz.get("ereignisse", [])]
    ev += [(h["t_s"], "H", h) for h in hg]
    ev += [(g["t_s"], "D", g) for g in dbg]
    ev.sort(key=lambda e: (e[0], "HIMED".index(e[1])))
    phasen = sz.get("phasen", [])
    w("| Uhr | Ereignis | Inhalt | an | Fall |")
    w("|---|---|---|---|---|")
    pi = 0
    for t, art, e in ev:
        while pi < len(phasen) and t >= phasen[pi]["von_s"]:
            p = phasen[pi]
            w(f"| | **Phase {p['nr']}: {p['name']}** | | | |")
            pi += 1
        if art == "M":
            k, konf = klasse(e)
            a = e["argus"]
            h = hilfe[e["id"]]
            inh = f"{k} · {konf} % · {a['empfehlung']}"
            if gestoert(meld[e["id"]]):
                ag = L.argus_bei(e, sz0, d["regeln"], True)
                kg, kfg = klasse(e, ag)
                inh += f" · **EloKa:** {kg} · {kfg} % · {ag['empfehlung']}"
            inh += f" · PQ {h['pq']} · {e['sensor']['bewegung']}"
            fall = e.get("fall") or ""
            b = "**" if fall.startswith("S") else ""
            w(f"| {uhr(t)} | {b}{zn(e['id'])}{b} ({e['id']}) · {zl(e['ziele'])} | {inh} | Team | {b}{fall}{b} |")
            for i in sz["injects"]:
                bed = i.get("bedingung")
                if bed and set(bed.get("ziele", [])) & set(e["ziele"]) and e.get("folge_von") is None:
                    txt = bedingung_text(bed, uhr, kurz=True)
                    w(f"| ↳ | {i['id']} (bedingt) | {txt}: „{i['text'][:70]}{'…' if len(i['text']) > 70 else ''}“ | {an_text(i['an'])} | {i.get('fall', '')} |")
        elif art == "E":
            bed = e["bedingung"]
            ziele_w = ", ".join(x["ziel"] for x in e["wirkungen"])
            w(f"| {uhr(t)} | **{e['id']}** Ereignis (bedingt) | {e['name']}: wenn bis {uhr(bed['t_s'])} nicht auf "
              f"{'/'.join(bed['ziele'])} gewirkt, wirken die PT-91 nacheinander auf {ziele_w} (nur Ziele, die noch stehen). {e['papier']} | SL | **{e.get('fall', '')}** |")
        elif art == "H":
            ziel = f" → {e['ziel']}" if e["art"] == "panzerabwehr" else ""
            w(f"| {uhr(t)} | {e['id']} {ART_TEXT.get(e['art'], e['art'])}{ziel} | *{e['text']}* | – | |")
        elif art == "D":
            erst = min(e["ueber_s"].values())
            w(f"| {uhr(t)} | {e['id']} Durchbruch (bedingt) | *{e['name']} ({zl(e['ziele'])}): wenn bis jetzt nicht aufgehalten, über "
              f"{e['ueber']}, erstes Fahrzeug über dem Bach {uhr(erst)}; dann I-13.* | – | |")
        else:
            fall = e.get("fall") or ""
            b = "**" if fall else ""
            w(f"| {uhr(t)} | {b}{e['id']}{b} Inject | {e['von']}: „{e['text'][:80]}{'…' if len(e['text']) > 80 else ''}“ | {an_text(e['an'])} | {b}{fall}{b} |")
    w(f"| {uhr(dauer)} | **Spielende** | Uhr anhalten, Ansichten sperren, Plenum | alle | |")
    w("")

    # ------------------------------------------------------------------ Meldungen
    w("## 5 ARGUS-Meldungen (Sicht des Teams)")
    w("")
    w("Seit 2.4 (E6.3) sehen die Spieler keine Sensordaten: Was zählt, steht im Bild (Spalte „Im Bild erkennbar“, mit der Lupe zu sehen; geprüft mit "
      "`tools/drohne_probe.py`). Die Sensordaten bleiben als Hilfe für die Spielleitung.")
    w("")
    w("| Ziel | Uhr | Fahrzeuge | PQ | ARGUS | Im Bild erkennbar | Bild | Sensordaten (nur Spielleitung) |")
    w("|---|---|---|---|---|---|---|---|")
    for m in sz["meldungen"]:
        a, s = m["argus"], m["sensor"]
        k, konf = klasse(m)
        arg = f"{k} · {konf} % · **{a['empfehlung']}**" + (f"<br>*{a['hinweis']}*" if a.get("hinweis") else "")
        if gestoert(meld[m["id"]]):
            ag = L.argus_bei(m, sz0, d["regeln"], True)
            kg, kfg = klasse(m, ag)
            arg += f"<br>EloKa: {kg} · {kfg} % · {ag['empfehlung']}"
        sen = " · ".join(s[x] for x in ("waerme", "bewegung", "spuren", "kennzeichnung", "personen"))
        if s.get("bildalter_s"):
            sen += f" · Bildalter {s['bildalter_s']} s"
        mk = "; ".join(x["text"] for x in m["bild"].get("merkmale") or []) or "–"
        sv = m["bild"].get("sicht") or []
        bild = m["bild"]["beschreibung"]
        if sv:
            bild += " · **Sicht:** " + ", ".join(f"{SICHT_TEXT[x['art']]} {round(x['anteil'] * 100)} %" for x in sv)
        if gestoert(meld[m["id"]]):
            bild += f" · **EloKa:** Rauschen und Streifen, Bildalter + {eloka['bildalter_plus_s']} s"
        gr = f" ({len(m['ziele'])} Fz)" if len(m["ziele"]) > 1 else ""
        w(f"| {zn(m['id'])}{gr} · {m['id']} | {uhr(m['t_s'])} | {zl(m['ziele'])} | {hilfe[m['id']]['pq']} | {arg} | {mk} | {bild} | {sen} |")
    w("")

    # ------------------------------------------------------------------ Injects
    w("## 6 Lagemeldungen an das Team (Injects, Feed)")
    w("")
    w("Höchstens 140 Zeichen mit Absender, Funkstil Absender – Lage – Forderung. Seit 2.6 stehen sie im schmalen Feed am Rand der Ansicht: "
      "Eine neue steht ca. 8 s oben, dann rutscht sie in „frühere Meldungen“ – unter Druck läuft der Feed leicht unter (S3 lebt davon). "
      "Platzhalter in geschweiften Klammern füllt das Spiel mit dem Stand dieses Teams ({pz} Panzer, {treffer} seine Treffer, {zustand} sein "
      "Zustand, {verw} seine Verwundeten; {bereit}/{gesamt} einsatzbereite Panzer und {zug_verw} Verwundete der Kp).")
    w("")
    w("| Nr | Zeitpunkt | von | Text | Zweck |")
    w("|---|---|---|---|---|")
    for i in sz["injects"]:
        bed = i.get("bedingung")
        zp = bedingung_text(bed, uhr) if bed else uhr(i["t_s"])
        vp = i.get("verluste_panzer")
        pzn = {p["id"]: p["name"] for p in (sz.get("eigene_truppe") or {}).get("panzer", [])}
        zug = (f" *(Panzer: der zuletzt durch den Durchbruch getroffene)*" if vp == "durchbruch" else
               f" *(Panzer {pzn.get(vp, vp)})*" if vp else "")
        w(f"| {i['id']} | {zp} | {i['von']} | {i['text']}{zug} | {i['zweck']} |")
    w("")
    w("**Reserve (nur durch SL 1, nach Lage, für ein Team oder alle):**")
    w("")
    for i in sz.get("reserve_injects", []):
        an = "an alle" if i["an"] == "alle" else f"an das {an_text(i['an'])}"
        w(f"- **{i['id']}** {an} ({i['von']}): „{i['text']}“ – {i['einsatz']}")
    w("")

    # ------------------------------------------------------------------ Hintergrundgefecht
    w("## 7 Hintergrundgefecht")
    w("")
    w((sz.get("hintergrund") or {}).get("hinweis", ""))
    w("")
    w("| Nr | Uhr | Art | von | Ziel | Folge | Text |")
    w("|---|---|---|---|---|---|---|")
    zugname = {p["id"]: p["name"] for p in (sz.get("eigene_truppe") or {}).get("panzer", [])}
    for h in hg:
        ziel = h.get("ziel", "")
        if h["art"] == "panzerabwehr":
            ziel = f"{ziel} ({fz[ziele[ziel]['typ']]['name']})"
        folge = {"zerstoert": "zerstört, Wrack brennt", "ausser_gefecht": "außer Gefecht"}.get(h.get("folge"), "Darstellung")
        if h["art"] == "feindartillerie" and zugname:
            folge = f"Treffer an Panzern im Umkreis {d['regeln']['verluste']['feindartillerie']['radius_m']} m (Verlustmodell)"
        w(f"| {h['id']} | {uhr(h['t_s'])} | {ART_TEXT.get(h['art'], h['art'])} | {zugname.get(h.get('von'), h.get('von', ''))} | {ziel} | {folge} | {h['text']} |")
    w("")
    zerst = kz["hintergrund_zerstoert"]
    ag = [h["ziel"] for h in hg if h.get("folge") == "ausser_gefecht"]
    ganz = [m["id"] for m in sz["meldungen"] if all(z in zerst for z in m["ziele"])]
    teil = [m["id"] for m in sz["meldungen"] if any(z in zerst for z in m["ziele"]) and m["id"] not in ganz]
    letzte = max(h["t_s"] for h in hg if h["art"] == "panzerabwehr")
    w(f"Die Kanonen der {etn} zerstören bis {uhr(letzte)} {len(zerst)} Fahrzeuge ({', '.join(sorted(zerst))})"
      + (f" und setzen {', '.join(ag)} außer Gefecht" if ag else "") + ". "
      f"Hat ein Team {'die Meldungen' if len(ganz) > 1 else 'die Meldung'} {', '.join(znm(x) for x in ganz)} bis dahin nicht bearbeitet, "
      f"{'verschwinden sie' if len(ganz) > 1 else 'verschwindet sie'} aus dem Eingang, weil jedes Fahrzeug zerstört ist"
      + (f"; bei {', '.join(znm(x) for x in teil)} fällt ein Teil der Fahrzeuge weg" if teil else "") + ". "
      "Ein langsames Team wird so entlastet, ein schnelles hat die Ziele vorher selbst bekämpft. Hat ein Team ein Ziel schon getroffen, "
      "entfällt der Schuss der Kp. Ist der vorgesehene Panzer ausgefallen, schießt der nächste einsatzbereite (F1.5) – das Drehbuch bleibt gleich.")
    w("")
    feuer = [z for z in sz["ziele"] if z.get("feuert")]
    if feuer:
        w("**Feuer im Bild:** " + "; ".join(
            f"{z['id']} ({fz[z['typ']]['name']}) " + ", ".join(f"{uhr(f['von_s'])}–{uhr(f['bis_s'])}" for f in z["feuert"])
            + (f" auf {zugname.get(z['feuert'][0]['auf'], z['feuert'][0]['auf'])}" if z["feuert"][0].get("auf") else "")
            for z in feuer) + ". Feuerstöße nach Schussrhythmus mit Mündungsblitz und Abschussrauch (Karte und Live-Drohnenbild), solange "
          "das Fahrzeug steht (der Beobachter im Kirchturm feuert nicht selbst: kein Mündungsblitz); das Team sieht es nur, wenn es das "
          "Fahrzeug aus einer Meldung kennt. Das Feuer auf die eigenen Panzer sieht es immer (seit 2.6, H5.7). Fahrende Fahrzeuge wirbeln Staub auf.")
        w("")

    # ------------------------------------------------------------------ Durchbruch
    w("## 8 Durchbruch (wenn eine Feindgruppe nicht aufgehalten wird)")
    w("")
    w((sz.get("durchbruch") or {}).get("hinweis", ""))
    w("")
    w("| Nr | Gruppe | Fahrzeuge | Zeitpunkt | über | erstes Fahrzeug über dem Bach | Hinweis |")
    w("|---|---|---|---|---|---|---|")
    for g in dbg:
        w(f"| {g['id']} | {g['name']} | {zl(g['ziele'])} | {uhr(g['t_s'])} | {g['ueber']} | {uhr(min(g['ueber_s'].values()))} | {g.get('zweck', '')} |")
    for g in vg:
        db = g.get("durchbruch")
        if db:
            w(f"| {g['id']} | {g['name']} (Verstärkung) | {g['kurz']} | +{db['t_s']} s nach dem Einspielen | {db['ueber']} | "
              f"+{round(min(db['ueber_s'].values()))} s | Wird der Zug nicht aufgehalten, bricht er durch, sonst zieht er ab oder bleibt stehen. |")
    w("")
    satz = []
    for team in ("ideal", "naiv"):
        du = lauf[team]["durch"]
        if not du:
            satz.append(f"beim Team „{team}“ bricht niemand durch")
            continue
        gr = [g for g in dbg if set(g["ziele"]) & set(du)]
        i13 = next((x.split(" um ")[1] for x in lauf[team]["inj"] if x.startswith("I-13")), None)
        satz.append(f"beim Team „{team}“ brechen {', '.join(du)} durch ({', '.join(g['id'] for g in gr)} über "
                    f"{' und '.join(sorted({g['ueber'] for g in gr}))}" + (f"; I-13 um {i13}" if i13 else "") + ")")
    w(f"Im Probelauf (Abschnitt 14) {satz[0]}; {satz[1]}. Bekämpft ein Team die PT-91 (S3), fällt der polnische Gegenangriff E-01 aus, so "
      "dass die letzten Feindkräfte an der Brücke Ost nicht aufgehalten werden. Die Lagemeldung I-13 („Feind über den Bach ELSTER eingebrochen“) "
      "kommt 10 s nach dem ersten Fahrzeug über dem Bach; der Übergang trifft die Panzer am Übergang (Abschnitt 9). In der Auswertung steht "
      "der Durchbruch als Kennzahl je Team, nicht als Punkte; das Gefecht ist weiter nicht zu verlieren.")
    w("")

    # ------------------------------------------------------------------ Eigene Truppe und Verluste (seit 2.3)
    verluste_abschnitt(d, w, uhr, zn)

    # ------------------------------------------------------------------ Verstärkungen
    w("## 10 Verstärkungen (Spielleitung)")
    w("")
    sl = regeln.get("spielleitung") or {}
    if sl.get("verstaerkung_menue") is False:
        w("**Seit 2.4 (E1) ausgeblendet:** Das Menü „Verstärkung“ ist per Schalter `regeln.spielleitung.verstaerkung_menue: false` aus; der Druck "
          "kommt aus dem Drehbuch selbst (mehr Fahrzeuge, dichtere Meldungen), damit alle Teams gleich spielen. Die Gruppen bleiben in den Daten "
          "und lassen sich mit `true` wieder einblenden; die Tabelle gilt dann unverändert.")
        w("")
    w((sz.get("verstaerkungen") or {}).get("hinweis", ""))
    w("")
    vinfo = {v["meldung"]: v for v in kz["verstaerkungen"]}
    w("| Nr | Gruppe | Fahrzeuge | Meldung (nach dem Einspielen) | zulässig | nicht einspielen | Zweck |")
    w("|---|---|---|---|---|---|---|")
    for g in vg:
        ms = []
        for m in g["meldungen"]:
            k, konf = klasse(m)
            ms.append(f"{m['id']} +{m['dt_s']} s: {k} · {konf} % · {m['argus']['empfehlung']} · {m['sensor']['bewegung']}")
        zul = ", ".join(sorted({w_ for m in g["meldungen"] for w_ in vinfo[m["id"]]["zulaessig"]}))
        ne = ", ".join(f"{uhr(a)}–{uhr(b)}" for a, b in g.get("nicht_einspielen", [])) or "–"
        w(f"| {g['id']} | {g['name']} | {g['kurz']} | {'<br>'.join(ms)} | {zul} | {ne} | {g['zweck']} |")
    w("")
    sim_v = SIM.faelle_erreicht(d, "naiv", SIM.VERSTAERKUNG_STANDARD)
    sim_v5 = SIM.faelle_erreicht(d, "naiv", SIM.VERSTAERKUNG_ZU_SPAET)
    fehlt = [k for k, (ok, _) in sim_v5.items() if not ok]
    zu_spaet = [v for k, v in SIM.VERSTAERKUNG_ZU_SPAET.items() if k not in SIM.VERSTAERKUNG_STANDARD]
    w("**Einsatz (wenn eingeblendet):** Standard ist „an alle Teams“, damit die Teams vergleichbar bleiben. Eine Verstärkung lohnt sich, wenn der Eingang "
      f"eines Teams leer ist. Eine eingespielte Meldung sehen die Spieler als „Ziel 8a“ (Buchstabe hinter der zuletzt gemeldeten Nummer). "
      f"In der Simulation verkraften beide Modellteams {len(SIM.VERSTAERKUNG_STANDARD)} Verstärkungen bis {uhr(max(SIM.VERSTAERKUNG_STANDARD.values()))} "
      f"({', '.join(f'{k} {uhr(v)}' for k, v in SIM.VERSTAERKUNG_STANDARD.items())}): "
      f"{'alle Schlüssel- und Nebenfälle werden erreicht' if all(ok for ok, _ in sim_v.values()) else 'nicht alle Fälle werden erreicht'}. "
      f"Eine weitere Verstärkung um {', '.join(uhr(v) for v in zu_spaet)} schiebt beim Team „naiv“ {', '.join(fehlt) or 'nichts'} hinter das Spielende. "
      f"Deshalb nach {uhr(18 * 60)} keine Verstärkung mehr, wenn ein Team noch Meldungen im Eingang hat. Verstärkungen schießen auch auf die "
      "eigenen Panzer (Abschnitt 9): Sie sollen Arbeit machen, nicht die Kp brechen; die Untergrenze gilt weiter.")
    w("")

    # ------------------------------------------------------------------ Ground Truth und Lösungshilfe
    w("## 11 Ground Truth und Lösungshilfe (nur Spielleitung)")
    w("")
    w(f"„zulässig“ = nach R2/R3 und Einsatzbereich maschinell geprüft, und zwar an der gemeldeten Position (Meldung) und am Einschlagort bei "
      f"BEKÄMPFEN {FREIGABE_RICHTWERT_S} s nach der Meldung (Einschlag; Richtwert; bei Zügen je Einschlag). „Vorhalt“ nennt, "
      "ab oder bis wann sich die Zulässigkeit während der Bearbeitung ändert. Ob das Ziel selbst geschützt ist (R1, R4), prüfen nur die Menschen. "
      "„Achtung“ nennt geschützte Objekte im Wirkradius beim Einschlag mit dem Zeitraum der Entscheidung, in dem das passiert. "
      "„Lösung“ = die eine Entscheidung des Teams nach dem Szenario (seit 2.6).")
    w("")
    w("| Ziel | Fahrzeuge | Ground Truth | ARGUS | zulässig Meldung → Einschlag | Vorhalt | Achtung | Lösung |")
    w("|---|---|---|---|---|---|---|---|")
    for m in sz["meldungen"]:
        h = hilfe[m["id"]]
        z0 = ziele[m["ziele"][0]]
        g0 = L.gt_bei(z0, m["t_s"])
        gt = f"**{GT_TEXT[g0['kategorie']]}**: {g0['text']}"
        arg = "richtig" if not h["argus_falsch"] else "**falsch**"
        ach = []
        for x in h["wirkmittel"]:
            prot = [AT(n["text"]) for n in x["nebenwirkung"] if n["kategorie"] in SCHUTZ]
            if prot and (x["zulaessig_meldung"] or x["zulaessig"] or x["fenster"] not in ("nie",)):
                ach.append(f"{x['wm']}: {'; '.join(prot)}")
        zul = f"{', '.join(h['zulaessig_meldung']) or '—'} → {', '.join(h['zulaessig']) or '—'}"
        w(f"| {znm(m['id'])}{' ' + m['fall'] if m.get('fall') else ''} | {zl(m['ziele'])} | {gt} | {arg} | {zul} | "
          f"{AT('; '.join(h['vorhalt'])) or '–'} | {'<br>'.join(ach) or '–'} | {loesung_text(m)} |")
    w("")
    ung = [z for z in sz["ziele"] if z.get("ungemeldet") or z.get("nur_kontakt")]
    if ung:
        w("**Nicht gemeldete Ziele** (nur auf der Kontrollkarte; ARGUS meldet sie nicht – ungemeldete auch kein Kontakt beim Team, "
          "„nur Kontakt“ als gelber Kontakt):")
        w("")
        for z in ung:
            w(f"- **{z['id']}** {fz[z['typ']]['name']}{' (nur Kontakt)' if z.get('nur_kontakt') else ''}: {z['gt']['text']}")
        w("")
    for e in sz.get("ereignisse", []):
        w(f"**Ereignis {e['id']}: {e['name']}.** {e['regel']} Wirkungen: "
          + ", ".join(f"{uhr(x['t_s'])} {x['von']} → {x['ziel']}" for x in e["wirkungen"]) + ".")
        w("")
    klein = kz["nur_praezision"]
    praez = [x for x in wm.values() if x["wirkradius_m"] <= 50 and not x.get("einsatzbereich")]
    w(f"**Bestand im Blick:** Für {len(klein)} legitime Meldungen ist nur Präzision zulässig ({', '.join(znm(x) for x in klein)}); "
      f"verfügbar sind {' + '.join(str(x['bestand']) + ' ' + x['kurz'] for x in praez)} je Team – ein Zug kostet eine LM je Fahrzeug. "
      f"Wer Fehlziele mit Präzision bekämpft, dem fehlt sie später (Modellteam *ideal* hat ab ca. 22:00 keine LM mehr). "
      f"Der {wm[kz['steilfeuer']]['name'].split(' (')[0]} ist beim Einschlag nur bei {', '.join(znm(x) for x in kz['steilfeuer_zulaessig'])} zulässig. "
      f"Bei {len(kz['sicht_gestoert'])} von {kz['meldungen']} Meldungen ist das Drohnenbild teilweise verdeckt.")
    w("")
    w("### Ziele im Raum")
    w("")
    w("Bewegung als Spielwerte. „im Raum“ = sichtbar auf der Kontrollkarte; jedes Fahrzeug fährt am Kartenrand ein und aus (Ostrand, "
      "Spähtrupp NORD und Beobachter an der Nordstraße am Nordrand, die polnischen PT-91 am Südrand; wer durchbricht, am Westrand), "
      "Stellungen werden bezogen (Mörser auf Lkw, durch den Wald MARDER bzw. über die Hauptstraße in den Hof RABE; der BMP-2 Z-21 verdeckt durch "
      "den Wald DACHS). Nur die Attrappe steht seit Spielbeginn; seit 2.4 kommen die Verwundeten aus ihrem Wrack (herkunft) und der Beobachter "
      "steigt im Kirchturm auf (im_gebaeude). Fahrzeuge einer Meldung halten mindestens 15 m Abstand, alle anderen 10 m; "
      "an den eigenen Panzern fährt keines näher als 25 m vorbei. "
      "Spähtrupp NORD klärt über die Felder westlich bis zur Brücke ELSTER auf, Spähtrupp HAUPT über die Felder südlich der Ortschaft an "
      "der Schule vorbei. Der Hauptangriff verteilt sich auf den Nord- und den Südteil der Ortschaft; die Schule liegt an der Achse SÜD.")
    w("")
    w("| Ziel | Typ | ARGUS-Klasse | Gruppe | im Raum | Weg | Tempo | Ground Truth |")
    w("|---|---|---|---|---|---|---|---|")
    for z in sz["ziele"]:
        rt = (z.get("bewegung") or {}).get("route")
        von = L.ab_s(z)
        bis = z.get("bis_s")
        raum = f"{uhr(von)}–{uhr(bis) if bis is not None else 'Ende'}"
        if rt:
            a_, b_ = (rt[0][1], rt[0][2]), (rt[-1][1], rt[-1][2])
            if L.dist(a_, b_) > 1:
                weg = f"{pqk(a_)} → {pqk(b_)}"
            else:
                fern = max(((x, y) for _, x, y in rt), key=lambda q: L.dist(q, a_))
                weg = f"{pqk(a_)} → {pqk(fern)} → {pqk(a_)}" if pqk(fern) != pqk(a_) else f"{pqk(a_)} (hin und zurück)"
        elif z.get("herkunft"):
            weg = f"{L.pq(z['pos'], karte)} (aus {z['herkunft']})"
        elif z.get("im_gebaeude"):
            weg = f"{L.pq(z['pos'], karte)} (im {z['im_gebaeude']})"
        else:
            weg = f"{L.pq(z['pos'], karte)} (Stellung)"
        gt = z["gt"]
        gtt = GT_TEXT[gt["kategorie"]]
        if gt.get("vorher"):
            gtt = f"{GT_TEXT[gt['vorher']['kategorie']]}, ab {uhr(gt['ab_s'])} {GT_TEXT[gt['kategorie']]}"
        w(f"| {z['id']} | {fz[z['typ']]['name']} | {fz[z['typ']].get('argus_klasse', '–')} | {z.get('gruppe', '')} | {raum} | {weg} | "
          f"{tempo(z) if rt else 'steht'} | {gtt}{' (ungemeldet)' if z.get('ungemeldet') else ''}{' (nur Kontakt)' if z.get('nur_kontakt') else ''} |")
    w("")

    # ------------------------------------------------------------------ Schlüsselfälle
    w("## 12 Schlüsselfälle")
    w("")
    for f in sorted(sz["schluesselfaelle"], key=lambda f: f["reihenfolge"]):
        m = meld[f["meldung"]]
        w(f"### {f['id']} · {f['titel']} ({znm(m['id'])}, {uhr(m['t_s'])}){' – im Replay zuschaltbar' if f.get('zuschaltbar') else ''}")
        w("")
        w(f"**Information liegt bei:** {f['info_bei']}  ")
        w(f"**Kern:** {f['kern']}  ")
        mk = m["bild"].get("merkmale") or []
        if mk:
            w(f"**Im Bild (mit Lupe):** {'; '.join(x['text'] for x in mk)}  ")
        k, konf = klasse(m)
        w(f"**ARGUS:** {k} · {konf} % · {m['argus']['empfehlung']} ({'falsch' if hilfe[m['id']]['argus_falsch'] else 'richtig'})  ")
        folge = [x for x in sz["meldungen"] if x.get("fall") == f["id"] and x["id"] != m["id"]]
        if folge:
            w("**Folgemeldung:** " + "; ".join(f"{znm(x['id'])} um {uhr(x['t_s'])}" for x in folge) + "  ")
        w(f"**Lösung:** {loesung_text(m)}  ")
        w(f"**Gute Lösung:** {f['gut']}")
        w("")
        w("Leitfragen für die Auswertung:")
        w("")
        for q in f["leitfragen"]:
            w(f"- {q}")
        w("")
        w(f"Bezüge: {'; '.join(f['bezuege'])}. *(Artikelangaben vor der Feinkonzept-Vorstellung gegenprüfen.)*")
        w("")
    w("### Nebenfälle")
    w("")
    for f in sz.get("nebenfaelle", []):
        m = meld[f["meldung"]]
        w(f"- **{f['id']} {f['titel']}** ({znm(m['id'])}, {uhr(m['t_s'])}): {f['kurz']}")
    w("")
    routine = [p["nr"] for p in sz.get("phasen", []) if p["bis_s"] <= 840]
    spitze = [p["nr"] for p in sz.get("phasen", []) if p["von_s"] >= 840]
    n_r = sum(1 for m in sz["meldungen"] if m.get("fall") and m.get("phase") in routine)
    n_s = sum(1 for m in sz["meldungen"] if m.get("fall") and m.get("phase") in spitze)
    w(f"**Verteilung (E5):** In der Routine (Phasen {', '.join(map(str, routine))}) liegen {n_r} Meldungen von Fällen, im Hauptangriff und in der "
      f"Krise (Phasen {', '.join(map(str, spitze))}) {n_s} – die Sonderfälle drängen sich dort, wo der Druck am höchsten ist.")
    w("")

    # ------------------------------------------------------------------ Auswertung
    w("## 13 Auswertung (12 min)")
    w("")
    w(sz["auswertung"]["einstieg"])
    w("")
    w("**Seit 2.6 (H7):** Teamvergleich mit 7 Teams (Zeilen = Fälle, Spalten = Teams) und je Zelle die eine Entscheidung mit den Sekunden ab "
      "Eingang; Kennzahl „Wie lange habt ihr hingeschaut?“ (Median ab Eingang und ab Öffnen, Entscheidungen in höchstens 20 s); im Replay je "
      "Meldung eine Entscheidung und das Drohnenbild, wie das Team es bei der Entscheidung sah. Die Spielleitung wertet aus den Protokollen "
      "aus, die die Team-Laptops hochgeladen haben (fehlt eines: „Protokoll laden“ mit der Datei des Teams).")
    w("")
    rp = sz["auswertung"].get("replay")
    if rp:
        ids, je, summe = replay_plan(sz0)
        ids8, je8, summe8 = replay_plan(sz0, rp["standard"] + rp["zuschaltbar"])
        ids6, je6, summe6 = replay_plan(sz0, rp["standard"] + rp["zuschaltbar"][:2])
        w(f"**Replay (E5):** Teamvergleich mit allen Fällen (S1–S{n_schluessel}, N1–N{n_neben}). Standard im Replay: {', '.join(ids)} je "
          f"{je // 60}:{je % 60:02d} min (zusammen mit Kennzahlen, Konfidenz und Preis des Abwartens {summe // 60}:{summe % 60:02d} min). Die Spielleitung "
          f"kann {', '.join(rp['zuschaltbar'])} zuschalten und die Reihenfolge ändern; das Budget bleibt {rp['budget_s'] // 60} min, die Zeit je Fall "
          f"passt sich an: mit sechs Fällen je {je6 // 60}:{je6 % 60:02d} min, mit allen acht je {je8 // 60}:{je8 % 60:02d} min (knapp – "
          "dann lieber Fälle nach dem, was die Teams erlebt haben, auswählen).")
        w("")
    pa = (sz.get("verluste") or {}).get("auswertung")
    if pa:
        w(f"Nach den Fällen das Kapitel **„{pa['titel']}“** (1 min): der Zustand der vier Panzer der {etn} je "
          "Team über die Spielzeit (Kurve = Mittel, am Ende „b/4“ einsatzbereit, daneben ein Balken je Panzer) mit den Entscheidungen bei S4, S5, N4 "
          f"und S3, daneben Fehlbekämpfungen. Leitfragen: „{pa['leitfragen']['weniger']}“ (Team mit den wenigsten Treffern an der Kp) und "
          f"„{pa['leitfragen']['mehr']}“ (Team mit den meisten).  ")
        w(f"**Offenlegung:** {pa['offenlegung']}  ")
        w("Bezüge: " + "; ".join(pa["bezuege"]) + ".")
        w("")
    w("**Kennzahlen, die das Protokoll je Team liefern soll:**")
    w("")
    for k in regeln["kennzahlen"]:
        w(f"- {k['text']}")
    if pa:
        w("- Eigene Verluste: Zustand je Panzer, einsatzbereite Panzer und Verwundete je Team bei Spielende und als Verlauf (Lage, keine Wertung)")
    w("- Bekämpft trotz Warnung zählt nur Regelwarnungen (R2, R3, Einsatzbereich), nicht den Hinweis „nur k von n – Bestand reicht nicht“")
    w("")
    w(f"**Kernaussage:** {sz['auswertung']['kernaussage']}")
    w("")
    w(f"**Schlussfrage:** {sz['auswertung']['schlussfrage']}")
    w("")

    # ------------------------------------------------------------------ Papier
    pa_ = next((h for h in hg if h["art"] == "panzerabwehr"), None)
    beispiel = f"„{uhr(pa_['t_s'])} – {pa_['text'].split(' (')[0].rstrip('.')}“" if pa_ else "„Uhrzeit – Ereignis“"
    w("## 14 Durchspielen auf Papier")
    w("")
    w(f"Die Spielleitungsmappe (`Spielleitungsmappe_ARGUS.pdf`) enthält alles für einen Durchlauf ohne Technik mit einem Team (2–3 Personen): "
      f"Zeitleiste zum Abhaken, Kontrollkarte, Lagekarte mit Wirkradius-Schablone, Teamkarte, {kz['meldungen']} Meldekarten (je Meldung eine "
      "Entscheidung mit Uhr), Inject-Karten, Lösungshilfe und Beobachtungsbogen.")
    w("")
    w("1. **Vorbereiten:** Meldekarten und Inject-Karten in Zeitreihenfolge stapeln. Lagekarte drucken. Stoppuhr.")
    w("2. **Einweisung (3 min):** Lage für alle vorlesen, Teamkarte geben, eine Beispielkarte zeigen.")
    w("3. **Spiel (25 min):** SL 1 legt jede Meldekarte zur angegebenen Spielzeit beim Team ab (Eingang) – auch wenn dort noch Karten liegen. "
      "Das Team sieht Bild und ARGUS-Zeile (ohne Sensordaten), trägt das Ziel auf der Lagekarte ein, prüft mit der Schablone und entscheidet: "
      "BEKÄMPFEN mit Wirkmittel, ZURÜCKSTELLEN oder ABLEHNEN; es schreibt die Uhr der Entscheidung dazu und gibt die Karte an SL 1. "
      "Zurückgestellte Karten bleiben beim Team.")
    w("4. **Injects:** SL 1 legt Inject-Karten zur Spielzeit zum Team, ohne sie vorzulesen. Bedingte Injects prüft SL 1 an den zurückgegebenen Karten.")
    w(f"5. **Hintergrundgefecht:** SL 1 sagt die Ereignisse der Zeitleiste kurz an (z. B. {beispiel}). "
      "Meldungen, deren Fahrzeuge alle zerstört sind, nimmt SL 1 aus dem Eingang.")
    w("6. **Durchbruch:** Zu den Zeitpunkten in Abschnitt 8 prüft SL 1, ob ein Fahrzeug der Gruppe getroffen ist. Wenn nicht, sagt sie den "
      "Durchbruch an, gibt I-13 an das Team und nimmt die Meldungen der Gruppe aus dem Eingang, sobald die Fahrzeuge aus dem Bild sind.")
    w("7. **Verluste:** SL 1 sagt die Druckmeldungen der Panzer nach der Tabelle des passenden Modellteams an "
      "(Abschnitt 9) – vor allem bei S4: Solange der Mörser im Hof RABE steht, liegt 1/4 unter Feuer; bei S5 1/1, bei S7 1/2.")
    w("8. **EloKa (seit 2.4):** Solange das EloKa-Fahrzeug nicht bekämpft ist, legt SL 1 die Karten der gestörten Meldungen mit der gestörten "
      "ARGUS-Zeile (Abschnitt 5) und einem verrauschten Bild ab.")
    w("9. **Wirkung:** SL 1 notiert Uhr und Wirkmittel und prüft mit der Lösungshilfe (Spalte „Achtung“ mit Zeitraum), "
      "was beim Einschlag getroffen wurde. BEKÄMPFEN wirkt auf den ganzen Zug: LM und Kanone je Fahrzeug nacheinander (eine LM je Fahrzeug "
      "vom Bestand), der Mörser auf alles im Wirkradius.")
    w("10. **Beobachten:** SL 2 füllt den Beobachtungsbogen je Schlüsselfall (Uhr, Sekunden ab Eingang, Bild angesehen, was gesagt).")
    w("11. **Auswerten:** Meldekarten nach Fällen sortieren, Sekunden ab Eingang ablesen.")
    w("")
    w("**Fertig-Kriterium Schritt 2:** Beide Spielleiter haben die Mappe einmal allein durchgespielt (SL 1 spielt das Team, "
      "SL 2 kontrolliert mit der Lösungshilfe) und keine Lücke gefunden.")
    w("")

    # ------------------------------------------------------------------ Probelauf
    w("### Probelauf (simuliert)")
    w("")
    w(f"Zwei Modellteams laufen mit festen Zeiten je Entscheidung durch das Drehbuch (*naiv* {SIM.T_NAIV} s, *ideal* {SIM.T_IDEAL} s; das Team "
      "arbeitet den Eingang der Reihe nach ab, Trefferregel nach der Lage beim Einschlag je Einschlag eines Zuges, Hintergrundgefecht, Durchbruch, "
      "E-01, EloKa und Verluste wie im Spiel). *naiv* folgt ARGUS (auch der gestörten Ausgabe): BEKÄMPFEN außer bei UNKLAR, mit dem ersten "
      "Wirkmittel ohne Warnung, sonst LM. *ideal* handelt nach der Lösung (mit dem Wirkmittel, das die Lösung nennt) und bekämpft nur, wenn die "
      "Warnung zum Einschlag frei ist und im Bild nichts Geschütztes steht (sonst ZURÜCKSTELLEN). Das prüft, ob die Fallen zuschnappen, die "
      "Bestände reichen, die bedingten Injects auslösen und jedes Team alle Fälle erreicht; es ist kein Gefechtsmodell. Dieselben Läufe spielt "
      "`tests/durchlauf.test.ts` im Repository mit der echten Engine nach.")
    w("")
    for team in ("naiv", "ideal"):
        x = lauf[team]
        fe = SIM.faelle_erreicht(d, team)
        offen = [a for a, b in x["log"] if b == "bei Spielende noch offen"]
        vk = x["verluste"]
        verl = (f" {etn} bei Spielende {vk['zug']['bereit']}/{vk['zug']['gesamt']} einsatzbereit ({vk['zug']['eingeschraenkt']} eingeschränkt, "
                f"{vk['zug']['ausgefallen']} ausgefallen), {vk['zug']['verwundete']} Verwundete." if vk else "")
        w(f"- **{team}:** Fehlziele/geschützt getroffen: {', '.join(x['ts']) or 'keine'}. Bedingte Injects: "
          f"{', '.join(i for i in x['inj'] if not i.startswith('K-')) or 'keine'}. "
          f"Durchgebrochen: {', '.join(x['durch']) or 'niemand'}. "
          f"Restbestand {', '.join(f'{k} {v}' for k, v in x['rest'].items())}. Letzte Bekämpfung {uhr(x['ende'])}. "
          f"Bei Spielende offen: {', '.join(znm(m) for m in offen) or 'nichts'}. Fälle erreicht: "
          f"{'alle' if all(ok for ok, _ in fe.values()) else 'nicht ' + ', '.join(k for k, (ok, _) in fe.items() if not ok)}.{verl}")
    w("")
    w("Fälle je Modellteam (Entscheidung an der Fall-Meldung):")
    w("")
    w("| Fall | naiv | ideal |")
    w("|---|---|---|")
    fn, fi = SIM.faelle_erreicht(d, "naiv"), SIM.faelle_erreicht(d, "ideal")
    for k in fn:
        w(f"| {k} | {AT(fn[k][1])} | {AT(fi[k][1])} |")
    w("")
    w("**S7** ist ein legitimes Ziel, ARGUS empfiehlt dort zu Recht die LM (die Frage ist das Wirkmittel – wer den Mörser nimmt, trifft Kirche "
      "und Ortschaft). *ideal* hat gegen Ende keine LM mehr und muss einzelne späte Ziele zurückstellen, obwohl sie legitim wären – auch das "
      "ist ein Preis des sorgfältigen Arbeitens (Widerspruch „zu Unrecht“ in der Auswertung).")
    w("")
    w("**Robustheit:** Wie langsam darf ein Team sein? Nicht erreichte Fälle bei längeren Zeiten je Entscheidung (ohne Verstärkung):")
    w("")
    w("| Sekunden je Entscheidung naiv / ideal | naiv | ideal |")
    w("|---|---|---|")
    rob = SIM.robustheit(d)
    for tn, ti, rr in rob:
        w(f"| {tn} / {ti} s | {', '.join(rr['naiv']) or 'alle erreicht'} | {', '.join(rr['ideal']) or 'alle erreicht'} |")
    w("")
    ok_n = [tn for tn, _, rr in rob if not rr["naiv"]]
    ok_i = [ti for _, ti, rr in rob if not rr["ideal"]]
    fehlt = [(team, t_, rr[team]) for tn, ti, rr in rob for team, t_ in (("naiv", tn), ("ideal", ti)) if rr[team]]
    w("Folgerung: Mit einer Rolle ist der Eingang des Teams der Engpass; gegen Ende entsteht ein Rückstau. Das ist gewollt (Zeitdruck – je "
      "länger ein Team hinschaut, desto voller der Eingang). "
      + (f"*naiv* erreicht alle Fälle bis {max(ok_n)} s je Entscheidung, *ideal* bis {max(ok_i)} s" if ok_n and ok_i else
         "Schon mit den Modellzeiten bleiben Fälle offen")
      + ("; " + "; ".join(f"bei {team} mit {t_} s bleibt {', '.join(f)} offen" for team, t_, f in fehlt) if fehlt else "") + ". "
      "Offen bleiben bei Spielende sonst nur die letzten Routinemeldungen. Die Spielleitung sieht den Eingang je Team in der Übersicht "
      "(Statusmeldung alle 5 s) und greift nicht ein; ein voller Eingang ist Teil der Auswertung („Wie lange habt ihr hingeschaut?“).")
    w("")

    # ------------------------------------------------------------------ Anforderungen
    w("## 15 Folgerungen für die Technik")
    w("")
    for a in sz.get("anforderungen_technik", []):
        w(f"- **{a['schritt']}:** {a['text']}")
    w("")
    w("## 16 Dateien")
    w("")
    w("| Datei | Inhalt |")
    w("|---|---|")
    for p, t in (("claude/daten/szenario_kraehe_01.json", "Szenario: Lage, Phasen, Zonen, Ziele mit Routen und Ground Truth, Meldungen mit Bildmerkmalen und Lösung, Injects, Hintergrundgefecht, Durchbruch, Verstärkungen, eigene Truppe, Verlustmodell (szenariobezogen), EloKa, Fälle, Replay"),
                 ("claude/daten/karte_kraehe.json", "Kartenvektoren, Raster, Namen, Gebäude (seit 2.4 Kirche mit Turm, Wohnhaus S5)"),
                 ("claude/daten/katalog_fahrzeuge.json", "Fahrzeugkatalog mit ARGUS-Klasse (Panzer, Fahrzeug, Infanterie mit Zeichen), Sprite, taktischem Zeichen, eigener Kampfpanzer Leopard 2A7V (drei Zustände), zivile Pkw, Beobachter, Verwundete"),
                 ("claude/daten/katalog_wirkmittel.json", "Wirkmittel (Spielwerte, LM mit Flug ab Startpunkt; Wirkung auf den Zug: je Fahrzeug oder Fläche)"),
                 ("claude/daten/regeln.json", "ARGUS-Schwellen, Klassen, EloKa, Ablauf (eine Rolle), Einsatzregeln, Trefferregel, Zug, Präzision, Durchbruch, Kennzahlen, Verlustmodell mit Meldungsregeln (H3.3, H5.7), Anzeige (Bestand knapp, Lagemeldung 8 s), Schalter der Spielleitung"),
                 ("claude/tools/argus_lib.py", "Gemeinsame Logik: Laden, Geometrie, Bewegung, Trefferregel je Einschlag, Regelprüfung, Durchbruch, Feuer, EloKa, Abstände, Anzeige-Texte"),
                 ("claude/tools/verluste.py", "Feindfeuer auf die eigene Kp: Zeitlinie aller Schüsse mit Einschießen, Zustand je Panzer, Druckmeldungen (Referenz für src/kern/verluste.ts)"),
                 ("claude/tools/pruefe_szenario.py", "Konsistenzprüfung (auch: keine Fast-Track-Reste, Phase „Krise“, Lösung je Meldung, Artilleriemeldungen ≤ 1 je 2 min, Lagemeldungen ≤ 140 Zeichen) und Lösungshilfe"),
                 ("claude/tools/gen_drehbuch.py", "erzeugt dieses Drehbuch"),
                 ("claude/tools/simuliere_durchlauf.py", "Probelauf mit Modellteams naiv/ideal (eine Rolle, Sekunden je Entscheidung), Durchbruch, Verstärkungen, Robustheit, Verluste und Kalibrierung"),
                 ("tools/referenz/erzeuge_durchlauf.py", "nur im Repository: schreibt die Referenz der fünf Modellläufe für tests/durchlauf.test.ts (dort auch Kopien der Python-Werkzeuge)"),
                 ("claude/tools/routen.py", "Hilfen zum Bauen zeitlich stimmiger Routen (entlang Straßen, im Gelände, Halte)"),
                 ("claude/tools/bau_szenario_v26.py", "Nachweis, wie Szenario 2.6 aus 2.5 gebaut wurde (Änderungen H3: Fast-Track raus, Phase „Krise“, Artilleriemeldungen, Texte für eine Rolle; einmalig, gepflegt wird die JSON-Datei)"),
                 ("claude/tools/bau_szenario_v25.py", "Nachweis, wie Szenario 2.5 aus 2.4 gebaut wurde (Änderungen F1–F4 und F5)"),
                 ("claude/tools/bau_szenario_v24.py", "Nachweis, wie Szenario 2.4 aus 2.3 gebaut wurde (Änderungen E1–E6)"),
                 ("claude/tools/bau_szenario_v23.py", "Nachweis, wie Szenario 2.3 aus 2.2 gebaut wurde (Änderungen D1–D5)"),
                 ("claude/tools/bau_szenario_v22.py", "Nachweis, wie Szenario 2.2 aus 2.1 gebaut wurde (Änderungen C1–C9)"),
                 ("claude/tools/bau_szenario_v21.py", "Nachweis, wie Szenario 2.1 aus 2.0 gebaut wurde"),
                 ("claude/tools/bau_szenario_v2.py", "Nachweis, wie Szenario 2.0 aus 1.3 gebaut wurde"),
                 ("claude/tools/karte_render.py", "Kontrollkarte und Lagekarte des Teams (PDF/PNG)"),
                 ("claude/tools/gen_mappe.py", "Spielleitungsmappe (PDF) für eine Rolle"),
                 ("claude/tools/render_video.py", "Zeitraffer-Video eines Probelaufs (MP4, braucht ffmpeg); Stand Szenario 2.1 mit drei Rollen, nicht nachgezogen")):
        w(f"| `{p}` | {t} |")
    w("")
    return "\n".join(o)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "Drehbuch_ARGUS.md"
    d = L.lade_alles()
    r = pruefe(d)
    if r["fehler"]:
        print("Szenario hat Fehler:", r["fehler"])
        sys.exit(1)
    with open(out, "w", encoding="utf-8") as f:
        f.write(md(d, r))
    print("ok", out)
