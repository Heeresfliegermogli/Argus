// Konsistenzprüfung der Inhalte beim Laden. Fehler verhindern den Spielstart nicht, werden aber
// in der Spielleitung angezeigt. Entspricht den Verweis- und Zeitprüfungen aus pruefe_szenario.py.
import { argusEmpfehlung } from "../kern/regeln";
import type { Inhalte } from "./typen";

export interface Pruefbericht {
  fehler: string[];
  warnungen: string[];
}

export function pruefeInhalte(inh: Inhalte): Pruefbericht {
  const { szenario: sz } = inh;
  const fehler: string[] = [];
  const warnungen: string[] = [];
  const doppelt = (liste: { id: string }[], was: string) => {
    const gesehen = new Set<string>();
    for (const e of liste) {
      if (gesehen.has(e.id)) fehler.push(`doppelte ${was}-ID ${e.id}`);
      gesehen.add(e.id);
    }
  };
  doppelt(sz.ziele, "Ziel");
  doppelt(sz.meldungen, "Meldungs");
  doppelt([...sz.injects, ...(sz.reserve_injects ?? [])], "Inject");

  for (const z of sz.ziele) {
    if (!inh.fahrzeuge[z.typ]) fehler.push(`${z.id}: Typ ${z.typ} fehlt im Fahrzeugkatalog`);
  }
  const faelle = new Set([...sz.schluesselfaelle, ...(sz.nebenfaelle ?? [])].map((f) => f.id));
  const gemeldet = new Set<string>();
  let vorher = -1;
  for (const m of sz.meldungen) {
    if (m.t_s < vorher) fehler.push(`${m.id}: Meldungen nicht zeitlich sortiert`);
    vorher = m.t_s;
    if (m.t_s >= sz.spieluhr.dauer_s) fehler.push(`${m.id}: nach Spielende`);
    if (!m.ziele.length) fehler.push(`${m.id}: keine Ziele`);
    for (const zid of m.ziele) {
      if (!inh.ziele[zid]) fehler.push(`${m.id}: Ziel ${zid} unbekannt`);
      gemeldet.add(zid);
    }
    if (m.fall && !faelle.has(m.fall)) fehler.push(`${m.id}: Fall ${m.fall} unbekannt`);
    if (m.folge_von && !inh.meldungen[m.folge_von]) fehler.push(`${m.id}: folge_von ${m.folge_von} unbekannt`);
    const soll = argusEmpfehlung(m.argus.konfidenz, inh.regeln);
    if (m.argus.empfehlung !== soll && m.argus.empfehlung !== "NICHT BEKÄMPFEN") {
      fehler.push(`${m.id}: Empfehlung ${m.argus.empfehlung} passt nicht zu ${m.argus.konfidenz} % (Soll ${soll})`);
    }
  }
  for (const z of sz.ziele) {
    if (!gemeldet.has(z.id) && !z.ungemeldet) warnungen.push(`${z.id} wird nie gemeldet`);
  }
  for (const i of sz.injects) {
    if (i.t_s === undefined && !i.bedingung) fehler.push(`${i.id}: weder Zeit noch Bedingung`);
    if (i.t_s !== undefined && i.t_s >= sz.spieluhr.dauer_s) fehler.push(`${i.id}: nach Spielende`);
    for (const zid of i.bedingung?.ziele ?? []) {
      if (!inh.ziele[zid]) fehler.push(`${i.id}: Ziel ${zid} unbekannt`);
    }
  }
  for (const e of sz.ereignisse ?? []) {
    const ids = [...e.bedingung.ziele, ...e.wirkungen.flatMap((w) => [w.von, w.ziel])];
    for (const zid of ids) if (!inh.ziele[zid]) fehler.push(`${e.id}: Ziel ${zid} unbekannt`);
  }
  for (const f of sz.schluesselfaelle) {
    if (!inh.meldungen[f.meldung]) fehler.push(`${f.id}: Meldung ${f.meldung} unbekannt`);
  }
  for (const w of Object.values(inh.wirkmittel)) {
    if (!(w.wirkradius_m > 0) || !(w.vorlauf_s >= 0)) fehler.push(`${w.id}: Wirkradius oder Vorlauf ungültig`);
  }
  if (!Object.keys(inh.wirkmittel).length) fehler.push("keine Wirkmittel im Katalog");
  return { fehler, warnungen };
}
