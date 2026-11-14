// Spielleitung für ein Team: Uhr, Kontrollkarte (Ground Truth), bedingte Lagemeldungen und Reserve, Zeitplan mit manuellem Auslösen,
// Fenster, Notiz und das Protokoll (mit Export). Seit 2.6 (H1) rechnet der Team-Laptop das Spiel; die Spielleitung sieht das
// hochgeladene Protokoll (mit Verzug) und schickt ihre Befehle als Aktionen an den Team-Laptop.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { bedingtStand } from "../engine/ablauf";
import { pruefeInhalte } from "../inhalte/pruefen";
import { absenderText, beschreibe } from "../kern/beschreibung";
import { TEXT_MAX } from "../kern/ereignisse";
import { effekte } from "../kern/effekte";
import { GT_NAME, lagebildKontrolle } from "../kern/lagebild";
import { ROLLEN_NAME, standText } from "../kern/sichten";
import { laptopText } from "../kern/sitzungen";
import { mmss, uhrzeit } from "../kern/uhr";
import { panzerName } from "../kern/verluste";
import { verstaerkungStand } from "../kern/welt";
import { fahrwegeAlle, verstaerkungVorschau } from "../kern/fahrwege";
import { zielNr } from "../kern/zielnummern";
import { istVeraltet } from "../sync/adapter";
import { protokollDatei, speichereDatei } from "../sitzung/ablage";
import { diagnoseText, kopiere } from "../sitzung/diagnose";
import type { Sicht, SichtTeilnehmer } from "../sitzung/sicht";
import type { Sitzung } from "../sitzung/sitzung";
import { AktionsKnopf, BestaetigenKnopf, Leer, Panel } from "./gemeinsam/bausteine";
import { useSpielzeit, useStand } from "./gemeinsam/hooks";
import { LagekarteAnsicht } from "./gemeinsam/lagekarte";

const TEMPI = [1, 2, 5, 10, 20];

interface Plan {
  art: "meldung" | "inject" | "hintergrund";
  id: string;
  t: number;
  text: string;
  zusatz: string;
  fall?: string;
}

function exportieren(s: Sicht): void {
  const st = s.stand;
  const sz = s.inh.szenario;
  speichereDatei(protokollDatei({
    szenario: sz.id, version: sz.version, sitzung: st.raum, team: st.teamName, team_id: st.team, farbe: st.teamFarbe, lauf: st.lauf, protokoll: st.protokoll,
  }));
}

/** L6.1: „Diagnose kopieren“ – Text für den Chat (Sitzung, Fenster, Teams, was aussteht). */
export function DiagnoseKnopf(p: { s: Sitzung; klasse?: string }) {
  const [stand, setStand] = useState<"" | "kopiert" | "zeigen">("");
  const [text, setText] = useState("");
  const los = async () => {
    const t = diagnoseText(p.s);
    setText(t);
    (window as { argusDiagnose?: string }).argusDiagnose = t;
    const ok = await kopiere(t);
    setStand(ok ? "kopiert" : "zeigen");
    if (ok) setTimeout(() => setStand(""), 2500);
  };
  return (
    <>
      <button type="button" class={`knopf klein ${p.klasse ?? ""}`} onClick={() => void los()} data-testid="diagnose" data-stand={stand}
        title="Kopiert einen Text in die Zwischenablage: Sitzung, Programmstand, Verbindung, je Fenster Gerät, Stand, Fenstergröße und Puls, je Team Lauf, Protokoll und ausstehende Befehle – zum Einfügen in den Chat">
        {stand === "kopiert" ? "kopiert ✓" : "Diagnose kopieren"}
      </button>
      {stand === "zeigen" && (
        <div class="diagnose-text" data-testid="diagnose-text">
          <div class="klein leise">Kopieren war nicht möglich – Text markieren (Strg+A, Strg+C): <button type="button" class="knopf klein mini" onClick={() => setStand("")}>schließen</button></div>
          <textarea class="feld mono" readOnly rows={10} value={text} ref={(el) => el?.select()} />
        </div>
      )}
    </>
  );
}

export function plenumOeffnen(): void {
  const u = new URL(location.href);
  u.searchParams.set("rolle", "plenum");
  u.searchParams.delete("name");
  window.open(u.toString(), "argus-plenum");
}

/** Reihenfolge in der Fensterleiste: Spielleitung, Team, Plenum. */
function fensterRang(x: SichtTeilnehmer): number {
  return x.art === "sl" ? 0 : x.art === "plenum" ? 9 : 1;
}

