// Testpult (Liste N, 15.11.2026): „Team und Spielleitung öffnen“ unter „Test ohne Lobby“ öffnet EIN Fenster im selben Tab, oben eine
// schmale Leiste (34 px) mit drei großen Reitern Spielleitung · Zielbearbeitung · Plenum und rechts „◂ Startseite“. Für Tester, die das
// Spiel nicht kennen.
//
// Umsetzung: drei Frames derselben Seite (…?rolle=sl|zb|plenum&raum=pult&sync=lokal&pult=1) liegen übereinander; der gewählte ist
// sichtbar, die anderen sind über `visibility: hidden` verdeckt (nicht `display: none` – die Karten behalten so ihre Größe) und `inert`
// (keine Tastatur, kein Fokus). Alle drei laufen weiter, wenn ihr Reiter nicht vorn ist: Die Zielbearbeitung rechnet das Spiel (Host)
// und wird beim Wechsel weder angehalten noch neu geladen – sie behält geöffnete Meldung, Zoom und Einweisung. Ein verdeckter Reiter
// zeichnet seine Karte nur langsamer (2 Bilder/s), Uhr und Spiel laufen unverändert.
//
// Synchronisation im Pult immer lokal (ein Rechner), eigener Raum „pult“ – unabhängig von der Wahl auf der Startseite; ein gleichzeitig
// offener Testraum „kraehe“ stört nicht. „Neues Spiel“ und „Testraum leeren“ der Spielleitung wirken wie gewohnt.
//
// Hinweise für Tester ohne Vorkenntnis (N1.4): Am Reiter Zielbearbeitung die Zahl der neuen Meldungen im Eingang (gelb und pulsierend,
// wenn eine Meldung kam, seit der Reiter verdeckt ist), solange ein anderer Reiter vorn ist. Am Reiter Plenum ein Punkt, wenn das Plenum
// auf „Gefecht beendet“ wechselt. Daneben die Zeile „So geht’s“ (ausblendbar). Der zuletzt gewählte Reiter bleibt beim Neuladen.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { type Einstellungen, pultFensterAdresse } from "../config";
import { type PultReiter, type PultStandZB, pultNachricht } from "./gemeinsam/pult";
import { Schild } from "./gemeinsam/logo";

export const PULT_REITER: PultReiter[] = ["sl", "zb", "plenum"];
const NAME: Record<PultReiter, string> = { sl: "Spielleitung", zb: "Zielbearbeitung", plenum: "Plenum" };
const TITEL: Record<PultReiter, string> = {
  sl: "Spielleitung: ▶ Start, Tempo, Kontrollkarte, Zeitplan, Protokoll",
  zb: "Zielbearbeitung (das Team): Meldungen entscheiden – rechnet das Spiel",
  plenum: "Plenum (Smartboard): Lage für alle, nach Spielende „Gefecht beendet“",
};
/** N1.5: Startreiter Zielbearbeitung (dort beginnt die Einweisung); der zuletzt gewählte bleibt beim Neuladen. */
const START_REITER: PultReiter = "zb";
const REITER_MERKER = "argus:pult:reiter";
const HILFE_MERKER = "argus:pult:hilfe";

function lies(k: string): string | null {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}

function schreib(k: string, v: string): void {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* privater Modus */
  }
}

function gemerkterReiter(): PultReiter {
  const r = lies(REITER_MERKER);
  return r === "sl" || r === "zb" || r === "plenum" ? r : START_REITER;
}

/** Was der Reiter Zielbearbeitung zeigt, solange ein anderer vorn ist: Zahl im Eingang, „neu“ oder „Achtung“ (Testraum geleert). */
export function zbMarke(zb: PultStandZB | null, gesehen: { lauf: string | null; n: number }): { zahl: number; neu: boolean; achtung: boolean } {
  if (!zb) return { zahl: 0, neu: false, achtung: false };
  // nach Spielende ist nichts mehr zu entscheiden – keine Zahl
  if (zb.ende) return { zahl: 0, neu: false, achtung: zb.entfernt };
  const neu = zb.lauf !== gesehen.lauf ? zb.meldungen > 0 : zb.meldungen > gesehen.n;
  return { zahl: zb.eingang, neu, achtung: zb.entfernt };
}

