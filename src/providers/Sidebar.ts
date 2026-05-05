import * as vscode from "vscode";

export interface Sidebar extends vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    _doc?: vscode.TextDocument;

    resolveWebviewView: (webviewView: vscode.WebviewView) => void;
    handleMessage: (data: any) => void;
    revive: (panel: vscode.WebviewView) => void;
    _getHtmlForWebview: (webview: vscode.Webview) => string;
}
