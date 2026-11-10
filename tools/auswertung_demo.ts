// Beispieldaten für die Auswertung (…/?auswertung=demo): sieben Teams wie im Seminar (H2.1) – die fünf Teams des Drehbuchs
// (tests/modellteam.ts, drehbuchTeams – dieselben Läufe wie tools/e2e_drehbuch.py) und zwei weitere Modellteams mit anderem Tempo
// (ideal in 25 s, naiv in 30 s je Entscheidung), mit der echten Engine durchgespielt, dazu einige Notizen der SL 2.
// Schreibt public/demo/auswertung_demo.json (Protokolle je Team, Teamnamen und -farben wie aus der Lobby).
//
// Aufruf: npx vite-node tools/auswertung_demo.ts [-- ziel.json]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { TEAMFARBEN } from "../src/kern/sitzungen";
import { inhalte } from "../tests/hilfen";
import { type DrehbuchReferenz, START_MS, drehbuchTeams, spieleDurch } from "../tests/modellteam";

const ref = JSON.parse(readFileSync(new URL("../tests/referenz_durchlauf.json", import.meta.url), "utf-8")) as DrehbuchReferenz;
const ziel = process.argv.slice(2).filter((a) => a !== "--")[0] ?? new URL("../public/demo/auswertung_demo.json", import.meta.url).pathname;
const NAMEN = ["Falke Nord", "Löwe 2", "Team Ömer & Co", "Wega", "Kassiopeia", "Rigel", "Deneb"];

// Notizen der SL 2, wie sie im Hörsaal entstehen könnten (je Team, Spielzeit in s; seit 2.6 eine Rolle je Team)
const NOTIZEN: Record<number, { t: number; fall?: string; text: string }[]> = {
  0: [
    { t: 540, fall: "S1", text: "Bild nicht vergrößert, nur auf die 93 % geschaut – nach 20 s bekämpft." },
    { t: 1125, fall: "S4", text: "„1/4 ist schon getroffen, wir müssen schießen.“ ARGUS-Warnung vorgelesen, trotzdem bekämpft." },
    { t: 1300, fall: "S3", text: "I-04 nicht gesehen – nach 30 s war sie aus dem Feed verschwunden." },
  ],
  1: [
    { t: 560, fall: "S1", text: "Laut: „Netz hängt durch, keine Spuren – das ist eine Attrappe.“ Abgelehnt." },
    { t: 1060, fall: "S3", text: "Liest I-04 laut vor, merkt sich Feldweg Süd." },
    { t: 1290, fall: "S3", text: "Ziel 30 noch im Eingang – auf der Karte schießen die Panzer schon nach Norden auf den Feind: „Das sind die Polen.“" },
  ],
  2: [
    { t: 830, fall: "S2", text: "Das Rote Kreuz gesehen, aber gedacht, „der Feind tarnt sich so“." },
    { t: 1240, fall: "S3", text: "I-04 gelesen – bei Ziel 30 trotzdem: „Steht aber T-72 da, 96 %.“" },
  ],
  3: [{ t: 845, fall: "S2", text: "Mit der Lupe auf das Dach gezoomt, nach 40 s abgelehnt." }],
};

const inh = await inhalte();
const dreh = drehbuchTeams(ref, NOTIZEN);
const extra = [
  { name: "team6", opt: { team: "ideal" as const, dauer: 25, reihenfolge: ref.reihenfolge_wirkmittel } },
  { name: "team7", opt: { team: "naiv" as const, dauer: 30, reihenfolge: ref.reihenfolge_wirkmittel } },
];
const teams = spieleDurch(inh, [...dreh, ...extra]);
const modell = [...ref.laeufe.map((l) => l.team), "ideal", "naiv"];
const daten = {
  hinweis: "Beispieldaten (fiktiv): sieben Modellteams (fünf aus dem Drehbuch, zwei mit anderem Tempo), erzeugt mit tools/auswertung_demo.ts. Keine echten Personen.",
  szenario: { id: inh.szenario.id, version: inh.szenario.version },
  teams: teams.map((m, i) => ({
    id: `tdemo${i + 1}`,
    name: NAMEN[i],
    farbe: TEAMFARBEN[i % TEAMFARBEN.length],
    modell: modell[i],
    // Serverzeit wie bei einem Lauf heute (nur Darstellung), Absender ohne Kennungen
    protokoll: m.kanal.protokoll.map((e) => ({ ...e, ts: e.ts - START_MS + Date.UTC(2026, 10, 4, 9, 0), von: { rolle: e.von.rolle } })),
  })),
};
mkdirSync(dirname(ziel), { recursive: true });
writeFileSync(ziel, JSON.stringify(daten));
console.log(`${daten.teams.length} Teams, ${daten.teams.reduce((n, t) => n + t.protokoll.length, 0)} Ereignisse → ${ziel}`);
