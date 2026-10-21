// Lagekarte als Preact-Baustein: verbindet die PixiJS-Karte (src/karte/lagekarte.ts) mit der Ansicht.
// Knöpfe (Zoom, Hintergrund), Legende und Tooltip sind normales HTML über der Leinwand.
import ms from "milsymbol";
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { type AssetManifest, assetUrl, kachelnVerfuegbar, ladeManifest } from "../../assets/assets";
import type { Inhalte } from "../../inhalte/typen";
import { type Lagebild, lagebildSchluessel } from "../../kern/lagebild";
// Die PixiJS-Karte wird erst geladen, wenn eine Ansicht eine Karte zeigt (G1 braucht sie nicht).
import type { Hintergrund, KartenInfo, Lagekarte, Vorschau } from "../../karte/lagekarte";
import { MODIFIKATOR_ATTRAPPE, sidc } from "../../karte/zeichen";

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
}) {
  const { man, fertig } = useManifestStatus();
  const host = useRef<HTMLDivElement>(null);
  const karte = useRef<Lagekarte | null>(null);
  const [bereit, setBereit] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [info, setInfo] = useState<KartenInfo | null>(null);
  const [zoom, setZoom] = useState(1);
  const [grund, setGrund] = useState<Hintergrund>(p.hintergrund ?? "topo");
  const wahlRef = useRef(p.onWahl);
  wahlRef.current = p.onWahl;

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
      onZoom: setZoom,
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
      {p.banner}
      <div class="karte-knoepfe">
        <button type="button" class="knopf" title="Hineinzoomen (auch Mausrad)" aria-label="Hineinzoomen" onClick={() => karte.current?.zoom(1.5)}>+</button>
        <button type="button" class="knopf" title="Herauszoomen" aria-label="Herauszoomen" onClick={() => karte.current?.zoom(1 / 1.5)} disabled={zoom <= 1}>−</button>
        <button type="button" class="knopf" title="Ganze Karte zeigen (auch Doppelklick)" aria-label="Ganze Karte" onClick={() => karte.current?.ganzeKarte()} disabled={zoom <= 1}>⤢</button>
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
