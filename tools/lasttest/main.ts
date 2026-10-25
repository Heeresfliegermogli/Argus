// Lasttest-Seite (…/Argus/lasttest.html): Einstellungen, Start, Verlauf und Ergebnis.
// Adresszeile (alles optional): db=…, transport=lp|auto, tempo=1|2|5|10|20, teams=1…5, beobachter=1,
// aufteilung=alles|host|beitreten, hier=1,2 (Teams mit Bots auf diesem Gerät), code=K7P (beitreten),
// start=1 (sofort starten, z. B. für tools/lasttest_probe.py).
import { type Aufteilung, TEMPI, einstellungenHtml, laufHtml } from "./ansicht";
import { auswerten, rohdaten } from "./auswertung";
import { type LastOptionen, Lasttest, STANDARD_OPTIONEN } from "./lauf";
import { ANZAHL_LAEUFE } from "./plan";
import "./stil.css";

const DAUER_S = 1500;
const wurzel = document.getElementById("app")!;

function alleTeams(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}

function ausAdresse(): { opt: LastOptionen; auf: Aufteilung; sofort: boolean } {
  const q = new URLSearchParams(location.search);
  const zahl = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
  const tempo = zahl("tempo", STANDARD_OPTIONEN.tempo);
  const teams = Math.max(1, Math.min(ANZAHL_LAEUFE, Math.round(zahl("teams", STANDARD_OPTIONEN.teams)) || STANDARD_OPTIONEN.teams));
  const aufRoh = q.get("aufteilung");
  const auf: Aufteilung = q.has("code") ? "beitreten" : aufRoh === "host" || aufRoh === "beitreten" ? aufRoh : "alles";
  const hier = (q.get("hier") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= teams);
  return {
    opt: {
      ...STANDARD_OPTIONEN,
      db: (q.get("db") ?? STANDARD_OPTIONEN.db).trim().replace(/\/+$/, ""),
      transport: q.get("transport") === "auto" ? "auto" : "lp",
      tempo: TEMPI.includes(tempo) ? tempo : STANDARD_OPTIONEN.tempo,
      teams,
      hier: auf === "alles" ? alleTeams(teams) : hier,
      host: auf !== "beitreten",
      code: q.get("code"),
      beobachter: q.get("beobachter") === "1" && auf !== "beitreten",
    },
    auf,
    sofort: q.get("start") === "1",
  };
}

const anfang = ausAdresse();
let opt: LastOptionen = anfang.opt;
let auf: Aufteilung = anfang.auf;
let lauf: Lasttest | null = null;
let anzeigeTimer: ReturnType<typeof setInterval> | null = null;

function einstellungenLesen(): void {
  if (!document.getElementById("db")) return;
  const wert = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value;
  auf = ((document.querySelector('input[name="aufteilung"]:checked') as HTMLInputElement | null)?.value as Aufteilung) ?? auf;
  const teams = Number(wert("teams") ?? opt.teams);
  const hier = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="hier"]'));
  const gewaehlt = hier.length ? hier.filter((x) => x.checked).map((x) => Number(x.value)) : opt.hier;
  opt = {
    ...opt,
    db: (wert("db") ?? opt.db).trim().replace(/\/+$/, ""),
    transport: wert("transport") === "auto" ? "auto" : "lp",
    teams,
    hier: auf === "alles" ? alleTeams(teams) : gewaehlt.filter((n) => n <= teams),
    host: auf !== "beitreten",
    code: (wert("code") ?? opt.code ?? "").trim() || null,
    beobachter: auf !== "beitreten" && !!(document.getElementById("beobachter") as HTMLInputElement | null)?.checked,
  };
}

function zeigeEinstellungen(): void {
  document.title = "ARGUS · Lasttest";
  wurzel.innerHTML = einstellungenHtml(opt, auf, DAUER_S);
  wurzel.dataset.phase = "bereit";
}

