// Rahmen jeder Ansicht: Kopfzeile mit Rolle, Team, Spieluhr und Phase, Verbindung und dem Knopf „Einweisung“. Seit 2.6 (H2.3, H5.6,
// H5.7) zeigt die Kopfzeile der Zielbearbeitung die vier Panzer der 1. Kp mit Zustand (ein getroffener blinkt rot, dazu kurz ein roter
// Rand am Bildschirm) und den Bestand der Wirkmittel groß. Vor Spielbeginn öffnet sich die Einweisung von selbst (einmal je Tab),
// bei Spielende sperrt eine Tafel die Eingaben.
// Der Team-Laptop rechnet sein Spiel selbst (H1): Die Kopfzeile sagt, ob das Protokoll im Netz ist, und bietet „Protokoll speichern“
// als Datei an (H1.3). Lehnen die Firebase-Regeln ab, steht oben ein roter Balken (H1.5).
// Der Wurzelknoten trägt data-Attribute (seq, Fingerabdruck), damit Tests Fenster vergleichen können.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Inhalte } from "../../inhalte/typen";
import { DIREKT_TEAM } from "../../kern/sitzungen";
import { ROLLEN_NAME } from "../../kern/sichten";
import { mmss, phaseZu, uhrzeit } from "../../kern/uhr";
import { panzer, PANZER_STUFE_TEXT, trefferText, verlustStand, verwText } from "../../kern/verluste";
import { type Spielzustand, fingerabdruck } from "../../kern/zustand";
import { protokollDatei, speichereDatei } from "../../sitzung/ablage";
import type { Sicht } from "../../sitzung/sicht";
import { istVeraltet } from "../../sync/adapter";
import { EinweisungFenster } from "../einweisung";
import { Hinweise } from "./bausteine";
import { useSpielzeit, useStand } from "./hooks";

function gelesen(schl: string): boolean {
  try {
    return sessionStorage.getItem(`argus:einweisung:${schl}`) === "1";
  } catch {
    return false;
  }
}

function merkeGelesen(schl: string): void {
  try {
    sessionStorage.setItem(`argus:einweisung:${schl}`, "1");
  } catch {
    /* privater Modus */
  }
}

/** Spieluhr mit Status und Phase (Kopfzeile). */
export function UhrAnzeige(p: { inh: Inhalte; z: Spielzustand; t: number; lauf: string | null; kurz?: boolean }) {
  const sz = p.inh.szenario;
  const z = p.z;
  const tAnzeige = Math.min(p.t, sz.spieluhr.dauer_s);
  const phase = phaseZu(sz, tAnzeige);
  const uhrText = !p.lauf ? "kein Spiel" : z.ende ? "Spielende" : z.uhr.laeuft ? `läuft${z.uhr.tempo !== 1 ? ` ×${z.uhr.tempo}` : ""}` : tAnzeige === 0 ? "noch nicht gestartet" : "angehalten";
  return (
    <div class="uhr" title={`Spielzeit ${mmss(tAnzeige)} von ${mmss(sz.spieluhr.dauer_s)}`} data-tour="uhr">
      <span class="uhr-zeit" data-testid="uhr">{uhrzeit(sz.spieluhr.start, tAnzeige)}</span>
      <span class="uhr-info">{uhrText}{!p.kurz && <><br />Phase {phase.nr}: {phase.name}</>}</span>
    </div>
  );
}

/**
 * Zustand der eigenen Truppe (seit 2.5, F2.6; Spielleitung, Plenum): „1. Kp: 3/4 einsatzbereit · 4 Verwundete“ und je Panzer ein
 * kleiner Balken (Zustand in %, gelb eingeschränkt, grau ausgefallen).
 */
