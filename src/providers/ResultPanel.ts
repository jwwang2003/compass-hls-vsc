import * as vscode from "vscode";

import type { HgboRunResultsPayload, HgboRunSummary } from "../services/hgboDseRunner";
import { getNonce } from "../utilities/getNonce";

export class ResultPanel {
    public static currentPanel: ResultPanel | undefined;
    public static readonly viewType = "compass.results";

    private readonly disposables: vscode.Disposable[] = [];
    private pendingData: HgboRunResultsPayload = createEmptyResultsPayload();
    private onSelectRun: ((runId: string) => Promise<void> | void) | undefined;
    private onVerifyImpl: ((runId: string, trials: number[]) => Promise<void> | void) | undefined;

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
        }
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = getNonce();
        const resetUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "reset.css")
        );
        const vscodeStyleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "vscode.css")
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "out", "compiled", "Result.js")
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "out", "compiled", "Result.css")
        );

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
