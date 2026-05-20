<script lang="ts">
  import { onMount } from "svelte";
  import {
    provideVSCodeDesignSystem,
    vsCodeButton,
    vsCodeDivider,
    vsCodeRadio,
    vsCodeRadioGroup,
    vsCodeTextArea,
    vsCodeTextField,
  } from "@vscode/webview-ui-toolkit";

  import MoreDashboard from "@/components/MoreDashboard.svelte";
  import DseConfig from "@/components/DseConfig.svelte";
  import DseRunMonitor from "@/components/DseRunMonitor.svelte";
  import HostApiConfig from "@/components/HostApiConfig.svelte";
  import ParamYamlMetrics from "@/components/ParamYamlMetrics.svelte";
  import ProjectSummary from "@/components/ProjectSummary.svelte";
  import RadioSelector from "@/components/RadioSelector.svelte";
  import type { RadioOption } from "@/components/RadioSelector.svelte";
  import VivadoInstallations from "@/components/VivadoInstallations.svelte";
  import WorkflowSteps from "@/components/WorkflowSteps.svelte";
  import {
    buildParamYamlMetricPayload,
    createDefaultParamYamlMetricValues,
    type ParamYamlMetricValues,
  } from "@/modules/paramYamlMetrics";
  import {
    createDefaultDseOptions,
    createIdleDseStatus,
    type DseLog,
    type DseOptions,
    type DseStatus,
  } from "@/modules/dseOptions";

  type DisplayMode = "flow" | "more";
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
  type IncomingMessage =
    | (VSCodeMessage<ProjectStatus> & { type: "projectStatus" })
    | { type: "local-status"; supported?: boolean; vivadoDiscovery?: VivadoDiscoveryStatus }
    | { type: "no-local"; supported?: boolean; vivadoDiscovery?: VivadoDiscoveryStatus }
    | { type: "autoDiscoverStatus"; enabled: boolean }
    | { type: "remoteInferenceConfig"; value: { endpoint: string; hasApiKey: boolean } }
    | { type: "savedProjects"; projects: string[] }
    | (VSCodeMessage<DseStatus> & { type: "dseStatus" })
    | (VSCodeMessage<DseLog> & { type: "dseLog" })
    | { type: "projectReset" };

  let displayMode: DisplayMode = "flow";
  let isProjectOpen = true;
  let initCompassFolder = false;
  let localSupported = true;
  let autoDiscoverEnabled = true;
  let vivadoDiscovery: VivadoDiscoveryStatus = { installations: [] };
  let projects: string[] = [];

  let projectName = "";
  let projectVersion = "";
  let projectRevision = "";
  let projectMemo = "";

  let remoteInferenceEndpoint = "http://localhost:8000/mcp";
  let apiKey = "";
  let remoteInferenceHasApiKey = false;
  let hostValid = true;
  let apiKeyValid = true;
  let paramYamlValues: ParamYamlMetricValues = createDefaultParamYamlMetricValues();
  let dseOptions: DseOptions = createDefaultDseOptions();
  let dseStatus: DseStatus = createIdleDseStatus();
  let dseLogs: DseLog[] = [];

  const displayOptions: RadioOption[] = [
    { label: "Flow", value: "flow" },
    { label: "More", value: "more" },
  ];
  onMount(() => {
    provideVSCodeDesignSystem().register(
      vsCodeButton(),
      vsCodeDivider(),
      vsCodeRadio(),
      vsCodeRadioGroup(),
      vsCodeTextArea(),
      vsCodeTextField()
    );

    window.addEventListener("message", handleMessage as EventListener);
    vscode_comm.postMessage({ type: "ready", value: "" });
    vscode_comm.postMessage({ type: "getSavedProjects", value: "" });
    vscode_comm.postMessage({ type: "getAutoDiscoverStatus", value: "" });
    vscode_comm.postMessage({ type: "getRemoteInferenceConfig", value: "" });

    return () => window.removeEventListener("message", handleMessage as EventListener);
  });

  function handleMessage(event: MessageEvent<IncomingMessage>) {
    const msg = event.data;
    switch (msg.type) {
      case "projectStatus":
        initCompassFolder = msg.value.initCompassFolder;
        isProjectOpen = msg.value.isOpened;
        projectName = msg.value.rootName;
        break;
      case "local-status":
        localSupported = msg.supported ?? true;
        if (msg.vivadoDiscovery) {
          vivadoDiscovery = msg.vivadoDiscovery;
        }
        break;
      case "no-local":
        localSupported = false;
        if (msg.vivadoDiscovery) {
          vivadoDiscovery = msg.vivadoDiscovery;
        }
        break;
      case "autoDiscoverStatus":
        autoDiscoverEnabled = msg.enabled;
        break;
      case "remoteInferenceConfig":
        remoteInferenceEndpoint = msg.value.endpoint;
        remoteInferenceHasApiKey = msg.value.hasApiKey;
        apiKey = "";
        break;
      case "savedProjects":
        projects = msg.projects;
        break;
      case "dseStatus":
        dseStatus = msg.value;
        break;
      case "dseLog":
        dseLogs = [...dseLogs, msg.value].slice(-200);
        break;
      case "projectReset":
        dseStatus = createIdleDseStatus();
        dseLogs = [];
        break;
    }
  }

  function initCompass() {
    vscode_comm.postMessage({ type: "initCompass", value: "" });
  }

  function exportCompass() {
    vscode_comm.postMessage({ type: "exportCompass", value: "" });
  }

  function removeCompass() {
    vscode_comm.postMessage({ type: "removeCompass", value: "" });
  }

  function runAll() {
    vscode_comm.postMessage({ type: "runAll", value: buildGenerateYamlPayload() });
  }

  function resetProject() {
    vscode_comm.postMessage({ type: "resetProject", value: "" });
  }

  function generateYamls() {
    vscode_comm.postMessage({ type: "generateYamls", value: buildGenerateYamlPayload() });
  }

  function packageUpload() {
    vscode_comm.postMessage({ type: "packageUpload", value: buildDsePayload() });
  }

  function runInference() {
    vscode_comm.postMessage({ type: "runInference", value: buildDsePayload() });
  }

  function showResults() {
    vscode_comm.postMessage({ type: "showInference", value: "" });
  }

  function toggleAutoDiscover() {
    vscode_comm.postMessage({ type: "toggleAutoDiscover", value: "" });
  }

  function selectVivadoSettings64Path(settings64Path: string) {
    vscode_comm.postMessage({ type: "selectVivadoSettings64Path", value: settings64Path });
  }

  function onValidation(event: CustomEvent<{ hostValid: boolean; apiKeyValid: boolean }>) {
    ({ hostValid, apiKeyValid } = event.detail);
  }

  function saveRemoteInferenceApiKey(event: CustomEvent<{ endpoint: string; apiKey: string }>) {
    vscode_comm.postMessage({
      type: "saveRemoteInferenceApiKey",
      value: {
        endpoint: event.detail.endpoint,
        apiKey: event.detail.apiKey,
      },
    });
  }

  function clearRemoteInferenceApiKey() {
    vscode_comm.postMessage({ type: "clearRemoteInferenceApiKey", value: "" });
  }

  function testRemoteInferenceConnection(event: CustomEvent<{ endpoint: string }>) {
    vscode_comm.postMessage({
      type: "testRemoteInferenceConnection",
      value: {
        endpoint: event.detail.endpoint,
      },
    });
  }

  function buildGenerateYamlPayload() {
    return {
      paramValues: buildParamYamlMetricPayload(paramYamlValues),
      dse: dseOptions,
    };
  }

  function buildDsePayload() {
    return {
      dse: dseOptions,
    };
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

<main class="main flex flex-col gap-3">
  <ProjectSummary
    {projectName}
    {isProjectOpen}
    {initCompassFolder}
    hostMode={dseOptions.vivadoExecutionMode}
    {localSupported}
    {autoDiscoverEnabled}
    {vivadoDiscovery}
  />

  {#if !isProjectOpen}
    <section class="empty-state">Open a workspace folder to start a Compass flow.</section>
  {:else}
    <div class="mode-row">
      <RadioSelector bind:value={displayMode} options={displayOptions} orientation="horizontal" />
    </div>

    {#if displayMode === "flow"}
      <section class="setup-strip">
        <div class="field-grid">
          <div class="field">
            <span>Project</span>
            <vscode-text-field
              value={projectName}
              on:input={(event) => (projectName = inputValue(event))}
            ></vscode-text-field>
          </div>
        </div>

        <div class="compass-actions">
          {#if initCompassFolder}
            <vscode-button
              appearance="secondary"
              role="button"
              tabindex="0"
              on:click={exportCompass}
              on:keydown={(event) => onButtonKeydown(event, exportCompass)}
            >
              Export
            </vscode-button>
            <vscode-button
              appearance="secondary"
              role="button"
              tabindex="0"
              on:click={removeCompass}
              on:keydown={(event) => onButtonKeydown(event, removeCompass)}
            >
              Remove
            </vscode-button>
          {:else}
            <vscode-button
              role="button"
              tabindex="0"
              on:click={initCompass}
              on:keydown={(event) => onButtonKeydown(event, initCompass)}
            >
              Init Compass
            </vscode-button>
          {/if}
        </div>

        {#if dseOptions.inferenceMode === "remote"}
          <HostApiConfig
            bind:endpoint={remoteInferenceEndpoint}
            bind:apiKey
            hasApiKey={remoteInferenceHasApiKey}
            on:validation={onValidation}
            on:save={saveRemoteInferenceApiKey}
            on:clear={clearRemoteInferenceApiKey}
            on:test={testRemoteInferenceConnection}
          />
        {/if}

        <VivadoInstallations
          {vivadoDiscovery}
          onSelectVivadoSettings64Path={selectVivadoSettings64Path}
        />

        <ParamYamlMetrics bind:values={paramYamlValues} />
        <DseConfig bind:options={dseOptions} />
      </section>

      <WorkflowSteps
        {initCompassFolder}
        {localSupported}
        onInitCompass={initCompass}
        onGenerateYamls={generateYamls}
        onPackageUpload={packageUpload}
        onRunInference={runInference}
        onShowResults={showResults}
        onRunAll={runAll}
        onResetProject={resetProject}
      />
    {:else}
      <MoreDashboard
        bind:projectName
        bind:projectVersion
        bind:projectRevision
        bind:projectMemo
        bind:remoteInferenceEndpoint
        bind:apiKey
        remoteInferenceHasApiKey={remoteInferenceHasApiKey}
        bind:paramYamlValues
        bind:dseOptions
        {autoDiscoverEnabled}
        {vivadoDiscovery}
        {projects}
        {onValidation}
        onSaveRemoteInferenceApiKey={saveRemoteInferenceApiKey}
        onClearRemoteInferenceApiKey={clearRemoteInferenceApiKey}
        onTestRemoteInferenceConnection={testRemoteInferenceConnection}
        onSelectVivadoSettings64Path={selectVivadoSettings64Path}
        onGenerateYamls={generateYamls}
        onPackageUpload={packageUpload}
        onRunInference={runInference}
        onShowResults={showResults}
        onResetProject={resetProject}
        onToggleAutoDiscover={toggleAutoDiscover}
      />
    {/if}

    <DseRunMonitor status={dseStatus} logs={dseLogs} />
  {/if}
</main>

<style>
  .main {
    min-width: 0;
    padding-block: 0.25rem 1rem;
  }

  .empty-state,
  .setup-strip {
    border-top: 1px solid var(--vscode-panel-border);
    padding-top: 0.75rem;
  }

  .empty-state {
    color: var(--vscode-descriptionForeground);
    font-size: 0.8rem;
  }

  .mode-row {
    display: flex;
    justify-content: flex-start;
  }

  .setup-strip {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .field-grid,
  .compass-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 0.625rem;
  }

  .field {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .field span {
    color: var(--vscode-descriptionForeground);
    font-size: 0.74rem;
  }
</style>