export function KompanieStand(p: { inh: Inhalte; z: Spielzustand; t: number; lauf: string | null }) {
  const et = p.inh.szenario.eigene_truppe ?? p.inh.basis?.szenario.eigene_truppe;
  const vr = p.inh.regeln.verluste;
  if (!et || !vr || !p.lauf) return null;
  const v = verlustStand(p.inh, p.z, Math.min(p.t, p.inh.szenario.spieluhr.dauer_s));
  if (!v) return null;
  const zg = v.zug;
  const kl = zg.ausgefallen ? "kp-ausgefallen" : zg.eingeschraenkt ? "kp-eingeschraenkt" : "";
  const pl = panzer(p.inh);
  const titel = pl.map((pz) => {
    const s = v.panzer[pz.id];
    return `${pz.name} (${pz.rolle ? `${pz.rolle}, ` : ""}${pz.ort}): ${s.zustand} % ${PANZER_STUFE_TEXT[s.stufe]} · ${trefferText(s.treffer)}`;
  }).join("\n");
  return (
    <span class={`badge kp-stand eigen ${kl}`} data-testid="kp-stand" data-bereit={zg.bereit} data-gesamt={zg.gesamt} data-verwundete={zg.verwundete}
      title={`${et.einheit} – Zustand der Panzer\n${titel}`}>
      {et.name}: {zg.bereit}/{zg.gesamt} einsatzbereit · {verwText(zg.verwundete)}
      <span class="pz-balken-reihe" aria-hidden="true">
        {pl.map((pz) => {
          const s = v.panzer[pz.id];
          return <span key={pz.id} class="pz-balken" data-pz={pz.name} data-stufe={s.stufe} data-zustand={s.zustand}><i style={{ width: `${s.ausgefallen ? 100 : s.zustand}%` }} /></span>;
        })}
      </span>
    </span>
  );
}

/** So lange blinkt ein getroffener Panzer in der Kopfzeile (ms, Echtzeit). */
const BLINK_MS = 4000;

/**
 * Die vier Panzer der 1. Kp in der Kopfzeile der Zielbearbeitung (H2.3, H5.7): Name, Zustand in %, Stufe. Wird einer getroffen,
 * blinkt er rot und der Bildschirm bekommt kurz einen roten Rand. Keine Personen, keine Punkte.
 */
export function PanzerLeiste(p: { inh: Inhalte; z: Spielzustand; t: number; lauf: string | null; aufTreffer?: () => void }) {
  const vr = p.inh.regeln.verluste;
  const v = vr && p.lauf ? verlustStand(p.inh, p.z, Math.min(p.t, p.inh.szenario.spieluhr.dauer_s)) : null;
  const vorher = useRef<Record<string, number> | null>(null);
  const [blink, setBlink] = useState<Record<string, number>>({});
  const pl = panzer(p.inh);
  const treffer = v ? pl.map((pz) => v.panzer[pz.id].treffer).join(",") : "";
  useEffect(() => {
    if (!v) return;
    const jetzt = Object.fromEntries(pl.map((pz) => [pz.id, v.panzer[pz.id].treffer]));
    // beim ersten Bild (oder nach Neuladen) nicht blinken
    if (vorher.current && p.z.uhr.laeuft) {
      const neu = pl.filter((pz) => jetzt[pz.id] > (vorher.current![pz.id] ?? 0)).map((pz) => pz.id);
      if (neu.length) {
        const bis = Date.now() + BLINK_MS;
        setBlink((b) => ({ ...b, ...Object.fromEntries(neu.map((id) => [id, bis])) }));
        p.aufTreffer?.();
        setTimeout(() => setBlink((b) => Object.fromEntries(Object.entries(b).filter(([, x]) => x > Date.now()))), BLINK_MS + 50);
      }
    }
    vorher.current = jetzt;
  }, [treffer, p.lauf]);
  if (!v) return null;
  return (
    <div class="pz-leiste" data-tour="panzer" data-testid="panzer-leiste" data-bereit={v.zug.bereit} data-verwundete={v.zug.verwundete}
      title={`${p.inh.szenario.eigene_truppe?.einheit ?? "1. Kp"} – ${v.zug.bereit}/${v.zug.gesamt} einsatzbereit · ${verwText(v.zug.verwundete)}`}>
      {pl.map((pz) => {
        const s = v.panzer[pz.id];
        const an = (blink[pz.id] ?? 0) > Date.now();
        return (
          <span key={pz.id} class={`pz-kachel ${s.stufe} ${an ? "getroffen" : ""}`} data-pz={pz.name} data-stufe={s.stufe} data-zustand={s.zustand}
            title={`${pz.name} (${pz.ort}): ${s.zustand} % ${PANZER_STUFE_TEXT[s.stufe]} · ${trefferText(s.treffer)}`}>
            <b>{pz.name}</b>
            <span class="pz-wert">{s.ausgefallen ? "aus" : `${s.zustand} %`}</span>
            <i class="pz-mini" style={{ width: `${s.ausgefallen ? 100 : s.zustand}%` }} />
          </span>
        );
      })}
      {v.zug.verwundete > 0 && <span class="pz-verw klein">{verwText(v.zug.verwundete)}</span>}
    </div>
  );
}

