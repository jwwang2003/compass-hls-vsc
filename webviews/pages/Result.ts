import App from "@/sveltePages/Results.svelte";
import { mount, unmount } from "svelte";
import "@/global.css";

// Import local styles
// import "./MainSidebar.css";

declare global {
  interface Window {
    __compassWebviewApp?: Record<string, any>;
  }
}

if (window.__compassWebviewApp) {
  void unmount(window.__compassWebviewApp);
  document.body.replaceChildren();
}

const app = mount(App, {
  target: document.body
});

window.__compassWebviewApp = app;

export default app;
