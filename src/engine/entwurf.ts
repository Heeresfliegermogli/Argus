// Ein Ereignis, bevor der Host Laufnummer und Zeiten vergibt.
import type { Absender, EreignisDaten, EreignisTyp } from "../kern/ereignisse";

export type Entwurf = {
  [T in EreignisTyp]: {
    typ: T;
    daten: EreignisDaten[T];
    von?: Absender;
    aktion?: string;
    ts_aktion?: number;
    /** geplante Spielzeit (Zeitplan); der Host nimmt sie, solange sie nicht vor dem letzten Ereignis liegt */
    t_geplant?: number;
  };
}[EreignisTyp];

export function entwurf<T extends EreignisTyp>(typ: T, daten: EreignisDaten[T], extra: Partial<Omit<Extract<Entwurf, { typ: T }>, "typ" | "daten">> = {}): Entwurf {
  return { typ, daten, ...extra } as Entwurf;
}