/** Bestand der Wirkmittel groß in der Kopfzeile (H5.6): „Mrs 12 · LM 14 · Kanone“; knapp gelb, leer rot. */
export function BestandLeiste(p: { inh: Inhalte; z: Spielzustand }) {
  const knapp = p.inh.regeln.anzeige?.bestand_knapp ?? {};
  return (
    <div class="bestand-leiste" data-tour="bestand" data-testid="bestand">
      {Object.values(p.inh.wirkmittel).map((w) => {
        const b = p.z.bestand[w.id];
        const kl = b === 0 ? "leer" : typeof b === "number" && knapp[w.id] !== undefined && b <= knapp[w.id] ? "knapp" : "";
        return (
          <span key={w.id} class={`bestand ${kl}`} data-wm={w.id} data-bestand={b ?? ""} title={`${w.name}${b === null || b === undefined ? "" : `: ${b} übrig`}${kl === "knapp" ? " – wird knapp" : kl === "leer" ? " – aufgebraucht" : ""}`}>
            {w.kurz}{typeof b === "number" && <b>{b}</b>}
          </span>
        );
      })}
    </div>
  );
}

/** Teamname mit Farbe. */
export function TeamMarke(p: { name: string; farbe: string; klein?: boolean }) {
  return (
    <span class={`team-marke ${p.klein ? "klein" : ""}`} title={`Team ${p.name}`}>
      <i style={{ background: p.farbe }} /><span>{p.name}</span>
    </span>
  );
}

/** Firebase-Regeln veraltet (H1.5): roter Balken mit dem, was zu tun ist. */
export function RegelBanner() {
  return (
    <div class="regel-banner" role="alert" data-testid="regel-banner">
      <b>Firebase-Regeln veraltet</b> – die Datenbank lehnt Rolle „zb“ oder Statusmeldungen ab. Spielleitung: In der Firebase-Konsole
      (Projekt argus-sync-e9fbc → Realtime Database → Regeln) den Inhalt von firebase/database.rules.json einsetzen und „Veröffentlichen“.
      Bis dahin spielt jeder Team-Laptop weiter; das Protokoll mit „Protokoll speichern“ sichern.
    </div>
  );
}

/** Test ohne Lobby am Team-Laptop allein: Uhr selbst starten, anhalten, Tempo. */
function TestUhr(p: { s: Sicht; z: Spielzustand }) {
  const z = p.z;
  return (
    <span class="zeile test-uhr" style="gap:4px;flex-wrap:nowrap" data-testid="test-uhr" title="Test ohne Lobby: Uhr selbst steuern (im Seminar macht das die Spielleitung)">
      <button type="button" class={`knopf klein ${z.uhr.laeuft ? "warn" : "gut"}`} disabled={z.ende} data-testid="test-start"
        onClick={() => p.s.senden("uhr", { befehl: z.uhr.laeuft ? "pause" : "start" })}>{z.uhr.laeuft ? "❚❚" : "▶ Start"}</button>
      {[1, 5, 20].map((v) => (
        <button type="button" key={v} class={`knopf klein ${z.uhr.tempo === v ? "an" : ""}`} onClick={() => p.s.senden("uhr", { befehl: "tempo", tempo: v })}>×{v}</button>
      ))}
    </span>
  );
}

