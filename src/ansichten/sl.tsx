// Spielleitung: Uhr, Zeitplan mit manuellem Auslösen, Reserve-Injects, Fast-Track, neues Spiel,
// Teilnehmer und das vollständige Protokoll (mit Export). Das Fenster der steuernden Spielleitung
// ist zugleich der Host. Die Spielleitung sieht die Ground Truth.
import { useMemo, useState } from "preact/hooks";
import { pruefeInhalte } from "../inhalte/pruefen";
import { absenderText, beschreibe } from "../kern/beschreibung";
import { TEXT_MAX } from "../kern/ereignisse";
import { ROLLEN_NAME, STUFE_TEXT } from "../kern/sichten";
import { mmss, uhrzeit } from "../kern/uhr";
import { istVeraltet } from "../sync/adapter";
import type { Sitzung } from "../sitzung/sitzung";
import { AktionsKnopf, Leer, Panel } from "./gemeinsam/bausteine";
import { useSpielzeit, useStand } from "./gemeinsam/hooks";

const GT_TEXT: Record<string, string> = {
  feind: "Feind", verbuendet: "verbündet", zivil: "zivil", geschuetzt: "geschützt", attrappe: "Attrappe", ausser_gefecht: "außer Gefecht",
};
const TEMPI = [1, 2, 5, 10, 20];

interface Plan {
  art: "meldung" | "inject";
  id: string;
  t: number | null;
  text: string;
  zusatz: string;
  fall?: string;
}

