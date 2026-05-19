import * as vscode from "vscode";

import { DebouncedAction } from "./debounce";

export interface ReloadableWebview {
    reloadWebview(): void;
    hotReloadWebview?(update: WebviewHotUpdate): void;
}

export interface WebviewHotUpdate {
    files: string[];
    hasScript: boolean;
    hasStyle: boolean;
    version: number;
}

export interface WebviewHotReloadClientOptions {
    nonce: string;
    scriptUri: string;
    styleUris: readonly string[];
}

export function registerWebviewHotReload(
    context: vscode.ExtensionContext,
    targets: ReloadableWebview[],
    debounceMs = 75
): void {
    if (context.extensionMode !== vscode.ExtensionMode.Development) {
        return;
    }

    let version = 0;
    const pendingFiles: string[] = [];
    const reload = new DebouncedAction(() => {
        const files = pendingFiles.splice(0);
        const update: WebviewHotUpdate = {
            files,
            hasScript: files.some(isScriptAsset),
            hasStyle: files.some(isStyleAsset),
            version: ++version,
        };

        for (const target of targets) {
            if (target.hotReloadWebview) {
                target.hotReloadWebview(update);
            } else {
                target.reloadWebview();
            }
        }
    }, debounceMs);
    const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(context.extensionUri, "out/compiled/*.{js,css}")
    );
    const scheduleReload = (uri?: vscode.Uri) => {
        const file = uriToFileName(uri);
        if (!pendingFiles.includes(file)) {
            pendingFiles.push(file);
        }
        reload.schedule();
    };

    context.subscriptions.push(
        watcher,
        watcher.onDidCreate(scheduleReload),
        watcher.onDidChange(scheduleReload),
        watcher.onDidDelete(scheduleReload),
        reload
    );
}

export function createWebviewHotReloadScript(options: WebviewHotReloadClientOptions): string {
    return `(function () {
        const scriptUri = ${JSON.stringify(options.scriptUri)};
        const styleUris = ${JSON.stringify(options.styleUris)};
        const withVersion = (uri, version) => {
            const separator = uri.includes("?") ? "&" : "?";
            return uri + separator + "v=" + encodeURIComponent(String(version));
        };
        const updateStyles = version => {
            for (const styleUri of styleUris) {
                const selector = "link[data-compass-hot-style=" + JSON.stringify(styleUri) + "]";
                const link = document.querySelector(selector);
                if (link) {
                    link.href = withVersion(styleUri, version);
                }
            }
        };
        const updateScript = version => {
            const oldScript = document.querySelector("script[data-compass-hot-script]");
            const nextScript = document.createElement("script");
            nextScript.nonce = ${JSON.stringify(options.nonce)};
            nextScript.src = withVersion(scriptUri, version);
            nextScript.setAttribute("data-compass-hot-script", "true");
            nextScript.onload = () => oldScript?.remove();
            document.body.appendChild(nextScript);
        };
        window.addEventListener("message", event => {
            const message = event.data;
            if (!message || message.type !== "compassHotReload") {
                return;
            }

            if (message.value?.hasStyle) {
                updateStyles(message.value.version);
            }
            if (message.value?.hasScript) {
                updateScript(message.value.version);
            }
        });
    })();`;
}

function uriToFileName(uri: vscode.Uri | undefined): string {
    if (!uri) {
        return "unknown";
    }

    return uri.fsPath || uri.path || uri.toString();
}

function isScriptAsset(file: string): boolean {
    return /\.js$/i.test(file);
}

function isStyleAsset(file: string): boolean {
    return /\.css$/i.test(file);
}
