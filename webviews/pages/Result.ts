import App from "@/sveltePages/Results.svelte";
import { mount } from "svelte";
import "@/global.css";

// Import local styles
// import "./MainSidebar.css";

const app = mount(App, {
  target: document.body
});

export default app;
