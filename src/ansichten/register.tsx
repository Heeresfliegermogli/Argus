// Welche Rolle welche Ansicht bekommt. Seit 2.6 (Änderungen H2) eine Rolle je Team: die Zielbearbeitung.
import type { JSX } from "preact";
import type { Rolle } from "../kern/ereignisse";
import type { Sicht } from "../sitzung/sicht";
import { PlenumAnsicht } from "./plenum";
import { SLAnsicht } from "./sl";
import { ZBAnsicht } from "./zb";

export const ANSICHTEN: Record<Rolle, (p: { s: Sicht }) => JSX.Element> = {
  zb: ZBAnsicht,
  sl: SLAnsicht,
  plenum: PlenumAnsicht,
};
