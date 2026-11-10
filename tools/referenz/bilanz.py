"""Bilanz „Das ist es wert“ (seit 2.7, Änderung G2) – unabhängige Nachrechnung in Python für tests/durchlauf.test.ts.

Aus den Einschlägen eines Laufs (simuliere_durchlauf.lauf, Detail-Liste) und den Spielwerten in regeln.json (Abschnitt `bilanz`):

  fahrzeuge   zerstörte Feindfahrzeuge (Treffer „Fahrzeug“ mit Kategorie feind, Typ mit Spielwert), je Fahrzeug einmal
  wert_mio    Summe der Spielwerte dieser Fahrzeuge (Mio €)
  schuss      Einschläge je Wirkmittel (ein Einschlag = ein Schuss bzw. eine LM)
  munition_eur  Summe Einschläge × Preis
  median_s    Zeit von der Meldung bis zum (ersten) Einschlag, Median über die bekämpften Meldungen
  hingeschaut_s  Sekunden ab Eingang bis zur Entscheidung, Median über alle Entscheidungen (H2.4)
  fehl        Fehlbekämpfungen ohne Eurowert: Sanitätsfahrzeug, Zivilpersonen (davon Kinder), Kamerateam, Verwundete, Besatzung mit
              weißem Tuch, Verbündete, Attrappe – Personen je Gruppe einmal (auch wenn zweimal getroffen), Fahrzeuge je Fahrzeug einmal

Die Engine rechnet dasselbe in src/kern/bilanz.ts.
"""

FEHL_IDS = ["sanitaet", "zivil", "kamerateam", "verwundete", "weisses_tuch", "verbuendet", "attrappe"]


def median(werte):
    w = sorted(werte)
    if not w:
        return None
    n = len(w)
    return w[n // 2] if n % 2 else (w[n // 2 - 1] + w[n // 2]) / 2


def alle_ziele(sz):
    """Alle Ziele samt Verstärkungen (für Typ und Personen)."""
    out = {z["id"]: z for z in sz["ziele"]}
    for g in (sz.get("verstaerkungen") or {}).get("gruppen", []):
        for z in g["ziele"]:
            out.setdefault(z["id"], z)
    return out


def bilanz(d, det, panzer=None):
    """det: Detail-Liste von simuliere_durchlauf.lauf; panzer: (bereit, gesamt) der eigenen Kp bei Spielende oder None."""
    regel = d["regeln"]["bilanz"]
    werte = regel["fahrzeuge_mio_eur"]
    preis = regel["munition_eur"]
    je_typ = regel.get("personen_je_typ", {})
    zmap = alle_ziele(d["szenario"])
    feind, schuss, zeiten, hingeschaut = {}, {}, [], []
    fahrzeug_fehl = {"sanitaet": set(), "verbuendet": set(), "attrappe": set(), "verwundete": set()}
    personen = {}                       # (ziel, art) → (fehl-art, anzahl, kinder)
    for e in det:
        if "m" not in e:
            continue
        if e.get("sek_eingang") is not None and e.get("entscheid"):
            hingeschaut.append(e["sek_eingang"])
        if e.get("ende") != "Wirkung":
            continue
        ein = e["einschlaege"]
        schuss[e["wm"]] = schuss.get(e["wm"], 0) + len(ein)
        zeiten.append(round(ein[0]["t"] - e["t_meld"], 2))
        for x in ein:
            for g in x["getroffen"]:
                zid, was, kat = g
                z = zmap[zid]
                if was in ("Fahrzeug", "Attrappe"):
                    if was == "Attrappe" or kat == "attrappe":
                        fahrzeug_fehl["attrappe"].add(zid)
                    elif kat == "feind" and z["typ"] in werte:
                        feind.setdefault(zid, x["t"])
                    elif kat == "geschuetzt":
                        fahrzeug_fehl["sanitaet"].add(zid)
                    elif kat == "verbuendet":
                        fahrzeug_fehl["verbuendet"].add(zid)
                    elif kat == "ausser_gefecht" and z["typ"] in je_typ:
                        fahrzeug_fehl["verwundete"].add(zid)
                    continue
                # Personen: „4 Zivilpersonen“ – Gruppe des Ziels mit dieser Art
                p = next((p for p in z.get("personen", []) or [] if p["art"] == kat and was.startswith(f"{p['anzahl']} ")), None)
                if p is None:
                    continue
                if kat == "zivil":
                    art = "kamerateam" if z["typ"] == "pkw_presse" else "zivil"
                elif kat == "besatzung_ergibt_sich":
                    art = "weisses_tuch"
                else:
                    continue
                personen.setdefault((zid, kat), (art, p["anzahl"], p.get("klein", 0)))
    fehl = {k: 0 for k in FEHL_IDS}
    kinder = 0
    for art, n, k in personen.values():
        fehl[art] += n
        if art == "zivil":
            kinder += k
    for art, ids in fahrzeug_fehl.items():
        fehl[art] += sum(je_typ.get(zmap[i]["typ"], 1) if art == "verwundete" else 1 for i in ids)
    wert = round(sum(werte[zmap[i]["typ"]] for i in feind), 2)
    return {
        "fahrzeuge": len(feind),
        "fahrzeug_ids": sorted(feind),
        "wert_mio": wert,
        "schuss": dict(sorted(schuss.items())),
        "munition_eur": sum(n * preis[w] for w, n in schuss.items()),
        "median_s": median(zeiten),
        "hingeschaut_s": median(hingeschaut),
        "panzer": None if panzer is None else {"bereit": panzer[0], "gesamt": panzer[1]},
        "fehl": fehl,
        "kinder": kinder,
    }
