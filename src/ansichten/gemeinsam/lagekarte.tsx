// Lagekarte als Preact-Baustein: verbindet die PixiJS-Karte (src/karte/lagekarte.ts) mit der Ansicht.
// Knöpfe (Zoom, Hintergrund), Legende und Tooltip sind normales HTML über der Leinwand.
//
// Seit Schritt 6b ist die Karte die Arbeitsfläche von G1, G2 und G3:
//  • Marken: Meldungen, die bei der Rolle offen oder zurückgestellt sind, stehen als Knöpfe am Zeichen
//    (Klick öffnet), freigegebene Wirkungen mit der Uhrzeit des Einschlags. Die Karte hält ihnen den Platz
//    frei (unsichtbare Beschriftung, siehe Lagekarte.setzeMarken) und meldet nach jedem Bild, wo sie stehen;
//    die Knöpfe werden direkt verschoben, ohne die Ansicht neu zu zeichnen.
//  • Fenster am Ort (G1): ein Fenster (Drohnenbild) neben dem Ziel mit einer Linie zum Zeichen. Es bleibt stehen,
//    solange das Ziel frei daneben liegt; fährt das Ziel darunter oder ändert sich der Ausschnitt, rückt es weiter.
import ms from "milsymbol";
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { type AssetManifest, assetUrl, kachelnVerfuegbar, ladeManifest } from "../../assets/assets";
import type { Inhalte, Punkt } from "../../inhalte/typen";
import { type Effekt, effekteSchluessel } from "../../kern/effekte";
import type { Fahrweg } from "../../kern/fahrwege";
import { type Lagebild, lagebildSchluessel } from "../../kern/lagebild";
import type { MeldungsStand } from "../../kern/zustand";
// Die PixiJS-Karte wird erst geladen, wenn eine Ansicht eine Karte zeigt.
import type { Hintergrund, KartenBild, KartenInfo, KartenUhr, Lagekarte, Rechteck, Vorschau } from "../../karte/lagekarte";
import { MODIFIKATOR_ATTRAPPE, sidc } from "../../karte/zeichen";

/** Marke über der Karte: Meldung (Knopf) oder geplante Wirkung (Uhrzeit des Einschlags). */
export interface KartenMarke {
  /** Meldung (z. B. „M05“) bzw. geplante Wirkung „W-M05“ */
  id: string;
  text: ComponentChildren;
  /** Text, den die Karte für den Platz der Marke misst (so lang wie der sichtbare Text) */
  mass: string;
  art: "offen" | "gewaehlt" | "zurueck" | "wirkung";
  titel?: string;
  onClick?: () => void;
}

/**
 * Fenster am Ort eines Ziels (Aufklärung: Drohnenbild) mit Linie zum Zeichen. Seit B8 verschiebbar (an der Kopfleiste
 * ziehen) und schließbar (✕; wieder öffnen über die Marke).
 */
export interface KartenFenster {
  /** Meldung, an deren Zeichen das Fenster hängt */
  id: string;
  breite: number;
  hoehe: number;
  inhalt: ComponentChildren;
  /** ✕ oben rechts schließt das Fenster */
  onSchliessen?: () => void;
}

/** Höhe der Kopfleiste, an der man das Fenster zieht (px) */
const ZIEH_LEISTE = 30;

/** Abstand Fenster–Ziel und Ränder (px) */
const FENSTER = { abstand: 46, rand: 8, unten: 40, frei: 26 };

function innen(p: Punkt, r: Rechteck, rand = 0): boolean {
  return p[0] > r[0] - rand && p[0] < r[2] + rand && p[1] > r[1] - rand && p[1] < r[3] + rand;
}

/** Hindernis für das Fenster am Ort; `gewicht` > 1: lieber eine Marke streifen als dieses Feld (z. B. Lagehinweise). */
export type Hindernis = Rechteck | { r: Rechteck; gewicht: number };

function ueberdeckt(r: Rechteck, liste: Hindernis[]): number {
  let f = 0;
  for (const h of liste) {
    const [o, g] = Array.isArray(h) ? [h, 1] : [h.r, h.gewicht];
    f += g * Math.max(0, Math.min(r[2], o[2]) - Math.max(r[0], o[0])) * Math.max(0, Math.min(r[3], o[3]) - Math.max(r[1], o[1]));
  }
  return f;
}