function zeigeLauf(): void {
  if (!lauf) return;
  const a = auswerten(lauf);
  wurzel.innerHTML = laufHtml(a, lauf.status);
  wurzel.dataset.phase = lauf.phase;
  document.title = `ARGUS · Lasttest · ${lauf.status}`;
  // für tools/lasttest_probe.py und zum Nachsehen in der Konsole
  (window as unknown as { argusLasttest: unknown }).argusLasttest = { lauf, auswertung: a };
}

function starten(): void {
  einstellungenLesen();
  if (!/^https?:\/\/\S+$/.test(opt.db)) {
    alert("Bitte eine gültige Adresse der Datenbank angeben (https://…).");
    return;
  }
  if (auf === "beitreten" && !opt.code) {
    alert("Bitte den Code der Sitzung vom Host-Gerät eingeben.");
    return;
  }
  if (auf === "beitreten" && !opt.hier.length) {
    alert("Bitte mindestens ein Team für dieses Gerät wählen.");
    return;
  }
  const q = new URLSearchParams();
  q.set("tempo", String(opt.tempo));
  q.set("teams", String(opt.teams));
  if (opt.transport === "auto") q.set("transport", "auto");
  if (opt.db !== STANDARD_OPTIONEN.db) q.set("db", opt.db);
  if (opt.beobachter) q.set("beobachter", "1");
  if (auf !== "alles") {
    q.set("aufteilung", auf);
    q.set("hier", opt.hier.join(","));
  }
  if (auf === "beitreten" && opt.code) q.set("code", opt.code);
  history.replaceState(null, "", `${location.pathname}?${q.toString()}`);
  lauf = new Lasttest(opt);
  lauf.abonnieren(zeigeLauf);
  zeigeLauf();
  anzeigeTimer = setInterval(() => {
    zeigeLauf();
    if (lauf && (lauf.phase === "ende" || lauf.phase === "fehler" || lauf.phase === "abgebrochen") && anzeigeTimer) {
      clearInterval(anzeigeTimer);
      anzeigeTimer = null;
    }
  }, 1000);
  void lauf.starten();
}

function herunterladen(): void {
  if (!lauf) return;
  const blob = new Blob([JSON.stringify(rohdaten(lauf), null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `argus-lasttest-${lauf.code ?? "lauf"}-${new Date().toISOString().slice(0, 16).replace(/[:T-]/g, "")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

wurzel.addEventListener("click", (ev) => {
  const k = (ev.target as HTMLElement).closest<HTMLElement>("[data-aktion]");
  if (!k || (k as HTMLButtonElement).disabled) return;
  switch (k.dataset.aktion) {
    case "tempo":
      einstellungenLesen();
      opt = { ...opt, tempo: Number(k.dataset.wert) };
      zeigeEinstellungen();
      break;
    case "start":
      starten();
      break;
    case "abbrechen":
      lauf?.abbrechen();
      break;
    case "json":
      herunterladen();
      break;
    case "neu":
      // frische Seite: Transport (Long-Polling/WebSocket) legt das Firebase-SDK je Seite einmal fest
      location.href = location.href.replace(/[?&]start=1/, "");
      break;
  }
});

wurzel.addEventListener("change", (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el.id === "teams" || el.id === "beobachter" || el.name === "aufteilung" || el.name === "hier") {
    const vorher = auf;
    einstellungenLesen();
    // Vorschlag beim Wechsel der Aufteilung: Host-Gerät mit Team 1, weiteres Gerät mit den übrigen Teams
    if (auf !== vorher && auf === "host") opt = { ...opt, hier: [1] };
    if (auf !== vorher && auf === "beitreten") opt = { ...opt, hier: alleTeams(opt.teams).slice(1) };
    zeigeEinstellungen();
  }
});

window.addEventListener("beforeunload", (ev) => {
  if (lauf && (lauf.phase === "laeuft" || lauf.phase === "vorbereiten")) ev.preventDefault();
});

zeigeEinstellungen();
if (anfang.sofort) starten();
