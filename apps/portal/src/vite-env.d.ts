/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origen del gateway en producción; vacío = mismo origen (proxy en dev). */
  readonly VITE_PORTAL_API?: string;
}