/**
 * Lage des Fensters neben dem Ziel p: eine Ecke, in der es ganz in die Karte passt, ohne das Ziel zu verdecken –
 * von diesen die, die am wenigsten andere Marken verdeckt (hindernisse).
 */
export function fensterLage(p: Punkt, w: number, h: number, bw: number, bh: number, hindernisse: Hindernis[] = []): Rechteck {
  const a = FENSTER.abstand;
  const basis: Punkt[] = [
    [p[0] + a, p[1] - h - a / 2], [p[0] - a - w, p[1] - h - a / 2], [p[0] + a, p[1] + a / 2], [p[0] - a - w, p[1] + a / 2],
    [p[0] + a, p[1] - h / 2], [p[0] - a - w, p[1] - h / 2], [p[0] - w / 2, p[1] - h - a], [p[0] - w / 2, p[1] + a],
  ];
  // dazu je Ecke etwas verschoben (Viertel der Fenstergröße), damit das Fenster Marken ganz ausweichen kann
  const kand: Punkt[] = [...basis];
  for (const [dx, dy] of [[0, h / 4], [0, -h / 4], [w / 4, 0], [-w / 4, 0], [0, h / 2], [0, -h / 2]]) {
    for (const [x, y] of basis) kand.push([x + dx, y + dy]);
  }
  const xmax = bw - w - FENSTER.rand;
  const ymax = bh - h - FENSTER.unten;
  const klemmen = ([x, y]: Punkt): Rechteck => {
    const kx = Math.max(FENSTER.rand, Math.min(xmax, x));
    const ky = Math.max(FENSTER.rand, Math.min(ymax, y));
    return [kx, ky, kx + w, ky + h];
  };
  // Alle Ecken an den Kartenrand geklemmt, soweit sie das Ziel frei lassen; davon die, die am wenigsten andere
  // Marken verdeckt (bei Gleichstand die frühere: rechts oben vor links oben …).
  const liste = kand.map(klemmen).filter((r) => !innen(p, r, FENSTER.frei));
  if (!liste.length) return klemmen(kand[0]);
  let best = liste[0];
  let wert = ueberdeckt(best, hindernisse);
  for (const r of liste.slice(1)) {
    const v = ueberdeckt(r, hindernisse);
    if (v < wert - 1) {
      best = r;
      wert = v;
    }
  }
  return best;
}

/**
 * Marken der offenen Meldungen einer Rolle: ein Knopf je Meldung am Zeichen („Ziel 7“, B7), Klick öffnet. Zurückgestellte
 * bleiben als Marke stehen („· zurückgestellt“); `zusatz` hängt einen kurzen Hinweis an (z. B. „⚠“ bei der Führung).
 */
export function meldungsMarken(offen: MeldungsStand[], gewaehlt: string | null, waehle: (id: string) => void,
  name: (id: string) => string, zusatz?: (st: MeldungsStand) => string | undefined): KartenMarke[] {
  return offen.map((st) => {
    const z = st.beobachten ? "zurückgestellt" : zusatz?.(st);
    const n = name(st.id);
    const text = z ? `${n} · ${z}` : n;
    return {
      id: st.id, text, mass: text,
      art: st.id === gewaehlt ? "gewaehlt" : st.beobachten ? "zurueck" : "offen",
      titel: st.id === gewaehlt ? `${n} ist geöffnet` : `${n} öffnen`,
      onClick: () => waehle(st.id),
    };
  });
}

/** Marken der freigegebenen Wirkungen: Uhrzeit des Einschlags am gestrichelten Kreis. */
export function wirkungsMarken(lb: Lagebild): KartenMarke[] {
  return lb.wirkungen.filter((w) => w.geplant).map((w) => {
    const text = `Einschlag ${w.text.split(" · ").pop()}`;
    return { id: w.id, text, mass: text, art: "wirkung" as const, titel: w.zeilen.join(" · ") };
  });
}

/** Fenster ganz in die Karte schieben (Rand wie bei der automatischen Lage). */
function klemmeFenster(r: Rechteck, bw: number, bh: number): Rechteck {
  const w = r[2] - r[0];
  const h = r[3] - r[1];
  const x = Math.max(FENSTER.rand, Math.min(bw - w - FENSTER.rand, r[0]));
  const y = Math.max(FENSTER.rand, Math.min(bh - h - FENSTER.rand, r[1]));
  return [x, y, x + w, y + h];
}

