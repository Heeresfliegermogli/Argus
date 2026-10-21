// Plenum (Smartboard): drei Bilder, die sich nach dem Spielstand von selbst umschalten und von Hand
// gewählt werden können.
//   Einweisung – Lage für alle, Lagekarte, die drei Gruppen (vor dem Start)
//   Lage       – Uhr und Lagekarte ohne Ziele (während des Spiels; der Raum sieht nichts Geheimes)
//   Auflösung  – Kontrollkarte mit Ground Truth und allen Wirkungen (nach Spielende)
// Die Auswertung mit Kennzahlen und Replay je Schlüsselfall folgt in Schritt 8.
import { useMemo, useState } from "preact/hooks";
import { LAGE_TAKT_S, LEER, lagebildKontrolle } from "../kern/lagebild";
import { ROLLEN_NAME } from "../kern/sichten";
import { phaseZu, uhrzeit } from "../kern/uhr";
import type { Sitzung } from "../sitzung/sitzung";
import { Panel } from "./gemeinsam/bausteine";
import { useSpielzeit, useStand } from "./gemeinsam/hooks";
import { LagekarteAnsicht } from "./gemeinsam/lagekarte";
import { gruppenKurz } from "./einweisung";

type Modus = "einweisung" | "lage" | "aufloesung";

/** Name des Raums aus der Karte, ohne Zusatz „(fiktiv)“. */
function raumName(inh: Sitzung["inh"]): string {
  return inh.karte.titel.replace(/\s*\(.*\)\s*$/, "");
}
const MODUS_TEXT: Record<Modus, string> = { einweisung: "Einweisung", lage: "Lage", aufloesung: "Auflösung" };

export function PlenumAnsicht(p: { s: Sitzung }) {
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

  return (
    <main class="plenum" data-modus={modus}>
      <div class="plenum-kopf">
        <h2 style="font-size:20px">{modus === "einweisung" ? sz.titel : modus === "lage" ? "Das Spiel läuft" : `Auflösung: was wirklich im ${raumName(inh)} war`}</h2>
        <div class="reiter">
          {(Object.keys(MODUS_TEXT) as Modus[]).map((m) => (
            <button type="button" class={modus === m ? "an" : ""} onClick={() => setWahl({ modus: m, bei: auto })} data-modus-knopf={m}>{MODUS_TEXT[m]}</button>
          ))}
        </div>
      </div>
      {modus === "einweisung" && <Einweisung s={s} />}
      {modus === "lage" && (
        <div class="plenum-raster plenum-lage">
          <Panel titel="Lagekarte" klasse="ohne-rand">
            <LagekarteAnsicht inh={inh} lagebild={LEER} hintergrund="topo" legende="gelaende" />
          </Panel>
          <div class="stapel">
            <Panel titel="Spieluhr" klasse="flach">
              <div class="plenum-uhr">{uhrzeit(sz.spieluhr.start, tAnzeige)}</div>
              <div class="leise" style="text-align:center;margin-top:6px;font-size:17px">Phase {phaseZu(sz, tAnzeige).nr}: {phaseZu(sz, tAnzeige).name}</div>
            </Panel>
            <Panel titel="Stand" klasse="flach">
              <div class="plenum-zahl"><span>ARGUS-Meldungen bisher</span><b>{z.reihenfolge.length} / {sz.meldungen.length}</b></div>
              <div class="plenum-zahl"><span>Wirkungen</span><b>{z.reihenfolge.filter((id) => z.meldungen[id].wirkung).length}</b></div>
              <div class="plenum-zahl"><span>Fast-Track</span><b>{z.fastTrack ? "EIN" : "AUS"}</b></div>
            </Panel>
          </div>
        </div>
      )}
      {modus === "aufloesung" && <Aufloesung s={s} t={tAnzeige} />}
    </main>
  );
}

function Einweisung(p: { s: Sitzung }) {
  const inh = p.s.inh;
  const sz = inh.szenario;
  const lage = sz.lage.plenum;
  return (
    <div class="plenum-raster plenum-einweisung">
      <Panel titel="Lage für alle" klasse="plenum-text">
        <div class="stapel" style="gap:12px;height:100%">
          <div>{lage.absaetze.map((a) => <p>{a}</p>)}</div>
          <div class="plenum-gruppen">
            {gruppenKurz(inh).map((g) => (
              <div class={`rolle-${g.rolle}`}><b>{ROLLEN_NAME[g.rolle]}</b>{g.text}</div>
            ))}
          </div>
          <div class="klein leise">{sz.ablauf_unterricht.map((a) => `${a.phase} ${a.dauer_min} min`).join(" · ")}</div>
        </div>
      </Panel>
      <Panel titel={raumName(inh)} klasse="ohne-rand" rechts={<span class="klein sehr-leise">Gelände, Einheiten und Namen sind frei erfunden</span>}>
        <LagekarteAnsicht inh={inh} lagebild={LEER} hintergrund="topo" legende="gelaende" />
      </Panel>
    </div>
  );
}

function Aufloesung(p: { s: Sitzung; t: number }) {
  const inh = p.s.inh;
  const z = p.s.stand.zustand;
  const start = inh.szenario.spieluhr.start;
  const tLage = Math.floor(p.t / LAGE_TAKT_S) * LAGE_TAKT_S;
  const lb = useMemo(() => lagebildKontrolle(inh, z, tLage), [inh, z, tLage]);
  const wirkungen = lb.wirkungen.filter((w) => !w.geplant);
  const bearbeitet = z.reihenfolge.filter((id) => z.meldungen[id].ergebnis).length;
  const trotzWarnung = z.reihenfolge.filter((id) => z.meldungen[id].g3?.entscheid === "freigabe" && (z.meldungen[id].g3?.warnungen.length ?? 0) > 0).length;
  const ungemeldet = inh.szenario.ziele.filter((x) => x.ungemeldet);
  return (
    <div class="plenum-raster plenum-aufloesung">
      <Panel titel="Kontrollkarte" klasse="ohne-rand" rechts={<span class="klein sehr-leise">Lage {uhrzeit(start, tLage)}</span>}>
        <LagekarteAnsicht inh={inh} lagebild={lb} hintergrund="luftbild" sprites legende="kontrolle" zeichenGroesse={18} testid="aufloesung-karte" />
      </Panel>
      <div class="stapel">
        <Panel titel="Auf einen Blick" klasse="flach">
          <div class="plenum-zahl"><span>Meldungen abgeschlossen</span><b>{bearbeitet} / {inh.szenario.meldungen.length}</b></div>
          <div class="plenum-zahl"><span>Wirkungen</span><b>{wirkungen.length}</b></div>
          <div class="plenum-zahl"><span>davon mit Fehltreffer</span><b style={wirkungen.some((w) => w.fehl) ? "color:#ff8f86" : ""}>{wirkungen.filter((w) => w.fehl).length}</b></div>
          <div class="plenum-zahl"><span>Freigaben trotz Regelwarnung</span><b>{trotzWarnung}</b></div>
          <div class="plenum-zahl"><span>Von ARGUS nie gemeldet</span><b>{ungemeldet.map((x) => x.id).join(", ")}</b></div>
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
