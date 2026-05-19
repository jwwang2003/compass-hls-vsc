import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

type ModuleLoad = (request: string, parent: unknown, isMain: boolean) => unknown;
type Listener = (uri?: { fsPath?: string; path?: string; toString(): string }) => void;

const requireModule = createRequire(__filename);
const moduleWithLoad = requireModule("node:module") as { _load: ModuleLoad };
const originalLoad = moduleWithLoad._load;

test("webview hot reload is only registered in extension development mode", () => {
    const vscode = createVscodeStub();
    const { registerWebviewHotReload } = loadHotReloadModule(vscode);
    const context = createContext(vscode.ExtensionMode.Production);

    registerWebviewHotReload(context as any, [{ reloadWebview: () => undefined }]);

    assert.equal(vscode.watchers.length, 0);
    assert.equal(context.subscriptions.length, 0);
    assert.deepEqual(vscode.debugLogs, []);
});

test("webview hot reload watches compiled assets and sends batched hot updates", async () => {
    const vscode = createVscodeStub();
    const { registerWebviewHotReload } = loadHotReloadModule(vscode);
    const context = createContext(vscode.ExtensionMode.Development);
    let sidebarReloads = 0;
    let resultReloads = 0;
    const sidebarUpdates: unknown[] = [];
    const resultUpdates: unknown[] = [];

    registerWebviewHotReload(context as any, [
        {
            reloadWebview: () => { sidebarReloads += 1; },
            hotReloadWebview: update => { sidebarUpdates.push(update); },
        },
        {
            reloadWebview: () => { resultReloads += 1; },
            hotReloadWebview: update => { resultUpdates.push(update); },
        },
    ], 5);

    assert.equal(vscode.watchers.length, 1);
    assert.equal(vscode.watchers[0].pattern.base, context.extensionUri);
    assert.equal(vscode.watchers[0].pattern.pattern, "out/compiled/*.{js,css}");
    assert.ok(vscode.debugLogs.some(line => line.includes("[Compass HMR] registered")));

    vscode.watchers[0].listeners.change(createUri("/extension/out/compiled/MainSidebar.css"));
    vscode.watchers[0].listeners.create(createUri("/extension/out/compiled/MainSidebar.js"));
    await wait(25);

    assert.equal(sidebarReloads, 0);
    assert.equal(resultReloads, 0);
    assert.deepEqual(sidebarUpdates, [{
        files: [
            "/extension/out/compiled/MainSidebar.css",
            "/extension/out/compiled/MainSidebar.js",
        ],
        hasScript: true,
        hasStyle: true,
        version: 1,
    }]);
    assert.deepEqual(resultUpdates, sidebarUpdates);
    assert.ok(vscode.debugLogs.some(line =>
        line.includes("[Compass HMR] dispatch v1") && line.includes("script=true") && line.includes("style=true")
    ));
    assert.ok(context.subscriptions.length >= 5);
});

test("webview hot reload falls back to full reload for legacy targets", async () => {
    const vscode = createVscodeStub();
    const { registerWebviewHotReload } = loadHotReloadModule(vscode);
    const context = createContext(vscode.ExtensionMode.Development);
    let reloads = 0;

    registerWebviewHotReload(context as any, [
        { reloadWebview: () => { reloads += 1; } },
    ], 5);

    vscode.watchers[0].listeners.change(createUri("/extension/out/compiled/MainSidebar.js"));
    await wait(25);

    assert.equal(reloads, 1);
});

test("webview hot reload client swaps styles and remounts scripts", () => {
    const vscode = createVscodeStub();
    const { createWebviewHotReloadScript } = loadHotReloadModule(vscode);
    const script = createWebviewHotReloadScript({
        nonce: "abc",
        scriptUri: "vscode-resource:/out/compiled/MainSidebar.js",
        styleUris: ["vscode-resource:/out/compiled/MainSidebar.css"],
    });

    assert.match(script, /compassHotReload/);
    assert.match(script, /\[Compass HMR\] client ready/);
    assert.match(script, /\[Compass HMR\] update/);
    assert.match(script, /\[Compass HMR\] style refreshed/);
    assert.match(script, /\[Compass HMR\] script remounted/);
    assert.match(script, /data-compass-hot-style/);
    assert.match(script, /data-compass-hot-script/);
    assert.match(script, /document\.createElement\("script"\)/);
    assert.match(script, /nextScript\.nonce = "abc"/);
});

test("webview hot reload client script is only emitted in development mode", () => {
    const vscode = createVscodeStub();
    const { createDevelopmentWebviewHotReloadScript } = loadHotReloadModule(vscode);
    const options = {
        nonce: "abc",
        scriptUri: "vscode-resource:/out/compiled/MainSidebar.js",
        styleUris: ["vscode-resource:/out/compiled/MainSidebar.css"],
    };

    assert.equal(createDevelopmentWebviewHotReloadScript(vscode.ExtensionMode.Production, options), "");
    assert.match(
        createDevelopmentWebviewHotReloadScript(vscode.ExtensionMode.Development, options),
        /\[Compass HMR\] client ready/
    );
});

function loadHotReloadModule(vscode: ReturnType<typeof createVscodeStub>) {
    const resolved = requireModule.resolve("../utilities/webviewHotReload");
    delete requireModule.cache[resolved];

    moduleWithLoad._load = (request, parent, isMain) => {
        if (request === "vscode") {
            return vscode;
        }
        return originalLoad(request, parent, isMain);
    };
    try {
        return requireModule("../utilities/webviewHotReload") as typeof import("../utilities/webviewHotReload");
    } finally {
        moduleWithLoad._load = originalLoad;
    }
}

function createContext(extensionMode: number) {
    return {
        extensionMode,
        extensionUri: { fsPath: "/extension" },
        subscriptions: [] as Array<{ dispose(): void }>,
    };
}

function createUri(fsPath: string) {
    return {
        fsPath,
        path: fsPath,
        toString: () => fsPath,
    };
}

function createVscodeStub() {
    const watchers: Array<{
        pattern: { base: unknown; pattern: string };
        listeners: Record<"create" | "change" | "delete", Listener>;
    }> = [];
    const debugLogs: string[] = [];

    class RelativePattern {
        constructor(
            public readonly base: unknown,
            public readonly pattern: string
        ) { }
    }

    const disposable = { dispose: () => undefined };

    return {
        ExtensionMode: {
            Production: 1,
            Development: 2,
        },
        RelativePattern,
        window: {
            createOutputChannel() {
                return {
                    appendLine(line: string) {
                        debugLogs.push(line);
                    },
                    dispose: () => undefined,
                };
            },
        },
        workspace: {
            createFileSystemWatcher(pattern: { base: unknown; pattern: string }) {
                const listeners: Record<"create" | "change" | "delete", Listener> = {
                    create: () => undefined,
                    change: () => undefined,
                    delete: () => undefined,
                };
                watchers.push({ pattern, listeners });

                return {
                    onDidCreate(listener: Listener) {
                        listeners.create = listener;
                        return disposable;
                    },
                    onDidChange(listener: Listener) {
                        listeners.change = listener;
                        return disposable;
                    },
                    onDidDelete(listener: Listener) {
                        listeners.delete = listener;
                        return disposable;
                    },
                    dispose: () => undefined,
                };
            },
        },
        watchers,
        debugLogs,
    };
}

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