/** Nächster Punkt des Rechtecks zu p (Ansatz der Linie am Fenster). */
function randPunkt(r: Rechteck, p: Punkt): Punkt {
  return [Math.max(r[0], Math.min(r[2], p[0])), Math.max(r[1], Math.min(r[3], p[1]))];
}

export type Legende = "ziele" | "kontrolle" | "gelaende";

/** Manifest laden; `fertig` auch dann, wenn es fehlschlägt (Karte zeigt dann nur Vektoren). */
export function useManifestStatus(): { man: AssetManifest | null; fertig: boolean } {
  const [st, setSt] = useState<{ man: AssetManifest | null; fertig: boolean }>({ man: null, fertig: false });
  useEffect(() => {
    let aktiv = true;
    ladeManifest()
      .then((m) => aktiv && setSt({ man: m, fertig: true }))
      .catch((e) => {
        console.warn("Asset-Manifest:", e);
        if (aktiv) setSt({ man: null, fertig: true });
      });
    return () => {
      aktiv = false;
    };
  }, []);
  return st;
}

function MiniZeichen(p: { code: string; groesse?: number }) {
  const svg = useMemo(() => new ms.Symbol(p.code, { size: p.groesse ?? 11, colorMode: "Medium" }).asSVG(), [p.code, p.groesse]);
  return <span dangerouslySetInnerHTML={{ __html: svg }} />;
}

function LegendeLeiste(p: { art: Legende }) {
  const zonen = (
    <>
      <span><i class="legende-flaeche" style="background:rgba(216,68,58,.3);border:2px solid #d8443a" />No-Strike-Zone</span>
      <span><i class="legende-flaeche" style="background:rgba(229,138,36,.14);border:2px dashed #e58a24" />Einschränkungsgebiet</span>
    </>
  );
  if (p.art === "gelaende") return <div class="karte-legende">{zonen}</div>;
  if (p.art === "ziele") {
    return (
      <div class="karte-legende">
        <span><MiniZeichen code={sidc("H", "EVAT")} />Zielmeldung (ARGUS-Klasse)</span>
        <span><MiniZeichen code={sidc("U", "EV")} />ARGUS unsicher</span>
        <span style="opacity:.5"><MiniZeichen code={sidc("H", "EVAI")} />erledigt</span>
        <span><i class="legende-flaeche" style="border:2px dashed #d8443a;border-radius:50%;width:12px;height:12px" />freigegeben, Einschlag folgt</span>
        <span><b style="color:#7a1b14">✕</b>bekämpft</span>
        {zonen}
      </div>
    );
  }
  return (
    <div class="karte-legende">
      <span><MiniZeichen code={sidc("H", "EVAT")} />Feind</span>
      <span><MiniZeichen code={sidc("F", "EVAT")} />verbündet</span>
      <span><MiniZeichen code={sidc("N", "EVCF")} />zivil</span>
      <span><MiniZeichen code={sidc("H", "EVAT", { modifikator: MODIFIKATOR_ATTRAPPE })} />Attrappe</span>
      <span><MiniZeichen code={sidc("H", "EVAT", { status: "D" })} />außer Gefecht</span>
      <span><i class="legende-flaeche legende-kreuz" />Schutzzeichen</span>
      <span><i class="legende-flaeche" style="border:2px solid #7c3aed;border-radius:50%;width:12px;height:12px" />ungemeldet</span>
      <span><i class="legende-flaeche" style="background:#fff;border:2px solid #111;border-radius:50%;width:10px;height:10px" />Zivilpersonen</span>
      <span><i class="legende-flaeche" style="background:#b3261e;border:2px solid #111;border-radius:50%;width:10px;height:10px" />Soldaten</span>
      <span><i class="legende-flaeche" style="border:2px dashed #c0392b;border-radius:50%;width:12px;height:12px" />Wirkung mit Fehltreffer</span>
    </div>
  );
}

