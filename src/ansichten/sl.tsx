// Spielleitung: Uhr, Kontrollkarte (Ground Truth), bedingte Injects und Reserve, Zeitplan mit
// manuellem Auslösen, Teilnehmer, Notiz und das vollständige Protokoll (mit Export). Das Fenster der
// steuernden Spielleitung ist zugleich der Host.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { bedingtStand } from "../engine/ablauf";
import { pruefeInhalte } from "../inhalte/pruefen";
import { absenderText, beschreibe } from "../kern/beschreibung";
import { TEXT_MAX } from "../kern/ereignisse";
import { GT_NAME, LAGE_TAKT_S, lagebildKontrolle } from "../kern/lagebild";
import { ROLLEN_NAME, STUFE_TEXT } from "../kern/sichten";
import { mmss, uhrzeit } from "../kern/uhr";
import { istVeraltet } from "../sync/adapter";
import type { Sicht, SichtTeilnehmer } from "../sitzung/sicht";
import { rollenAnzeige } from "../kern/sitzungen";
import { AktionsKnopf, BestaetigenKnopf, Leer, Panel } from "./gemeinsam/bausteine";
import { useSpielzeit, useStand } from "./gemeinsam/hooks";
import { LagekarteAnsicht } from "./gemeinsam/lagekarte";

const TEMPI = [1, 2, 5, 10, 20];

interface Plan {
  art: "meldung" | "inject";
  id: string;
  t: number;
  text: string;
  zusatz: string;
  fall?: string;
}

