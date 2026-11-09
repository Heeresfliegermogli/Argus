// Vom Build erzeugt (vite.config.ts, Plugin argus-laeufe): Auszug aus tests/referenz_durchlauf.json.
declare module "virtual:argus-laeufe" {
  const laeufe: {
    /** Sekunden je Entscheidung der Modellteams (seit 2.6 eine Rolle) */
    zeiten: { naiv: number; ideal: number };
    reihenfolge_wirkmittel: string[];
  };
  export default laeufe;
}

// Vom Build gesetzt (define)
declare const __ARGUS_VERSION__: string;
declare const __ARGUS_STAND__: string;
declare const __ARGUS_OFFLINE__: boolean;
