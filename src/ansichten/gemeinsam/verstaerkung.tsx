// Verstärkung reinrufen (Spielleitung): vorbereitete Feindgruppen aus dem Szenario (V-1 … V-5) an alle
// Teams (Standard, damit die Teams vergleichbar bleiben) oder an ein einzelnes Team. Nur Routineziele;
// in den Zeitfenstern `nicht_einspielen` ist eine Gruppe gesperrt (käme Schule oder Sanität zu nahe),
// jede Gruppe höchstens einmal je Lauf. Jede Verstärkung steht im Protokoll des Teams.
import { useState } from "preact/hooks";
import { spielzeit, uhrzeit } from "../../kern/uhr";
import { type VerstaerkungStand, verstaerkungStand, verstaerkungen } from "../../kern/welt";
import type { Inhalte } from "../../inhalte/typen";
import type { Spielzustand } from "../../kern/zustand";
import { Menue } from "./bausteine";
import { TeamMarke } from "./rahmen";

/** Nach dieser Spielzeit nur noch, wenn die Eingänge leer sind (Simulation 2b). */
const SPAET_S = 1080;

export interface VerstaerkungTeam {
  id: string;
  name: string;
  farbe: string;
  z: Spielzustand;
  /** offene Meldungen bei G1 + G2 + G3 */
  eingang: number;
}

function zustandText(inh: Inhalte, v: VerstaerkungStand): string {
  const start = inh.szenario.spieluhr.start;
  if (v.eingespielt !== undefined) return `eingespielt ${uhrzeit(start, v.eingespielt)}`;
  if (v.gesperrtBis !== undefined) return `jetzt gesperrt (käme Schule oder Sanität zu nahe) – wieder ab ${uhrzeit(start, v.gesperrtBis)}`;
  return "bereit";
}

/** Menü mit allen Gruppen; je Gruppe „an alle“ und je Team ein Knopf. */
export function VerstaerkungMenue(p: {
  inh: Inhalte; teams: VerstaerkungTeam[]; jetzt: number; gesperrt?: boolean; einspielen: (gruppe: string, teams: string[]) => void;
}) {
  const [offen, setOffen] = useState(false);
  // Das Menü liegt fest im Fenster unter dem Knopf, rechtsbündig: Die Steuerleiste schneidet sonst ab.
  const [lage, setLage] = useState<{ top: number; right: number; maxHoehe: number } | undefined>(undefined);
  const { inh } = p;
  const gruppen = verstaerkungen(inh);
  if (!gruppen.length) return null;
  const stand = new Map(p.teams.map((t) => [t.id, verstaerkungStand(inh, t.z.verstaerkungen, Math.min(spielzeit(t.z.uhr, p.jetzt), inh.szenario.spieluhr.dauer_s))]));
  const tMax = Math.max(0, ...p.teams.map((t) => spielzeit(t.z.uhr, p.jetzt)));
  const spaet = tMax >= SPAET_S && p.teams.some((t) => t.eingang > 0);
  const aktiv = p.teams.filter((t) => !t.z.ende);
  return (
    <span class="menue-anker">
      <button type="button" class="knopf klein" disabled={p.gesperrt || !aktiv.length} data-testid="verstaerkung-menue" onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setLage({ top: Math.round(r.bottom + 4), right: Math.max(8, Math.round(window.innerWidth - r.right)), maxHoehe: Math.round(window.innerHeight - r.bottom - 16) });
          setOffen(!offen);
        }}
        title="Vorbereitete Feindgruppen einspielen (nur Routineziele, keine neuen Fallen)">Verstärkung ▾</button>
      <Menue offen={offen} schliessen={() => setOffen(false)} testid="verstaerkung-liste" fest={lage}>
        <div class="menue-kopf"><b>Verstärkung reinrufen</b> <span class="sehr-leise">Standard: an alle Teams, damit sie vergleichbar bleiben</span></div>
        {spaet && <div class="klein" style="color:var(--warn,#e0a030)">Nach 10:18 nur, wenn die Eingänge leer sind – sonst verpasst ein Team die Schlüsselfälle am Ende.</div>}
        {gruppen.map((g) => {
          const frei = aktiv.filter((t) => {
            const v = stand.get(t.id)!.find((x) => x.id === g.id)!;
            return v.eingespielt === undefined && v.gesperrtBis === undefined;
          });
          const erster = stand.get(aktiv[0]?.id ?? p.teams[0]?.id)?.find((x) => x.id === g.id);
          return (
            <div class="verstaerkung-zeile" key={g.id} data-verstaerkung={g.id}>
              <div class="menue-zeile">
                <span><b>{g.id}</b> {g.name} <span class="sehr-leise">· {g.kurz}</span></span>
                <button type="button" class="knopf klein gut" disabled={!frei.length} data-alle={g.id}
                  title={frei.length ? `${g.id} an ${frei.length === aktiv.length ? "alle Teams" : frei.map((t) => t.name).join(", ")}` : erster ? zustandText(inh, erster) : ""}
                  onClick={() => { p.einspielen(g.id, frei.map((t) => t.id)); setOffen(false); }}>
                  an alle{frei.length && frei.length < aktiv.length ? ` (${frei.length})` : ""}
                </button>
              </div>
              <div class="zeile" style="gap:4px;flex-wrap:wrap">
                <span class="klein sehr-leise" style="flex:1 1 220px">{g.zweck}</span>
                {p.teams.map((t) => {
                  const v = stand.get(t.id)!.find((x) => x.id === g.id)!;
                  const geht = !t.z.ende && v.eingespielt === undefined && v.gesperrtBis === undefined;
                  return (
                    <button type="button" key={t.id} class={`knopf klein ${v.eingespielt !== undefined ? "an" : ""}`} disabled={!geht}
                      data-team-verstaerkung={`${t.name}:${g.id}`} title={`${t.name}: ${zustandText(inh, v)}`}
                      onClick={() => { p.einspielen(g.id, [t.id]); setOffen(false); }}>
                      <TeamMarke name={t.name} farbe={t.farbe} klein />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </Menue>
    </span>
  );
}
