// Asset-Manifest für die Drohnenbilder (G1). Das Bild selbst zeigt seit Schritt 6b livedrohne.tsx: live aus den
// Ebenen im Fenster am Ort, per Klick groß mit Lupe, und die Aufnahme zur Meldezeit, wenn das Ziel den
// Ausschnitt verlassen hat.
import { useEffect, useState } from "preact/hooks";
import { type AssetManifest, ladeManifest } from "../../assets/assets";

export function useManifest(): AssetManifest | null {
  const [man, setMan] = useState<AssetManifest | null>(null);
  useEffect(() => {
    let aktiv = true;
    ladeManifest().then((m) => aktiv && setMan(m)).catch((e) => console.warn("Asset-Manifest:", e));
    return () => {
      aktiv = false;
    };
  }, []);
  return man;
}
