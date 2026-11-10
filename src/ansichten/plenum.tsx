// Plenum (Smartboard): drei Bilder, die sich nach dem Spielstand von selbst umschalten und von Hand
// gewählt werden können.
//   Einweisung – Lage für alle, Lagekarte, Code und Teams (vor dem Start)
//   Lage       – Uhr und Lagekarte ohne Ziele (während des Spiels; der Raum sieht nichts Geheimes)
//   Auflösung  – Kontrollkarte mit Ground Truth und allen Wirkungen dieses Teams (nach Spielende)
// Die Auswertung über alle Teams (Schritt 8, auswertung.tsx) zeigt das Plenum-Fenster von selbst, sobald alle Teams
// das Spielende erreicht haben; „Auswertung – alle Teams ›“ führt von Hand hin.
import { useMemo, useState } from "preact/hooks";
import { effekte } from "../kern/effekte";
import { LEER, eigeneLage, lagebildKontrolle } from "../kern/lagebild";
import { phaseZu, uhrzeit } from "../kern/uhr";
import { zustandAus } from "../kern/zustand";
import type { Sicht } from "../sitzung/sicht";
import { Panel } from "./gemeinsam/bausteine";
import { useSpielzeit, useStand } from "./gemeinsam/hooks";
import { LagekarteAnsicht } from "./gemeinsam/lagekarte";
import { TeamMarke } from "./gemeinsam/rahmen";

/** Mitte des Kartenausschnitts im Plenum (seit 2.7, G4b): die Karte füllt ihr Feld, oben und unten fehlt etwas Wald. */
const KARTE_MITTE_PLENUM: [number, number] = [500, 340];

/** Was Teilnehmer zum Mitspielen brauchen (Sitzung mit Lobby): Seite, Code und die Teams bisher. */
export interface Beitritt {
  code: string;
  adresse: string;
  teams: { id: string; name: string; farbe: string; spieler: number }[];
}

type Modus = "einweisung" | "lage" | "aufloesung";

/** Name des Raums aus der Karte, ohne Zusatz „(fiktiv)“. */
function raumName(inh: Sicht["inh"]): string {
  return inh.karte.titel.replace(/\s*\(.*\)\s*$/, "");
}
const MODUS_TEXT: Record<Modus, string> = { einweisung: "Einweisung", lage: "Lage", aufloesung: "Auflösung" };

export function PlenumAnsicht(p: { s: Sicht; beitritt?: Beitritt; zurAuswertung?: () => void }) {
  const { s } = p;
  const st = useStand(s);
  const t = useSpielzeit(s, 1000);
  const inh = s.inh;
  const sz = inh.szenario;
  const z = st.zustand;
  const auto: Modus = !st.lauf || (!z.uhr.laeuft && z.uhr.t_s === 0 && !z.ende) ? "einweisung" : z.ende ? "aufloesung" : "lage";
  const [wahl, setWahl] = useState<{ modus: Modus; bei: Modus } | null>(null);
  const modus = wahl && wahl.bei === auto ? wahl.modus : auto;
  const tAnzeige = Math.min(t, sz.spieluhr.dauer_s);
  // Lage im Raum: nur das Gefecht ringsum (Feindartillerie, Rauch, Feuer auf die eigene Kp), nichts Geheimes
  const umgebung = useMemo(() => effekte(inh, z, "umgebung"), [inh, z]);
  // seit 2.5 (F1, F2.6): die vier eigenen Panzer mit ihrem Zustand – eigene Truppe, verrät kein Ziel
  const tLage = Math.floor(tAnzeige);
  const lageEigen = useMemo(() => ({ ...LEER, eigene: eigeneLage(inh, z, tLage) }), [inh, z, tLage]);

  return (
    <main class="plenum" data-modus={modus}>
      <div class="plenum-kopf">
        <h2 style="font-size:20px">{modus === "einweisung" ? sz.titel : modus === "lage" ? "Das Spiel läuft" : `Auflösung: was wirklich im ${raumName(inh)} war`}</h2>
        <div class="reiter">
          {(Object.keys(MODUS_TEXT) as Modus[]).map((m) => (
            <button type="button" class={modus === m ? "an" : ""} onClick={() => setWahl({ modus: m, bei: auto })} data-modus-knopf={m}>{MODUS_TEXT[m]}</button>
          ))}
          {p.zurAuswertung && <button type="button" class="weiter" onClick={p.zurAuswertung} data-modus-knopf="auswertung"
            title="Auswertung über alle Teams: Teamvergleich, Kennzahlen, Replay je Schlüsselfall">Auswertung – alle Teams ›</button>}
        </div>
      </div>
      {modus === "einweisung" && <PlenumEinweisung inh={inh} beitritt={p.beitritt} />}
      {modus === "lage" && (
        <div class="plenum-raster plenum-lage">
          <Panel titel="Lagekarte" klasse="ohne-rand">
            <LagekarteAnsicht inh={inh} lagebild={lageEigen} hintergrund="topo" legende="gelaende" uhr={() => p.s.kartenUhr()} effekte={umgebung} fuellen={KARTE_MITTE_PLENUM} />
          </Panel>
          <div class="stapel">
            <Panel titel="Spieluhr" klasse="flach">
              <div class="plenum-uhr">{uhrzeit(sz.spieluhr.start, tAnzeige)}</div>
              <div class="leise" style="text-align:center;margin-top:6px;font-size:17px">Phase {phaseZu(sz, tAnzeige).nr}: {phaseZu(sz, tAnzeige).name}</div>
            </Panel>
            <Panel titel="Stand" klasse="flach">
              <div class="plenum-zahl"><span>ARGUS-Meldungen bisher</span><b>{z.reihenfolge.length} / {sz.meldungen.length}</b></div>
              <div class="plenum-zahl"><span>Wirkungen</span><b>{z.reihenfolge.filter((id) => z.meldungen[id].wirkung).length}</b></div>
              <div class="plenum-zahl"><span>Lagemeldungen</span><b>{z.injectReihenfolge.length}</b></div>
            </Panel>
          </div>
        </div>
      )}
      {modus === "aufloesung" && <Aufloesung s={s} t={tAnzeige} />}
    </main>
  );
}

