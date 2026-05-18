import * as vscode from "vscode";

import type {
    HgboRunArtifactContent,
    HgboRunResultsPayload,
    HgboRunSummary,
} from "../services/hgboDseRunner";
import { getNonce } from "../utilities/getNonce";
import { versionedWebviewUri } from "../utilities/webviewCacheBust";

export class ResultPanel {
    public static currentPanel: ResultPanel | undefined;
    public static readonly viewType = "compass.results";

    private readonly disposables: vscode.Disposable[] = [];
    private pendingData: HgboRunResultsPayload = createEmptyResultsPayload();
    private onSelectRun: ((runId: string) => Promise<void> | void) | undefined;
    private onVerifyImpl: ((runId: string, trials: number[]) => Promise<void> | void) | undefined;
    private onLoadArtifact: ((runId: string, artifactId: string) => Promise<HgboRunArtifactContent | undefined> | HgboRunArtifactContent | undefined) | undefined;
    private webviewResourceVersion = 0;

    public static createOrShow(extensionUri: vscode.Uri, inferenceId = "latest"): ResultPanel {
        const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

        if (ResultPanel.currentPanel) {
            ResultPanel.currentPanel.panel.reveal(column);
            ResultPanel.currentPanel.setInferenceId(inferenceId);
            return ResultPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            ResultPanel.viewType,
            `Compass Results - ${inferenceId}`,
            column,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
            }
        );

        ResultPanel.currentPanel = new ResultPanel(panel, extensionUri, inferenceId);
        return ResultPanel.currentPanel;
    }

    public static reloadCurrentWebview() {
        ResultPanel.currentPanel?.reloadWebview();
    }

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private inferenceId: string
    ) {
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage(this.handleMessage.bind(this), null, this.disposables);
        this.update();
    }

    public dispose() {
        ResultPanel.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            this.disposables.pop()?.dispose();
        }
    }

    public setRunSelectionHandler(onSelectRun: (runId: string) => Promise<void> | void) {
        this.onSelectRun = onSelectRun;
    }

    public setImplVerificationHandler(onVerifyImpl: (runId: string, trials: number[]) => Promise<void> | void) {
        this.onVerifyImpl = onVerifyImpl;
    }

    public setArtifactContentHandler(
        onLoadArtifact: (runId: string, artifactId: string) => Promise<HgboRunArtifactContent | undefined> | HgboRunArtifactContent | undefined
    ) {
        this.onLoadArtifact = onLoadArtifact;
    }

    public render(results: HgboRunResultsPayload) {
        this.pendingData = results;
        this.setInferenceId(results.runId);
        this.panel.webview.postMessage({
            type: "render",
            value: this.pendingData,
        });
    }

    public renderLoading(message = "Loading run artifacts and studies...") {
        this.pendingData = {
            ...createEmptyResultsPayload(),
            runId: this.inferenceId,
            runs: this.pendingData.runs,
            loading: true,
            message,
        };
        this.panel.webview.postMessage({
            type: "render",
            value: this.pendingData,
        });
    }

    public renderRunList(runs: HgboRunSummary[], selectedRunId: string, message = "Loading selected run artifacts and studies...") {
        this.pendingData = {
            ...createEmptyResultsPayload(),
            runId: selectedRunId,
            runs,
            loading: true,
            message,
        };
        this.setInferenceId(selectedRunId);
        this.panel.webview.postMessage({
            type: "render",
            value: this.pendingData,
        });
    }

    public renderMessage(message: string, runId = this.inferenceId) {
        this.pendingData = {
            ...createEmptyResultsPayload(),
            runId,
            runs: this.pendingData.runs,
            message,
        };
        this.setInferenceId(runId);
        this.panel.webview.postMessage({
            type: "render",
            value: this.pendingData,
        });
    }

    public reloadWebview() {
        this.webviewResourceVersion += 1;
        this.update();
    }

    private setInferenceId(inferenceId: string) {
        this.inferenceId = inferenceId;
        this.panel.title = `Compass Results - ${this.inferenceId}`;
    }

    private update() {
        this.setInferenceId(this.inferenceId);
        this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);
    }

    private async handleMessage(message: any) {
        if (message.type === "ready") {
            this.render(this.pendingData);
            return;
        }

        if (message.type === "selectRun" && typeof message.value === "string") {
            await this.onSelectRun?.(message.value);
            return;
        }

        if (message.type === "verifyImpl" && isVerifyImplPayload(message.value)) {
            await this.onVerifyImpl?.(message.value.runId, message.value.trials);
            return;
        }

        if (message.type === "getArtifactContent" && isArtifactContentPayload(message.value)) {
            const artifact = await this.onLoadArtifact?.(message.value.runId, message.value.artifactId);
            this.panel.webview.postMessage({
                type: "artifactContent",
                value: {
                    requestId: message.value.requestId,
                    runId: message.value.runId,
                    artifactId: message.value.artifactId,
                    artifact,
                    error: artifact ? undefined : "Artifact not found.",
                },
            });
        }
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = getNonce();
        const resetUri = versionedWebviewUri(webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "reset.css")
        ), this.webviewResourceVersion);
        const vscodeStyleUri = versionedWebviewUri(webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "vscode.css")
        ), this.webviewResourceVersion);
        const scriptUri = versionedWebviewUri(webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "out", "compiled", "Result.js")
        ), this.webviewResourceVersion);
        const styleUri = versionedWebviewUri(webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "out", "compiled", "Result.css")
        ), this.webviewResourceVersion);

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: https:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <link href="${resetUri}" rel="stylesheet">
                <link href="${vscodeStyleUri}" rel="stylesheet">
                <script nonce="${nonce}">
                    const vscode_comm = acquireVsCodeApi();
                </script>
            </head>
            <body></body>
            <script nonce="${nonce}" src="${scriptUri}"></script>
            </html>`;
    }
}

function createEmptyResultsPayload(): HgboRunResultsPayload {
    return {
        runId: "latest",
        runs: [],
        logs: [],
        fileGroups: [],
        svgs: [],
        plot: {
            axes: {
                x: "Power",
                y: "CP",
                z: "Area",
            },
            points: [],
        },
        trialManifest: [],
        verification: [],
    };
}

function isVerifyImplPayload(value: unknown): value is { runId: string; trials: number[] } {
    if (!value || typeof value !== "object") {
        return false;
    }

    const payload = value as { runId?: unknown; trials?: unknown };
    return typeof payload.runId === "string" &&
        Array.isArray(payload.trials) &&
        payload.trials.every(trial => Number.isInteger(trial));
}

function isArtifactContentPayload(value: unknown): value is { requestId: number; runId: string; artifactId: string } {
    if (!value || typeof value !== "object") {
        return false;
    }

    const payload = value as { requestId?: unknown; runId?: unknown; artifactId?: unknown };
    return Number.isInteger(payload.requestId) &&
        typeof payload.runId === "string" &&
        typeof payload.artifactId === "string";
}