/** „So geht’s“ – drei Schritte; der passende ist hervorgehoben, nach dem Start sind 1 und 2 erledigt. */
function SoGehts(p: { zb: PultStandZB | null; vorn: PultReiter; waehle: (r: PultReiter) => void; aus: () => void }) {
  const begonnen = !!p.zb?.begonnen;
  const jetzt = begonnen ? (p.vorn === "zb" ? 0 : 3) : p.vorn === "sl" ? 2 : p.vorn === "zb" ? 1 : 0;
  const kl = (n: number) => `pult-schritt ${jetzt === n ? "jetzt" : ""} ${begonnen && n < 3 ? "erledigt" : ""}`;
  const link = (r: PultReiter) => <button type="button" class="link-knopf" onClick={() => p.waehle(r)}>{NAME[r]}</button>;
  return (
    <div class="pult-hilfe" data-testid="pult-so-gehts" data-schritt={jetzt}>
      <b>So geht’s:</b>
      <span class={kl(1)} data-schritt-nr="1"><b>1</b> {link("zb")} – Einweisung lesen</span>
      <span class="sehr-leise">·</span>
      <span class={kl(2)} data-schritt-nr="2"><b>2</b> {link("sl")} – ▶ Start</span>
      <span class="sehr-leise">·</span>
      <span class={kl(3)} data-schritt-nr="3"><b>3</b> zurück zur {link("zb")}</span>
      <button type="button" class="pult-zu" onClick={p.aus} title="Zeile ausblenden" aria-label="So geht’s ausblenden" data-testid="pult-hilfe-aus">×</button>
    </div>
  );
}

