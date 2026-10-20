// Startet eine Nachbildung der Firebase Realtime Database auf localhost (Standard: Port 5555)
// mit den Regeln aus firebase/database.rules.json. Nur WebSocket, kein Long-Polling.
// Im Spiel: ?sync=firebase&transport=auto&db=http%3A%2F%2Flocalhost%3A5555%3Fns%3Dargus-test
const path = require("node:path");
const FirebaseServer = require("firebase-server");

const port = Number(process.env.PORT || process.argv[2] || 5555);
const regeln = require(path.join(__dirname, "..", "..", "firebase", "database.rules.json"));
const server = new FirebaseServer({ port }, `localhost:${port}`, {});
server.setRules(regeln);
console.log(`Firebase-Testserver auf ws://localhost:${port} (Regeln aktiv)`);
process.on("SIGTERM", () => server.close(() => process.exit(0)));