export function LagekarteAnsicht(p: {
  inh: Inhalte;
  lagebild: Lagebild;
  vorschau?: Vorschau | null;
  gewaehlt?: string | null;
  onWahl?: (meldung: string) => void;
  hintergrund?: Hintergrund;
  sprites?: boolean;
  zeichenGroesse?: number;
  legende?: Legende | null;
  banner?: ComponentChildren;
  testid?: string;
  /** Spielzeit für Bewegung und Effekte (fehlt: Standbild) */
  uhr?: () => KartenUhr;
  effekte?: Effekt[];
  /** Marken als Knöpfe über der Karte (Schritt 6b) */
  marken?: KartenMarke[];
  /** Fenster am Ort eines Ziels mit Linie (G1: Drohnenbild) */
  fenster?: KartenFenster | null;
  /** Kasten oben links auf der Karte (G1, G2: Lagehinweise von G3) */
  ecke?: ComponentChildren;
  /** auf einen Punkt zoomen, sobald die Karte steht und wenn sich `schluessel` ändert (Replay der Auswertung) */
  fokus?: { pos: Punkt; faktor: number; schluessel: string };
  /** Fahrwege der Einheiten (Kontrollkarte, B10; Knopf „Fahrwege“ blendet sie aus) und Vorschau einer Verstärkung */
  fahrwege?: Fahrweg[];
}) {
  const { man, fertig } = useManifestStatus();
  const host = useRef<HTMLDivElement>(null);
  const karte = useRef<Lagekarte | null>(null);
  const [bereit, setBereit] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [info, setInfo] = useState<KartenInfo | null>(null);
  const [zoom, setZoom] = useState(1);
  const [grund, setGrund] = useState<Hintergrund>(p.hintergrund ?? "topo");
  const [wegeAn, setWegeAn] = useState(true);
  const wahlRef = useRef(p.onWahl);
  wahlRef.current = p.onWahl;

  // Marken und Fenster: nach jedem Bild der Karte direkt verschieben (kein Neuzeichnen der Ansicht)
  const markenEl = useRef(new Map<string, HTMLElement>());
  const fensterEl = useRef<HTMLDivElement>(null);
  const eckeEl = useRef<HTMLDivElement>(null);
  const linieEl = useRef<SVGLineElement>(null);
  const punktEl = useRef<SVGCircleElement>(null);
  const fensterLageRef = useRef<{ id: string; r: Rechteck; bw: number; bh: number; zoom: number; manuell?: boolean } | null>(null);
  /** Ziehen des Fensters (B8): Startpunkt und ob schon gezogen wurde (dann kein Klick) */
  const ziehRef = useRef<{ x: number; y: number; r: Rechteck; bewegt: boolean; id: number } | null>(null);
  const gezogenRef = useRef(false);
  const fensterRef = useRef(p.fenster);
  fensterRef.current = p.fenster;
  const letztesBild = useRef<KartenBild | null>(null);
  const zoomRef = useRef(1);
  const aufBild = (b: KartenBild) => {
    letztesBild.current = b;
    for (const [id, el] of markenEl.current) {
      const r = b.rechtecke.get(id);
      const stil = r ? `translate(${Math.round((r[0] + r[2]) / 2)}px, ${Math.round((r[1] + r[3]) / 2)}px) translate(-50%, -50%)` : "";
      if (el.dataset.lage !== stil) {
        el.dataset.lage = stil;
        el.style.transform = stil;
        el.style.visibility = r ? "visible" : "hidden";
      }
    }
    const f = fensterRef.current;
    const fe = fensterEl.current;
    if (!f || !fe) return;
    const p0 = b.punkte.get(f.id) ?? null;
    let lage = fensterLageRef.current;
    if (lage && lage.manuell && lage.id === f.id && (lage.bw !== b.breite || lage.bh !== b.hoehe)) {
      // von Hand verschoben: bleibt, wo es ist – nur in die Karte zurück, wenn sie kleiner wurde
      lage = { ...lage, r: klemmeFenster(lage.r, b.breite, b.hoehe), bw: b.breite, bh: b.hoehe };
      fensterLageRef.current = lage;
      fe.style.transform = `translate(${Math.round(lage.r[0])}px, ${Math.round(lage.r[1])}px)`;
    }
    const neu = !lage || lage.id !== f.id || (!lage.manuell && (lage.bw !== b.breite || lage.bh !== b.hoehe || lage.zoom !== zoomRef.current
      || (p0 !== null && innen(p0, lage.r, FENSTER.frei))));
    if (neu && p0) {
      // andere Marken und Zeichen möglichst frei lassen
      const hindernisse: Hindernis[] = [];
      for (const [id, r] of b.rechtecke) if (id !== f.id) hindernisse.push(r);
      for (const [id, q] of b.punkte) if (id !== f.id) hindernisse.push([q[0] - 16, q[1] - 16, q[0] + 16, q[1] + 16]);
      hindernisse.push([b.breite - 210, 0, b.breite, 44]); // Knöpfe der Karte
      const ec = eckeEl.current; // Lagehinweise oben links
      if (ec) hindernisse.push({ r: [ec.offsetLeft, ec.offsetTop, ec.offsetLeft + ec.offsetWidth, ec.offsetTop + ec.offsetHeight], gewicht: 4 });
      lage = { id: f.id, r: fensterLage(p0, f.breite, f.hoehe, b.breite, b.hoehe, hindernisse), bw: b.breite, bh: b.hoehe, zoom: zoomRef.current };
      fensterLageRef.current = lage;
      fe.style.transform = `translate(${Math.round(lage.r[0])}px, ${Math.round(lage.r[1])}px)`;
      fe.style.visibility = "visible";
    } else if (!lage) {
      // Ziel (noch) nicht auf der Karte: Fenster oben links
      lage = { id: f.id, r: [FENSTER.rand, FENSTER.rand, FENSTER.rand + f.breite, FENSTER.rand + f.hoehe], bw: b.breite, bh: b.hoehe, zoom: zoomRef.current };
      fensterLageRef.current = lage;
      fe.style.transform = `translate(${FENSTER.rand}px, ${FENSTER.rand}px)`;
      fe.style.visibility = "visible";
    }
    const li = linieEl.current;
    const pu = punktEl.current;
    if (li && pu) {
      if (p0 && lage) {
        const a = randPunkt(lage.r, p0);
        li.setAttribute("x1", String(a[0]));
        li.setAttribute("y1", String(a[1]));
        li.setAttribute("x2", String(p0[0]));
        li.setAttribute("y2", String(p0[1]));
        pu.setAttribute("cx", String(p0[0]));
        pu.setAttribute("cy", String(p0[1]));
        li.style.visibility = pu.style.visibility = "visible";
      } else {
        li.style.visibility = pu.style.visibility = "hidden";
      }
    }
  };
  const aufBildRef = useRef(aufBild);
  aufBildRef.current = aufBild;

  useEffect(() => {
    if (!fertig || !host.current) return;
    let aus = false;
    let k: Lagekarte | null = null;
    const el = host.current;
    import("../../karte/lagekarte").then(({ Lagekarte: Karte }) => Karte.erzeugen(el, p.inh, man, {
      hintergrund: grund,
      sprites: p.sprites,
      zeichenGroesse: p.zeichenGroesse,
      onKlick: (o) => o.meldung && wahlRef.current?.(o.meldung),
      onInfo: setInfo,
      onZoom: (z) => {
        zoomRef.current = z;
        setZoom(z);
      },
      onBild: (b) => aufBildRef.current(b),
    })).then((neu) => {
      if (aus) {
        neu.zerstoeren();
        return;
      }
      k = neu;
      karte.current = neu;
      setBereit(true);
    }).catch((e: Error) => {
      console.error("Lagekarte:", e);
      if (!aus) setFehler(e.message || String(e));
    });
    return () => {
      aus = true;
      k?.zerstoeren();
      karte.current = null;
    };
  }, [fertig]);

  const schluessel = lagebildSchluessel(p.lagebild);
  useEffect(() => {
    if (bereit) karte.current?.setzeLagebild(p.lagebild);
  }, [bereit, schluessel]);
  const vSchl = p.vorschau ? JSON.stringify(p.vorschau) : "";
  useEffect(() => {
    if (bereit) karte.current?.setzeVorschau(p.vorschau ?? null);
  }, [bereit, vSchl]);
  useEffect(() => {
    if (bereit) karte.current?.setzeGewaehlt(p.gewaehlt ?? null);
  }, [bereit, p.gewaehlt]);
  useEffect(() => {
    if (bereit) karte.current?.setzeHintergrund(grund);
  }, [bereit, grund]);
  const uhrRef = useRef(p.uhr);
  uhrRef.current = p.uhr;
  const mitUhr = !!p.uhr;
  useEffect(() => {
    if (bereit) karte.current?.setzeUhr(mitUhr ? () => uhrRef.current!() : null);
  }, [bereit, mitUhr]);
  const eSchl = p.effekte ? effekteSchluessel(p.effekte) : "";
  useEffect(() => {
    if (bereit) karte.current?.setzeEffekte(p.effekte ?? []);
  }, [bereit, eSchl]);
  const mSchl = (p.marken ?? []).map((m) => `${m.id}=${m.mass}`).join("|");
  useEffect(() => {
    if (bereit) karte.current?.setzeMarken(new Map((p.marken ?? []).map((m) => [m.id, m.mass])));
  }, [bereit, mSchl]);
  const wege = (p.fahrwege ?? []).filter((w) => wegeAn || w.vorschau);
  const wSchl = wege.map((w) => `${w.id}:${w.art}:${w.punkte.length}`).join("|");
  useEffect(() => {
    if (bereit) karte.current?.setzeFahrwege(wege);
  }, [bereit, wSchl]);
  const fokusRef = useRef(p.fokus);
  fokusRef.current = p.fokus;
  useEffect(() => {
    const f = fokusRef.current;
    if (bereit && f) karte.current?.zeigeAuf(f.pos, f.faktor);
  }, [bereit, p.fokus?.schluessel ?? ""]);
  const fId = p.fenster?.id ?? "";
  useEffect(() => {
    if (!fId) fensterLageRef.current = null;
    else if (bereit) karte.current?.zeichnen(true);
  }, [bereit, fId]);

  // Fenster ziehen (B8): an der Kopfleiste; ein Klick ohne Ziehen geht wie bisher an den Inhalt (Vergrößerung)
  const ziehStart = (e: PointerEvent) => {
    const lage = fensterLageRef.current;
    const fe = fensterEl.current;
    if (!lage || !fe || e.button !== 0 || (e.target as HTMLElement).closest("[data-schliessen]")) return;
    const oben = e.clientY - fe.getBoundingClientRect().top;
    if (oben > ZIEH_LEISTE) return;
    ziehRef.current = { x: e.clientX, y: e.clientY, r: lage.r, bewegt: false, id: e.pointerId };
    gezogenRef.current = false;
  };
  const ziehen = (e: PointerEvent) => {
    const z = ziehRef.current;
    const fe = fensterEl.current;
    const lage = fensterLageRef.current;
    if (!z || !fe || !lage || e.pointerId !== z.id) return;
    const dx = e.clientX - z.x;
    const dy = e.clientY - z.y;
    if (!z.bewegt && Math.hypot(dx, dy) < 5) return;
    if (!z.bewegt) fe.setPointerCapture(e.pointerId);
    z.bewegt = true;
    const b = letztesBild.current;
    const r = klemmeFenster([z.r[0] + dx, z.r[1] + dy, z.r[2] + dx, z.r[3] + dy], b?.breite ?? lage.bw, b?.hoehe ?? lage.bh);
    fensterLageRef.current = { ...lage, r, manuell: true };
    fe.style.transform = `translate(${Math.round(r[0])}px, ${Math.round(r[1])}px)`;
    fe.classList.add("gezogen");
    if (b) aufBildRef.current(b);
  };
  const ziehEnde = (e: PointerEvent) => {
    const z = ziehRef.current;
    if (!z || e.pointerId !== z.id) return;
    gezogenRef.current = z.bewegt;
    ziehRef.current = null;
    fensterEl.current?.classList.remove("gezogen");
  };

  const infoStil = (() => {
    if (!info || !host.current) return {};
    const w = host.current.clientWidth;
    const h = host.current.clientHeight;
    const links = info.x + 16 + 320 > w ? Math.max(4, info.x - 16 - 320) : info.x + 16;
    const oben = Math.min(Math.max(4, info.y - 10), h - 110);
    return { left: `${links}px`, top: `${oben}px` };
  })();

  return (
    <div class="karte" data-testid={p.testid ?? "lagekarte"} data-bereit={bereit ? "1" : "0"}>
      <div class="karte-leinwand" ref={host} />
      {fehler && (
        <div class="karte-fehler">
          <div>
            <b>Die Lagekarte konnte nicht gestartet werden.</b>
            <div class="klein">{fehler}</div>
            {man && <img src={assetUrl(man.karte.topo.datei)} alt="Topografische Karte Raum KRÄHE" style="max-width:100%;max-height:60vh;margin-top:10px" />}
          </div>
        </div>
      )}
      {p.fenster && (
        <svg class="karte-linie" aria-hidden="true">
          <line ref={linieEl} style="visibility:hidden" />
          <circle ref={punktEl} r="5" style="visibility:hidden" />
        </svg>
      )}
      {(p.marken?.length ?? 0) > 0 && (
        <div class="karte-marken" data-testid="karten-marken">
          {p.marken!.map((m) => {
            const reg = (el: HTMLElement | null) => {
              if (!el) {
                markenEl.current.delete(m.id);
                return;
              }
              if (markenEl.current.get(m.id) === el) return;
              markenEl.current.set(m.id, el);
              // neu montiert: gleich an die zuletzt gemeldete Stelle (sonst unsichtbar bis zum nächsten Bild)
              const r = letztesBild.current?.rechtecke.get(m.id);
              if (r) {
                const lage = `translate(${Math.round((r[0] + r[2]) / 2)}px, ${Math.round((r[1] + r[3]) / 2)}px) translate(-50%, -50%)`;
                el.dataset.lage = lage;
                el.style.transform = lage;
                el.style.visibility = "visible";
              }
            };
            // Lage setzt aufBild direkt; das style-Attribut bleibt gleich, damit Preact sie nicht zurücksetzt
            const stil = "visibility:hidden";
            return m.onClick
              ? <button type="button" key={m.id} ref={reg} class={`kmarke ${m.art}`} style={stil} data-meldung={m.id} title={m.titel}
                aria-pressed={m.art === "gewaehlt"} onClick={m.onClick}>{m.text}</button>
              : <span key={m.id} ref={reg} class={`kmarke ${m.art}`} style={stil} data-marke={m.id} title={m.titel}>{m.text}</span>;
          })}
        </div>
      )}
      {p.fenster && (
        <div class="karte-fenster" ref={fensterEl} key={p.fenster.id} data-fenster={p.fenster.id}
          style={{ width: `${p.fenster.breite}px`, height: `${p.fenster.hoehe}px`, visibility: "hidden" }}
          onPointerDown={ziehStart} onPointerMove={ziehen} onPointerUp={ziehEnde} onPointerCancel={ziehEnde}
          onClickCapture={(e) => { if (gezogenRef.current) { gezogenRef.current = false; e.stopPropagation(); e.preventDefault(); } }}
          title="Kopfleiste ziehen: verschieben">
          {p.fenster.inhalt}
          {p.fenster.onSchliessen && (
            <button type="button" class="fenster-zu" data-schliessen onClick={(e) => { e.stopPropagation(); p.fenster?.onSchliessen?.(); }}
              title="Drohnenbild schließen – die Marke öffnet es wieder" aria-label="Drohnenbild schließen">✕</button>
          )}
        </div>
      )}
      {p.ecke && <div class="karte-ecke" ref={eckeEl}>{p.ecke}</div>}
      {p.banner}
      <div class="karte-knoepfe">
        <button type="button" class="knopf" title="Hineinzoomen (auch Mausrad)" aria-label="Hineinzoomen" onClick={() => karte.current?.zoom(1.5)}>+</button>
        <button type="button" class="knopf" title="Herauszoomen" aria-label="Herauszoomen" onClick={() => karte.current?.zoom(1 / 1.5)} disabled={zoom <= 1}>−</button>
        <button type="button" class="knopf" title="Ganze Karte zeigen (auch Doppelklick)" aria-label="Ganze Karte" onClick={() => karte.current?.ganzeKarte()} disabled={zoom <= 1}>⤢</button>
        {p.fahrwege && (
          <button type="button" class={`knopf ${wegeAn ? "an" : ""}`} onClick={() => setWegeAn(!wegeAn)} data-testid="karte-fahrwege" aria-pressed={wegeAn}
            title={wegeAn ? "Fahrwege der Einheiten ausblenden" : "Fahrwege der Einheiten zeigen"}>Fahrwege</button>
        )}
        <button type="button" class="knopf" onClick={() => setGrund(grund === "topo" ? "luftbild" : "topo")} data-testid="karte-grund"
          title={grund === "topo" ? (kachelnVerfuegbar() ? "Luftbild zeigen (beim Hineinzoomen schärfer)" : "Luftbild zeigen") : "Topografische Karte zeigen"}>
          {grund === "topo" ? "Luftbild" : "Karte"}
        </button>
      </div>
      {p.legende && <LegendeLeiste art={p.legende} />}
      {info && (
        <div class="karte-info" style={infoStil}>
          <b>{info.titel}</b>
          {info.zeilen.map((z) => <div>{z}</div>)}
        </div>
      )}
    </div>
  );
}
