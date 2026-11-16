"""Behauptungen der Lagemeldungen (seit Szenario 2.9, Änderung P4) – gleiche Logik wie src/kern/behauptung.ts.

Jede Lagemeldung, die ein Ergebnis behauptet (brennt, zerstört, getroffen, eingebrochen, zurückgezogen, genommen, zerschlagen), stimmt mit
dem Stand im Spiel des Teams überein: In den Daten trägt sie `behauptet` und, wo das nicht in jedem Spiel stimmt, `varianten` (je Variante
`behauptet` und `text`). Die Engine nimmt die erste Variante, deren Behauptung zur Zeit der Meldung stimmt, sonst den Text der Lagemeldung.

Die Lage eines Laufs (Lage) baut simuliere_durchlauf.lauf() am Ende; pruefe_szenario.pruefe_behauptungen() prüft damit in allen
Modellläufen, dass jede Lagemeldung zur Zeit ihres Erscheinens stimmt.
"""
import argus_lib as L

SCHLUESSEL = ("zerstoert", "stehen", "hintergrund", "ereignis_traf", "bereich_frei", "feind_im_bereich", "ereignis_aus", "getroffen",
              "durchbruch", "panzer_getroffen", "beschuss", "eloka", "verstoss", "letzte_nicht_bekaempft")

ZAHLWORT = ["Kein", "Ein", "Zwei", "Drei", "Vier", "Fünf"]


def kurz_name(name):
    """„Kampfpanzer T-72“ → „KPz T-72“ (wie kurzName in src/kern/abschluss.ts)."""
    import re
    s = name
    for alt, neu in (("^Kampfpanzer ", "KPz "), ("^Schützenpanzerwagen ", "SPW "), ("^Schützenpanzer ", "SPz "), ("^Spähpanzer ", "SpähPz "),
                     ("^Geschütztes Fahrzeug ", ""), (r"^Störsender auf Lkw \(EloKa\)$", "Störsender-Lkw"), (r"\s*\((militärisch|eigen)\)$", "")):
        s = re.sub(alt, neu, s)
    return s


def aufzaehlen(teile):
    return "".join(teile) if len(teile) <= 1 else ", ".join(teile[:-1]) + " und " + teile[-1]


