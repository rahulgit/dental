/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** GoodDoc publishable key (gd_test_… / gd_live_…). Unset = GoodDoc integration off. */
  readonly VITE_GD_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
