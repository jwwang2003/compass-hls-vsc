<script lang="ts">
  import type { DseLog, DseStatus } from "@/modules/dseOptions";

  export let status: DseStatus;
  export let logs: DseLog[] = [];

  $: progress = Math.max(0, Math.min(100, status.progress));
  $: logText = logs
    .slice(-160)
    .map((entry) => `[${entry.stream}] ${entry.text}`)
    .join("");
</script>

<section class="run-monitor" class:failed={Boolean(status.error)}>
  <div class="monitor-heading">
    <h2>HGBO-DSE</h2>
    <span class:running={status.running}>{status.stage}</span>
  </div>

  <div class="progress-shell" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress} role="progressbar">
    <div class="progress-fill" style={`width: ${progress}%`}></div>
  </div>

  <div class="status-line">
    <span>{progress}%</span>
    <span>{status.message}</span>
  </div>

  {#if status.logPath}
    <div class="log-path">{status.logPath}</div>
  {/if}

  <pre>{logText}</pre>
</section>

<style>
  .run-monitor {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    border-top: 1px solid var(--vscode-panel-border);
    padding-top: 0.75rem;
  }

  .monitor-heading,
  .status-line {
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

  .monitor-heading span,
  .status-line,
  .log-path {
    color: var(--vscode-descriptionForeground);
    font-size: 0.72rem;
  }

  .monitor-heading .running {
    color: var(--vscode-progressBar-background);
  }

  .failed .monitor-heading span {
    color: var(--vscode-errorForeground);
  }

  .progress-shell {
    height: 6px;
    overflow: hidden;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 3px;
  }

  .progress-fill {
    height: 100%;
    background: var(--vscode-progressBar-background);
    transition: width 120ms linear;
  }

  .log-path {
    overflow-wrap: anywhere;
  }

  pre {
    max-height: 12rem;
    margin: 0;
    overflow: auto;
    white-space: pre-wrap;
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 0.5rem;
    font-size: 0.72rem;
    line-height: 1.35;
  }
</style>
