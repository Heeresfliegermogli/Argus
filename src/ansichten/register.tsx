// Welche Rolle welche Ansicht bekommt. Eine neue Rolle oder Ansicht ist ein Modul, das den
// Sitzungsstand liest und Aktionen sendet, und wird hier eingetragen.
import type { JSX } from "preact";
import type { Rolle } from "../kern/ereignisse";
import type { Sitzung } from "../sitzung/sitzung";
import { G1Ansicht } from "./g1";
import { G2Ansicht } from "./g2";
import { G3Ansicht } from "./g3";
import { PlenumAnsicht } from "./plenum";
import { SLAnsicht } from "./sl";

export const ANSICHTEN: Record<Rolle, (p: { s: Sitzung }) => JSX.Element> = {
  g1: G1Ansicht,
  g2: G2Ansicht,
  g3: G3Ansicht,
  sl: SLAnsicht,
  plenum: PlenumAnsicht,
};
