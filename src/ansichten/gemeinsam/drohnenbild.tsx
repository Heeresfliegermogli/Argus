// Drohnenbild einer ARGUS-Meldung mit ARGUS-Markierung (Eckrahmen, Klasse, Konfidenz).
// Bild und Rahmen kommen aus dem Asset-Manifest; die Markierung wird hier gezeichnet, nicht ins Bild
// eingebrannt, damit sie scharf bleibt und die Gestaltung (Schritt 6) sie frei anpassen kann.
import { useEffect, useState } from "preact/hooks";
import { type AssetManifest, assetUrl, drohnenbild, ladeManifest, vorladen } from "../../assets/assets";
import type { Meldung } from "../../inhalte/typen";

export function useManifest(): AssetManifest | null {
  const [man, setMan] = useState<AssetManifest | null>(null);
  useEffect(() => {
    let aktiv = true;
    ladeManifest().then((m) => aktiv && setMan(m)).catch((e) => console.warn("Asset-Manifest:", e));
    return () => {
      aktiv = false;
    };
  }, []);
  return man;
}

export function DrohnenbildAnzeige(p: { meldung: Meldung; uhr: string; bildalter: number; naechste?: string[] }) {
  const man = useManifest();
  const m = p.meldung;
  const b = man ? drohnenbild(man, m.id) : null;
  useEffect(() => {
    if (man && p.naechste?.length) vorladen(p.naechste.map((id) => drohnenbild(man, id)?.datei).filter((d): d is string => !!d));
  }, [man, (p.naechste ?? []).join(",")]);
  const einzeln = m.argus.einzeln ?? [];
  return (
    <div class="drohne" data-testid="drohnenbild">
      {b ? <img src={assetUrl(b.datei)} width={b.breite} height={b.hoehe} alt={m.bild.beschreibung} draggable={false} /> : <div class="drohne-leer">Bild wird geladen …</div>}
      {b && b.ziele.map((z, i) => (
        <div key={z.id} class="argus-rahmen" style={{
          left: `${(z.box[0] / b.breite) * 100}%`, top: `${(z.box[1] / b.hoehe) * 100}%`,
          width: `${(z.box[2] / b.breite) * 100}%`, height: `${(z.box[3] / b.hoehe) * 100}%`,
        }}>
          <span class={`argus-marke ${z.box[1] < 40 ? "unten" : ""}`}>{m.argus.klasse} · {einzeln[i] ?? m.argus.konfidenz} %</span>
        </div>
      ))}
      <div class="drohne-kopf mono">ARGUS 3.2 │ UAV-2 „Milan“ │ EO TAG │ {p.uhr}</div>
      <div class="drohne-fuss mono">{b ? `PQ ${b.pq} │ ` : ""}BILDALTER {p.bildalter} s │ ÜBUNG</div>
    </div>
  );
}
