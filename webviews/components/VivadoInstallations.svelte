<script lang="ts">
  type VivadoInstallationStatus = {
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
  };

  type VivadoDiscoveryStatus = {
    installations: VivadoInstallationStatus[];
    selectedVersion?: string;
    selectedSettings64Path?: string;
  };

  export let vivadoDiscovery: VivadoDiscoveryStatus = { installations: [] };
  export let onSelectVivadoSettings64Path: (settings64Path: string) => void = () => {};

  function selectInstallation(installation: VivadoInstallationStatus) {
    if (!installation.selectable) {
      return;
    }

    onSelectVivadoSettings64Path(installation.settings64Path);
  }

  function onInstallationKeydown(event: KeyboardEvent, installation: VivadoInstallationStatus) {
    if (!installation.selectable || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    selectInstallation(installation);
  }
</script>

{#if vivadoDiscovery.installations.length}
  <section class="vivado-panel">
    <div class="vivado-heading">
      <h2>Vivado installations</h2>
      {#if vivadoDiscovery.selectedVersion}
        <span class="selected-summary">Selected {vivadoDiscovery.selectedVersion}</span>
      {:else}
        <span class="selected-summary">2022.1 required</span>
      {/if}
    </div>

    <div class="installation-list">
      {#each vivadoDiscovery.installations as installation}
        <button
          type="button"
          class:selected={installation.selected}
          class:selectable={installation.selectable}
          class:unsupported={!installation.supported}
          class="installation-row"
          title={installation.tooltip}
          aria-disabled={!installation.selectable}
          tabindex={installation.selectable ? 0 : -1}
          on:click={() => selectInstallation(installation)}
          on:keydown={(event) => onInstallationKeydown(event, installation)}
        >
          <div class="installation-title">
            <span>{installation.product} {installation.version}</span>
            {#if installation.selected}
              <span class="selected-badge">Selected</span>
            {:else if installation.selectable}
              <span class="select-badge">Click to select</span>
            {/if}
          </div>
          <div class="install-path" title={installation.installDir}>{installation.installDir}</div>
          <div class="settings-path" title={installation.settings64Path}>
            <span>settings64.sh</span>
            <code>{installation.settings64Path}</code>
          </div>
        </button>
      {/each}
    </div>
  </section>
{/if}

<style>
  .vivado-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  .vivado-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 600;
  }

  .selected-summary,
  .selected-badge,
  .select-badge {
    border: 1px solid var(--vscode-focusBorder);
    border-radius: 4px;
    color: var(--vscode-foreground);
    flex: 0 0 auto;
    font-size: 0.68rem;
    line-height: 1rem;
    padding: 0.05rem 0.3rem;
  }

  .select-badge {
    border-color: var(--vscode-panel-border);
    color: var(--vscode-descriptionForeground);
  }

  .installation-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .installation-row {
    background: transparent;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    color: var(--vscode-foreground);
    display: flex;
    flex-direction: column;
    font: inherit;
    gap: 0.25rem;
    text-align: left;
    min-width: 0;
    padding: 0.5rem;
    width: 100%;
  }

  .installation-row.selected {
    border-color: var(--vscode-focusBorder);
  }

  .installation-row.unsupported {
    border-color: var(--vscode-errorForeground);
  }

  .installation-row.unsupported .installation-title > span:first-child,
  .installation-row.unsupported .install-path,
  .installation-row.unsupported .settings-path,
  .installation-row.unsupported code {
    color: var(--vscode-errorForeground);
  }

  .installation-row.selectable {
    cursor: pointer;
  }

  .installation-row.selectable:hover {
    border-color: var(--vscode-focusBorder);
  }

  .installation-title {
    align-items: center;
    display: flex;
    gap: 0.5rem;
    justify-content: space-between;
    min-width: 0;
  }

  .installation-title > span:first-child {
    font-size: 0.78rem;
    font-weight: 600;
    min-width: 0;
  }

  .install-path,
  .settings-path {
    color: var(--vscode-descriptionForeground);
    font-size: 0.7rem;
    line-height: 1rem;
    min-width: 0;
  }

  .install-path,
  .settings-path code {
    overflow-wrap: anywhere;
  }

  .settings-path {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .settings-path span {
    color: var(--vscode-foreground);
  }

  code {
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family);
  }
</style>
