<script lang="ts">
  import { onMount } from 'svelte';
  import { provideVSCodeDesignSystem, vsCodeButton } from '@vscode/webview-ui-toolkit';

  // import your RadioGroup and its type
  import RadioGroup from '@/components/RadioSelector.svelte';
  import type { RadioOption } from '@/components/RadioSelector.svelte';

  // --- VSCode toolkit registration for buttons only; radios register themselves in RadioGroup ---
  onMount(() => {
    provideVSCodeDesignSystem().register(vsCodeButton());
    loadTests();
    vscode_comm.postMessage({ type: 'getSavedProjects', value: '' });
    vscode_comm.postMessage({ type: 'getAutoDiscoverStatus', value: '' });
  });

  // --- Mode selector state ---
  let mode: string = 'normal';
  const modeOptions: RadioOption[] = [
    { label: 'Debug', value: 'debug' },
    { label: 'Demo', value: 'demo' },
    { label: 'Normal', value: 'normal' }
  ];

  // whenever mode changes, inform the extension
  $: vscode_comm.postMessage({ type: 'setMode', value: mode });
  function onButtonKeydown(event: KeyboardEvent, handler: () => void) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler();
    }
  }

  // --- rest of your existing state & functions ---
  let repoUrl: string = "https://github.com/jwwang2003/HGBO-DSE/tree/main/benchmark/MachSuite";
  let owner = "", repo = "", branch = "", basePath = "";
  let suites: string[] = [];
  let benchMap: Record<string, string[]> = {};
  let benches: string[] = [];
  let selectedSuite: string = "";
  let selectedBench: string = "";
  let loadingSuites = false;
  let error = "";
  let projects: string[] = [];
  let autoDiscoverEnabled = true;

  function parseRepoUrl(): Boolean { return false; }
  async function fetchAllBenches() { /* … */ }
  async function loadTests() { /* … */ }
  $: if (selectedSuite) { /* … */ }
  function runBenchmark(path: string) { /* … */ }
  function runAllBenchmarks() { /* … */ }
  function openProject(proj: string) { /* … */ }
  function toggleAutoDiscover() {
    vscode_comm.postMessage({ type: 'toggleAutoDiscover', value: '' });
  }

  window.addEventListener('message', (event) => {
    if (event.data.type === 'savedProjects') {
      projects = event.data.projects;
    }
    if (event.data.type === 'autoDiscoverStatus') {
      autoDiscoverEnabled = event.data.enabled;
    }
  });
</script>

<div class="panel-content">
  <!-- Reusable radio group -->
  <h2 class="text-orange-300">Mode</h2>
  <RadioGroup
    bind:value={mode}
    options={modeOptions}
    orientation="horizontal"
  />

  <h2 class="text-orange-300">Config Selection</h2>
  <vscode-button
    role="button"
    tabindex="0"
    on:click={toggleAutoDiscover}
    on:keydown={(event) => onButtonKeydown(event, toggleAutoDiscover)}
  >
    Auto-discovery: {autoDiscoverEnabled ? 'On' : 'Off'}
  </vscode-button>

  <!-- existing sections -->
  <h2 class="text-orange-300">Default Benchmark Tests</h2>
  <!-- ... repo URL input, selectors, buttons ... -->

  <h2 class="text-orange-300">About</h2>
  <p>Version: 1.0.0</p>
  <p>© 2025 FDUROP Team</p>
  <p>Extension for design space exploration within VSCode.</p>

  <h2 class="text-orange-300">More</h2>
  {#if projects.length}
    <ul>
      {#each projects as proj}
        <li>
          <vscode-button
            role="button"
            tabindex="0"
            on:click={() => openProject(proj)}
            on:keydown={(event) => onButtonKeydown(event, () => openProject(proj))}
          >
            {proj}
          </vscode-button>
        </li>
      {/each}
    </ul>
  {:else}
    <p>No saved projects.</p>
  {/if}
</div>

<style>
  .panel-content { display: flex; flex-direction: column; gap: 1rem; }
  ul { list-style-type: none; padding: 0; }
  li { margin: 0.25rem 0; }
</style>
