<script lang="ts">
  export let projectName = "";
  export let isProjectOpen = false;
  export let initCompassFolder = false;
  export let hostMode = "local";
  export let localSupported = true;
  export let autoDiscoverEnabled = true;

  type VivadoDiscoveryStatus = {
    installations: Array<{
      product: string;
      version: string;
      installDir: string;
      settings64Path: string;
      selected: boolean;
    }>;
    selectedVersion?: string;
    selectedSettings64Path?: string;
  };

  export let vivadoDiscovery: VivadoDiscoveryStatus = { installations: [] };
</script>

<section class="summary-shell">
  <div class="min-w-0">
    <div class="eyebrow">Workspace</div>
    <div class="truncate text-sm font-semibold text-[var(--vscode-foreground)]">
      {isProjectOpen ? projectName || "Untitled workspace" : "No workspace open"}
    </div>
  </div>

  <div class="status-grid">
    <span class:good={initCompassFolder}>{initCompassFolder ? "Compass ready" : "Not initialized"}</span>
    <span>{hostMode === "mcp" ? "Vivado MCP" : "Local terminal"}</span>
    <span class:good={localSupported}>{localSupported ? "Local available" : "Remote only"}</span>
    {#if vivadoDiscovery.selectedVersion}
      <span class="good">Vivado {vivadoDiscovery.selectedVersion}</span>
    {:else if vivadoDiscovery.installations.length}
      <span>Vivado incompatible</span>
    {/if}
    <span class:good={autoDiscoverEnabled}>{autoDiscoverEnabled ? "Auto on" : "Auto off"}</span>
  </div>
</section>

<style>
  .summary-shell {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-block: 0.25rem 0.75rem;
    border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border));
  }

  .eyebrow {
    color: var(--vscode-descriptionForeground);
    font-size: 0.7rem;
    line-height: 1rem;
    text-transform: uppercase;
  }

  .status-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .status-grid span {
    border: 1px solid var(--vscode-badge-background);
    color: var(--vscode-descriptionForeground);
    font-size: 0.72rem;
    line-height: 1rem;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
  }

  .status-grid span.good {
    color: var(--vscode-foreground);
    border-color: var(--vscode-focusBorder);
  }
</style>
