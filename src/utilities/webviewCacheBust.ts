import type * as vscode from "vscode";

export function versionedWebviewUri(uri: vscode.Uri, version: number): string {
    const text = uri.toString();
    if (version <= 0) {
        return text;
    }

    const separator = text.includes("?") ? "&" : "?";
    return `${text}${separator}v=${encodeURIComponent(String(version))}`;
}