class Lage:
    """Stand eines Modelllaufs für die Behauptungen: alles mit Zeiten, abgefragt zur Zeit t.

    d          Daten (mit Verstärkungen), welt(t) → Daten zur Zeit t (mit Durchbrüchen)
    zer        {ziel: Zeit der Zerstörung} (Team, Hintergrund, E-01)
    hg         {hintergrund-id: (t, wirkt)}
    e01        [(t, ziel)] Treffer der Skriptereignisse je Ereignis-ID: {id: [(t, ziel)]}
    freigabe_t {ziel: früheste Freigabe}
    einschlaege [{t, getroffen, verstoesse}] eigene Einschläge
    entscheide [(t, entscheid)] Entscheidungen des Teams
    durch      [(ziel, t über dem Bach, Übergang, Gruppe)] Fahrzeuge durchgebrochener Gruppen (bis Spielende)
    gemeldet   {ziel: Zeit der ersten Meldung}
    erschienen [(meldung-id, t, verstaerkung, bedingt, ziele, entfallen_beim_erscheinen)] in Reihenfolge des Erscheinens
    verluste   Zeitlinie der Verluste (verluste.zeitlinie)
    """

    def __init__(self, d, welt, zer, hg, e01, freigabe_t, einschlaege, entscheide, durch, gemeldet, erschienen, verluste):
        self.d, self.welt, self.zer, self.hg, self.e01 = d, welt, zer, hg, e01
        self.freigabe_t, self.einschlaege, self.entscheide = freigabe_t, einschlaege, entscheide
        self.durch, self.gemeldet, self.erschienen, self.verluste = durch, gemeldet, erschienen, verluste

    # ---------------------------------------------------------------- Hilfen
    def ereignis(self, eid):
        return next((e for e in self.d["szenario"].get("ereignisse", []) if e["id"] == eid), None)

    def steht(self, zid, t):
        zmap = {z["id"]: z for z in L.alle_ziele(self.welt(t)["szenario"])}
        z = zmap.get(zid)
        return z is not None and L.vorhanden(z, t) and self.zer.get(zid, 1e9) > t

    def feinde_im_bereich(self, e, t):
        b = e.get("bereich")
        if not b:
            return []
        out = []
        for z in L.alle_ziele(self.welt(t)["szenario"]):
            if not (L.vorhanden(z, t) and self.zer.get(z["id"], 1e9) > t):
                continue
            gt = L.gt_bei(z, t)
            if not gt["legitim"] or gt["kategorie"] != "feind":
                continue
            p = L.position(z, t)
            if b["x"][0] <= p[0] <= b["x"][1] and b["y"][0] <= p[1] <= b["y"][1]:
                out.append(z["id"])
        return out

    def ereignis_aus(self, e, t):
        ab = min([self.freigabe_t.get(x, 1e9) for x in e["bedingung"]["ziele"]] or [1e9])
        letzter = max([e["bedingung"].get("t_s", -1e9)] + [w["t_s"] for w in e["wirkungen"]])
        return ab <= t and ab <= letzter

    def durch_bis(self, t):
        return sorted([x for x in self.durch if x[1] <= t and self.gemeldet.get(x[0], 1e9) <= t], key=lambda x: (x[1], x[0]))

    def regel_von(self, text):
        """Regel eines Verstoßtexts von argus_lib.pruefe_wirkmittel (R2: No-Strike-Zone im Wirkradius, R3: Einschränkungsgebiet)."""
        for zo in self.d["szenario"]["zonen"]:
            name = L.zonen_name(zo)
            if text.startswith(f"{name} im Wirkradius") and zo["typ"] == "no_strike":
                return "R2"
            if text.startswith(f"{name}: Wirkradius") and zo["typ"] == "einschraenkung":
                return "R3"
        return "EB" if text.startswith("außer") else None

    # ---------------------------------------------------------------- Behauptungen
    def abweichungen(self, b, t):
        if not b:
            return []
        aus = []
        if b.get("zerstoert") and not all(self.zer.get(x, 1e9) <= t for x in b["zerstoert"]):
            aus.append("zerstoert")
        if b.get("stehen") and not any(self.steht(x, t) for x in b["stehen"]):
            aus.append("stehen")
        if b.get("hintergrund") and not all(self.hg.get(h, (1e9, False))[1] and self.hg[h][0] <= t for h in b["hintergrund"]):
            aus.append("hintergrund")
        if b.get("ereignis_traf") and not any(tt <= t for tt, _ in self.e01.get(b["ereignis_traf"], [])):
            aus.append("ereignis_traf")
        for k in ("bereich_frei", "feind_im_bereich"):
            if b.get(k):
                e = self.ereignis(b[k])
                n = len(self.feinde_im_bereich(e, t)) if e else 0
                if not e or (n > 0 if k == "bereich_frei" else n == 0):
                    aus.append(k)
        if b.get("ereignis_aus"):
            e = self.ereignis(b["ereignis_aus"])
            if not e or not self.ereignis_aus(e, t):
                aus.append("ereignis_aus")
        if b.get("getroffen"):
            g = b["getroffen"]
            hit = set()
            for w in self.einschlaege:
                if w["t"] > t:
                    continue
                for x in w["getroffen"]:
                    if x[0] not in g["ziele"]:
                        continue
                    person = x[1] not in ("Fahrzeug", "Attrappe")
                    if (person and x[2] == g["personen"]) if g.get("personen") else not person:
                        hit.add(x[0])
            if len(hit) < g.get("min", 1):
                aus.append("getroffen")
        if b.get("durchbruch"):
            liste = self.durch_bis(t)
            ok = any(x[0] in b["durchbruch"] for x in liste) if isinstance(b["durchbruch"], list) else bool(liste)
            if not ok:
                aus.append("durchbruch")
        if b.get("panzer_getroffen") and not any(e["t"] <= t and e["art"] == b["panzer_getroffen"] and e["ergebnis"] == "treffer"
                                                 for e in self.verluste):
            aus.append("panzer_getroffen")
        if b.get("beschuss"):
            q = b["beschuss"]
            if not any(e["t"] <= t and e["quelle"] == q["quelle"] and (not q.get("panzer") or e["panzer"] == q["panzer"]) for e in self.verluste):
                aus.append("beschuss")
        if b.get("eloka") and not L.eloka_aktiv(self.welt(t)["szenario"], self.zer, t):
            aus.append("eloka")
        if b.get("verstoss") and not any(w["t"] <= t and any(self.regel_von(v) == b["verstoss"] for v in w["verstoesse"]) for w in self.einschlaege):
            aus.append("verstoss")
        if b.get("letzte_nicht_bekaempft"):
            vorher = [x for x in self.entscheide if x[0] <= t]
            if not vorher or vorher[-1][1] == "BEKÄMPFEN":
                aus.append("letzte_nicht_bekaempft")
        return aus

    def stimmt(self, b, t):
        return not self.abweichungen(b, t)

    def variante(self, plan, t):
        """(text, behauptet, nr) – die erste Variante, deren Behauptung stimmt, sonst der Text der Lagemeldung (nr 0)."""
        for i, v in enumerate(plan.get("varianten") or []):
            if self.stimmt(v["behauptet"], t):
                return v["text"], v["behauptet"], i + 1
        return plan["text"], plan.get("behauptet"), 0

    # ---------------------------------------------------------------- Platzhalter {durch} {ueber} {getroffen_zahl}
    def nummern(self):
        """Zielnummern dieses Laufs wie src/kern/zielnummern.ts: Szenario-Meldungen (ohne Verstärkung und bedingte) nach t_s, die übrigen
        nach der zuletzt erschienenen mit Buchstaben."""
        sz = self.d["szenario"]
        basis_liste = [m for m in sz["meldungen"] if not m.get("verstaerkung") and not m.get("bedingung")]
        basis_liste = sorted(enumerate(basis_liste), key=lambda x: (x[1]["t_s"], x[0]))
        basis = {m["id"]: i + 1 for i, (_, m) in enumerate(basis_liste)}
        out, letzte, zusatz = {}, 0, 0
        for mid, *_ in self.erschienen:
            if mid in basis:
                out[mid] = str(basis[mid])
                letzte = max(letzte, basis[mid])
                zusatz = 0
            else:
                out[mid] = f"{letzte}{chr(97 + min(25, zusatz))}"
                zusatz += 1
        return out

    def werte(self, t, ziele=()):
        werte = {}
        liste = self.durch_bis(t)
        if liste:
            nummern = self.nummern()

            def nr_von(zid):
                ids = [mid for mid, tm, _, _, zl, entf in self.erschienen if zid in zl and tm <= t and not entf]
                return nummern.get(ids[-1], "?") if ids else "?"
            zmap = {z["id"]: z for z in L.alle_ziele(self.d["szenario"])}
            gruppen = []
            for zid, _, _, _ in liste:
                nr = nr_von(zid)
                g = next((x for x in gruppen if x[0] == nr), None)
                if g is None:
                    g = (nr, {})
                    gruppen.append(g)
                name = kurz_name(self.d["fahrzeuge"].get(zmap[zid]["typ"], {}).get("name", zid))
                g[1][name] = g[1].get(name, 0) + 1
            werte["durch"] = aufzaehlen([f"{aufzaehlen([(f'{n} {k}' if n > 1 else k) for k, n in typen.items()])} (Ziel {nr})"
                                         for nr, typen in gruppen])
            ueber = []
            for x in liste:
                if f"die {x[2]}" not in ueber:
                    ueber.append(f"die {x[2]}")
            werte["ueber"] = aufzaehlen(ueber)
        if ziele:
            hit = {x[0] for w in self.einschlaege if w["t"] <= t for x in w["getroffen"] if x[0] in ziele and x[1] in ("Fahrzeug", "Attrappe")}
            werte["getroffen_zahl"] = ZAHLWORT[len(hit)] if len(hit) < len(ZAHLWORT) else str(len(hit))
        return werte


