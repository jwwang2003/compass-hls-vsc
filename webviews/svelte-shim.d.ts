// svelte-shim.d.ts

declare module "*.css";

declare module "*.svelte" {
  import type { ComponentType } from "svelte";
  const component: ComponentType;
  export default component;
}
