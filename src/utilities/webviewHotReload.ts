import * as vscode from "vscode";

import { DebouncedAction } from "./debounce";

export interface ReloadableWebview {
    reloadWebview(): void;
}

export function registerWebviewHotReload(
    context: vscode.ExtensionContext,
    targets: ReloadableWebview[],
    debounceMs = 75
): void {
    if (context.extensionMode !== vscode.ExtensionMode.Development) {
        return;
    }

    const reload = new DebouncedAction(() => {
        for (const target of targets) {
            target.reloadWebview();
        }
    }, debounceMs);
    const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(context.extensionUri, "out/compiled/*.{js,css}")
    );
    const scheduleReload = () => reload.schedule();

    context.subscriptions.push(
        watcher,
        watcher.onDidCreate(scheduleReload),
        watcher.onDidChange(scheduleReload),
        watcher.onDidDelete(scheduleReload),
        reload
    );
}
