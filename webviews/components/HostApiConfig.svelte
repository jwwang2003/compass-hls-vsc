<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let endpoint = "http://localhost:8000/mcp";
  export let apiKey = "";
  export let hasApiKey = false;

  let endpointValid = true;
  let apiKeyValid = true;

  const dispatch = createEventDispatcher<{
    validation: { hostValid: boolean; apiKeyValid: boolean };
    save: { endpoint: string; apiKey: string };
    test: { endpoint: string };
    clear: undefined;
  }>();

  function validateEndpoint() {
    try {
      new URL(endpoint);
      endpointValid = true;
    } catch {
      endpointValid = false;
    }
  }

  function validateApiKey() {
    apiKeyValid = apiKey.trim().length > 0;
  }

  function emitValidation() {
    dispatch("validation", { hostValid: endpointValid, apiKeyValid });
  }

  function saveConfig() {
    validateEndpoint();
    if (!hasApiKey) {
      validateApiKey();
    } else {
      apiKeyValid = true;
    }
    emitValidation();
    if (!endpointValid || !apiKeyValid) return;

    dispatch("save", { endpoint, apiKey });
    apiKey = "";
    apiKeyValid = true;
  }

  function testConnection() {
    validateEndpoint();
    emitValidation();
    if (!endpointValid) return;

    dispatch("test", { endpoint });
  }

  function clearKey() {
    apiKey = "";
    apiKeyValid = true;
    dispatch("clear");
  }

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

<div class="remote-config">
  <div class="field wide">
    <span>MCP Endpoint</span>
    <vscode-text-field
      value={endpoint}
      placeholder="http://localhost:8000/mcp"
      class:invalid={!endpointValid}
      on:input={(event) => (endpoint = inputValue(event))}
      on:blur={() => {
        validateEndpoint();
        emitValidation();
      }}
    ></vscode-text-field>
    {#if !endpointValid}
      <p class="error">Enter a valid URL.</p>
    {/if}
  </div>

  <div class="field">
    <span>API Key</span>
    <vscode-text-field
      type="password"
      value={apiKey}
      placeholder={hasApiKey ? "Stored key unchanged" : "API key"}
      class:invalid={!apiKeyValid}
      on:input={(event) => (apiKey = inputValue(event))}
      on:blur={() => {
        if (apiKey.trim()) {
          validateApiKey();
          emitValidation();
        }
      }}
    ></vscode-text-field>
    {#if !apiKeyValid}
      <p class="error">Enter an API key.</p>
    {/if}
  </div>

  <div class="status">
    <span>Stored</span>
    <strong>{hasApiKey ? "Yes" : "No"}</strong>
  </div>

  <div class="actions">
    <vscode-button
      role="button"
      tabindex="0"
      on:click={saveConfig}
      on:keydown={(event) => onButtonKeydown(event, saveConfig)}
    >
      Save
    </vscode-button>
    <vscode-button
      appearance="secondary"
      role="button"
      tabindex="0"
      on:click={testConnection}
      on:keydown={(event) => onButtonKeydown(event, testConnection)}
    >
      Test
    </vscode-button>
    <vscode-button
      appearance="secondary"
      role="button"
      tabindex="0"
      on:click={clearKey}
      on:keydown={(event) => onButtonKeydown(event, clearKey)}
      disabled={!hasApiKey && !apiKey}
    >
      Clear
    </vscode-button>
  </div>
</div>

<style>
  .remote-config {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.5rem;
  }

  .field,
  .status,
  .actions {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .wide {
    grid-column: 1 / -1;
  }

  .field span,
  .status span {
    color: var(--vscode-descriptionForeground);
    font-size: 0.74rem;
  }

  .status strong {
    min-height: 26px;
    display: flex;
    align-items: center;
    font-size: 0.78rem;
  }

  .actions {
    justify-content: end;
  }

  .error {
    margin: 0;
    font-size: 0.72rem;
    color: var(--vscode-inputValidation-errorForeground);
  }

  :global(vscode-text-field.invalid) {
    outline: 1px solid var(--vscode-inputValidation-errorBorder);
  }
</style>