function exportieren(s: Sitzung): void {
  const st = s.stand;
  const daten = {
    format: "argus-protokoll/1",
    szenario: s.inh.szenario.id,
    version: s.inh.szenario.version,
    lauf: st.lauf,
    exportiert: new Date().toISOString(),
    protokoll: st.protokoll,
  };
  const blob = new Blob([JSON.stringify(daten, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `argus-protokoll-${st.lauf ?? "ohne-lauf"}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function SLAnsicht(p: { s: Sitzung }) {
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
  const [filter, setFilter] = useState<"alle" | "meldung" | "inject">("alle");
  const jetzt = s.adapter.serverJetzt();
  const darfSteuern = st.istHost || (!!st.host && !istVeraltet(st.host.puls, jetzt));

  const plan = useMemo<Plan[]>(() => {
    const liste: Plan[] = sz.meldungen.map((m) => {
      const gt = [...new Set(m.ziele.map((id) => GT_TEXT[inh.ziele[id].gt.kategorie]))].join("/");
      return { art: "meldung", id: m.id, t: m.t_s, text: `${m.argus.klasse} ${m.argus.konfidenz} % ${m.argus.empfehlung}`, zusatz: `GT: ${gt}`, fall: m.fall };
    });
    for (const i of sz.injects) {
      const b = i.bedingung;
      const bed = !b ? "" : b.typ === "keine_freigabe_bis" ? `bedingt: keine Freigabe auf ${b.ziele[0]}… bis ${uhrzeit(start, b.t_s)}`
        : `bedingt: ${b.typ === "freigabe_mit_zivil" ? "Freigabe mit Zivilpersonen" : "Freigabe"} auf ${b.ziele.join(", ")} +${b.verzoegerung_s} s`;
      liste.push({ art: "inject", id: i.id, t: i.t_s ?? null, text: `${i.von} → ${i.an}`, zusatz: bed, fall: i.fall });
    }
    for (const r of sz.reserve_injects ?? []) liste.push({ art: "inject", id: r.id, t: null, text: `Reserve: ${r.von} → ${r.an}`, zusatz: r.einsatz });
    return liste.sort((a, b) => (a.t ?? 1e9) - (b.t ?? 1e9));
  }, [inh]);

  const sichtbar = plan.filter((x) => filter === "alle" || x.art === filter);

  const zeitSetzen = () => {
    const m = zeitEingabe.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return s.hinweis("warnung", "Spielzeit als mm:ss eingeben, z. B. 08:30");
    s.senden("uhr", { befehl: "setzen", t_s: Number(m[1]) * 60 + Number(m[2]) });
    setZeitEingabe("");
  };

  return (
    <main class="inhalt spalten-sl">
      <div class="stapel">
        <Panel titel="Steuerung" klasse="flach" rechts={st.istHost ? <span class="badge gut" data-testid="host">steuert</span> : <span class="badge">beobachtet</span>}>
          <div class="stapel" style="gap:8px">
            <div class="klein leise">
              Lauf <span class="mono">{st.lauf ?? "–"}</span> · {sz.anzeige} v{sz.version}
              {!st.istHost && <div>Steuerung: {st.host ? `„${st.host.name}“${istVeraltet(st.host.puls, jetzt) ? " (keine Rückmeldung)" : ""}` : "niemand"}</div>}
            </div>
            {!st.istHost && <button type="button" class="knopf warn" onClick={() => void s.uebernehmen()}>Steuerung übernehmen</button>}
            <div class="knopf-reihe">
              <AktionsKnopf s={s} wartet={s.wartetAuf("uhr")} gesperrt={!darfSteuern || !st.lauf} klasse={z.uhr.laeuft ? "warn gross" : "gut gross"}
                onClick={() => s.senden("uhr", { befehl: z.uhr.laeuft ? "pause" : "start" })}>
                {z.uhr.laeuft ? "❚❚ Anhalten" : "▶ Start"}
              </AktionsKnopf>
            </div>
            <div class="zeile">
              <span class="klein leise">Tempo</span>
              {TEMPI.map((v) => (
                <button type="button" class={`knopf klein ${z.uhr.tempo === v ? "an" : ""}`} onClick={() => s.senden("uhr", { befehl: "tempo", tempo: v })}>×{v}</button>
              ))}
            </div>
            <div class="zeile">
              <input class="feld mono" style="width:90px" placeholder={mmss(t)} value={zeitEingabe} onInput={(e) => setZeitEingabe((e.target as HTMLInputElement).value)} />
              <button type="button" class="knopf klein" onClick={zeitSetzen}>Spielzeit setzen</button>
            </div>
            <div class="zeile zwischen">
              <span class="klein">Fast-Track <b>{z.fastTrack ? "EIN" : "AUS"}</b></span>
              <AktionsKnopf s={s} wartet={s.wartetAuf("fast_track")} klasse="klein" onClick={() => s.senden("fast_track", { an: !z.fastTrack })}>
                {z.fastTrack ? "ausschalten" : "einschalten"}
              </AktionsKnopf>
            </div>
            <button type="button" class="knopf schlecht klein" disabled={!st.istHost}
              onClick={() => { if (confirm("Neues Spiel beginnen? Der jetzige Lauf bleibt gespeichert.")) void s.neuesSpiel(); }}>
              Neues Spiel
            </button>
            {(bericht.fehler.length > 0 || bericht.warnungen.length > 0) && (
              <div class={bericht.fehler.length ? "warnung" : "klein leise"} title={[...bericht.fehler, ...bericht.warnungen].join("\n")}>
                Szenario-Prüfung: {bericht.fehler.length} Fehler, {bericht.warnungen.length} Warnungen
              </div>
            )}
          </div>
        </Panel>
        <Panel titel="Fenster im Raum" rechts={<span class="badge">{st.teilnehmer.length}</span>}>
          <table class="tabelle">
            <tbody>
              {[...st.teilnehmer].sort((a, b) => a.rolle.localeCompare(b.rolle)).map((x) => (
                <tr key={x.client}>
                  <th>{ROLLEN_NAME[x.rolle] ?? x.rolle}</th>
                  <td>{x.name !== ROLLEN_NAME[x.rolle] ? x.name : ""}{x.client === st.client ? " (dieses)" : ""}{st.host?.id === x.client ? " · steuert" : ""}</td>
                  <td class="mono klein sehr-leise" style="text-align:right">{Math.max(0, Math.round((jetzt - x.puls) / 1000))} s</td>
                </tr>
              ))}
            </tbody>
          </table>
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

      <Panel titel="Zeitplan" rechts={
        <div class="zeile">
          {(["alle", "meldung", "inject"] as const).map((f) => (
            <button type="button" class={`knopf klein ${filter === f ? "an" : ""}`} onClick={() => setFilter(f)}>{f === "alle" ? "Alle" : f === "meldung" ? "Meldungen" : "Injects"}</button>
          ))}
        </div>}>
        <table class="tabelle raster" data-testid="zeitplan">
          <tbody>
            {sichtbar.map((x) => {
              const ms = x.art === "meldung" ? z.meldungen[x.id] : undefined;
              const is = x.art === "inject" ? z.injects[x.id] : undefined;
              const erschienen = ms?.erschienen ?? is?.erschienen;
              const status = ms ? STUFE_TEXT[ms.stufe] + (ms.fastTrack ? " · FT" : "")
                : is ? (is.quittiert ? "quittiert" : "ausgelöst") : "";
              return (
                <tr key={x.id} style={erschienen ? "opacity:.6" : ""}>
                  <td class="mono">{x.t === null ? "—" : uhrzeit(start, x.t)}</td>
                  <td class="mono"><b>{x.id}</b>{x.fall && <span class="badge" style="margin-left:4px">{x.fall}</span>}</td>
                  <td>{x.text}<div class="klein sehr-leise">{x.zusatz}</div></td>
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
      </Panel>

      <Panel titel={`Protokoll · ${st.protokoll.length} Einträge`} rechts={
        <button type="button" class="knopf klein" disabled={!st.protokoll.length} onClick={() => exportieren(s)}>Export JSON</button>}>
        {st.protokoll.length === 0 ? <Leer>noch keine Einträge</Leer> : (
          <table class="tabelle protokoll" data-testid="protokoll">
            <tbody>
              {[...st.protokoll].reverse().map((e) => (
                <tr key={e.seq} class={`${e.typ === "aktion_abgelehnt" ? "abgelehnt" : ""} ${e.von.rolle === "system" ? "system" : ""}`} data-seq={e.seq} data-aktion={e.aktion ?? ""}>
                  <td class="mono sehr-leise">{e.seq}</td>
                  <td class="mono">{uhrzeit(start, e.t_s)}</td>
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
