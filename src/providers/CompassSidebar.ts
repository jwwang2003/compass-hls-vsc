import { spawn } from "child_process";
import * as vscode from "vscode";

import {
    chooseYamlOutputDirectory,
    generateYamlFiles,
    type DisplayFile,
} from "../services/yamlService";
import type { ParamYamlMetricInputs } from "../services/paramYaml";
import { resetCompassProjectArtifacts } from "../services/projectReset";
import { normalizeDseOptions, type DseOptions } from "../services/hgboDseConfig";
import {
    prepareHgboDsePackage,
    listHgboRuns,
    readLatestHgboRunFiles,
    readHgboRunFiles,
    readHgboRunArtifact,
    readHgboRunOverview,
    runHgboDse,
    runHgboImplVerification,
    buildHgboDseEnvironment,
    redactRemoteInferenceOutput,
    type DseLogPayload,
    type HgboDseRunCallbacks,
    type HgboRunSummary,
    type HgboRunOverviewPayload,
    type HgboRunResultsPayload,
    type DseStatusPayload,
    type RemoteInferenceRuntime,
} from "../services/hgboDseRunner";
import {
    DEFAULT_MCP_ENDPOINT,
    normalizeMcpEndpoint,
    RemoteInferenceSecrets,
    type SecretStorageLike,
} from "../services/remoteInferenceSecrets";
import { TdmConfigService } from "../parser/tdmConfigService";
import { getNonce } from "../utilities/getNonce";
import { versionedWebviewUri } from "../utilities/webviewCacheBust";
import type { VivadoDiscoveryStatus } from "../utilities/vivadoDiscovery";
import { ResultPanel } from "./ResultPanel";
import { Sidebar } from "./Sidebar";

