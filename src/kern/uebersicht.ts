// Übersicht der Spielleitung über alle Teams: Eingang, Wirkungen, Fehltreffer und die Schlüsselfälle live. Reine Funktion von
// Inhalten und Spielstand eines Teams.
//
// Seit 2.6 (Änderungen H) rechnet jeder Team-Laptop sein Spiel selbst und schickt der Spielleitung etwa alle 5 s eine
// Statusmeldung (status/<team>): Uhr, Eingang, Schlüsselfälle offen/richtig/falsch, Zustand der Panzer. Die Übersicht zeigt diese
// Meldungen; sie kommen auch mit Verzug an, die Uhr läuft aus dem letzten Stand weiter (statusUhr).
//
// Schlüsselfall (S1–S8) live:
//   wartet  – die Meldung ist noch nicht gekommen
//   offen   – die Meldung ist im Eingang des Teams (auch zurückgestellt)
//   richtig – abgeschlossen, ohne dass Geschütztes, Verbündete, Zivilpersonen oder die Attrappe
//             getroffen wurden (S4: auch, wenn M18 zurückgestellt bleibt und die Folgemeldung erledigt ist)
//   falsch  – eine Bekämpfung trifft (oder wird treffen) etwas, das nicht bekämpft werden durfte
// Das ist die Live-Anzeige für die Spielleitung, nicht die Auswertung (Schritt 8).
import type { Inhalte } from "../inhalte/typen";
import { einschlagVon, weltFuer } from "./lage";
import { FEHL } from "./lagebild";
import { wirkungBeimEinschlag } from "./regeln";
import { standText, warteschlange } from "./sichten";
import { spielzeit } from "./uhr";
import { panzer as eigenePanzer, verlustStand } from "./verluste";
import type { MeldungsStand, Spielzustand } from "./zustand";

export type FallStatus = "wartet" | "offen" | "richtig" | "falsch";

export interface FallStand {
  id: string;
  titel: string;
  status: FallStatus;
  /** kurzer Stand für den Tooltip */
  text: string;
}

export interface TeamUebersicht {
  /** offene Meldungen im Eingang (ohne zurückgestellte) */
  eingang: number;
  zurueckgestellt: number;
  /** Meldungen erschienen */
  meldungen: number;
  wirkungen: number;
  /** Bekämpfungen, die Geschütztes, Verbündete, Zivilpersonen oder die Attrappe treffen (auch noch im Anflug) */
  fehltreffer: number;
  faelle: FallStand[];
}

/** Treffer einer Bekämpfung: nach der Wirkung, sonst wie sie beim vorausberechneten Einschlag ausfallen wird. */
function trefferDerFreigabe(inh: Inhalte, z: Spielzustand, st: MeldungsStand) {
  if (st.wirkung) return st.wirkung.getroffen;
  if (!st.freigabe) return [];
  const e = einschlagVon(inh, z, st.id);
  return e ? wirkungBeimEinschlag(inh, e, st.freigabe.wirkmittel, z.zerstoert).getroffen : [];
}

function istFehl(inh: Inhalte, z: Spielzustand, st: MeldungsStand): boolean {
  return trefferDerFreigabe(inh, z, st).some((g) => FEHL.has(g.kategorie));
}

const ABGESCHLOSSEN = new Set(["erledigt", "entfallen", "wirkung"]);

export function teamUebersicht(basis: Inhalte, z: Spielzustand): TeamUebersicht {
  const inh = weltFuer(basis, z);
  const sz = inh.szenario;
  const liste = z.reihenfolge.map((id) => z.meldungen[id]);
  const faelle = [...sz.schluesselfaelle].sort((a, b) => a.id.localeCompare(b.id)).map((f): FallStand => {
    const ids = [...new Set([f.meldung, ...sz.meldungen.filter((m) => m.fall === f.id).map((m) => m.id)])];
    const staende = ids.map((id) => z.meldungen[id]).filter((x): x is MeldungsStand => !!x);
    const haupt = z.meldungen[f.meldung];
    const fehl = staende.find((st) => istFehl(inh, z, st));
    if (fehl) return { id: f.id, titel: f.titel, status: "falsch", text: `${fehl.id} bekämpft – trifft, was nicht bekämpft werden durfte` };
    if (!haupt) return { id: f.id, titel: f.titel, status: "wartet", text: `${f.meldung} noch nicht gekommen` };
    const textVon = (st: MeldungsStand) => `${st.id}: ${standText(st)}`;
    if (ABGESCHLOSSEN.has(haupt.stufe)) return { id: f.id, titel: f.titel, status: "richtig", text: textVon(haupt) };
    const folge = staende.find((st) => st.id !== haupt.id && ABGESCHLOSSEN.has(st.stufe));
    if (haupt.zurueckgestellt && folge) return { id: f.id, titel: f.titel, status: "richtig", text: `${textVon(haupt)}, ${textVon(folge)}` };
    return { id: f.id, titel: f.titel, status: "offen", text: textVon(haupt) };
  });
  const offen = warteschlange(z);
  return {
    eingang: offen.filter((m) => !m.zurueckgestellt).length,
    zurueckgestellt: offen.filter((m) => m.zurueckgestellt).length,
    meldungen: liste.length,
    wirkungen: liste.filter((m) => m.wirkung).length,
    fehltreffer: liste.filter((m) => istFehl(inh, z, m)).length,
    faelle,
  };
}

