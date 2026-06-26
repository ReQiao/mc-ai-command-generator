/// <reference types="vite/client" />

import type { McaiApi } from "../preload";

declare global {
  interface Window {
    mcai: McaiApi;
  }
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