/** Einweisung am Smartboard: Lage für alle, Lagekarte; in einer Sitzung dazu Code und Teams. */
export function PlenumEinweisung(p: { inh: Sicht["inh"]; beitritt?: Beitritt }) {
  const inh = p.inh;
  const sz = inh.szenario;
  const b = p.beitritt;
  const lage = sz.lage.plenum;
  // seit 2.5 (F1): die vier Panzer der 1. Kp in Stellung, wie in der Lage beschrieben (Spielbeginn, alle einsatzbereit)
  const start = useMemo(() => ({ ...LEER, eigene: eigeneLage(inh, zustandAus([], inh), 0) }), [inh]);
  return (
    <div class="plenum-raster plenum-einweisung">
      <Panel titel="Lage für alle" klasse="plenum-text">
        <div class="stapel" style="gap:12px;height:100%">
          <div>{lage.absaetze.map((a) => <p>{a}</p>)}</div>
          <div class="klein leise">{sz.ablauf_unterricht.map((a) => `${a.phase} ${a.dauer_min} min`).join(" · ")}</div>
        </div>
      </Panel>
      <div class="stapel">
        {b && (
          <section class="beitritt" data-testid="beitritt">
            <div>
              <div class="leise">Mitspielen: <span class="mono">{b.adresse}</span></div>
              <div class="beitritt-code">Code <b class="mono" data-testid="plenum-code">{b.code}</b></div>
            </div>
            <div class="beitritt-teams">
              {b.teams.length === 0 ? <span class="sehr-leise">noch keine Teams</span>
                : b.teams.map((t) => <span key={t.id} class={t.spieler ? "" : "sehr-leise"}><TeamMarke name={t.name} farbe={t.farbe} /></span>)}
            </div>
          </section>
        )}
        <Panel titel={raumName(inh)} klasse="ohne-rand" rechts={<span class="klein sehr-leise">Gelände, Einheiten und Namen sind frei erfunden</span>}>
          <LagekarteAnsicht inh={inh} lagebild={start} hintergrund="topo" legende="gelaende" fuellen={KARTE_MITTE_PLENUM} />
        </Panel>
      </div>
    </div>
  );
}

function Aufloesung(p: { s: Sicht; t: number }) {
  const inh = p.s.inh;
  const z = p.s.stand.zustand;
  const start = inh.szenario.spieluhr.start;
  const tLage = Math.floor(Math.min(p.t, inh.szenario.spieluhr.dauer_s));
  const lb = useMemo(() => lagebildKontrolle(inh, z, tLage), [inh, z, tLage]);
  const fx = useMemo(() => effekte(inh, z, "alle"), [inh, z]);
  const wirkungen = lb.wirkungen.filter((w) => !w.geplant);
  const bearbeitet = z.reihenfolge.filter((id) => z.meldungen[id].ergebnis).length;
  const trotzWarnung = z.reihenfolge.filter((id) => (z.meldungen[id].freigabe?.warnungen ?? []).some((w) => !/^(Bestand |nur \d+ von \d+ )/.test(w))).length;
  const ungemeldet = inh.szenario.ziele.filter((x) => x.ungemeldet);
  return (
    <div class="plenum-raster plenum-aufloesung">
      <Panel titel="Kontrollkarte" klasse="ohne-rand" rechts={<span class="klein sehr-leise">Lage {uhrzeit(start, tLage)}</span>}>
        <LagekarteAnsicht inh={inh} lagebild={lb} hintergrund="luftbild" sprites legende="kontrolle" zeichenGroesse={18} testid="aufloesung-karte" fuellen={KARTE_MITTE_PLENUM}
          uhr={() => p.s.kartenUhr()} effekte={fx} />
      </Panel>
      <div class="stapel">
        <Panel titel="Auf einen Blick" klasse="flach">
          <div class="plenum-zahl"><span>Meldungen abgeschlossen</span><b>{bearbeitet} / {inh.szenario.meldungen.length}</b></div>
          <div class="plenum-zahl"><span>Wirkungen</span><b>{wirkungen.length}</b></div>
          <div class="plenum-zahl"><span>davon mit Fehltreffer</span><b style={wirkungen.some((w) => w.fehl) ? "color:#ff8f86" : ""}>{wirkungen.filter((w) => w.fehl).length}</b></div>
          <div class="plenum-zahl"><span>Bekämpft trotz Regelwarnung</span><b>{trotzWarnung}</b></div>
          <div class="plenum-zahl"><span>Von ARGUS nie gemeldet</span><b>{ungemeldet.map((x) => inh.fahrzeuge[x.typ]?.name ?? x.typ).join(", ") || "–"}</b></div>
        </Panel>
        <Panel titel="Wirkungen" liste>
          {wirkungen.length === 0 ? <div class="hinweistext">Keine Wirkung.</div> : (
            <div class="treffer-liste">
              {wirkungen.map((w) => (
                <div class={`wirkung-eintrag ${w.fehl ? "fehl" : ""}`}>
                  <b>{w.text}</b>
                  {w.zeilen.map((zl) => <div class="klein leise">{zl}</div>)}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
