import App from "../sveltePages/MainSidebar.svelte";
import { mount } from "svelte";
import "../global.css";

// Import local styles
import "./MainSidebar.css";

const app = mount(App, {
  target: document.body
});

export default app;
