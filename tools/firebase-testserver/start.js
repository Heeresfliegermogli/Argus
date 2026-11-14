// Startet eine Nachbildung der Firebase Realtime Database auf localhost (Standard: Port 5555)
// mit den Regeln aus firebase/database.rules.json. Nur WebSocket, kein Long-Polling.
// Im Spiel: ?sync=firebase&transport=auto&db=http%3A%2F%2Flocalhost%3A5555%3Fns%3Dargus-test
const path = require("node:path");
const FirebaseServer = require("firebase-server");

const port = Number(process.env.PORT || process.argv[2] || 5555);
// REGELN=<Datei>: andere Regeln, z. B. tests/regeln_stand_h.json (Stand H–K, ohne argus/v1/reset) für den Nachweis, dass mit den
// alten Regeln nichts bricht (Liste L, L6.2).
const regeln = require(process.env.REGELN ? path.resolve(process.env.REGELN) : path.join(__dirname, "..", "..", "firebase", "database.rules.json"));
const server = new FirebaseServer({ port }, `localhost:${port}`, {});
server.setRules(regeln);
console.log(`Firebase-Testserver auf ws://localhost:${port} (Regeln aktiv${process.env.REGELN ? `: ${process.env.REGELN}` : ""})`);
process.on("SIGTERM", () => server.close(() => process.exit(0)));
