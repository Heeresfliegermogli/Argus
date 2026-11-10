// Einweisung (seit 2.6, Änderungen H4). Für das Team in zwei Teilen, jederzeit über „? Einweisung“ in der Kopfzeile wieder aufrufbar:
//   1. Übersicht auf der echten Oberfläche: Die Ansicht bleibt sichtbar, ein Lichtfleck mit Pfeil zeigt nacheinander auf Eingang,
//      Entscheiden, Karte, die vier Panzer, Lagemeldungen, Wirkmittel und Bestand, Uhr („Hier kommen die Meldungen rein“ …).
//      Weiterklicken mit „weiter ›“, Pfeiltasten oder Klick in den dunklen Bereich. Seit Liste J (J4) zeigt „Lagemeldungen“ auf die
//      Einblendung oben links auf der Karte (dafür steht dort während der Übersicht ein Beispiel, body[data-tour]) und „Wirkmittel“
//      auf die drei Kacheln. Die Übersicht liegt über dem ganzen Fenster (außerhalb der verkleinerten Ansicht eingehängt).
//   2. Kurz: die Phasen (je ein Satz, ohne Lösungshinweis), je Klasse ein helles Bildbeispiel als Ausschnitt mit Lupe (Panzer,
//      Fahrzeug, Infanterie – keine Attrappe, kein Schutzzeichen), je Wirkmittel eine kurze Animation (Mörser, LM, Kanone).
// Nicht mehr in der Einweisung (H4.3): das Kleingedruckte des Herstellers (steht im Befehl, im Spiel hinter „i“, in der Auswertung),
// der Block „Regelungen“ (die Regeln stehen im Befehl, das System warnt) und die Kette der drei Rollen.
// Der Druck (…/?druck=einweisung, A5 quer) zeigt eine Karte für das Team (Übersicht als Skizze, Phasen, Klassen, Wirkmittel) und eine für
// die Spielleitung.
import type { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { assetUrl, drohnenbild } from "../assets/assets";
import type { Inhalte } from "../inhalte/typen";
import type { Rolle } from "../kern/ereignisse";
import { ROLLEN_NAME } from "../kern/sichten";
import { uhrzeit } from "../kern/uhr";
import { useManifest } from "./gemeinsam/drohnenbild";
import { aktuelleSkala, fensterText, useFenster, zuKlein } from "./gemeinsam/fenster";

type KartenRolle = Exclude<Rolle, "plenum">;

const M = (p: { k?: string; children: ComponentChildren }) => <span class={`muster ${p.k ?? ""}`}>{p.children}</span>;

// ---------------------------------------------------------------- Teil 1: Übersicht auf der Oberfläche (H4.1)

export interface TourSchritt {
  /** data-tour des Elements */
  ziel: string;
  titel: string;
  text: ComponentChildren;
}

export const TOUR: TourSchritt[] = [
  { ziel: "eingang", titel: "Hier kommen die Meldungen rein", text: <>Jede ARGUS-Meldung landet im Eingang, die Zeit daneben läuft mit: so lange wartet sie schon. Die älteste öffnet sich von selbst, ein Klick öffnet eine andere. Darüber: was gerade unterwegs ist, mit Countdown bis zum Einschlag.</> },
  { ziel: "entscheiden", titel: "Hier entscheidet ihr", text: <>Die geöffnete Meldung: Drohnenbild live (Klick: groß mit Lupe), was ARGUS meldet, die Wirkmittel – und ganz unten die drei Knöpfe <M k="toedlich">BEKÄMPFEN mit …</M> <M>ZURÜCKSTELLEN</M> <M>ABLEHNEN</M>. Ohne eure Entscheidung wird nichts bekämpft.</> },
  { ziel: "karte", titel: "Die Lagekarte", text: <>Die ganze Karte, vom Westrand mit euren Panzern bis zu den Wäldern am Ostrand. Meldungen stehen als Marke am Ziel (Klick öffnet). Bekämpfte Ziele zeigen den Countdown bis zum Einschlag. Rot: No-Strike-Zone, orange gestrichelt: Einschränkungsgebiet. Mausrad zoomt, ⤢ zeigt wieder alles.</> },
  { ziel: "panzer", titel: "Hier eure vier Panzer", text: <>Die 1. Kp am Westrand: 1/1 bis 1/4 mit ihrem Zustand. Wird ein Panzer getroffen, blinkt er rot.</> },
  { ziel: "feed", titel: "Hier Lagemeldungen", text: <>Brigade, Nachbarn und 1. Kp melden sich oben links auf der Karte – höchstens zwei auf einmal. Eine Meldung steht 30 Sekunden oder bis ihr sie anklickt (✕). Danach ist sie weg.</> },
  { ziel: "wirkmittel", titel: "Hier Wirkmittel und Bestand", text: <>Mörser, Loitering Munition (LM) und die Kanone der 1. Kp: je Kachel der Bestand, der Countdown bis zum Einschlag und ✓ oder ⚠ am Einschlagort. Mörser und LM sind begrenzt (wird es knapp, wird die Zahl gelb), die Kanone nicht – sie reicht aber nur bis zum Bach.</> },
  { ziel: "uhr", titel: "Spieluhr", text: <>25 Minuten in Echtzeit, die Spielleitung startet für alle Teams gleichzeitig. Daneben die Phase.</> },
];

interface Rechteck {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rechteckVon(ziel: string): Rechteck | null {
  const el = document.querySelector(`[data-tour="${ziel}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** Lage der Sprechblase neben dem Ziel (unten, oben, links oder rechts – wo Platz ist) und Pfeil von der Blase zum Ziel. */
function blasenLage(r: Rechteck, bw: number, bh: number, vw: number, vh: number): { x: number; y: number; pfeil: [number, number, number, number] } {
  const abstand = 46;
  const kand = [
    { x: r.x + r.w / 2 - bw / 2, y: r.y + r.h + abstand },
    { x: r.x + r.w / 2 - bw / 2, y: r.y - abstand - bh },
    { x: r.x - abstand - bw, y: r.y + r.h / 2 - bh / 2 },
    { x: r.x + r.w + abstand, y: r.y + r.h / 2 - bh / 2 },
  ];
  const passt = (k: { x: number; y: number }) => k.x >= 8 && k.y >= 8 && k.x + bw <= vw - 8 && k.y + bh <= vh - 8;
  const klemme = (k: { x: number; y: number }) => ({ x: Math.max(8, Math.min(vw - bw - 8, k.x)), y: Math.max(8, Math.min(vh - bh - 8, k.y)) });
  // großes Ziel (Karte): Blase in die Mitte des Ziels
  let b = kand.find(passt) ?? klemme({ x: r.x + r.w / 2 - bw / 2, y: r.y + r.h / 2 - bh / 2 });
  b = klemme(b);
  // Pfeil von der Blasenkante zur nächsten Stelle am Ziel
  const bx = Math.max(b.x, Math.min(b.x + bw, r.x + r.w / 2));
  const by = Math.max(b.y, Math.min(b.y + bh, r.y + r.h / 2));
  const zx = Math.max(r.x + 6, Math.min(r.x + r.w - 6, bx));
  const zy = Math.max(r.y + 6, Math.min(r.y + r.h - 6, by));
  return { x: b.x, y: b.y, pfeil: [bx, by, zx, zy] };
}

/** Übersicht über die echte Oberfläche: Lichtfleck und Pfeil auf das Element, Sprechblase daneben. */
function Tour(p: { schritte: TourSchritt[]; fertig: () => void; abbrechen: () => void }) {
  // Während der Übersicht steht oben links auf der Karte eine Beispiel-Lagemeldung (CSS: body[data-tour]) – vor dem Messen setzen
  const [liste] = useState(() => {
    document.body.dataset.tour = "an";
    const da = p.schritte.filter((s) => !!rechteckVon(s.ziel));
    return da.length ? da : p.schritte;
  });
  useEffect(() => {
    document.body.dataset.tour = "an";
    return () => {
      delete document.body.dataset.tour;
    };
  }, []);
  const [nr, setNr] = useState(0);
  const [r, setR] = useState<Rechteck | null>(null);
  const [masse, setMasse] = useState({ vw: window.innerWidth, vh: window.innerHeight });
  const blase = useRef<HTMLDivElement>(null);
  const [bm, setBm] = useState({ w: 380, h: 150 });
  const s = liste[Math.min(nr, liste.length - 1)];
  useLayoutEffect(() => {
    const neu = () => {
      setR(rechteckVon(s.ziel));
      setMasse({ vw: window.innerWidth, vh: window.innerHeight });
    };
    neu();
    const t = setInterval(neu, 400); // die Ansicht kann sich darunter ändern (neue Meldung)
    window.addEventListener("resize", neu);
    return () => {
      clearInterval(t);
      window.removeEventListener("resize", neu);
    };
  }, [s.ziel]);
  useLayoutEffect(() => {
    const el = blase.current;
    if (el && (Math.abs(el.offsetWidth - bm.w) > 2 || Math.abs(el.offsetHeight - bm.h) > 2)) setBm({ w: el.offsetWidth, h: el.offsetHeight });
  });
  const weiter = () => (nr >= liste.length - 1 ? p.fertig() : setNr(nr + 1));
  const zurueck = () => setNr(Math.max(0, nr - 1));
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape") p.abbrechen();
      else if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") { e.preventDefault(); weiter(); }
      else if (e.key === "ArrowLeft") zurueck();
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  });
  const lage = r ? blasenLage(r, bm.w, bm.h, masse.vw, masse.vh) : { x: masse.vw / 2 - bm.w / 2, y: masse.vh / 2 - bm.h / 2, pfeil: null };
  const pf = lage.pfeil;
  // über dem ganzen Fenster einhängen: Die Ansicht darunter kann verkleinert sein (unter 1280 × 600), die Übersicht rechnet in Fensterpixeln
  return createPortal(
    <div class="tour" data-testid="tour" data-schritt={s.ziel} onClick={weiter}>
      {r ? <div class="tour-licht" style={{ left: `${r.x - 6}px`, top: `${r.y - 6}px`, width: `${r.w + 12}px`, height: `${r.h + 12}px` }} />
        : <div class="tour-dunkel" />}
      {pf && (
        <svg class="tour-pfeil" width={masse.vw} height={masse.vh} aria-hidden="true">
          <defs><marker id="tour-spitze" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" /></marker></defs>
          <line x1={pf[0]} y1={pf[1]} x2={pf[2]} y2={pf[3]} marker-end="url(#tour-spitze)" />
        </svg>
      )}
      <div class="tour-blase" ref={blase} style={{ left: `${lage.x}px`, top: `${lage.y}px` }} onClick={(e) => e.stopPropagation()}>
        <div class="tour-kopf"><span class="tour-nr">{nr + 1}/{liste.length}</span><b>{s.titel}</b></div>
        <div class="tour-text">{s.text}</div>
        <div class="tour-knoepfe">
          <button type="button" class="knopf klein leise" onClick={p.abbrechen} data-testid="tour-ueberspringen">Übersicht überspringen</button>
          <span class="zeile" style="gap:6px">
            {nr > 0 && <button type="button" class="knopf klein leise" onClick={zurueck}>‹ zurück</button>}
            <button type="button" class="knopf klein weiter" onClick={weiter} data-testid="tour-weiter">{nr >= liste.length - 1 ? "weiter zur Einweisung ›" : "weiter ›"}</button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Teil 2: Phasen, Klassen, Wirkmittel (H4.2)

function PhasenFolie(p: { inh: Inhalte }) {
  const sz = p.inh.szenario;
  return (
    <div class="phasen-liste" data-testid="einweisung-phasen">
      {sz.phasen.map((ph) => (
        <div class="phase-zeile" key={ph.nr}>
          <span class="phase-zeit mono">{uhrzeit(sz.spieluhr.start, ph.von_s)}–{uhrzeit(sz.spieluhr.start, ph.bis_s)}</span>
          <b>{ph.nr}. {ph.name}</b>
          <span>{ph.kurz ?? ""}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Beispiele je Klasse (H4.2): Routineziele ohne Fall – keine Attrappe, kein Schutzzeichen. `zoom` > 1 schneidet enger um das Ziel
 * (die Mörserbedienung in M05 ist klein; enger geschnitten sind die Soldaten zu erkennen).
 */
export const KLASSEN_BEISPIEL: { klasse: string; meldung: string; text: string; zoom?: number }[] = [
  { klasse: "Panzer", meldung: "M06", text: "gepanzerte Fahrzeuge: Kampf- und Schützenpanzer" },
  { klasse: "Fahrzeug", meldung: "M28", text: "ungepanzerte Fahrzeuge, auch zivile" },
  { klasse: "Infanterie", meldung: "M05", text: "Soldaten zu Fuß, auch an Waffen wie dem Mörser", zoom: 1.7 },
];

/** Heller Ausschnitt eines Drohnenbilds um das Ziel, mit Lupe (Maus darüber). */
function KlassenBild(p: { meldung: string; klasse: string; breite?: number; zoom?: number }) {
  const man = useManifest();
  const db = man ? drohnenbild(man, p.meldung) : null;
  const [lupe, setLupe] = useState<{ x: number; y: number } | null>(null);
  const w = p.breite ?? 250;
  const h = Math.round(w * 0.62);
  if (!db) return <div class="klassen-bild leer" style={{ width: `${w}px`, height: `${h}px` }}>{man ? "kein Bild" : "Bild wird geladen …"}</div>;
  const box = db.ziele[0]?.box ?? [db.breite / 2 - 40, db.hoehe / 2 - 30, 80, 60];
  // Ausschnitt: dreifache Zielgröße, mindestens 240 × 150 Bildpunkte (enger mit zoom), um das Ziel zentriert, im Bild
  const aw = Math.min(db.breite, Math.max(240, box[2] * 3.2) / (p.zoom ?? 1));
  const ah = aw * (h / w);
  const ax = Math.max(0, Math.min(db.breite - aw, box[0] + box[2] / 2 - aw / 2));
  const ay = Math.max(0, Math.min(db.hoehe - ah, box[1] + box[3] / 2 - ah / 2));
  const k = w / aw;
  const url = assetUrl(db.datei);
  const groesse = `${db.breite * k}px ${db.hoehe * k}px`;
  const lageBild = `${-ax * k}px ${-ay * k}px`;
  const f = 2.4;
  return (
    <div class="klassen-bild" style={{ width: `${w}px`, height: `${h}px`, backgroundImage: `url("${url}")`, backgroundSize: groesse, backgroundPosition: lageBild }}
      data-klasse={p.klasse} onPointerMove={(e) => { const rc = (e.currentTarget as HTMLElement).getBoundingClientRect(); const k = aktuelleSkala(); setLupe({ x: (e.clientX - rc.left) / k, y: (e.clientY - rc.top) / k }); }}
      onPointerLeave={() => setLupe(null)} role="img" aria-label={`Beispiel ${p.klasse}`}>
      <span class="klassen-rahmen" style={{ left: `${(box[0] - ax) * k}px`, top: `${(box[1] - ay) * k}px`, width: `${box[2] * k}px`, height: `${box[3] * k}px` }}>
        <span class="argus-marke">{p.klasse}</span>
      </span>
      {lupe && (
        <span class="klassen-lupe" style={{
          left: `${lupe.x}px`, top: `${lupe.y}px`, backgroundImage: `url("${url}")`, backgroundSize: `${db.breite * k * f}px ${db.hoehe * k * f}px`,
          backgroundPosition: `${-((ax * k + lupe.x) * f - 55)}px ${-((ay * k + lupe.y) * f - 55)}px`,
        }} />
      )}
    </div>
  );
}

function KlassenFolie() {
  return (
    <div class="klassen-reihe" data-testid="einweisung-klassen">
      {KLASSEN_BEISPIEL.map((b) => (
        <figure key={b.klasse}>
          <KlassenBild meldung={b.meldung} klasse={b.klasse} breite={258} zoom={b.zoom} />
          <figcaption><b>{b.klasse}</b> – {b.text}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** SMIL-Attribute, die die JSX-Typen von Preact nicht kennen (keyPoints …). */
const smil = (a: Record<string, string>) => a as unknown as Record<string, never>;

/**
 * Kurze Animation je Wirkmittel (H4.2, aus E7.2): Mörser trifft eine Fläche (80 m, ca. 35 s), die LM fliegt vom Westrand und trifft
 * ein Fahrzeug (10 m), die Kanone der 1. Kp schießt mit Leuchtspur – nur bis zum Bach. Gezeichnet, keine Personen.
 */
function WirkmittelAnimation(p: { art: "MRS" | "LM" | "PZA" }) {
  const W = 260;
  const H = 150;
  const ziel = { x: 196, y: 82 };
  const fahrt = <animateTransform attributeName="transform" type="translate" values="0 0; -26 4" dur="4s" repeatCount="indefinite" />;
  return (
    <svg class="wm-animation" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" data-wm-animation={p.art}>
      <rect width={W} height={H} fill="#c9d7a6" />
      <path d="M0,118 C70,108 120,124 260,112" stroke="#b9ad8f" stroke-width="7" fill="none" />
      {/* Bach */}
      <path d="M150,0 C140,40 162,80 148,150" stroke="#6da7d6" stroke-width="6" fill="none" />
      {/* eigener Panzer am Westrand */}
      <g transform="translate(20 64)"><rect x="-9" y="-6" width="18" height="12" rx="2" fill="#3f6fb0" /><rect x="0" y="-1.5" width="14" height="3" fill="#3f6fb0" /></g>
      {/* Feindfahrzeug fährt langsam */}
      <g>
        {fahrt}
        <rect x={ziel.x - 9} y={ziel.y - 6} width="18" height="12" rx="2" fill="#a33b33" />
      </g>
      {p.art === "MRS" && (
        <>
          <circle r="3" fill="#222">
            <animateMotion {...smil({ dur: "4s", repeatCount: "indefinite", keyPoints: "0;1;1", keyTimes: "0;0.55;1", calcMode: "linear", path: `M0,10 Q100,-30 ${ziel.x - 14},${ziel.y + 2}` })} />
            <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.54;0.56;1" dur="4s" repeatCount="indefinite" />
          </circle>
          <circle cx={ziel.x - 14} cy={ziel.y + 2} fill="rgba(216,68,58,.28)" stroke="#d8443a" stroke-width="2" r="0">
            <animate attributeName="r" values="0;0;46;46;0" keyTimes="0;0.55;0.62;0.9;1" dur="4s" repeatCount="indefinite" />
          </circle>
          <text x="8" y="144" class="wm-anim-text">Fläche 80 m · Flug ca. 35 s</text>
        </>
      )}
      {p.art === "LM" && (
        <>
          <path d={`M-10,70 C60,40 140,60 ${ziel.x - 26},${ziel.y + 4}`} stroke="#555" stroke-width="1" stroke-dasharray="3 4" fill="none" />
          <g>
            <animateMotion {...smil({ dur: "4s", repeatCount: "indefinite", keyPoints: "0;1;1", keyTimes: "0;0.6;1", calcMode: "linear", rotate: "auto",
              path: `M-10,70 C60,40 140,60 ${ziel.x - 23},${ziel.y + 4}` })} />
            <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.59;0.61;1" dur="4s" repeatCount="indefinite" />
            <path d="M-6,-4 L6,0 L-6,4 z" fill="#222" />
          </g>
          <circle cx={ziel.x - 23} cy={ziel.y + 4} fill="#ffd36b" stroke="#d8443a" stroke-width="2" r="0">
            <animate attributeName="r" values="0;0;9;9;0" keyTimes="0;0.6;0.64;0.85;1" dur="4s" repeatCount="indefinite" />
          </circle>
          <text x="8" y="144" class="wm-anim-text">fliegt vom Westrand, trifft ein Fahrzeug · 10 m</text>
        </>
      )}
      {p.art === "PZA" && (
        <>
          {/* Fahrzeug diesseits des Bachs: Leuchtspur trifft; jenseits: Grenze */}
          <rect x="112" y="30" width="18" height="12" rx="2" fill="#a33b33" />
          <line x1="34" y1="64" x2="120" y2="37" stroke="#ffcf4a" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="14 200">
            <animate attributeName="stroke-dashoffset" values="0;-110;-110" keyTimes="0;0.25;1" dur="3s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.25;0.27;1" dur="3s" repeatCount="indefinite" />
          </line>
          <circle cx="121" cy="36" r="0" fill="#ffd36b">
            <animate attributeName="r" values="0;0;7;0;0" keyTimes="0;0.25;0.3;0.5;1" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle cx="34" cy="64" r="0" fill="#ffe79a">
            <animate attributeName="r" values="5;0;0" keyTimes="0;0.08;1" dur="3s" repeatCount="indefinite" />
          </circle>
          <line x1="150" y1="0" x2="150" y2="150" stroke="#d8443a" stroke-width="1.5" stroke-dasharray="5 4" />
          <text x="156" y="16" class="wm-anim-text">Grenze</text>
          <text x="8" y="144" class="wm-anim-text">Leuchtspur · nur bis zum Bach</text>
        </>
      )}
    </svg>
  );
}

function WirkmittelFolie(p: { inh: Inhalte }) {
  const wm = p.inh.wirkmittel;
  const liste: { id: "MRS" | "LM" | "PZA"; text: string }[] = [
    { id: "MRS", text: `Wirkt auf eine Fläche (${wm.MRS?.wirkradius_m ?? 80} m). Einschlag nach ca. ${wm.MRS?.vorlauf_s ?? 35} s – das Ziel fährt so lange weiter. Bestand ${wm.MRS?.bestand ?? "?"}.` },
    { id: "LM", text: `Startet westlich der Karte, fliegt zum Ziel und trifft genau ein Fahrzeug (${wm.LM?.wirkradius_m ?? 10} m); bei einem Zug eine LM je Fahrzeug. Bestand ${wm.LM?.bestand ?? "?"}.` },
    { id: "PZA", text: `Die Kanone der 1. Kp: schnell (ca. ${wm.PZA?.vorlauf_s ?? 5} s), kein Bestand – aber nur auf Ziele bis zum Bach ELSTER.` },
  ];
  return (
    <div class="wm-reihe" data-testid="einweisung-wirkmittel">
      {liste.filter((x) => wm[x.id]).map((x) => (
        <figure key={x.id}>
          <WirkmittelAnimation art={x.id} />
          <figcaption><b>{wm[x.id].name}</b><span>{x.text}</span></figcaption>
        </figure>
      ))}
    </div>
  );
}

interface Folie {
  titel: string;
  text?: ComponentChildren;
  inhalt: ComponentChildren;
}

function teamFolien(inh: Inhalte): Folie[] {
  return [
    {
      titel: "Die Phasen",
      text: <>Das Spiel läuft 25 Minuten in Echtzeit. Die Lage ändert sich in fünf Phasen:</>,
      inhalt: <PhasenFolie inh={inh} />,
    },
    {
      titel: "Was ARGUS meldet",
      text: <>ARGUS meldet drei Klassen, dazu Zugehörigkeit, Konfidenz und eine Empfehlung, z. B. <M k="argus">Panzer · Feind 91 %</M>. Maus aufs Bild: Lupe.</>,
      inhalt: <KlassenFolie />,
    },
    {
      titel: "Die Wirkmittel",
      text: <>Wählt ein Wirkmittel, dann <M k="toedlich">BEKÄMPFEN mit …</M>. Die Karte zeigt, wo es einschlagen wird; das System warnt bei einem Regelverstoß dort, verhindert ihn aber nicht.</>,
      inhalt: <WirkmittelFolie inh={inh} />,
    },
    {
      titel: "Los geht’s",
      inhalt: (
        <div class="los-folie">
          <p>Ihr seid die Zielbearbeitung des Bataillons. Jede Meldung entscheidet ihr: <M k="toedlich">BEKÄMPFEN mit …</M> <M>ZURÜCKSTELLEN</M> <M>ABLEHNEN</M>.</p>
          <p>Ihr dürft miteinander sprechen. Ihr verantwortet jede Wirkung.</p>
          <p class="leise">Die Uhr startet die Spielleitung für alle Teams gleichzeitig. Diese Einweisung gibt es jederzeit wieder über <M>? Einweisung</M> oben rechts.</p>
        </div>
      ),
    },
  ];
}

function slFolien(inh: Inhalte): Folie[] {
  const bis = uhrzeit(inh.szenario.spieluhr.start, inh.szenario.spieluhr.dauer_s);
  return [
    {
      titel: "Auftrag",
      inhalt: <div class="los-folie">{(inh.szenario.lage.spielleitung?.absaetze ?? []).map((a) => <p>{a}</p>)}</div>,
    },
    {
      titel: "Vor dem Spiel",
      inhalt: (
        <div class="los-folie">
          <p>Sitzung anlegen, Code ans Smartboard (Plenum öffnen). Jedes Team legt an <b>einem</b> Laptop sein Team an (2–3 Personen).</p>
          <p>Lage vorlesen, dann <M k="weiter">Spiel öffnen – alle Teams</M>: Die Teams sehen ihre Ansicht und die Einweisung. Danach <M k="weiter">▶ Start für alle</M>.</p>
        </div>
      ),
    },
    {
      titel: "Während des Spiels",
      inhalt: (
        <div class="los-folie">
          <p>Jeder Team-Laptop rechnet sein Spiel selbst. Die Übersicht zeigt etwa alle 5 s die Statusmeldung jedes Teams: Uhr, Eingang, Schlüsselfälle, Panzer, wie weit das Protokoll im Netz ist.</p>
          <p>„ansehen ›“: Steuerung eines Teams (Reserve, Notiz, Kontrollkarte) oder Zuschauen. Nicht eingreifen, keine Hinweise zur Lage.</p>
        </div>
      ),
    },
    {
      titel: "Spielende",
      inhalt: (
        <div class="los-folie">
          <p>Um {bis} hält die Uhr an, die Ansichten der Teams sperren. Das Plenum zeigt die Auswertung über alle Teams, sobald alle Protokolle da sind.</p>
          <p>Fehlt ein Protokoll (Netz), am Team-Laptop „⇩ Protokoll“ speichern und in der Übersicht mit „Protokoll laden“ einlesen.</p>
        </div>
      ),
    },
  ];
}

/**
 * Einweisung im Spiel. Team: erst die Übersicht auf der Oberfläche, dann Folien. Spielleitung: Folien. Weiter mit „weiter ›“,
 * Pfeiltasten oder Wischen; „Überspringen“ schließt.
 */
/** Technik (J2.4): Fenstergröße dieses Laptops; unter 1280 × 600 der Hinweis auf Vollbild. */
function FensterInfo() {
  const f = useFenster();
  const klein = zuKlein(f.breite, f.hoehe);
  return (
    <span class={`fenster-info ${klein ? "zu-klein" : ""}`} data-testid="fenster-info" data-fenster={`${f.breite}x${f.hoehe}`}
      title={klein ? "Kleiner als 1280 × 600: Die Ansicht wird verkleinert. Browser auf Vollbild (F11) stellen." : "Fenstergröße dieses Laptops (geprüft ab 1280 × 600)"}>
      Fenster {fensterText(f)}{klein ? " – Browser auf Vollbild (F11)" : ""}
    </span>
  );
}

export function EinweisungFenster(p: { inh: Inhalte; rolle: KartenRolle; schliessen: () => void }) {
  const team = p.rolle === "zb";
  const [tour, setTour] = useState(team);
  const folien = team ? teamFolien(p.inh) : slFolien(p.inh);
  const [nr, setNr] = useState(0);
  const wisch = useRef<{ x: number; y: number } | null>(null);
  const anzahl = folien.length;
  const geh = (n: number) => setNr(Math.max(0, Math.min(anzahl - 1, n)));
  useEffect(() => {
    if (tour) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape") p.schliessen();
      else if (e.key === "ArrowRight" || e.key === "PageDown") setNr((n) => Math.min(anzahl - 1, n + 1));
      else if (e.key === "ArrowLeft" || e.key === "PageUp") setNr((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [anzahl, tour]);
  if (tour) return <Tour schritte={TOUR} fertig={() => setTour(false)} abbrechen={() => setTour(false)} />;
  const f = folien[nr];
  const letzte = nr === anzahl - 1;
  return (
    <div class="einweisung-schirm">
      <article class={`ekarte folien ${p.rolle}`} data-testid={`einweisung-${p.rolle}`} data-folie={nr + 1} data-folien={anzahl}
        onPointerDown={(e) => { wisch.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={(e) => {
          const w = wisch.current;
          wisch.current = null;
          if (!w || e.pointerType === "mouse") return;
          const dx = e.clientX - w.x;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - w.y)) geh(nr + (dx < 0 ? 1 : -1));
        }}>
        <header class="ekarte-kopf">
          <h1>{f.titel}</h1>
          <span class="unter">{team ? "Zielbearbeitung" : ROLLEN_NAME.sl}</span>
        </header>
        <div class="folie-rumpf">
          <div class="folie folie-schritt" key={nr}>
            {f.text && <p class="folie-einleitung">{f.text}</p>}
            <div class="folie-inhalt">{f.inhalt}</div>
          </div>
        </div>
        <footer class="ekarte-fuss folie-fuss">
          <span class="zeile" style="gap:8px">
            <button type="button" class="knopf leise" onClick={p.schliessen} data-testid="einweisung-ueberspringen">Überspringen</button>
            {team && <button type="button" class="knopf leise" onClick={() => setTour(true)} data-testid="einweisung-tour">Übersicht noch einmal</button>}
          </span>
          <span class="folie-mitte">
            <span class="folie-punkte" aria-label={`Folie ${nr + 1} von ${anzahl}`}>
              {Array.from({ length: anzahl }, (_, i) => (
                <button type="button" key={i} class={i === nr ? "an" : ""} onClick={() => geh(i)} aria-label={`Folie ${i + 1}`} />
              ))}
            </span>
            <FensterInfo />
          </span>
          <span class="zeile" style="gap:8px">
            {nr > 0 && <button type="button" class="knopf leise" onClick={() => geh(nr - 1)}>‹ zurück</button>}
            {letzte
              ? <button type="button" class="knopf" onClick={p.schliessen} data-testid="einweisung-schliessen">Verstanden – zur Ansicht</button>
              : <button type="button" class="knopf" onClick={() => geh(nr + 1)} data-testid="einweisung-weiter">weiter ›</button>}
          </span>
        </footer>
      </article>
    </div>
  );
}

// ---------------------------------------------------------------- Druck

/** Skizze der Ansicht mit nummerierten Bereichen (Druckkarte statt Übersicht auf der Oberfläche). */
function AnsichtSkizze() {
  const feld = (nr: number, text: string, stil: string) => (
    <div class="skizze-feld" style={stil}><span class="schritt">{nr}</span>{text}</div>
  );
  return (
    <div class="skizze" aria-label="Aufbau der Ansicht">
      <div class="skizze-kopf">{feld(7, "Uhr, Phase", "")}{feld(4, "vier Panzer", "")}</div>
      <div class="skizze-rumpf">
        <div class="skizze-karte">{feld(3, "Lagekarte (ganz)", "flex:1")}<div class="skizze-ecke">{feld(5, "Lagemeldungen", "")}</div></div>
        <div class="skizze-rechts">
          {feld(1, "Eingang mit Wartezeit", "")}
          {feld(2, "Meldung: Drohnenbild, ARGUS, entscheiden", "flex:1")}
          {feld(6, "Wirkmittel: Bestand, Countdown", "")}
        </div>
      </div>
    </div>
  );
}

/** Druckkarte für das Team (A5 quer): Skizze der Ansicht, Phasen, Klassen, Wirkmittel. */
export function Einweisungskarte(p: { inh: Inhalte; rolle: KartenRolle }) {
  if (p.rolle === "sl") {
    return (
      <article class="ekarte druck sl" data-testid="einweisung-sl">
        <header class="ekarte-kopf"><h1>{ROLLEN_NAME.sl}</h1><span class="unter">Steuern, beobachten, nicht eingreifen</span></header>
        <div class="druck-folien n4">{slFolien(p.inh).map((f) => <section><b class="folie-titel">{f.titel}</b>{f.inhalt}</section>)}</div>
        <footer class="ekarte-fuss"><span>{p.inh.szenario.anzeige} · {p.inh.szenario.fiktiv}</span></footer>
      </article>
    );
  }
  return (
    <article class="ekarte druck zb" data-testid="einweisung-zb">
      <header class="ekarte-kopf"><h1>Zielbearbeitung</h1><span class="unter">Ein Laptop je Team · eine Entscheidung je Meldung</span></header>
      <div class="druck-team">
        <section>
          <AnsichtSkizze />
          <ol class="skizze-legende">{TOUR.map((s) => <li><b>{s.titel}</b></li>)}</ol>
        </section>
        <section>
          <b class="folie-titel">Die Phasen</b>
          <PhasenFolie inh={p.inh} />
          <b class="folie-titel">Entscheiden</b>
          <p><M k="toedlich">BEKÄMPFEN mit …</M> (Wirkmittel wählen) · <M>ZURÜCKSTELLEN</M> · <M>ABLEHNEN</M>. Ihr verantwortet jede Wirkung.</p>
        </section>
      </div>
      <footer class="ekarte-fuss"><span>{p.inh.szenario.anzeige} · {p.inh.szenario.fiktiv}</span></footer>
    </article>
  );
}

/** Druckseite: eine Karte je Team (Zielbearbeitung), dazu die Spielleitung. */
export function EinweisungDruck(p: { inh: Inhalte }) {
  return (
    <div class="druck-seiten">
      <div class="druck-leiste">
        <span>Einweisungskarten {p.inh.szenario.anzeige} – A5 quer, eine Karte je Seite (je Team eine Karte)</span>
        <button type="button" class="knopf" onClick={() => window.print()}>Drucken</button>
      </div>
      {(["zb", "sl"] as const).map((r) => <Einweisungskarte inh={p.inh} rolle={r} />)}
    </div>
  );
}
