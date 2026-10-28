// Lädt Szenario, Karte und Kataloge und baut die Nachschlage-Tabellen.
import { holeJson } from "@quelle";
import { anzeigeDaten, anzeigeSzenario } from "../kern/anzeige";
import type {
  Inhalte, Karte, KatalogFahrzeuge, KatalogWirkmittel, Regeln, Szenario,
} from "./typen";

export const STANDARD_SZENARIO = "szenario_kraehe_01.json";

export type JsonHoler = (name: string) => Promise<unknown>;

export async function ladeInhalte(szenarioDatei = STANDARD_SZENARIO, hole: JsonHoler = holeJson): Promise<Inhalte> {
  if (!/^[\w.-]+\.json$/.test(szenarioDatei)) throw new Error(`Ungültiger Dateiname: ${szenarioDatei}`);
  const szenario = (await hole(szenarioDatei)) as Szenario;
  const k = szenario.kataloge;
  const [karte, fahrzeuge, wirkmittel, regeln] = await Promise.all([
    hole(k.karte), hole(k.fahrzeuge), hole(k.wirkmittel), hole(k.regeln),
  ]);
  return baueInhalte(szenario, karte as Karte, fahrzeuge as KatalogFahrzeuge, wirkmittel as KatalogWirkmittel, regeln as Regeln);
}

/**
 * Inhalte mit Nachschlage-Tabellen. Die Texte des Szenarios und der Regeln kommen für die Anzeige umgeschrieben an
 * (Rollen ohne G-Nummern, Spieluhr 00:00–25:00, „Ziel 7“ statt M07; src/kern/anzeige.ts) – Kennungen bleiben.
 */
export function baueInhalte(
  szenarioRoh: Szenario, karte: Karte, fahrzeuge: KatalogFahrzeuge, wirkmittel: KatalogWirkmittel, regelnRoh: Regeln,
): Inhalte {
  const szenario = anzeigeSzenario(szenarioRoh);
  const regeln = anzeigeDaten(regelnRoh, szenarioRoh);
  const nachId = <T extends { id: string }>(liste: T[]): Record<string, T> =>
    Object.fromEntries(liste.map((e) => [e.id, e]));
  return {
    szenario,
    karte,
    regeln,
    fahrzeuge: nachId(fahrzeuge.fahrzeuge),
    groessen: Object.fromEntries(Object.entries(fahrzeuge.groesse_nach_anzahl ?? {}).filter(([k]) => /^\d+$/.test(k))) as Record<string, string>,
    wirkmittel: nachId(wirkmittel.wirkmittel),
    ziele: nachId(szenario.ziele),
    meldungen: nachId(szenario.meldungen),
    injects: { ...nachId(szenario.injects), ...nachId(szenario.reserve_injects ?? []) },
  };
}