const STATUS_TEXT = { wartet: "wartet", erfuellt: "kommt", ausgeloest: "ausgelöst", entfaellt: "entfällt" } as const;
/** Durchbruch-Gruppen (seit Szenario 2.1): wartet bis zum Angriffszeitpunkt, dann bricht durch oder aufgehalten */
const DURCHBRUCH_TEXT = { wartet: "Durchbruch", erfuellt: "Durchbruch", ausgeloest: "bricht durch", entfaellt: "aufgehalten" } as const;

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
  const tLage = Math.floor(Math.min(t, sz.spieluhr.dauer_s));
  const lagebild = useMemo(() => lagebildKontrolle(inh, z, tLage), [inh, z, tLage]);
  const fx = useMemo(() => effekte(inh, z, "alle"), [inh, z]);
  const bedingt = bedingtStand(inh, z, t);
  // Fahrwege der Einheiten (B10); beim Zeigen auf eine Verstärkung ihre Fahrwege ausgegraut als Vorschau
  const [vorschauV, setVorschauV] = useState<string | null>(null);
  const tWege = Math.floor(tLage / 15);
  const fahrwege = useMemo(() => [...fahrwegeAlle(inh, tLage), ...(vorschauV ? verstaerkungVorschau(inh, vorschauV, tLage) : [])], [inh, tWege, vorschauV]);

  const plan = useMemo<Plan[]>(() => {
    const liste: Plan[] = sz.meldungen.map((m) => {
      const gt = [...new Set(m.ziele.map((id) => GT_NAME[inh.ziele[id].gt.kategorie]))].join("/");
      return { art: "meldung", id: m.id, t: m.t_s, text: `${m.argus.klasse} ${m.argus.konfidenz} % ${m.argus.empfehlung}`, zusatz: `Ground Truth: ${gt}`, fall: m.fall };
    });
    for (const i of sz.injects) {
      if (i.t_s === undefined) continue;
      liste.push({ art: "inject", id: i.id, t: i.t_s, text: `Lagemeldung ${i.von}`, zusatz: i.text.length > 70 ? `${i.text.slice(0, 68)} …` : i.text, fall: i.fall });
    }
    for (const h of sz.hintergrund?.ereignisse ?? []) {
      const art = h.art === "panzerabwehr" ? `Kanone ${panzerName(inh, h.von)} → ${h.ziel}` : h.art === "feindartillerie" ? "Feindartillerie" : "Rauch";
      liste.push({ art: "hintergrund", id: h.id, t: h.t_s, text: `Hintergrund: ${art}`, zusatz: h.text.length > 70 ? `${h.text.slice(0, 68)} …` : h.text });
    }
    return liste.sort((a, b) => a.t - b.t);
  }, [inh]);

  const zeitSetzen = () => {
    const m = zeitEingabe.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return s.hinweis("warnung", "Spielzeit als mm:ss eingeben, z. B. 08:30");
    s.senden("uhr", { befehl: "setzen", t_s: Number(m[1]) * 60 + Number(m[2]) });
    setZeitEingabe("");
  };

  // Lagemeldung mit Platzhaltern (seit 2.5 {pz}, {treffer}, {bereit} …): nach dem Auslösen der gefüllte Text aus dem Protokoll
  const zusatzText = (x: Plan) => {
    const gefuellt = x.art === "inject" ? z.injects[x.id]?.text : undefined;
    return gefuellt ? (gefuellt.length > 70 ? `${gefuellt.slice(0, 68)} …` : gefuellt) : x.zusatz;
  };

  // Zeitplan: nächsten Eintrag sichtbar halten
  const erschienenVon = (x: Plan) => x.art === "meldung" ? z.meldungen[x.id]?.erschienen : x.art === "inject" ? z.injects[x.id]?.erschienen : z.hintergrund[x.id];
  const naechster = plan.find((x) => !erschienenVon(x))?.id;
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
            {st.uhrGrund && (
              <div class="uhr-grund" role="status" data-testid="uhr-grund" data-befehl={st.uhrGrund.befehl}>{st.uhrGrund.text}</div>
            )}
            {st.zwei && <div class="uhr-grund" role="alert" data-testid="zwei-hinweis"><b>Lauf hat zwei Verläufe – Neues Spiel empfohlen.</b></div>}
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
            <div class="klein sehr-leise" data-testid="sl-netz">
              Protokoll hier: {z.seq} Einträge{st.upload.fehler ? ` · ${st.upload.fehler}` : ""} · rechnet: <span data-testid="sl-rechnet" class={st.rechnerGeraet && !st.rechnerOnline ? "rot" : ""}>{st.rechnerGeraet
                ? `${st.rechnerGeraet} · ${st.rechnerOnline ? "verbunden" : "nicht verbunden"}${st.rechnerZuletzt ? ` · zuletzt vor ${mmss(Math.max(0, Math.round((jetzt - st.rechnerZuletzt) / 1000)))}` : ""}`
                : "kein Team-Laptop da"}</span>
            </div>
            <div class={st.direkt ? "knopf-zeile" : "knopf-reihe"}>
              <button type="button" class="knopf klein" onClick={plenumOeffnen}>Plenum öffnen</button>
              {st.direkt && (
                <BestaetigenKnopf klasse="klein" gesperrt={!st.istHost} testid="testraum-leeren" onClick={() => void s.testraumLeeren()}
                  frage="Wirklich? Alle Laptops abmelden, neuer Lauf"
                  titel="Testraum leeren: nimmt alle Laptop-Einträge aus „Team 1“ und legt einen neuen Lauf an. Offene Team-Fenster halten an („Testraum geleert – neu laden“); das nächste Team-Fenster, das (neu) öffnet, rechnet.">
                  Testraum leeren
                </BestaetigenKnopf>
              )}
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
        <Panel titel="Bedingte Lagemeldungen, E-01, Durchbruch, Reserve" liste>
          <div class="bedingt-liste" data-testid="bedingt">
            {bedingt.map((b) => {
              const inj = inh.injects[b.id];
              const ereignis = b.art === "ereignis" ? sz.ereignisse.find((e) => e.id === b.id) : undefined;
              const titel = b.art === "durchbruch" ? `Durchbruch: ${b.text}` : ereignis?.name ?? `${inj?.von}: „${inj?.text}“`;
              return (
                <div class={`bedingt ${b.status}`} key={b.id} data-bedingt={b.id} title={titel}>
                  <div>
                    <div><b>{b.id}</b> <span class="status">· {(b.art === "durchbruch" ? DURCHBRUCH_TEXT : STATUS_TEXT)[b.status]}{b.t !== undefined && b.status !== "ausgeloest" ? ` ${uhrzeit(start, b.t)}` : ""}</span></div>
                    <div class="status">{b.text}</div>
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
                    <div><b>{r.id}</b> <span class="status">· Reserve{da ? ` · ausgelöst ${uhrzeit(start, da.erschienen.t_s)}` : ""}</span></div>
                    <div class="status">{r.einsatz}</div>
                  </div>
                  {!da && <button type="button" class="knopf klein" disabled={!darfSteuern} onClick={() => s.senden("inject_ausloesen", { inject: r.id })}>auslösen</button>}
                </div>
              );
            })}
            {(inh.regeln.spielleitung?.verstaerkung_menue ? verstaerkungStand(inh, z.verstaerkungen, Math.min(t, sz.spieluhr.dauer_s)) : []).map((v) => (
              <div class={`bedingt ${v.eingespielt !== undefined ? "ausgeloest" : v.gesperrtBis !== undefined ? "entfaellt" : ""} ${vorschauV === v.id ? "vorschau" : ""}`} key={v.id} data-verstaerkung-sl={v.id}
                title={`${v.name} (${v.kurz}): ${v.zweck}`}
                onMouseEnter={() => v.eingespielt === undefined && setVorschauV(v.id)} onMouseLeave={() => setVorschauV((x) => (x === v.id ? null : x))}>
                <div>
                  <div><b>{v.id}</b> <span class="status">· {v.name} · {v.kurz}{v.eingespielt !== undefined ? ` · eingespielt ${uhrzeit(start, v.eingespielt)}` : ""}</span></div>
                  <div class="status">{v.gesperrtBis !== undefined ? `jetzt gesperrt (käme Schule oder Sanität zu nahe), wieder ab ${uhrzeit(start, v.gesperrtBis)}` : v.zweck}</div>
                </div>
                {v.eingespielt === undefined && (
                  <button type="button" class="knopf klein" disabled={!darfSteuern || v.gesperrtBis !== undefined || z.ende}
                    onFocus={() => setVorschauV(v.id)} onBlur={() => setVorschauV((x) => (x === v.id ? null : x))}
                    onClick={() => { setVorschauV(null); s.senden("verstaerkung_einspielen", { gruppe: v.id }); }}>einspielen</button>
                )}
              </div>
            ))}
          </div>
        </Panel>
        <Panel titel={`Fenster · ${st.teamName}`} klasse="flach" rechts={<span class="zeile" style="gap:6px;flex-wrap:nowrap"><DiagnoseKnopf s={s.sitzung} klasse="mini" /><span class="badge">{st.teilnehmer.length}</span></span>}>
          <div class="fenster-liste" data-testid="fenster">
            {[...st.teilnehmer].sort((a, b) => fensterRang(a) - fensterRang(b) || a.name.localeCompare(b.name)).map((x) => {
              const alter = Math.max(0, Math.round((jetzt - x.puls) / 1000));
              const marke = x.art === "tt" ? "zb" : x.art;
              const kurz = x.art === "plenum" ? "Plenum" : x.art === "sl" ? "SL" : "Team";
              return (
                <span key={x.client} class={`fenster ${alter > 20 ? "still" : ""}`} data-fenster={x.fenster ?? ""}
                  title={`${x.name}${x.client === st.client ? " (dieses Fenster)" : ""}${st.host?.id === x.client ? " · steuert" : ""}${x.fenster ? ` · Fenster ${x.fenster.replace("x", " × ")}` : ""} · letzte Rückmeldung vor ${alter} s`}>
                  <i class={`rolle-${marke}`} />{x.art === "tt" ? laptopText(x.client, x.name) : <>{kurz}{x.name && x.name !== ROLLEN_NAME[marke as keyof typeof ROLLEN_NAME] ? ` ${x.name}` : ""}</>}
                  {st.host?.id === x.client && <b> ★</b>}<span class="sehr-leise zahl">{alter} s</span>
                </span>
              );
            })}
              {st.rechnerGeraet && (
                <BestaetigenKnopf klasse="klein mini" gesperrt={!darfSteuern} testid="laptop-abmelden" onClick={() => void s.laptopAbmelden()}
                  frage={st.rechnerOnline ? "verbunden und rechnet – wirklich abmelden?" : "wirklich abmelden?"}
                  titel={`${st.rechnerGeraet} ${st.rechnerOnline ? "ist verbunden und rechnet – wirklich abmelden?" : "abmelden?"} Das Spiel geht am nächsten Fenster des Teams weiter (ab dem hochgeladenen Protokoll); das abgemeldete Fenster hält an.`}>
                  Laptop abmelden ({st.rechnerGeraet.slice(7, 11)})
                </BestaetigenKnopf>
              )}
          </div>
        </Panel>
        <Panel titel="Notiz ins Protokoll" klasse="flach">
          <div class="zeile" style="flex-wrap:nowrap">
            <input class="feld" maxLength={TEXT_MAX.notiz} placeholder="Beobachtung, z. B. „Team diskutiert I-04“" value={notiz}
              onInput={(e) => setNotiz((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => { if (e.key === "Enter" && notiz.trim()) { s.senden("notiz", { text: notiz.trim() }); setNotiz(""); } }} />
            <button type="button" class="knopf" disabled={!notiz.trim()} onClick={() => { s.senden("notiz", { text: notiz.trim() }); setNotiz(""); }}>+</button>
          </div>
        </Panel>
      </div>

      {/* Seit 2.7 (G4b) geprüft: Die Kontrollkarte zeigt weiter die ganze Karte – Ground Truth vom Ostrand (Einfahrten, Mörser im Wald
          MARDER) bis zu den eigenen Panzern am Westrand; füllen hieße hier rund ein Viertel der Breite abschneiden. */}
      <Panel titel="Kontrollkarte" klasse="ohne-rand"
        rechts={<span class="klein sehr-leise">{vorschauV ? `Vorschau ${vorschauV}: Fahrwege grau, Einheiten am Start` : `Ground Truth, Lage ${uhrzeit(start, tLage)} · Ziele mit Maus zeigen · Mausrad zoomt`}</span>}>
        <LagekarteAnsicht inh={inh} lagebild={lagebild} hintergrund="luftbild" sprites legende="kontrolle" zeichenGroesse={17} testid="kontrollkarte"
          uhr={() => s.kartenUhr()} effekte={fx} fahrwege={fahrwege} />
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
                const hs = x.art === "hintergrund" ? z.hintergrund[x.id] : undefined;
                const erschienen = erschienenVon(x);
                const status = ms ? standText(ms)
                  : is ? (is.quittiert ? "angeklickt" : "ausgelöst") : hs ? (hs.wirkt === false ? `entfällt` : "") : "";
                return (
                  <tr key={x.id} data-plan={x.id} style={erschienen ? "opacity:.55" : x.id === naechster ? "background:#2a2d24" : ""}>
                    <td class="zahl klein">{uhrzeit(start, x.t)}</td>
                    <td style="white-space:nowrap">{x.art === "meldung" ? (zielNr(inh, z, x.id) === x.id ? <b>{x.id}</b> : <><b>Ziel {zielNr(inh, z, x.id)}</b> <span class="sehr-leise klein">{x.id}</span></>) : <b>{x.id}</b>}{x.fall && <span class="badge" style="margin-left:4px">{x.fall}</span>}</td>
                    <td class="klein">{x.text}<div class="sehr-leise">{zusatzText(x)}</div></td>
                    <td class="klein" style="white-space:nowrap">{erschienen ? <>{uhrzeit(start, erschienen.t_s)}<br />{status}</> : ""}</td>
                    <td style="text-align:right">
                      {!erschienen && x.art !== "hintergrund" && (
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
                  <td>{beschreibe(e, inh, st.zustand)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </main>
  );
}