export function Rahmen(p: {
  s: Sicht; children: ComponentChildren;
  /** ersetzt das Rollenband (z. B. Leiste der Spielleitung) */
  band?: ComponentChildren;
  /** zusätzlich links neben dem Band (z. B. Teamwahl im Plenum) */
  links?: ComponentChildren;
  /** Band oder links zeigen das Team schon (Spielleitung, Plenum): keine zweite Teammarke */
  teamImBand?: boolean;
}) {
  const st = useStand(p.s);
  const t = useSpielzeit(p.s);
  const inh = p.s.inh;
  const sz = inh.szenario;
  const z = st.zustand;
  const rolle = st.rolle;
  const team = rolle === "zb";
  const [einweisung, setEinweisung] = useState(false);
  const [sperreZu, setSperreZu] = useState(false);
  const [rot, setRot] = useState(0);
  const entschieden = useRef(false);

  // Einweisung des Teams von selbst zeigen: einmal je Tab (vor dem Start, bei spätem Beitritt auch im laufenden Spiel)
  const schl = `${rolle}:${st.lauf ?? ""}`;
  useEffect(() => {
    if (!st.geladen || !team || st.nurLesen || entschieden.current || !st.lauf) return;
    entschieden.current = true;
    if (!gelesen(schl) && !z.ende) setEinweisung(true);
  }, [st.geladen, st.lauf, st.nurLesen]);
  useEffect(() => {
    if (!z.ende) setSperreZu(false);
  }, [z.ende]);
  const schliessen = () => {
    setEinweisung(false);
    merkeGelesen(schl);
  };
  const treffer = () => {
    setRot((n) => n + 1);
    setTimeout(() => setRot((n) => Math.max(0, n - 1)), 900);
  };

  const hostDa = !!st.host && !istVeraltet(st.host.puls, p.s.adapter.serverJetzt());
  const zeigeTeam = st.team !== DIREKT_TEAM && rolle !== "sl" && rolle !== "plenum" && !p.teamImBand;
  const speichern = () => speichereDatei(protokollDatei({
    szenario: sz.id, version: sz.version, sitzung: st.raum, team: st.teamName, team_id: st.team, farbe: st.teamFarbe, lauf: st.lauf, protokoll: st.protokoll,
  }));
  const up = st.upload;
  const offenHoch = st.rechnet ? z.seq - up.hoch : 0;
  return (
    <div class={`rahmen ${st.nurLesen ? "nur-lesen" : ""} ${rot ? "treffer-rand" : ""}`} data-rolle={rolle} data-seq={z.seq} data-fp={fingerabdruck(z)} data-lauf={st.lauf ?? ""}
      data-host={st.istHost ? "1" : "0"} data-rechnet={st.rechnet ? "1" : "0"} data-hoch={up.hoch} data-team={st.team}>
      <header class="kopf">
        <div class="kopf-links">
          {p.band ?? <div class={`rollenband rolle-${rolle}`}><span class="marke">ARGUS</span><span>{ROLLEN_NAME[rolle]}</span></div>}
          {p.links}
          {zeigeTeam && <TeamMarke name={st.teamName} farbe={st.teamFarbe} />}
          {!zeigeTeam && !p.teamImBand && !team && st.name !== ROLLEN_NAME[rolle] && <span class="leise">{st.name}</span>}
        </div>
        <UhrAnzeige inh={inh} z={z} t={t} lauf={st.lauf} kurz={false} />
        <div class="kopf-rechts">
          {team ? <PanzerLeiste inh={inh} z={z} t={t} lauf={st.lauf} aufTreffer={treffer} /> : <KompanieStand inh={inh} z={z} t={t} lauf={st.lauf} />}
          {team && <BestandLeiste inh={inh} z={z} />}
          {team && st.direkt && st.rechnet && <TestUhr s={p.s} z={z} />}
          {st.nurLesen && <span class="badge zuschauen" data-testid="nur-lesen" title="Ansicht des Teams zum Zuschauen; Eingaben sind gesperrt.">◉ Zuschauen</span>}
          {team && !st.direkt && !hostDa && <span class="badge schlecht" title="Keine Spielleitung verbunden – das Spiel läuft trotzdem weiter">Spielleitung fehlt</span>}
          <span class={`badge ${st.verbindung.verbunden ? "gut" : "schlecht"}`} data-testid="verbindung"
            title={`${st.verbindung.fehler ?? st.verbindung.art} · Sitzung ${st.raum}${st.rechnet ? ` · Protokoll im Netz bis ${up.hoch} von ${z.seq}${up.fehler ? ` (${up.fehler})` : ""}` : ""}`}>
            <span class="punkt" />{st.verbindung.verbunden ? (offenHoch > 0 ? `verbunden · ${offenHoch} offen` : "verbunden") : st.rechnet ? "offline – Spiel läuft" : "keine Verbindung"}
          </span>
          {st.rechnet && (
            <button type="button" class={`knopf klein ${up.fehler && offenHoch > 0 ? "warn" : "leise"}`} onClick={speichern} data-testid="protokoll-speichern"
              title="Protokoll dieses Teams als Datei speichern (für die Spielleitung, wenn das Netz nicht geht)">⇩ Protokoll</button>
          )}
          {rolle !== "plenum" && (
            <button type="button" class="knopf klein" onClick={() => setEinweisung(true)} data-testid="einweisung-knopf"
              title={team ? "Übersicht der Ansicht und kurze Einweisung – jederzeit wieder aufrufbar" : "Einweisung der Spielleitung"}>
              {team ? "? Einweisung" : "Einweisung"}
            </button>
          )}
        </div>
      </header>
      {st.regelFehler && <RegelBanner />}
      {team && st.nurLesen && !p.band && st.lauf && st.geladen && (
        <div class="zuschau-banner" data-testid="zuschau-banner">
          {st.rechnerOnline
            ? <>Das Spiel dieses Teams rechnet der Laptop von <b>{st.rechnerName ?? "jemand anderem"}</b>. Hier nur zuschauen.</>
            : <>Der Team-Laptop{st.rechnerName ? <> von <b>{st.rechnerName}</b></> : ""} ist nicht verbunden. Spielt er ohne Netz weiter, kommt sein
              Protokoll nach. Nur wenn er aus ist:{" "}
              <button type="button" class="knopf klein warn" data-testid="uebernehmen" onClick={() => void p.s.uebernehmenTeam()}>Spiel hier weiterführen</button></>}
        </div>
      )}
      {p.children}
      {team && z.ende && !sperreZu && !st.nurLesen && (
        <div class="sperre" data-testid="spielende">
          <div class="sperre-karte">
            <h2>Spielende {uhrzeit(sz.spieluhr.start, sz.spieluhr.dauer_s)}</h2>
            <div class="leise" style="margin-bottom:14px">Eingaben sind gesperrt. Bitte zum Plenum – die Auswertung beginnt.</div>
            {st.rechnet && offenHoch > 0 && (
              <div class="warnung" style="margin-bottom:12px">Protokoll noch nicht ganz im Netz ({offenHoch} Einträge offen).
                <button type="button" class="knopf klein" style="margin-left:8px" onClick={speichern}>Protokoll speichern</button></div>
            )}
            <button type="button" class="knopf klein" onClick={() => setSperreZu(true)}>Ansicht ansehen</button>
          </div>
        </div>
      )}
      {einweisung && rolle !== "plenum" && <EinweisungFenster inh={inh} rolle={rolle} schliessen={schliessen} />}
      <Hinweise liste={st.hinweise} />
    </div>
  );
}
