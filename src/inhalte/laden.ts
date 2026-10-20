// Lädt Szenario, Karte und Kataloge und baut die Nachschlage-Tabellen.
import { holeJson } from "@quelle";
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

export function baueInhalte(
  szenario: Szenario, karte: Karte, fahrzeuge: KatalogFahrzeuge, wirkmittel: KatalogWirkmittel, regeln: Regeln,
): Inhalte {
  const nachId = <T extends { id: string }>(liste: T[]): Record<string, T> =>
    Object.fromEntries(liste.map((e) => [e.id, e]));
  return {
    szenario,
    karte,
    regeln,
    fahrzeuge: nachId(fahrzeuge.fahrzeuge),
    wirkmittel: nachId(wirkmittel.wirkmittel),
    ziele: nachId(szenario.ziele),
    meldungen: nachId(szenario.meldungen),
    injects: { ...nachId(szenario.injects), ...nachId(szenario.reserve_injects ?? []) },
  };
}
