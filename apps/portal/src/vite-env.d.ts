/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origen del gateway en producción; vacío = mismo origen (proxy en dev). */
  readonly VITE_PORTAL_API?: string;
}

/** El catálogo de la página APIs, generado en el build desde los contratos (`plugins/catalogo.ts`). */
declare module "virtual:catalogo" {
  const catalogo: import("./catalogo/generar").Catalogo;
  export default catalogo;
}
