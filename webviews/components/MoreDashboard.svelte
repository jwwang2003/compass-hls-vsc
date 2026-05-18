<script lang="ts">
  import HostApiConfig from "@/components/HostApiConfig.svelte";
  import DseConfig from "@/components/DseConfig.svelte";
  import ParamYamlMetrics from "@/components/ParamYamlMetrics.svelte";
  import VivadoInstallations from "@/components/VivadoInstallations.svelte";
  import type { DseOptions } from "@/modules/dseOptions";
  import type { ParamYamlMetricValues } from "@/modules/paramYamlMetrics";

  type VivadoDiscoveryStatus = {
    installations: Array<{
      product: string;
      version: string;
      installDir: string;
      settings64Path: string;
      selected: boolean;
      supported: boolean;
      selectable: boolean;
      tooltip: string;
      signatureState: "same-version-same-signature" | "same-version-different-signature" | "unsupported" | "unknown";
      sha256?: string;
    }>;
    selectedVersion?: string;
    selectedSettings64Path?: string;
  };

  export let projectName = "";
  export let projectVersion = "";
  export let projectRevision = "";
  export let projectMemo = "";
  export let remoteInferenceEndpoint = "http://localhost:8000/mcp";
  export let apiKey = "";
  export let remoteInferenceHasApiKey = false;
  export let paramYamlValues: ParamYamlMetricValues;
  export let dseOptions: DseOptions;
  export let autoDiscoverEnabled = true;
  export let vivadoDiscovery: VivadoDiscoveryStatus = { installations: [] };
  export let projects: string[] = [];
  export let onValidation: (event: CustomEvent<{ hostValid: boolean; apiKeyValid: boolean }>) => void;
  export let onSaveRemoteInferenceApiKey: (event: CustomEvent<{ endpoint: string; apiKey: string }>) => void;
  export let onClearRemoteInferenceApiKey: () => void;
  export let onTestRemoteInferenceConnection: (event: CustomEvent<{ endpoint: string }>) => void;
  export let onGenerateYamls: () => void;
  export let onPackageUpload: () => void;
  export let onRunInference: () => void;
  export let onShowResults: () => void;
  export let onResetProject: () => void;
  export let onToggleAutoDiscover: () => void;
  export let onSelectVivadoSettings64Path: (settings64Path: string) => void;

  function inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  function onButtonKeydown(event: KeyboardEvent, handler: () => void) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler();
    }
  }
</script>

<section class="more-dashboard">
  <div class="field-grid">
    <div class="field">
      <span>Project</span>
      <vscode-text-field
        value={projectName}
        on:input={(event) => (projectName = inputValue(event))}
      ></vscode-text-field>
    </div>
    <div class="field">
      <span>Version</span>
      <vscode-text-field
        value={projectVersion}
        on:input={(event) => (projectVersion = inputValue(event))}
      ></vscode-text-field>
    </div>
    <div class="field">
      <span>Revision</span>
      <vscode-text-field
        value={projectRevision}
        on:input={(event) => (projectRevision = inputValue(event))}
      ></vscode-text-field>
    </div>
    <div class="field wide">
      <span>Memo</span>
      <vscode-text-area
        resize="vertical"
        value={projectMemo}
        on:input={(event) => (projectMemo = inputValue(event))}
      ></vscode-text-area>
    </div>
  </div>

  <vscode-divider></vscode-divider>

  <div class="section">
    <div class="section-heading">
      <h2>Host</h2>
      <vscode-button
        appearance="secondary"
        role="button"
        tabindex="0"
        on:click={onToggleAutoDiscover}
        on:keydown={(event) => onButtonKeydown(event, onToggleAutoDiscover)}
      >
        Auto {autoDiscoverEnabled ? "On" : "Off"}
      </vscode-button>
    </div>
    {#if dseOptions.inferenceMode === "remote"}
      <HostApiConfig
        bind:endpoint={remoteInferenceEndpoint}
        bind:apiKey
        hasApiKey={remoteInferenceHasApiKey}
        on:validation={onValidation}
        on:save={onSaveRemoteInferenceApiKey}
        on:clear={onClearRemoteInferenceApiKey}
        on:test={onTestRemoteInferenceConnection}
      />
    {/if}
    <VivadoInstallations {vivadoDiscovery} {onSelectVivadoSettings64Path} />
  </div>

  <ParamYamlMetrics bind:values={paramYamlValues} />
  <DseConfig bind:options={dseOptions} />

  <div class="action-grid">
    <vscode-button
      role="button"
      tabindex="0"
      on:click={onGenerateYamls}
      on:keydown={(event) => onButtonKeydown(event, onGenerateYamls)}
    >
      Generate YAMLs
    </vscode-button>
    <vscode-button
      role="button"
      tabindex="0"
      on:click={onPackageUpload}
      on:keydown={(event) => onButtonKeydown(event, onPackageUpload)}
    >
      Package .compass
    </vscode-button>
    <vscode-button
      role="button"
      tabindex="0"
      on:click={onRunInference}
      on:keydown={(event) => onButtonKeydown(event, onRunInference)}
    >
      Run Inference + DSE
    </vscode-button>
    <vscode-button
      role="button"
      tabindex="0"
      on:click={onShowResults}
      on:keydown={(event) => onButtonKeydown(event, onShowResults)}
    >
      Show Results
    </vscode-button>
    <vscode-button
      appearance="secondary"
      role="button"
      tabindex="0"
      on:click={onResetProject}
      on:keydown={(event) => onButtonKeydown(event, onResetProject)}
    >
      Reset Project
    </vscode-button>
  </div>

  <div class="section">
    <h2>Saved Projects</h2>
    {#if projects.length}
      <div class="project-list">
        {#each projects as project}
          <span>{project}</span>
        {/each}
      </div>
    {:else}
      <p>No saved projects.</p>
    {/if}
  </div>
</section>

<style>
  .more-dashboard,
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .field-grid,
  .action-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.5rem;
  }

  .field {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .field span,
  p {
    color: var(--vscode-descriptionForeground);
    font-size: 0.74rem;
  }

  .wide {
    grid-column: 1 / -1;
  }

  .section-heading {
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

  .project-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .project-list span {
    color: var(--vscode-descriptionForeground);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 0.125rem 0.375rem;
    font-size: 0.72rem;
  }
</style>
