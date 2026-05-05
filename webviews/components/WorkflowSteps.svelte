<script lang="ts">
  export let initCompassFolder = false;
  export let localSupported = true;
  export let onInitCompass: () => void;
  export let onGenerateYamls: () => void;
  export let onPackageUpload: () => void;
  export let onRunInference: () => void;
  export let onShowResults: () => void;
  export let onRunAll: () => void;

  function onButtonKeydown(event: KeyboardEvent, handler: () => void) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler();
    }
  }
</script>

<section class="workflow">
  <div class="section-heading">
    <h2>Flow</h2>
    <vscode-button
      appearance="secondary"
      role="button"
      tabindex="0"
      on:click={onRunAll}
      on:keydown={(event) => onButtonKeydown(event, onRunAll)}
    >
      Run All
    </vscode-button>
  </div>

  <div class="steps">
    <div class="step">
      <div>
        <strong>Initialize</strong>
        <span>{initCompassFolder ? "Workspace metadata exists" : "Create .compass metadata"}</span>
      </div>
      <vscode-button
        appearance={initCompassFolder ? "secondary" : "primary"}
        role="button"
        tabindex="0"
        on:click={onInitCompass}
        on:keydown={(event) => onButtonKeydown(event, onInitCompass)}
      >
        {initCompassFolder ? "Ready" : "Init"}
      </vscode-button>
    </div>

    <div class="step">
      <div>
        <strong>Generate YAMLs</strong>
        <span>Build configuration from C sources</span>
      </div>
      <vscode-button
        role="button"
        tabindex="0"
        on:click={onGenerateYamls}
        on:keydown={(event) => onButtonKeydown(event, onGenerateYamls)}
      >
        Generate
      </vscode-button>
    </div>

    <div class="step">
      <div>
        <strong>Package .compass</strong>
        <span>Prepare .compass for Inference + DSE</span>
      </div>
      <vscode-button
        role="button"
        tabindex="0"
        on:click={onPackageUpload}
        on:keydown={(event) => onButtonKeydown(event, onPackageUpload)}
      >
        Package
      </vscode-button>
    </div>

    <div class="step">
      <div>
        <strong>Run Inference + DSE</strong>
        <span>{localSupported ? "Use packaged .compass with local or remote target" : "Remote target required"}</span>
      </div>
      <vscode-button
        role="button"
        tabindex="0"
        on:click={onRunInference}
        on:keydown={(event) => onButtonKeydown(event, onRunInference)}
      >
        Run
      </vscode-button>
    </div>

    <div class="step">
      <div>
        <strong>Results</strong>
        <span>Open Inference + DSE reports and artifacts</span>
      </div>
      <vscode-button
        role="button"
        tabindex="0"
        on:click={onShowResults}
        on:keydown={(event) => onButtonKeydown(event, onShowResults)}
      >
        Show
      </vscode-button>
    </div>
  </div>
</section>

<style>
  .workflow,
  .steps {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .section-heading,
  .step {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  h2 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .step {
    border-top: 1px solid var(--vscode-panel-border);
    padding-top: 0.625rem;
  }

  .step div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .step strong {
    font-size: 0.8rem;
  }

  .step span {
    color: var(--vscode-descriptionForeground);
    font-size: 0.73rem;
  }

  vscode-button {
    flex: 0 0 auto;
  }
</style>
