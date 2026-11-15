// Abschlussbild „Gefecht beendet“ (Liste M, M4): am Team-Laptop statt der gesperrten Ansicht, im Plenum und in der Übersicht der
// Spielleitung als Karte je Team. Inhalt aus kern/abschluss.ts (dieselbe Rechnung wie die Bilanz der Auswertung): links die
// abgeschossenen Feindfahrzeuge als Wrack-Sprites je Typ, rechts die vier Leopards mit Zustand, darunter eine neutrale Zeile.
// Sprites aus dem Fahrzeug-Atlas der Karte (public/assets/sprites), leicht schräg, an den Wracks kleine Rauchwölkchen (CSS; ohne
// Bewegung, wenn der Rechner „weniger Bewegung“ wünscht). Keine Figuren, keine Zeiten, kein €, keine Rangfolge.
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { type AssetManifest, atlas, ladeManifest } from "../../assets/assets";
import type { Inhalte } from "../../inhalte/typen";
import { type Abschluss, STUFE_KURZ, abschluss, weitereText } from "../../kern/abschluss";
import { verwText } from "../../kern/verluste";
import type { Spielzustand } from "../../kern/zustand";

interface Rahmen {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface FahrzeugAtlas {
  url: string;
  breite: number;
  hoehe: number;
  frames: Record<string, Rahmen>;
}

let laden: Promise<FahrzeugAtlas> | null = null;
function ladeAtlas(): Promise<FahrzeugAtlas> {
  laden ??= ladeManifest().then(async (man: AssetManifest) => {
    const a = await atlas(man, "fahrzeuge");
    const j = a.json as { frames: Record<string, { frame: Rahmen }> };
    return { url: a.bildUrl, breite: man.fahrzeuge.breite, hoehe: man.fahrzeuge.hoehe, frames: Object.fromEntries(Object.entries(j.frames).map(([k, v]) => [k, v.frame])) };
  }).catch((e) => {
    laden = null;
    throw e;
  });
  return laden;
}

/** Fahrzeug-Atlas der Karte (einmal geladen; null, solange er lädt oder fehlt – dann stehen nur die Texte da). */
function useAtlas(): FahrzeugAtlas | null {
  const [a, setA] = useState<FahrzeugAtlas | null>(null);
  useEffect(() => {
    let aus = false;
    ladeAtlas().then((x) => { if (!aus) setA(x); }).catch(() => {});
    return () => { aus = true; };
  }, []);
  return a;
}

/** Ein Sprite aus dem Atlas im Maßstab der Karte (px je Atlas-px), optional gespiegelt und gedreht. */
function Sprite(p: { a: FahrzeugAtlas | null; name: string | null; mass: number; spiegeln?: boolean; drehen?: number; titel: string; klasse?: string }) {
  const f = p.a && p.name ? p.a.frames[p.name] : undefined;
  if (!p.a || !f) return <span class={`ab-sprite leer ${p.klasse ?? ""}`} title={p.titel} />;
  const s = p.mass;
  return (
    <span class={`ab-sprite ${p.klasse ?? ""}`} role="img" aria-label={p.titel} title={p.titel} data-sprite={p.name}
      style={{
        width: `${Math.round(f.w * s)}px`, height: `${Math.round(f.h * s)}px`,
        backgroundImage: `url(${p.a.url})`, backgroundSize: `${p.a.breite * s}px ${p.a.hoehe * s}px`,
        backgroundPosition: `${-f.x * s}px ${-f.y * s}px`,
        transform: `${p.spiegeln ? "scaleX(-1) " : ""}rotate(${p.drehen ?? 0}deg)`,
      }} />
  );
}

/** Kleine Rauchwölkchen über einem Wrack (versetzt je Nummer, damit nicht alle gleich qualmen). */
function Rauch(p: { nr: number }) {
  return <span class="ab-rauch" style={{ animationDelay: `${(p.nr * 0.37) % 1.6}s` }} aria-hidden="true"><i /><i /><i /></span>;
}

/** feste, leicht verspielte Schräglage je Sprite (deterministisch) */
const SCHRAEG = [-7, 5, -3, 8, -5, 3, -8, 6];
const MAX_JE_REIHE = 5;
const LEO = { bereit: "kpz_leo2a7v.png", eingeschraenkt: "kpz_leo2a7v_eingeschraenkt.png", ausgefallen: "kpz_leo2a7v_ausgefallen.png" };

function leoSprite(stufe: string): string {
  return stufe === "ausgefallen" ? LEO.ausgefallen : stufe === "eingeschraenkt" ? LEO.eingeschraenkt : LEO.bereit;
}

/**
 * Abgeschossene Feindfahrzeuge: je Typ eine Reihe Wracks (höchstens fünf, auf einem Streifen Gelände, der Abstand passt sich der Breite
 * an) und „3 × KPz T-72“; kompakt (Karten): ein Wrack je Typ.
 */
function Abgeschossen(p: { ab: Abschluss; a: FahrzeugAtlas | null; mass: number; kompakt?: boolean; streifen?: number }) {
  if (!p.ab.feind.length) return <div class="ab-leer leise" data-testid="ab-keine">Keine Feindfahrzeuge abgeschossen.</div>;
  let nr = 0;
  const breite = p.streifen ?? 320;
  return (
    <div class={`ab-feind ${p.kompakt ? "kompakt" : ""}`} data-testid="ab-feind">
      {p.ab.feind.map((f) => {
        const name = f.wrack ?? f.sprite;
        const rahmen = p.a?.frames[name];
        const w = rahmen ? rahmen.w * p.mass : 48;
        const n = p.kompakt ? 1 : Math.min(f.n, MAX_JE_REIHE);
        // Abstand der Wracks: so, dass die Reihe in den Streifen passt (höchstens eine Breite plus 6 px)
        const schritt = n > 1 ? Math.max(8, Math.min(w + 6, (breite - 16 - w) / (n - 1))) : 0;
        return (
          <div class="ab-feind-zeile" key={f.typ} data-typ={f.typ} data-n={f.n}>
            <span class="ab-reihe" style={p.kompakt ? undefined : { width: `${breite}px` }}>
              {Array.from({ length: n }, (_, i) => {
                const k = nr++;
                return (
                  <span class="ab-wrack" key={i} style={p.kompakt ? undefined : { left: `${8 + i * schritt}px`, zIndex: 10 + i }}>
                    <Sprite a={p.a} name={name} mass={p.mass} drehen={SCHRAEG[k % SCHRAEG.length]} titel={f.kurz} />
                    {(i === 1 || i === 3) && <Rauch nr={k} />}
                  </span>
                );
              })}
            </span>
            <span class="ab-zahl"><b>{f.n} ×</b> {f.kurz}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Die vier Leopards mit Zustand, Stufe und Treffern (gespiegelt: sie blicken nach links zu den Wracks). */
function EurePanzer(p: { ab: Abschluss; a: FahrzeugAtlas | null; mass: number; kompakt?: boolean }) {
  return (
    <div class={`ab-panzer ${p.kompakt ? "kompakt" : ""}`} data-testid="ab-panzer">
      {p.ab.panzer.map((x, i) => (
        <div class={`ab-pz stufe-${x.stufe}`} key={x.id} data-panzer={x.name} data-zustand={x.zustand} data-stufe={x.stufe}>
          <span class="ab-pz-bild">
            <Sprite a={p.a} name={leoSprite(x.stufe)} mass={p.mass} spiegeln drehen={SCHRAEG[(i + 3) % SCHRAEG.length] / 2} titel={`Leopard ${x.name}`} />
            {x.stufe === "ausgefallen" && <Rauch nr={i + 5} />}
          </span>
          <span class="ab-pz-text">
            <span class="ab-pz-kopf"><b>{x.name}</b> <span class="ab-pz-prozent">{x.zustand} %</span></span>
            <span class="ab-pz-stufe">{STUFE_KURZ[x.stufe]}{!p.kompakt && <span class="sehr-leise"> · {x.treffer === 1 ? "1 Treffer" : `${x.treffer} Treffer`}</span>}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Abschlussbild am Team-Laptop (M4.1–M4.4): ganze Fläche unter der Kopfzeile. */
export function AbschlussBild(p: { inh: Inhalte; z: Spielzustand; team: string; farbe: string; ende: string; children?: ComponentChildren }) {
  const ab = useMemo(() => abschluss(p.inh, p.z), [p.inh, p.z]);
  const a = useAtlas();
  if (!ab) return null;
  return (
    <div class="ab-bild" data-testid="abschluss" data-feind={ab.feindSumme} data-weitere={ab.weitere} data-bereit={ab.bereit}>
      <header class="ab-kopf" style={{ background: p.farbe }}>
        {/* Testraum und Testpult heißen „Team 1“ – nicht „Team Team 1“ (Befund Liste N) */}
        <h2>Gefecht beendet – {/^Team\b/.test(p.team) ? p.team : `Team ${p.team}`}</h2>
        <span class="ab-ende">{p.ende}</span>
      </header>
      <div class="ab-unterzeile leise">Eingaben sind gesperrt. Bitte zum Plenum – die Auswertung beginnt.</div>
      <div class="ab-spalten">
        <section class="ab-feld">
          <h3>Abgeschossen <span class="ab-summe" data-testid="ab-feind-summe">{ab.feindSumme} {ab.feindSumme === 1 ? "Feindfahrzeug" : "Feindfahrzeuge"}</span></h3>
          <Abgeschossen ab={ab} a={a} mass={0.44} streifen={330} />
        </section>
        <section class="ab-feld">
          <h3>Eure Panzer <span class="ab-summe" data-testid="ab-bereit">{ab.bereit}/{ab.gesamt} einsatzbereit · {verwText(ab.verwundete)}</span></h3>
          <EurePanzer ab={ab} a={a} mass={0.62} />
          {ab.wirkmittel.length > 0 && (
            <div class="ab-wm" data-testid="ab-wirkmittel">
              <span class="leise">Verbraucht:</span> {ab.wirkmittel.map((w) => <span key={w.id} data-wm={w.id}><b>{w.kurz}</b> {w.verbraucht}/{w.bestand}</span>)}
            </div>
          )}
        </section>
      </div>
      <div class="ab-fuss">
        <div class="ab-weitere" data-testid="ab-weitere">{weitereText(ab.weitere)}</div>
        <div class="ab-knoepfe">{p.children}</div>
      </div>
    </div>
  );
}

/** Kompakte Karte eines Teams (Plenum, Übersicht der Spielleitung; M4.5). */
export function AbschlussKarte(p: { inh: Inhalte; z: Spielzustand; name: string; farbe: string; a: FahrzeugAtlas | null }) {
  const ab = useMemo(() => abschluss(p.inh, p.z), [p.inh, p.z]);
  if (!ab) return null;
  return (
    <article class="ab-karte" style={{ borderTopColor: p.farbe }} data-testid="abschluss-karte" data-team={p.name} data-feind={ab.feindSumme} data-weitere={ab.weitere} data-bereit={ab.bereit}>
      <header><span class="team-marke" title={`Team ${p.name}`}><i style={{ background: p.farbe }} /><span>{p.name}</span></span>{!p.z.ende && <span class="sehr-leise klein">läuft noch</span>}</header>
      <div class="ab-karte-zeile"><span class="leise">Abgeschossen</span><b data-testid="ab-feind-summe">{ab.feindSumme}</b><span class="sehr-leise klein">{ab.feindSumme === 1 ? "Feindfahrzeug" : "Feindfahrzeuge"}</span></div>
      <Abgeschossen ab={ab} a={p.a} mass={0.24} kompakt />
      <div class="ab-karte-zeile"><span class="leise">Eure Panzer</span><b data-testid="ab-bereit">{ab.bereit}/{ab.gesamt}</b><span class="sehr-leise klein">{verwText(ab.verwundete)}</span></div>
      <EurePanzer ab={ab} a={p.a} mass={0.27} kompakt />
      <div class="ab-weitere klein" data-testid="ab-weitere">{weitereText(ab.weitere)}</div>
    </article>
  );
}

/**
 * „Gefecht beendet“ mit einer Karte je Team (M4.5): feste Reihenfolge wie in der Lobby (Reihenfolge der übergebenen Liste), keine
 * Summe, kein Sortieren, kein „bestes Team“.
 */
export function AbschlussUebersicht(p: { inh: Inhalte; teams: { id: string; name: string; farbe: string; zustand: Spielzustand }[]; titel?: ComponentChildren; knoepfe?: ComponentChildren; testid?: string }) {
  const a = useAtlas();
  return (
    <section class="ab-uebersicht" data-testid={p.testid ?? "abschluss-uebersicht"} data-teams={p.teams.length}>
      {(p.titel || p.knoepfe) && <div class="ab-uebersicht-kopf"><h2>{p.titel}</h2><span class="zeile" style="gap:8px">{p.knoepfe}</span></div>}
      <div class={`ab-raster n${Math.min(p.teams.length, 8)}`}>
        {p.teams.map((t) => <AbschlussKarte key={t.id} inh={p.inh} z={t.zustand} name={t.name} farbe={t.farbe} a={a} />)}
      </div>
    </section>
  );
}
