// Nach dem Bauen: Offline-Datei neben die Webseite legen (dist/argus-offline.html),
// damit sie auf GitHub Pages zum Herunterladen bereitliegt.
import { copyFileSync, existsSync } from "node:fs";
if (existsSync("dist-offline/index.html") && existsSync("dist")) {
  copyFileSync("dist-offline/index.html", "dist/argus-offline.html");
  console.log("dist/argus-offline.html geschrieben");
}