function exportieren(s: Sicht): void {
  const st = s.stand;
  const daten = {
    format: "argus-protokoll/1",
    szenario: s.inh.szenario.id,
    version: s.inh.szenario.version,
    sitzung: st.raum,
    team: st.teamName,
    lauf: st.lauf,
    exportiert: new Date().toISOString(),
    protokoll: st.protokoll,
  };
  const blob = new Blob([JSON.stringify(daten, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const team = st.teamName.replace(/[^A-Za-z0-9ÄÖÜäöüß-]+/g, "_");
  a.download = `argus-protokoll-${st.raum}-${team}-${st.lauf ?? "ohne-lauf"}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function plenumOeffnen(): void {
  const u = new URL(location.href);
  u.searchParams.set("rolle", "plenum");
  u.searchParams.delete("name");
  window.open(u.toString(), "argus-plenum");
}

/** Reihenfolge in der Fensterleiste: Spielleitung, G1, G2, G3, Plenum. */
function fensterRang(x: SichtTeilnehmer): number {
  if (x.art === "sl") return 0;
  if (x.art === "plenum") return 9;
  return 1 + ["g1", "g2", "g3"].indexOf(x.rollen[0] ?? "g3");
}

const STATUS_TEXT = { wartet: "wartet", erfuellt: "kommt", ausgeloest: "ausgelöst", entfaellt: "entfällt" } as const;

export function SLAnsicht(p: { s: Sicht }) {
  const { s } = p;
  const st = useStand(s);
  const t = useSpielzeit(s, 500);
  const inh = s.inh;
  const sz = inh.szenario;
  const z = st.zustand;
  const start = sz.spieluhr.start;
  const bericht = useMemo(() => pruefeInhalte(inh), [inh]);
  const [notiz, setNotiz] = useState("");
  const [zeitEingabe, setZeitEingabe] = useState("");
  const [reiter, setReiter] = useState<"zeitplan" | "protokoll">("zeitplan");
  const jetzt = s.adapter.serverJetzt();
  const darfSteuern = st.istHost || (!!st.host && !istVeraltet(st.host.puls, jetzt));
  const tLage = Math.floor(Math.min(t, sz.spieluhr.dauer_s) / LAGE_TAKT_S) * LAGE_TAKT_S;
  const lagebild = useMemo(() => lagebildKontrolle(inh, z, tLage), [inh, z, tLage]);
  const bedingt = bedingtStand(inh, z, t);

  const plan = useMemo<Plan[]>(() => {
    const liste: Plan[] = sz.meldungen.map((m) => {
      const gt = [...new Set(m.ziele.map((id) => GT_NAME[inh.ziele[id].gt.kategorie]))].join("/");
      return { art: "meldung", id: m.id, t: m.t_s, text: `${m.argus.klasse} ${m.argus.konfidenz} % ${m.argus.empfehlung}`, zusatz: `Ground Truth: ${gt}`, fall: m.fall };
    });
    for (const i of sz.injects) {
      if (i.t_s === undefined) continue;
      liste.push({ art: "inject", id: i.id, t: i.t_s, text: `${i.von} → ${i.an}`, zusatz: i.text.length > 70 ? `${i.text.slice(0, 68)} …` : i.text, fall: i.fall });
    }
    return liste.sort((a, b) => a.t - b.t);
  }, [inh]);

  const zeitSetzen = () => {
    const m = zeitEingabe.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return s.hinweis("warnung", "Spielzeit als mm:ss eingeben, z. B. 08:30");
    s.senden("uhr", { befehl: "setzen", t_s: Number(m[1]) * 60 + Number(m[2]) });
    setZeitEingabe("");
  };

  // Zeitplan: nächsten Eintrag sichtbar halten
  const naechster = plan.find((x) => !(x.art === "meldung" ? z.meldungen[x.id] : z.injects[x.id]))?.id;
  const zeitplanRef = useRef<HTMLTableElement>(null);
  useEffect(() => {
    if (reiter !== "zeitplan" || !naechster) return;
    zeitplanRef.current?.querySelector(`[data-plan="${naechster}"]`)?.scrollIntoView({ block: "center" });
  }, [naechster, reiter]);

  return (
    <main class="inhalt ansicht-sl">
      <div class="stapel">
        <Panel titel="Steuerung" klasse="flach" rechts={st.istHost ? <span class="badge gut" data-testid="host">steuert</span> : <span class="badge">beobachtet</span>}>
          <div class="stapel" style="gap:8px">
            <div class="klein leise">
              Lauf <span class="mono">{st.lauf ?? "–"}</span> · {sz.anzeige} v{sz.version}
              {!st.istHost && <div>Steuerung: {st.host ? `„${st.host.name}“${istVeraltet(st.host.puls, jetzt) ? " (keine Rückmeldung)" : ""}` : "niemand"}</div>}
            </div>
            {!st.istHost && <button type="button" class="knopf warn" onClick={() => void s.uebernehmen()}>Steuerung übernehmen</button>}
            <AktionsKnopf s={s} wartet={s.wartetAuf("uhr")} gesperrt={!darfSteuern || !st.lauf || z.ende} klasse={z.uhr.laeuft ? "warn gross" : "gut gross"}
              onClick={() => s.senden("uhr", { befehl: z.uhr.laeuft ? "pause" : "start" })}>
              {z.uhr.laeuft ? "❚❚ Anhalten" : "▶ Start"}
            </AktionsKnopf>
            <div class="zeile" style="gap:4px">
              <span class="klein leise" style="margin-right:4px">Tempo</span>
              {TEMPI.map((v) => (
                <button type="button" class={`knopf klein ${z.uhr.tempo === v ? "an" : ""}`} disabled={!darfSteuern} onClick={() => s.senden("uhr", { befehl: "tempo", tempo: v })}>×{v}</button>
              ))}
            </div>
            <div class="zeile" style="flex-wrap:nowrap">
              <input class="feld zahl" style="width:80px" placeholder={mmss(t)} value={zeitEingabe} onInput={(e) => setZeitEingabe((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => e.key === "Enter" && zeitSetzen()} data-testid="sl-zeit" />
              <button type="button" class="knopf klein" disabled={!darfSteuern} onClick={zeitSetzen}>Spielzeit setzen</button>
            </div>
            <div class="zeile zwischen">
              <span class="klein">Fast-Track <b>{z.fastTrack ? "EIN" : "AUS"}</b> <span class="sehr-leise">(auf Zuruf von G3)</span></span>
              <AktionsKnopf s={s} wartet={s.wartetAuf("fast_track")} klasse="klein" onClick={() => s.senden("fast_track", { an: !z.fastTrack })}>
                {z.fastTrack ? "aus" : "ein"}
              </AktionsKnopf>
            </div>
            <div class="knopf-reihe">
              <button type="button" class="knopf klein" onClick={plenumOeffnen}>Plenum öffnen</button>
              <BestaetigenKnopf klasse="schlecht klein" gesperrt={!st.istHost} onClick={() => void s.neuesSpiel()}
                frage="Wirklich? Klick = neues Spiel" titel="Neuer Lauf für dieses Team. Der jetzige Lauf bleibt gespeichert.">
                Neues Spiel
              </BestaetigenKnopf>
            </div>
            {(bericht.fehler.length > 0 || bericht.warnungen.length > 0) && (
              <div class={bericht.fehler.length ? "warnung" : "klein sehr-leise"} title={[...bericht.fehler, ...bericht.warnungen].join("\n")}>
                Szenario-Prüfung: {bericht.fehler.length} Fehler, {bericht.warnungen.length} Warnungen
              </div>
            )}
          </div>
        </Panel>
        <Panel titel="Bedingte Injects, Ereignis und Reserve" liste>
          <div class="bedingt-liste" data-testid="bedingt">
            {bedingt.map((b) => {
              const inj = inh.injects[b.id];
              const ereignis = b.art === "ereignis" ? sz.ereignisse.find((e) => e.id === b.id) : undefined;
              return (
                <div class={`bedingt ${b.status}`} key={b.id} data-bedingt={b.id} title={ereignis?.name ?? `${inj?.von}: „${inj?.text}“`}>
                  <div>
                    <div><b>{b.id}</b> <span class="status">· {STATUS_TEXT[b.status]}{b.t !== undefined && b.status !== "ausgeloest" ? ` ${uhrzeit(start, b.t)}` : ""}</span></div>
                    <div class="status">{b.text}{ereignis ? " · ab Schritt 7 automatisch, bis dahin nach Kontrollkarte" : ""}</div>
                  </div>
                  {b.art === "inject" && b.status !== "ausgeloest" && (
                    <button type="button" class="knopf klein" disabled={!darfSteuern} onClick={() => s.senden("inject_ausloesen", { inject: b.id })}>jetzt</button>
                  )}
                </div>
              );
            })}
            {(sz.reserve_injects ?? []).map((r) => {
              const da = z.injects[r.id];
              return (
                <div class={`bedingt ${da ? "ausgeloest" : ""}`} key={r.id} data-reserve={r.id} title={`${r.von}: „${r.text}“`}>
                  <div>
                    <div><b>{r.id}</b> <span class="status">· Reserve an {r.an}{da ? ` · ausgelöst ${uhrzeit(start, da.erschienen.t_s)}` : ""}</span></div>
                    <div class="status">{r.einsatz}</div>
                  </div>
                  {!da && <button type="button" class="knopf klein" disabled={!darfSteuern} onClick={() => s.senden("inject_ausloesen", { inject: r.id })}>auslösen</button>}
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel titel={`Fenster · ${st.teamName}`} klasse="flach" rechts={<span class="badge">{st.teilnehmer.length}</span>}>
          <div class="fenster-liste" data-testid="fenster">
            {[...st.teilnehmer].sort((a, b) => fensterRang(a) - fensterRang(b) || a.name.localeCompare(b.name)).map((x) => {
              const alter = Math.max(0, Math.round((jetzt - x.puls) / 1000));
              const marke = x.art === "tt" ? (x.rollen[0] ?? "sl") : x.art;
              const kurz = x.art === "plenum" ? "Plenum" : x.art === "sl" ? "SL" : rollenAnzeige(x.rollen);
              return (
                <span key={x.client} class={`fenster ${alter > 20 ? "still" : ""}`}
                  title={`${x.name}${x.client === st.client ? " (dieses Fenster)" : ""}${st.host?.id === x.client ? " · steuert" : ""} · letzte Rückmeldung vor ${alter} s`}>
                  <i class={`rolle-${marke}`} />{kurz}{x.name && x.name !== ROLLEN_NAME[marke as keyof typeof ROLLEN_NAME] ? ` ${x.name}` : ""}
                  {st.host?.id === x.client && <b> ★</b>}<span class="sehr-leise zahl">{alter} s</span>
                </span>
              );
            })}
          </div>
        </Panel>
        <Panel titel="Notiz ins Protokoll" klasse="flach">
          <div class="zeile" style="flex-wrap:nowrap">
            <input class="feld" maxLength={TEXT_MAX.notiz} placeholder="Beobachtung, z. B. „G3 diskutiert I-04“" value={notiz}
              onInput={(e) => setNotiz((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => { if (e.key === "Enter" && notiz.trim()) { s.senden("notiz", { text: notiz.trim() }); setNotiz(""); } }} />
            <button type="button" class="knopf" disabled={!notiz.trim()} onClick={() => { s.senden("notiz", { text: notiz.trim() }); setNotiz(""); }}>+</button>
          </div>
        </Panel>
      </div>

      <Panel titel="Kontrollkarte" klasse="ohne-rand"
        rechts={<span class="klein sehr-leise">Ground Truth, Lage {uhrzeit(start, tLage)} · Ziele mit Maus zeigen · Mausrad zoomt (Fahrzeuge ab Zoom)</span>}>
        <LagekarteAnsicht inh={inh} lagebild={lagebild} hintergrund="luftbild" sprites legende="kontrolle" zeichenGroesse={17} testid="kontrollkarte" />
      </Panel>
      <Panel liste titel={
        <div class="reiter">
          <button type="button" class={reiter === "zeitplan" ? "an" : ""} onClick={() => setReiter("zeitplan")}>Zeitplan</button>
          <button type="button" class={reiter === "protokoll" ? "an" : ""} onClick={() => setReiter("protokoll")}>Protokoll · {st.protokoll.length}</button>
        </div>}
        rechts={reiter === "protokoll" ? <button type="button" class="knopf klein" disabled={!st.protokoll.length} onClick={() => exportieren(s)}>Export JSON</button> : null}>
        {reiter === "zeitplan" ? (
          <table class="tabelle raster" data-testid="zeitplan" ref={zeitplanRef}>
            <tbody>
              {plan.map((x) => {
                const ms = x.art === "meldung" ? z.meldungen[x.id] : undefined;
                const is = x.art === "inject" ? z.injects[x.id] : undefined;
                const erschienen = ms?.erschienen ?? is?.erschienen;
                const status = ms ? STUFE_TEXT[ms.stufe] + (ms.fastTrack ? " · FT" : "")
                  : is ? (is.quittiert ? "quittiert" : "ausgelöst") : "";
                return (
                  <tr key={x.id} data-plan={x.id} style={erschienen ? "opacity:.55" : x.id === naechster ? "background:#2a2d24" : ""}>
                    <td class="zahl klein">{uhrzeit(start, x.t)}</td>
                    <td><b>{x.id}</b>{x.fall && <span class="badge" style="margin-left:4px">{x.fall}</span>}</td>
                    <td class="klein">{x.text}<div class="sehr-leise">{x.zusatz}</div></td>
                    <td class="klein" style="white-space:nowrap">{erschienen ? <>{uhrzeit(start, erschienen.t_s)}<br />{status}</> : ""}</td>
                    <td style="text-align:right">
                      {!erschienen && (
                        <button type="button" class="knopf klein" disabled={!darfSteuern}
                          onClick={() => x.art === "meldung" ? s.senden("meldung_ausloesen", { meldung: x.id }) : s.senden("inject_ausloesen", { inject: x.id })}>
                          jetzt
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : st.protokoll.length === 0 ? <Leer>noch keine Einträge</Leer> : (
          <table class="tabelle protokoll" data-testid="protokoll">
            <tbody>
              {[...st.protokoll].reverse().map((e) => (
                <tr key={e.seq} class={`${e.typ === "aktion_abgelehnt" ? "abgelehnt" : ""} ${e.von.rolle === "system" ? "system" : ""}`} data-seq={e.seq} data-aktion={e.aktion ?? ""}>
                  <td class="zahl sehr-leise">{e.seq}</td>
                  <td class="zahl">{uhrzeit(start, e.t_s)}</td>
                  <td class="typ">{absenderText(e)}</td>
                  <td>{beschreibe(e, inh)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </main>
  );
}
