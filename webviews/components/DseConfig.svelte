<script lang="ts">
  import RadioSelector from "@/components/RadioSelector.svelte";
  import {
    DSE_ALGORITHM_OPTIONS,
    DSE_ENCODING_OPTIONS,
    DSE_INFERENCE_OPTIONS,
    DSE_MODE_OPTIONS,
    DSE_SPACE_OPTIONS,
    DSE_VIVADO_EXECUTION_OPTIONS,
    type DseOptions,
  } from "@/modules/dseOptions";

  export let options: DseOptions;

  let mode = options.mode;
  let bench = options.bench;
  let caseName = options.caseName;
  let ver = options.ver;
  let num = options.num;
  let alg = options.alg;
  let device = options.device;
  let clk = options.clk;
  let encode = options.encode;
  let space = options.space;
  let parallel = options.parallel;
  let process = options.process;
  let inferenceMode = options.inferenceMode;
  let vivadoExecutionMode = options.vivadoExecutionMode;
  let vivadoMcpHost = options.vivadoMcpHost;
  let vivadoMcpPort = options.vivadoMcpPort;

  $: options = {
    mode: mode as DseOptions["mode"],
    bench,
    caseName,
    ver,
    num,
    alg: alg as DseOptions["alg"],
    device,
    clk,
    encode: encode as DseOptions["encode"],
    space: space as DseOptions["space"],
    parallel,
    process,
    inferenceMode: inferenceMode as DseOptions["inferenceMode"],
    vivadoExecutionMode: vivadoExecutionMode as DseOptions["vivadoExecutionMode"],
    vivadoMcpHost,
    vivadoMcpPort,
  };

  function inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  function inputNumber(event: Event, fallback: number): number {
    const value = Number(inputValue(event));
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
  }
</script>

<section class="dse-config">
  <h2>DSE</h2>

  <div class="field-grid">
    <div class="field">
      <span>Mode</span>
      <RadioSelector bind:value={mode} options={DSE_MODE_OPTIONS} orientation="horizontal" />
    </div>
    <div class="field">
      <span>Inference</span>
      <RadioSelector bind:value={inferenceMode} options={DSE_INFERENCE_OPTIONS} orientation="horizontal" />
    </div>
    <div class="field wide">
      <span>Vivado Target</span>
      <RadioSelector bind:value={vivadoExecutionMode} options={DSE_VIVADO_EXECUTION_OPTIONS} orientation="horizontal" />
    </div>
    {#if vivadoExecutionMode === "mcp"}
      <div class="field">
        <span>MCP Host</span>
        <vscode-text-field
          value={vivadoMcpHost}
          placeholder="localhost"
          on:input={(event) => (vivadoMcpHost = inputValue(event))}
        ></vscode-text-field>
      </div>
      <div class="field">
        <span>MCP Port</span>
        <input
          class="compact-input"
          type="number"
          min="1"
          max="65535"
          value={vivadoMcpPort}
          on:input={(event) => (vivadoMcpPort = inputNumber(event, vivadoMcpPort))}
        />
      </div>
    {/if}
    <div class="field">
      <span>Case</span>
      <vscode-text-field value={caseName} on:input={(event) => (caseName = inputValue(event))}></vscode-text-field>
    </div>
    <div class="field">
      <span>Version</span>
      <vscode-text-field value={ver} on:input={(event) => (ver = inputValue(event))}></vscode-text-field>
    </div>
    <div class="field">
      <span>Iterations</span>
      <input class="compact-input" type="number" min="1" bind:value={num} />
    </div>
    <div class="field">
      <span>Clock</span>
      <vscode-text-field value={clk} on:input={(event) => (clk = inputValue(event))}></vscode-text-field>
    </div>
    <div class="field wide">
      <span>Algorithm</span>
      <RadioSelector bind:value={alg} options={DSE_ALGORITHM_OPTIONS} orientation="horizontal" />
    </div>
    <div class="field">
      <span>Encoding</span>
      <RadioSelector bind:value={encode} options={DSE_ENCODING_OPTIONS} orientation="horizontal" />
    </div>
    <div class="field">
      <span>Space</span>
      <RadioSelector bind:value={space} options={DSE_SPACE_OPTIONS} orientation="horizontal" />
    </div>
    <div class="field">
      <span>Process</span>
      <input
        class="compact-input"
        type="number"
        min="1"
        value={process}
        on:input={(event) => (process = inputNumber(event, process))}
      />
    </div>
    <label class="check-field">
      <input type="checkbox" bind:checked={parallel} />
      <span>Parallel</span>
    </label>
  </div>
</section>

<style>
  .dse-config {
    --dse-control-height: 28px;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  h2 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.625rem;
  }

  .field {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .wide {
    grid-column: 1 / -1;
  }

  .field span,
  .check-field span {
    color: var(--vscode-descriptionForeground);
    font-size: 0.74rem;
  }

  vscode-text-field,
  .compact-input {
    width: 100%;
    height: var(--dse-control-height);
    box-sizing: border-box;
  }

  .compact-input {
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 2px;
    padding-inline: 0.45rem;
    line-height: var(--dse-control-height);
  }

  .check-field {
    min-height: var(--dse-control-height);
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
</style>