export class CompassSidebar implements Sidebar {
    _view?: vscode.WebviewView;
    _doc?: vscode.TextDocument;
    private isLocalSupported = true;
    private vivadoDiscovery: VivadoDiscoveryStatus | undefined;
    private latestDseFiles: DisplayFile[] = [];
    private latestYamlOutputDirectory: vscode.Uri | undefined;
    private resultsLoadRequestId = 0;
    private resultRuns: HgboRunSummary[] = [];
    private webviewResourceVersion = 0;
    private readonly remoteInferenceSecrets: RemoteInferenceSecrets;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly tdmConfigService?: TdmConfigService,
        private readonly onSelectVivadoSettings64Path?: (settings64Path: string) => Promise<void> | void,
        secretStorage: SecretStorageLike = createVolatileSecretStorage()
    ) {
        this.remoteInferenceSecrets = new RemoteInferenceSecrets(secretStorage);
    }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(this.handleMessage.bind(this));
        void this.postInitialState();
    }

    public setLocalSupport(isSupported: boolean, vivadoDiscovery?: VivadoDiscoveryStatus) {
        this.isLocalSupported = isSupported;
        this.vivadoDiscovery = vivadoDiscovery;
        this.postLocalSupport();
    }

    public async handleMessage(data: any) {
        switch (data.type) {
            case "onInfo":
                if (data.value) {
                    vscode.window.showInformationMessage(data.value);
                }
                break;
            case "onError":
                if (data.value) {
                    vscode.window.showErrorMessage(data.value);
                }
                break;
            case "ready":
                await this.postInitialState();
                break;
            case "generateYamlFiles":
            case "generateYamls":
                await this.handleGenerateYamlFiles(this.getParamValues(data));
                break;
            case "upload":
            case "packageUpload":
                await this.handleUpload(this.getDseOptions(data));
                break;
            case "downloadArtifacts":
                await this.handleDownloadArtifacts();
                break;
            case "showInference":
                await this.handleShowInference();
                break;
            case "runInference":
                await this.handleRunInference(this.getDseOptions(data));
                break;
            case "runAll":
                await this.handleRunAll(this.getParamValues(data), this.getDseOptions(data));
                break;
            case "resetProject":
                await this.handleResetProject();
                break;
            case "initCompass":
                await this.handleInitCompass();
                break;
            case "exportCompass":
                vscode.window.showInformationMessage("Compass project metadata is ready in the workspace.");
                break;
            case "removeCompass":
                await this.handleRemoveCompass();
                break;
            case "getSavedProjects":
                this.postSavedProjects();
                break;
            case "setMode":
                break;
            case "toggleAutoDiscover":
                await this.handleToggleAutoDiscover();
                break;
            case "getAutoDiscoverStatus":
                this.postAutoDiscoverStatus();
                break;
            case "getRemoteInferenceConfig":
                await this.postRemoteInferenceConfig();
                break;
            case "saveRemoteInferenceApiKey":
                await this.handleSaveRemoteInferenceApiKey(data);
                break;
            case "clearRemoteInferenceApiKey":
                await this.handleClearRemoteInferenceApiKey();
                break;
            case "testRemoteInferenceConnection":
                await this.handleTestRemoteInferenceConnection(data);
                break;
            case "selectVivadoSettings64Path":
                if (typeof data.value === "string") {
                    await this.onSelectVivadoSettings64Path?.(data.value);
                }
                break;
        }
    }

    private async handleGenerateYamlFiles(paramValues?: ParamYamlMetricInputs): Promise<boolean> {
        const workspaceFolder = this.getWorkspaceFolder();
        if (!workspaceFolder) {
            vscode.window.showErrorMessage("No workspace folder is open.");
            return false;
        }

        const outputDirectory = await chooseYamlOutputDirectory(workspaceFolder.uri);
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Generating YAML from C source...",
                cancellable: false,
            },
            async () => {
                try {
                    const files = await generateYamlFiles(outputDirectory, {
                        paramValues,
                        afterGenerate: async (sourceDocument, directory) => {
                            await this.tdmConfigService?.autoDiscoverDocument(sourceDocument, directory);
                            await this.tdmConfigService?.pruneDisabledDocumentItems(sourceDocument, directory);
                        },
                    });
                    this.latestYamlOutputDirectory = outputDirectory;
                    this._view?.webview.postMessage({
                        type: "configFiles",
                        files,
                    });
                    vscode.window.showInformationMessage(`YAML files generated in ${outputDirectory.fsPath}`);
                    return true;
                } catch (err: unknown) {
                    vscode.window.showErrorMessage(`YAML generation failed: ${this.getErrorMessage(err)}`);
                    return false;
                }
            }
        );
    }

    private async handleUpload(dseOptions: DseOptions = normalizeDseOptions(undefined)): Promise<boolean> {
        const workspaceFolder = this.getWorkspaceFolder();
        if (!workspaceFolder) {
            vscode.window.showErrorMessage("No workspace folder is open.");
            return false;
        }

        const compassUri = vscode.Uri.joinPath(workspaceFolder.uri, ".compass");
        if (!await this.pathExists(compassUri)) {
            vscode.window.showInformationMessage("Initialize Compass before packaging .compass.");
            return false;
        }

        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Packaging .compass for Inference + DSE...",
                cancellable: false,
            },
            async (progress) => {
                try {
                    this.postDseStatus({
                        running: false,
                        stage: "Packaging .compass",
                        progress: 0,
                        message: "Preparing HGBO-DSE package inputs.",
                    });
                    const dsePackage = await prepareHgboDsePackage(workspaceFolder, dseOptions, progress);
                    this.postDseLog({
                        stream: "system",
                        text: `Packaged .compass for HGBO-DSE with ${dsePackage.files.length} files.\n`,
                    });
                    this.postDseStatus({
                        running: false,
                        stage: "Package Ready",
                        progress: 100,
                        message: `${dsePackage.files.length} files packaged for Inference + DSE.`,
                    });
                    vscode.window.showInformationMessage(`.compass package ready for Inference + DSE (${dsePackage.files.length} files).`);
                    return true;
                } catch (err: unknown) {
                    const message = this.getErrorMessage(err);
                    this.postDseStatus({
                        running: false,
                        stage: "Package Failed",
                        progress: 100,
                        message,
                        error: message,
                    });
                    vscode.window.showErrorMessage(`Failed to package .compass: ${message}`);
                    return false;
                }
            }
        );
    }

    private async handleDownloadArtifacts(): Promise<DisplayFile[]> {
        const workspaceFolder = this.getWorkspaceFolder();
        if (!workspaceFolder) {
            vscode.window.showErrorMessage("No workspace folder is open.");
            return [];
        }

        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Loading Inference + DSE artifacts...",
                cancellable: false,
            },
            async (progress) => {
                try {
                    progress.report({ increment: 100, message: "Reading latest .compass run artifacts..." });
                    const files = await readLatestHgboRunFiles(workspaceFolder.uri);
                    if (files.length === 0) {
                        vscode.window.showInformationMessage("No Inference + DSE artifacts found. Run Inference + DSE first.");
                        return [];
                    }

                    this._view?.webview.postMessage({
                        type: "artifactFiles",
                        files,
                    });
                    vscode.window.showInformationMessage("Inference + DSE artifacts loaded from .compass.");
                    return files;
                } catch (err: unknown) {
                    vscode.window.showErrorMessage(`Failed to load artifacts: ${this.getErrorMessage(err)}`);
                    return [];
                }
            }
        );
    }

    private async handleShowInference(runId?: string) {
        const workspaceFolder = this.getWorkspaceFolder();
        if (!workspaceFolder) {
            vscode.window.showErrorMessage("No workspace folder is open.");
            return;
        }

        const panel = ResultPanel.createOrShow(this.extensionUri, runId ?? "latest");
        panel.setRunSelectionHandler(async selectedRunId => {
            await this.renderSelectedRun(panel, workspaceFolder.uri, selectedRunId);
        });
        panel.setImplVerificationHandler(async (selectedRunId, trials) => {
            await this.handleVerifyImpl(panel, workspaceFolder, selectedRunId, trials);
        });
        panel.setArtifactContentHandler(async (selectedRunId, artifactId) =>
            readHgboRunArtifact(workspaceFolder.uri, selectedRunId, artifactId)
        );
        const requestId = ++this.resultsLoadRequestId;
        panel.renderLoading("Discovering .compass runs...");

        const runs = await listHgboRuns(workspaceFolder.uri);
        if (requestId !== this.resultsLoadRequestId) {
            return;
        }

        this.resultRuns = runs;
        if (runs.length === 0) {
            panel.renderMessage("No Inference + DSE artifacts found. Run Inference + DSE first.");
            vscode.window.showInformationMessage("No Inference + DSE artifacts found. Run Inference + DSE first.");
            return;
        }

        const selectedRunId = runs.some(run => run.id === runId)
            ? runId as string
            : runs.find(run => run.isLatest)?.id ?? runs[0].id;
        panel.renderRunList(runs, selectedRunId, `Loading ${selectedRunId} artifacts and studies...`);
        await this.loadRunDetails(panel, workspaceFolder.uri, selectedRunId, runs, requestId);
    }

    private async renderSelectedRun(panel: ResultPanel, workspaceUri: vscode.Uri, runId: string) {
        const requestId = ++this.resultsLoadRequestId;
        const runs = this.resultRuns.length > 0 ? this.resultRuns : await listHgboRuns(workspaceUri);
        if (requestId !== this.resultsLoadRequestId) {
            return;
        }

        this.resultRuns = runs;
        panel.renderRunList(runs, runId, `Loading ${runId} artifacts and studies...`);
        await this.loadRunDetails(panel, workspaceUri, runId, runs, requestId);
    }

    private async loadRunDetails(
        panel: ResultPanel,
        workspaceUri: vscode.Uri,
        runId: string,
        runs: HgboRunSummary[],
        requestId: number
    ) {
        const overview = await readHgboRunOverview(workspaceUri, runId);
        if (requestId !== this.resultsLoadRequestId) {
            return;
        }

        if (!overview) {
            panel.renderMessage("No Inference + DSE artifacts found. Run Inference + DSE first.", runId);
            vscode.window.showInformationMessage("No Inference + DSE artifacts found. Run Inference + DSE first.");
            return;
        }

        panel.render(this.overviewToResultsPayload({ ...overview, runs }));
    }

    private async handleVerifyImpl(
        panel: ResultPanel,
        workspaceFolder: vscode.WorkspaceFolder,
        runId: string,
        trials: number[]
    ) {
        const runs = this.resultRuns.length > 0 ? this.resultRuns : await listHgboRuns(workspaceFolder.uri);
        if (!runs.some(run => run.id === runId)) {
            vscode.window.showErrorMessage(`Run ${runId} was not found in .compass/runs.`);
            return;
        }

        const results = await readHgboRunOverview(workspaceFolder.uri, runId);
        if (!results) {
            vscode.window.showErrorMessage(`Could not load ${runId} before implementation verification.`);
            return;
        }

        const selectedTrialSet = new Set(trials);
        const selectedEntries = results.trialManifest.filter(entry => selectedTrialSet.has(entry.trial));
        const missingParams = selectedEntries.filter(entry => Object.keys(entry.params).length === 0);
        if (selectedEntries.length === 0) {
            vscode.window.showErrorMessage("Select at least one Pareto PPA study before running implementation verification.");
            return;
        }
        if (missingParams.length > 0) {
            vscode.window.showErrorMessage(`Selected trials are missing saved parameters: ${missingParams.map(entry => entry.projectLabel).join(", ")}`);
            return;
        }

        const dseOptions = await this.readRunDseOptions(workspaceFolder.uri, runId);
        let notificationProgress = 0;
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Running implementation verification...",
                cancellable: false,
            },
            async progress => {
                try {
                    panel.renderRunList(runs, runId, `Running implementation verification for ${selectedEntries.length} selected studies...`);
                    progress.report({ increment: 10, message: "Launching implementation verification" });
                    notificationProgress = 10;
                    await runHgboImplVerification(
                        this.extensionUri,
                        workspaceFolder,
                        runId,
                        dseOptions,
                        results.trialManifest,
                        selectedEntries.map(entry => entry.trial),
                        this.getHgboPythonPath(),
                        {
                            onLog: log => this.postDseLog(log),
                            onStatus: status => {
                                this.postDseStatus(status);
                                const nextProgress = Math.max(notificationProgress, status.progress);
                                progress.report({
                                    increment: nextProgress - notificationProgress,
                                    message: status.message,
                                });
                                notificationProgress = nextProgress;
                            },
                        }
                    );
                    await this.renderSelectedRun(panel, workspaceFolder.uri, runId);
                    vscode.window.showInformationMessage("Implementation verification complete.");
                } catch (err: unknown) {
                    const message = this.getErrorMessage(err);
                    this.postDseStatus({
                        running: false,
                        stage: "Implementation Verification Failed",
                        progress: 100,
                        message,
                        error: message,
                    });
                    const latestResults = await readHgboRunOverview(workspaceFolder.uri, runId);
                    if (latestResults) {
                        panel.render(this.overviewToResultsPayload({ ...latestResults, runs }));
                    }
                    vscode.window.showErrorMessage(`Implementation verification failed: ${message}`);
                }
            }
        );
    }

    private overviewToResultsPayload(overview: HgboRunOverviewPayload): HgboRunResultsPayload {
        return {
            runId: overview.runId,
            runs: overview.runs,
            logs: [],
            fileGroups: overview.artifactGroups
                .map(group => ({
                    id: group.id,
                    projectId: group.projectId,
                    projectLabel: group.projectLabel,
                    trial: group.trial,
                    files: group.artifacts
                        .filter(artifact => artifact.kind === "text")
                        .map(artifact => ({
                            name: artifact.name,
                            content: "",
                        })),
                }))
                .filter(group => group.files.length > 0),
            svgs: overview.graphs.map(graph => ({
                name: graph.name,
                uri: "",
                content: "",
            })),
            plot: overview.plot,
            trialManifest: overview.trialManifest,
            verification: overview.verification,
            loading: overview.loading,
            message: overview.message,
        };
    }

    private async handleRunInference(dseOptions: DseOptions = normalizeDseOptions(undefined)): Promise<boolean> {
        const workspaceFolder = this.getWorkspaceFolder();
        if (!workspaceFolder) {
            vscode.window.showErrorMessage("No workspace folder is open.");
            return false;
        }

        const compassUri = vscode.Uri.joinPath(workspaceFolder.uri, ".compass");
        if (!await this.pathExists(compassUri)) {
            vscode.window.showInformationMessage("Package .compass before running Inference + DSE.");
            return false;
        }

        let notificationProgress = 0;
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Running Inference + DSE from .compass...",
                cancellable: false,
            },
            async (progress) => {
                try {
                    progress.report({ increment: 5, message: "Preparing .compass package" });
                    notificationProgress = 5;
                    const remoteRuntime = await this.getRemoteInferenceRuntime(dseOptions);
                    const dsePackage = await prepareHgboDsePackage(workspaceFolder, dseOptions);
                    const callbacks = this.createRemoteDseCallbacks({
                        onLog: log => this.postDseLog(log),
                        onStatus: status => {
                            this.postDseStatus(status);
                            const nextProgress = Math.max(notificationProgress, status.progress);
                            progress.report({
                                increment: nextProgress - notificationProgress,
                                message: status.message,
                            });
                            notificationProgress = nextProgress;
                        },
                    }, remoteRuntime);
                    const result = await runHgboDse(
                        this.extensionUri,
                        workspaceFolder,
                        dseOptions,
                        dsePackage,
                        this.getHgboPythonPath(),
                        callbacks,
                        remoteRuntime
                    );
                    this.latestDseFiles = await readHgboRunFiles(result.runUri);
                    this._view?.webview.postMessage({
                        type: "artifactFiles",
                        files: this.latestDseFiles,
                    });
                    vscode.window.showInformationMessage("Inference + DSE complete.");
                    return true;
                } catch (err: unknown) {
                    const message = this.getErrorMessage(err);
                    this.postDseStatus({
                        running: false,
                        stage: "Failed",
                        progress: 100,
                        message,
                        error: message,
                    });
                    vscode.window.showErrorMessage(`Inference + DSE failed: ${message}`);
                    return false;
                }
            }
        );
    }

    private async handleRunAll(paramValues?: ParamYamlMetricInputs, dseOptions: DseOptions = normalizeDseOptions(undefined)) {
        if (!await this.handleGenerateYamlFiles(paramValues)) {
            return;
        }
        if (!await this.handleUpload(dseOptions)) {
            return;
        }
        if (!await this.handleRunInference(dseOptions)) {
            return;
        }
        await this.handleShowInference();
    }

    private async handleResetProject(): Promise<void> {
        const workspaceFolder = this.getWorkspaceFolder();
        if (!workspaceFolder) {
            vscode.window.showErrorMessage("No workspace folder is open.");
            return;
        }

        const confirmed = await vscode.window.showWarningMessage(
            "Reset generated Compass artifacts? This removes generated YAML files, packaged .compass inputs, runs, logs, and results. Source files and base project code are not touched.",
            { modal: true },
            "Reset Project"
        );
        if (confirmed !== "Reset Project") {
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Resetting Compass project...",
                cancellable: false,
            },
            async progress => {
                progress.report({ increment: 20, message: "Deleting generated artifacts" });
                const summary = await resetCompassProjectArtifacts(workspaceFolder.uri, {
                    yamlDirectories: this.latestYamlOutputDirectory ? [this.latestYamlOutputDirectory] : [],
                });

                this.latestDseFiles = [];
                this.resultRuns = [];
                this.resultsLoadRequestId += 1;
                this._view?.webview.postMessage({
                    type: "projectReset",
                    value: summary,
                });
                ResultPanel.currentPanel?.renderMessage("Project reset. Generated Compass artifacts were removed.", "latest");

                progress.report({ increment: 80, message: "Refresh project state" });
                this.postProjectStatus();
                this.postSavedProjects();

                if (summary.failed.length > 0) {
                    vscode.window.showErrorMessage(`Project reset completed with ${summary.failed.length} cleanup error(s).`);
                    return;
                }

                vscode.window.showInformationMessage(`Project reset removed ${summary.deleted.length} generated artifact path(s).`);
            }
        );
    }

    private getParamValues(data: any): ParamYamlMetricInputs | undefined {
        const value = data?.value;
        if (!value || typeof value !== "object" || !("paramValues" in value)) {
            return undefined;
        }

        const paramValues = value.paramValues;
        return paramValues && typeof paramValues === "object" ? paramValues as ParamYamlMetricInputs : undefined;
    }

    private getDseOptions(data: any): DseOptions {
        return normalizeDseOptions(data?.value?.dse);
    }

    private async handleToggleAutoDiscover() {
        if (!this.tdmConfigService) {
            return;
        }

        const enabled = await this.tdmConfigService.toggleAutoDiscover();
        this.postAutoDiscoverStatus();
        vscode.window.showInformationMessage(`Compass auto-discovery ${enabled ? "enabled" : "disabled"}.`);
    }

    private async handleSaveRemoteInferenceApiKey(data: any) {
        try {
            const endpoint = this.normalizeEndpointFromMessage(data);
            const apiKey = typeof data?.value?.apiKey === "string" ? data.value.apiKey.trim() : "";
            const hasApiKey = await this.remoteInferenceSecrets.hasApiKey();

            if (!apiKey && !hasApiKey) {
                throw new Error("Remote inference API key is required.");
            }

            if (apiKey) {
                await this.remoteInferenceSecrets.storeApiKey(apiKey);
            }

            await this.updateRemoteInferenceEndpoint(endpoint);
            await this.postRemoteInferenceConfig();
            vscode.window.showInformationMessage("Remote inference configuration saved.");
        } catch (err: unknown) {
            vscode.window.showErrorMessage(`Failed to save remote inference API key: ${this.getErrorMessage(err)}`);
        }
    }

    private async handleClearRemoteInferenceApiKey() {
        try {
            await this.remoteInferenceSecrets.clearApiKey();
            await this.postRemoteInferenceConfig();
            vscode.window.showInformationMessage("Remote inference API key cleared.");
        } catch (err: unknown) {
            vscode.window.showErrorMessage(`Failed to clear remote inference API key: ${this.getErrorMessage(err)}`);
        }
    }

    private async handleTestRemoteInferenceConnection(data: any) {
        try {
            const endpoint = this.normalizeEndpointFromMessage(data);
            const apiKey = await this.remoteInferenceSecrets.getApiKey();
            if (!apiKey) {
                vscode.window.showErrorMessage("Remote inference API key is required to test the MCP connection.");
                return;
            }

            await this.runRemoteInferenceConnectionCheck({ endpoint, apiKey, timeoutSec: 600 });
            vscode.window.showInformationMessage("Remote inference MCP connection succeeded.");
        } catch (err: unknown) {
            vscode.window.showErrorMessage(`Remote inference MCP connection failed: ${this.getErrorMessage(err)}`);
        }
    }

    private createRemoteDseCallbacks(
        callbacks: HgboDseRunCallbacks,
        remoteRuntime: RemoteInferenceRuntime | undefined
    ): HgboDseRunCallbacks {
        if (!remoteRuntime) {
            return callbacks;
        }

        return {
            ...callbacks,
            onLog: log => callbacks.onLog?.({
                ...log,
                text: redactRemoteInferenceOutput(log.text, remoteRuntime),
            }),
            onStatus: status => callbacks.onStatus?.({
                ...status,
                message: redactRemoteInferenceOutput(status.message, remoteRuntime),
                error: status.error ? redactRemoteInferenceOutput(status.error, remoteRuntime) : undefined,
            }),
        };
    }

    private runRemoteInferenceConnectionCheck(remoteRuntime: RemoteInferenceRuntime): Promise<void> {
        const hgboRootUri = vscode.Uri.joinPath(this.extensionUri, "3rdParty", "HGBO-DSE");
        const pythonPath = this.getHgboPythonPath();
        const args = ["-u", "-m", "backend.mcp_client", "--list-tools"];

        return new Promise((resolve, reject) => {
            const child = spawn(pythonPath, args, {
                cwd: hgboRootUri.fsPath,
                env: buildHgboDseEnvironment(process.env, remoteRuntime),
            });
            const output: string[] = [];
            const collect = (chunk: Buffer) => output.push(chunk.toString("utf8"));

            child.stdout.on("data", collect);
            child.stderr.on("data", collect);
            child.on("error", reject);
            child.on("close", code => {
                if (code === 0) {
                    resolve();
                    return;
                }

                const message = redactRemoteInferenceOutput(
                    output.join("").trim() || `python exited with code ${code ?? "unknown"}`,
                    remoteRuntime
                );
                reject(new Error(message));
            });
        });
    }

    public postAutoDiscoverStatus() {
        if (!this._view || !this.tdmConfigService) {
            return;
        }

        this._view.webview.postMessage({
            type: "autoDiscoverStatus",
            enabled: this.tdmConfigService.autoDiscoverEnabled,
        });
    }

    private async postRemoteInferenceConfig() {
        if (!this._view) {
            return;
        }

        this._view.webview.postMessage({
            type: "remoteInferenceConfig",
            value: {
                endpoint: this.getRemoteInferenceEndpoint(),
                hasApiKey: await this.remoteInferenceSecrets.hasApiKey(),
            },
        });
    }

    private postDseStatus(status: DseStatusPayload) {
        this._view?.webview.postMessage({
            type: "dseStatus",
            value: status,
        });
    }

    private postDseLog(log: DseLogPayload) {
        this._view?.webview.postMessage({
            type: "dseLog",
            value: log,
        });
    }

    private async handleInitCompass() {
        const workspaceFolder = this.getWorkspaceFolder();
        if (!workspaceFolder) {
            vscode.window.showErrorMessage("No workspace folder is open.");
            return;
        }

        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspaceFolder.uri, ".compass"));
        this.postProjectStatus();
        vscode.window.showInformationMessage("Compass workspace initialized.");
    }

    private async handleRemoveCompass() {
        const workspaceFolder = this.getWorkspaceFolder();
        if (!workspaceFolder) {
            vscode.window.showErrorMessage("No workspace folder is open.");
            return;
        }

        const compassUri = vscode.Uri.joinPath(workspaceFolder.uri, ".compass");
        try {
            await vscode.workspace.fs.delete(compassUri, { recursive: true, useTrash: true });
        } catch {
            // Already absent.
        }
        this.postProjectStatus();
        vscode.window.showInformationMessage("Compass workspace metadata removed.");
    }

    private postLocalSupport() {
        if (!this._view) {
            return;
        }

        this._view.webview.postMessage({
            type: this.isLocalSupported ? "local-status" : "no-local",
            supported: this.isLocalSupported,
            vivadoDiscovery: this.vivadoDiscovery,
        });
    }

    private async postProjectStatus() {
        if (!this._view) {
            return;
        }

        const workspaceFolder = this.getWorkspaceFolder();
        const initCompassFolder = workspaceFolder
            ? await this.pathExists(vscode.Uri.joinPath(workspaceFolder.uri, ".compass"))
            : false;

        this._view.webview.postMessage({
            type: "projectStatus",
            value: {
                isOpened: Boolean(workspaceFolder),
                rootName: workspaceFolder?.name ?? "",
                initCompassFolder,
            },
        });
    }

    private async postSavedProjects() {
        const workspaceFolder = this.getWorkspaceFolder();
        if (!this._view || !workspaceFolder) {
            return;
        }

        const compassUri = vscode.Uri.joinPath(workspaceFolder.uri, ".compass");
        let projects: string[] = [];
        try {
            const entries = await vscode.workspace.fs.readDirectory(compassUri);
            projects = entries
                .filter(([, type]) => type === vscode.FileType.Directory)
                .map(([name]) => name);
        } catch {
            projects = [];
        }

        this._view.webview.postMessage({
            type: "savedProjects",
            projects,
        });
    }

    private async readRunDseOptions(workspaceUri: vscode.Uri, runId: string): Promise<DseOptions> {
        const manifestUri = vscode.Uri.joinPath(workspaceUri, ".compass", "runs", runId, "package", "manifest.json");
        try {
            const bytes = await vscode.workspace.fs.readFile(manifestUri);
            const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as { dse?: unknown };
            return normalizeDseOptions(parsed.dse);
        } catch {
            return normalizeDseOptions(undefined);
        }
    }

    private async pathExists(uri: vscode.Uri): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }

    private async collectCompassPackageFiles(directory: vscode.Uri, prefix = ""): Promise<string[]> {
        const entries = await vscode.workspace.fs.readDirectory(directory);
        const files: string[] = [];

        for (const [name, type] of entries) {
            const relativePath = prefix ? `${prefix}/${name}` : name;
            const childUri = vscode.Uri.joinPath(directory, name);

            if ((type & vscode.FileType.Directory) !== 0) {
                files.push(...await this.collectCompassPackageFiles(childUri, relativePath));
            } else if ((type & vscode.FileType.File) !== 0) {
                files.push(relativePath);
            }
        }

        return files.sort();
    }

    private getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
        return vscode.workspace.workspaceFolders?.[0];
    }

    private getHgboPythonPath(): string {
        return vscode.workspace
            .getConfiguration("compass")
            .get<string>("hgboPythonPath", "python3")
            .trim() || "python3";
    }

    private getRemoteInferenceEndpoint(): string {
        return normalizeMcpEndpoint(
            vscode.workspace
                .getConfiguration("compass")
                .get<string>("remoteInferenceMcpEndpoint", DEFAULT_MCP_ENDPOINT)
        );
    }

    private normalizeEndpointFromMessage(data: any): string {
        return normalizeMcpEndpoint(typeof data?.value?.endpoint === "string" ? data.value.endpoint : undefined);
    }

    private async updateRemoteInferenceEndpoint(endpoint: string) {
        await vscode.workspace
            .getConfiguration("compass")
            .update("remoteInferenceMcpEndpoint", endpoint, vscode.ConfigurationTarget.Global);
    }

    private async getRemoteInferenceRuntime(dseOptions: DseOptions): Promise<RemoteInferenceRuntime | undefined> {
        if (dseOptions.inferenceMode === "remote") {
            const apiKey = await this.remoteInferenceSecrets.getApiKey();
            if (!apiKey) {
                throw new Error("Remote inference API key is required before running remote Inference + DSE.");
            }

            return {
                endpoint: this.getRemoteInferenceEndpoint(),
                apiKey,
                timeoutSec: 600,
            };
        }

        return undefined;
    }

    private getErrorMessage(err: unknown): string {
        return err instanceof Error ? err.message : String(err);
    }

    public revive(panel: vscode.WebviewView) {
        this._view = panel;
    }

    public reloadWebview() {
        if (!this._view) {
            return;
        }

        this.webviewResourceVersion += 1;
        this._view.webview.html = this._getHtmlForWebview(this._view.webview);
    }

    private async postInitialState() {
        this.postLocalSupport();
        await this.postProjectStatus();
        this.postAutoDiscoverStatus();
        await this.postRemoteInferenceConfig();
        await this.postSavedProjects();
    }

    public _getHtmlForWebview(webview: vscode.Webview): string {
        const styleResetUri = versionedWebviewUri(webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "reset.css")
        ), this.webviewResourceVersion);
        const styleVSCodeUri = versionedWebviewUri(webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "vscode.css")
        ), this.webviewResourceVersion);
        const scriptUri = versionedWebviewUri(webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "out", "compiled", "MainSidebar.js")
        ), this.webviewResourceVersion);
        const styleMainUri = versionedWebviewUri(webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "out", "compiled", "MainSidebar.css")
        ), this.webviewResourceVersion);
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="img-src https: data:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleMainUri}" rel="stylesheet">
                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${styleVSCodeUri}" rel="stylesheet">
                <script nonce="${nonce}">
                    const vscode_comm = acquireVsCodeApi();
                    const tsvscode = vscode_comm;
                </script>
            </head>
            <body></body>
            <script nonce="${nonce}" src="${scriptUri}"></script>
            </html>`;
    }
}

function createVolatileSecretStorage(): SecretStorageLike {
    const values = new Map<string, string>();
    return {
        get: key => values.get(key),
        store: (key, value) => {
            values.set(key, value);
        },
        delete: key => {
            values.delete(key);
        },
    };
}
