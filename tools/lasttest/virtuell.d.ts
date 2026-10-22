// Vom Build erzeugt (vite.config.ts, Plugin argus-laeufe): Auszug aus tests/referenz_durchlauf.json.
declare module "virtual:argus-laeufe" {
  const laeufe: {
    zeiten: { G1: number; G2: number; G3: number; ft_nach_angebot: number };
    reihenfolge_wirkmittel: string[];
    laeufe: { team: "naiv" | "ideal"; einspielen: Record<string, number> }[];
  };
  export default laeufe;
}

// Vom Build gesetzt (define)
declare const __ARGUS_VERSION__: string;
declare const __ARGUS_STAND__: string;
declare const __ARGUS_OFFLINE__: boolean;
