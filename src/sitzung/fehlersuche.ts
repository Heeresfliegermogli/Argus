// Zugriff für Fehlersuche und Ende-zu-Ende-Tests über die Browserkonsole:
//   window.argus         die Sicht, die das Fenster gerade zeigt (stand, senden …); ohne Sicht die Sitzung
//   window.argusSitzung  die Sitzung des Fensters
//   window.argusTeams()  je Team: Name, Lauf, seq, Fingerabdruck, Kennungen der Aktionen im Protokoll
//   window.argusGespeichert(team)  Kennungen aller gespeicherten Aktionen des aktuellen Laufs (Promise)
import { fingerabdruck } from "../kern/zustand";
import type { Sicht } from "./sicht";
import type { Sitzung } from "./sitzung";

interface Fenster {
  argus?: Sicht | Sitzung;
  argusSitzung?: Sitzung;
  argusTeams?: () => unknown[];
  argusGespeichert?: (team: string) => Promise<string[]>;
}

let sitzung: Sitzung | null = null;

export function meldeSitzung(s: Sitzung | null): void {
  sitzung = s;
  const w = globalThis as unknown as Fenster;
  w.argusSitzung = s ?? undefined;
  w.argus = s ?? undefined;
  w.argusTeams = () => (sitzung ? sitzung.stand.teams.map((t) => {
    const sp = sitzung!.spiel(t.id);
    const z = sp?.stand.zustand;
    return {
      id: t.id, name: t.name, farbe: t.farbe, lauf: t.lauf, geladen: !!sp?.stand.geladen,
      spieler: t.spieler.map((x) => ({ client: x.client, name: x.name, rollen: x.rollen, online: x.online })),
      seq: z?.seq ?? 0, fp: z ? fingerabdruck(z) : "", aktionen: z ? Object.keys(z.aktionen) : [],
      offen: sp ? Object.keys(sp.stand.offen) : [], laeuft: !!z?.uhr.laeuft, ende: !!z?.ende,
      uhr: z ? { ts: z.uhr.ts, t_s: z.uhr.t_s, tempo: z.uhr.tempo } : null, host: !!sp?.hostAktiv,
      protokoll: sp ? sp.stand.protokoll.map((e) => ({ seq: e.seq, typ: e.typ, aktion: e.aktion ?? null, client: e.von.client ?? null, rolle: e.von.rolle })) : [],
    };
  }) : []);
  w.argusGespeichert = (team: string) => new Promise<string[]>((ok) => {
    const lauf = sitzung?.team(team)?.lauf;
    if (!sitzung || !lauf) return ok([]);
    const ids: string[] = [];
    const ab = sitzung.adapter.aufAktionen(team, lauf, (a) => ids.push(a.id));
    setTimeout(() => { ab(); ok(ids); }, 1500);
  });
}

/** Die Ansicht meldet ihre Sicht beim Erscheinen und gibt sie beim Verschwinden wieder frei. */
export function meldeSicht(s: Sicht | null): void {
  (globalThis as unknown as Fenster).argus = s ?? sitzung ?? undefined;
}
