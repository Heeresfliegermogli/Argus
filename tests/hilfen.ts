import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type JsonHoler, STANDARD_SZENARIO, ladeInhalte } from "../src/inhalte/laden";
import type { Inhalte } from "../src/inhalte/typen";

const DATEN = fileURLToPath(new URL("../public/daten/", import.meta.url));

export const vonPlatte: JsonHoler = async (name) => JSON.parse(readFileSync(DATEN + name, "utf-8"));

let zwischen: Inhalte | null = null;
export async function inhalte(): Promise<Inhalte> {
  zwischen ??= await ladeInhalte(STANDARD_SZENARIO, vonPlatte);
  return zwischen;
}

export function warte(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function bis(bedingung: () => boolean, ms = 3000, text = "Bedingung"): Promise<void> {
  const ende = Date.now() + ms;
  while (!bedingung()) {
    if (Date.now() > ende) throw new Error(`${text} nicht erfüllt nach ${ms} ms`);
    await warte(10);
  }
}