def text(b):
    """Kurzer Text einer Behauptung für die Spielleitung („nur, wenn …“), wie behauptungText in src/kern/behauptung.ts."""
    if not b:
        return ""
    t = []
    if b.get("zerstoert"):
        t.append(f"{', '.join(b['zerstoert'])} zerstört")
    if b.get("stehen"):
        t.append(f"{'/'.join(b['stehen'])} steht noch")
    if b.get("hintergrund"):
        t.append(f"{', '.join(b['hintergrund'])} hat gewirkt")
    if b.get("ereignis_traf"):
        t.append(f"{b['ereignis_traf']} hat getroffen")
    if b.get("bereich_frei"):
        t.append(f"kein Feind mehr im Bereich von {b['bereich_frei']}")
    if b.get("feind_im_bereich"):
        t.append(f"Feind im Bereich von {b['feind_im_bereich']}")
    if b.get("ereignis_aus"):
        t.append(f"{b['ereignis_aus']} ausgefallen")
    if b.get("getroffen"):
        g = b["getroffen"]
        pers = ("Zivilpersonen" if g["personen"] == "zivil" else g["personen"]) + " bei " if g.get("personen") else ""
        t.append(f"eigene Wirkung traf {pers}{'/'.join(g['ziele'])}" + (f" (mindestens {g['min']})" if g.get("min", 1) > 1 else ""))
    if b.get("durchbruch"):
        t.append("gemeldete Kräfte über dem Bach")
    if b.get("panzer_getroffen"):
        t.append("eigener Panzer vom Durchbruch getroffen")
    if b.get("beschuss"):
        q = b["beschuss"]
        t.append(f"Feuer von {q['quelle']}" + (f" auf {q['panzer']}" if q.get("panzer") else ""))
    if b.get("eloka"):
        t.append("Datenlink gestört (EloKa)")
    if b.get("verstoss"):
        t.append(f"eigene Wirkung mit Verstoß {b['verstoss']}")
    if b.get("letzte_nicht_bekaempft"):
        t.append("letzte Entscheidung war nicht BEKÄMPFEN")
    return " · ".join(t)
