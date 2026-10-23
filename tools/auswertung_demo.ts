// Beispieldaten für die Auswertung (…/?auswertung=demo): die fünf Teams des Drehbuchs (tests/modellteam.ts,
// drehbuchTeams – dieselben Läufe wie tools/e2e_drehbuch.py) mit der echten Engine durchgespielt, dazu einige Notizen
// der SL 2. Schreibt public/demo/auswertung_demo.json (Protokolle je Team, Teamnamen und -farben wie aus der Lobby).
//
// Aufruf: npx vite-node tools/auswertung_demo.ts [-- ziel.json]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { TEAMFARBEN } from "../src/kern/sitzungen";
import { inhalte } from "../tests/hilfen";
import { type DrehbuchReferenz, START_MS, drehbuchTeams, spieleDurch } from "../tests/modellteam";

const ref = JSON.parse(readFileSync(new URL("../tests/referenz_durchlauf.json", import.meta.url), "utf-8")) as DrehbuchReferenz;
const ziel = process.argv.slice(2).filter((a) => a !== "--")[0] ?? new URL("../public/demo/auswertung_demo.json", import.meta.url).pathname;
const NAMEN = ["Falke Nord", "Löwe 2", "Team Ömer & Co", "Wega", "Kassiopeia"];

// Notizen der SL 2, wie sie im Hörsaal entstehen könnten (je Team, Spielzeit in s)
const NOTIZEN: Record<number, { t: number; fall?: string; text: string }[]> = {
  0: [
    { t: 650, fall: "S1", text: "G1 hat Sensordaten nicht aufgeklappt, nur auf die 93 % geschaut." },
    { t: 1240, fall: "S4", text: "G3: „Die 3. Kp stirbt, wir müssen schießen.“ ARGUS-Warnung vorgelesen, trotzdem frei." },
    { t: 1340, fall: "S3", text: "Fast-Track an seit 10:14:30, G3 hat I-04 erst nach dem Einschlag gelesen." },
  ],
  1: [
    { t: 560, fall: "S1", text: "G1 laut: „Kalt und keine Spuren – das ist eine Attrappe.“" },
    { t: 1060, fall: "S3", text: "G3 liest I-04 vor und schickt sofort den Lagehinweis, G1 und G2 nicken." },
    { t: 1340, fall: "S3", text: "G2 empfiehlt PzAbw, G3 lehnt mit Verweis auf I-04 ab." },
  ],
  2: [
    { t: 925, fall: "S2", text: "G1 hat das Rote Kreuz gesehen, aber gedacht, „der Feind tarnt sich so“." },
    { t: 1420, fall: "S3", text: "Lagehinweis kam bei G2 an – G2: „Steht aber T-72 da, 96 %.“" },
  ],
  3: [{ t: 845, fall: "S2", text: "G1 zoomt mit der Lupe auf das Dach, lehnt nach 40 s ab." }],
};

const inh = await inhalte();
const teams = spieleDurch(inh, drehbuchTeams(ref, NOTIZEN));
const daten = {
  hinweis: "Beispieldaten (fiktiv): fünf Modellteams des Drehbuchs, erzeugt mit tools/auswertung_demo.ts. Keine echten Personen.",
  szenario: { id: inh.szenario.id, version: inh.szenario.version },
  teams: teams.map((m, i) => ({
    id: `tdemo${i + 1}`,
    name: NAMEN[i],
    farbe: TEAMFARBEN[i % TEAMFARBEN.length],
    modell: ref.laeufe[i].team,
    // Serverzeit wie bei einem Lauf heute (nur Darstellung), Absender ohne Kennungen
    protokoll: m.kanal.protokoll.map((e) => ({ ...e, ts: e.ts - START_MS + Date.UTC(2026, 10, 4, 9, 0), von: { rolle: e.von.rolle } })),
  })),
};
mkdirSync(dirname(ziel), { recursive: true });
writeFileSync(ziel, JSON.stringify(daten));
console.log(`${daten.teams.length} Teams, ${daten.teams.reduce((n, t) => n + t.protokoll.length, 0)} Ereignisse → ${ziel}`);