// ---------------------------------------------------------------- Statusmeldung des Teams (seit 2.6, H1.2)

/**
 * Statusmeldung des Team-Laptops an die Spielleitung (Firebase status/<team>, etwa alle 5 s). Flach und klein, damit sie auch über
 * Long-Polling mit Verzug zuverlässig ankommt; die Felder prüfen die Firebase-Regeln.
 */
export interface TeamStatus {
  /** Fenster, das das Spiel des Teams rechnet */
  client: string;
  lauf: string;
  /** letztes Ereignis im Protokoll des Teams */
  seq: number;
  /** so weit ist das Protokoll hochgeladen */
  hoch: number;
  /** Serverzeit der Meldung (ms) und Spielzeit dazu (s) */
  ts: number;
  t_s: number;
  laeuft: boolean;
  tempo: number;
  ende: boolean;
  eingang: number;
  zurueck: number;
  meldungen: number;
  wirkungen: number;
  fehl: number;
  /** Schlüsselfälle „S1:r,S2:o,…“ (w wartet, o offen, r richtig, f falsch) */
  faelle: string;
  /** Zustand je Panzer in %, „a“ = ausgefallen, z. B. „100,85,40a,72“ */
  panzer: string;
  bereit: number;
  verwundete: number;
}

const KURZ: Record<FallStatus, string> = { wartet: "w", offen: "o", richtig: "r", falsch: "f" };
const LANG: Record<string, FallStatus> = { w: "wartet", o: "offen", r: "richtig", f: "falsch" };

/** Statusmeldung aus dem Spielstand des Teams (Spielzeit t zur Serverzeit ts). */
export function teamStatus(basis: Inhalte, z: Spielzustand, ts: number, extra: { client: string; lauf: string; hoch: number }): TeamStatus {
  const u = teamUebersicht(basis, z);
  const t = Math.min(spielzeit(z.uhr, ts), basis.szenario.spieluhr.dauer_s);
  const v = verlustStand(basis, z, t);
  const pl = eigenePanzer(basis);
  return {
    client: extra.client, lauf: extra.lauf, seq: z.seq, hoch: extra.hoch, ts: Math.round(ts), t_s: Math.round(t * 10) / 10,
    laeuft: z.uhr.laeuft && !z.ende, tempo: z.uhr.tempo, ende: z.ende,
    eingang: u.eingang, zurueck: u.zurueckgestellt, meldungen: u.meldungen, wirkungen: u.wirkungen, fehl: u.fehltreffer,
    faelle: u.faelle.map((f) => `${f.id}:${KURZ[f.status]}`).join(","),
    panzer: v ? pl.map((p) => `${v.panzer[p.id].zustand}${v.panzer[p.id].ausgefallen ? "a" : ""}`).join(",") : "",
    bereit: v?.zug.bereit ?? 0, verwundete: v?.zug.verwundete ?? 0,
  };
}

/** Schlüsselfälle aus der Statusmeldung (mit Titel aus dem Szenario). */
export function statusFaelle(inh: Inhalte, s: Pick<TeamStatus, "faelle">): FallStand[] {
  const titel = new Map(inh.szenario.schluesselfaelle.map((f) => [f.id, f.titel]));
  return (s.faelle || "").split(",").filter(Boolean).map((x) => {
    const [id, k] = x.split(":");
    const status = LANG[k] ?? "wartet";
    return { id, titel: titel.get(id) ?? id, status, text: status === "wartet" ? "kommt noch" : status };
  });
}

/** Zustand der Panzer aus der Statusmeldung: [{ zustand, ausgefallen }] in der Reihenfolge des Szenarios. */
export function statusPanzer(s: Pick<TeamStatus, "panzer">): { zustand: number; ausgefallen: boolean }[] {
  return (s.panzer || "").split(",").filter(Boolean).map((x) => ({ zustand: Number.parseInt(x, 10) || 0, ausgefallen: x.endsWith("a") }));
}

/** Spielzeit des Teams jetzt (Serverzeit jetzt) aus der letzten Statusmeldung: läuft weiter, bis die nächste kommt. */
export function statusUhr(s: Pick<TeamStatus, "ts" | "t_s" | "laeuft" | "tempo" | "ende">, jetzt: number, dauer: number): number {
  if (!s.laeuft || s.ende) return Math.min(s.t_s, dauer);
  return Math.min(dauer, s.t_s + (Math.max(0, jetzt - s.ts) / 1000) * (s.tempo || 1));
}
