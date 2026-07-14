/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_DEMO_DASHBOARD?: string;
  readonly VITE_PUBLIC_SALES_CONTACT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