export function Testpult(p: { e: Einstellungen }) {
  const [vorn, setVorn] = useState<PultReiter>(gemerkterReiter);
  const vornRef = useRef(vorn);
  vornRef.current = vorn;
  const frames = useRef<Partial<Record<PultReiter, HTMLIFrameElement | null>>>({});
  const adressen = useMemo(() => Object.fromEntries(PULT_REITER.map((r) => [r, pultFensterAdresse(p.e, r)])) as Record<PultReiter, string>, []);
  const [zb, setZb] = useState<PultStandZB | null>(null);
  const [gesehen, setGesehen] = useState<{ lauf: string | null; n: number }>({ lauf: null, n: 0 });
  const [plenumPunkt, setPlenumPunkt] = useState(false);
  const plenumBild = useRef<string | null>(null);
  const [hilfe, setHilfe] = useState(() => lies(HILFE_MERKER) !== "aus");

  const sichtbarMelden = (r: PultReiter, an: boolean) => {
    try {
      frames.current[r]?.contentWindow?.postMessage({ argusPult: 1, art: "sichtbar", an }, "*");
    } catch {
      /* Frame lädt gerade */
    }
  };
  const waehle = (r: PultReiter) => {
    setVorn(r);
    schreib(REITER_MERKER, r);
  };

  // Nachrichten der Reiter (nur von den eigenen drei Frames)
  useEffect(() => {
    const an = (ev: MessageEvent) => {
      const d = pultNachricht(ev.data);
      if (!d) return;
      const von = PULT_REITER.find((r) => frames.current[r]?.contentWindow === ev.source);
      if (!von) return;
      if (d.art === "hallo") sichtbarMelden(von, von === vornRef.current);
      else if (d.art === "stand" && von === "zb") setZb(d.stand as PultStandZB);
      else if (d.art === "stand" && von === "plenum") {
        const bild = String((d.stand as { bild?: unknown }).bild ?? "");
        // Punkt, wenn das Plenum auf „Gefecht beendet“ wechselt – seit Liste O ist das Kapitel 1 der Auswertung (Bild „auswertung“)
        const ende = (b: string | null) => b === "abschluss" || b === "auswertung";
        if (plenumBild.current !== null && !ende(plenumBild.current) && ende(bild) && vornRef.current !== "plenum") setPlenumPunkt(true);
        plenumBild.current = bild;
      } else if (d.art === "reiter" && PULT_REITER.includes(d.ziel as PultReiter)) waehle(d.ziel as PultReiter);
      else if (d.art === "neuLaden") location.reload();
      else if (d.art === "startseite") location.href = location.pathname;
    };
    window.addEventListener("message", an);
    return () => window.removeEventListener("message", an);
  }, []);

  // Reiter gewechselt: verdeckte zeichnen langsamer, der sichtbare bekommt die Tastatur
  useEffect(() => {
    for (const r of PULT_REITER) sichtbarMelden(r, r === vorn);
    if (vorn === "plenum") setPlenumPunkt(false);
    try {
      frames.current[vorn]?.contentWindow?.focus();
    } catch {
      /* Frame lädt gerade */
    }
  }, [vorn]);

  // Zielbearbeitung vorn: alle Meldungen bis jetzt gelten als gesehen
  useEffect(() => {
    if (vorn !== "zb" || !zb) return;
    setGesehen((g) => (g.lauf === zb.lauf && g.n === zb.meldungen ? g : { lauf: zb.lauf, n: zb.meldungen }));
  }, [vorn, zb]);

  const zbM = zbMarke(zb, gesehen);
  const marke = (r: PultReiter) => {
    if (r === vorn) return null;
    if (r === "zb") {
      if (zbM.achtung) return <span class="pult-punkt achtung" data-testid="pult-achtung" title="Die Zielbearbeitung braucht euch (z. B. „Testraum geleert – neu laden“)" />;
      if (zbM.zahl > 0) return <span class={`pult-zahl ${zbM.neu ? "neu" : ""}`} data-testid="pult-zahl" title={`${zbM.zahl} neue ${zbM.zahl === 1 ? "Meldung" : "Meldungen"} im Eingang`}>{zbM.zahl}</span>;
      if (zbM.neu) return <span class="pult-punkt" data-testid="pult-punkt-zb" title="Neue Meldung" />;
      return null;
    }
    if (r === "plenum" && plenumPunkt) return <span class="pult-punkt" data-testid="pult-punkt-plenum" title="Das Plenum zeigt jetzt „Gefecht beendet“" />;
    return null;
  };

  return (
    <div class="pult" data-testid="pult" data-vorn={vorn}>
      <nav class="pult-leiste" data-testid="pult-leiste">
        <span class="pult-marke"><Schild hoehe={24} />ARGUS <span>Testpult</span></span>
        <div class="pult-reiter" role="tablist">
          {PULT_REITER.map((r) => (
            <button type="button" role="tab" key={r} aria-selected={r === vorn} class={`pult-tab pult-${r} ${r === vorn ? "an" : ""}`}
              onClick={() => waehle(r)} title={TITEL[r]} data-pult-reiter={r}>
              {NAME[r]}{marke(r)}
            </button>
          ))}
        </div>
        {hilfe
          ? <SoGehts zb={zb} vorn={vorn} waehle={waehle} aus={() => { setHilfe(false); schreib(HILFE_MERKER, "aus"); }} />
          : <button type="button" class="link-knopf pult-hilfe-an" onClick={() => { setHilfe(true); schreib(HILFE_MERKER, "an"); }} data-testid="pult-hilfe-an">So geht’s</button>}
        <a class="pult-start" href={`${location.pathname}#spielleitung`} data-testid="pult-startseite"
          title="Zurück zur Startseite (Spielleitung). Das Spiel im Testpult bleibt gespeichert und läuft beim nächsten Öffnen weiter.">◂ Startseite</a>
      </nav>
      <div class="pult-flaeche">
        {PULT_REITER.map((r) => (
          <iframe key={r} ref={(el) => { frames.current[r] = el; }} src={adressen[r]} title={NAME[r]} class={r === vorn ? "vorn" : ""}
            data-pult-frame={r} inert={r !== vorn} onLoad={() => sichtbarMelden(r, r === vornRef.current)} />
        ))}
      </div>
    </div>
  );
}
