import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

type ModuleLoad = (request: string, parent: unknown, isMain: boolean) => unknown;
type Listener = () => void;

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
});

test("webview hot reload watches compiled assets and reloads targets after changes", async () => {
    const vscode = createVscodeStub();
    const { registerWebviewHotReload } = loadHotReloadModule(vscode);
    const context = createContext(vscode.ExtensionMode.Development);
    let sidebarReloads = 0;
    let resultReloads = 0;

    registerWebviewHotReload(context as any, [
        { reloadWebview: () => { sidebarReloads += 1; } },
        { reloadWebview: () => { resultReloads += 1; } },
    ], 5);

    assert.equal(vscode.watchers.length, 1);
    assert.equal(vscode.watchers[0].pattern.base, context.extensionUri);
    assert.equal(vscode.watchers[0].pattern.pattern, "out/compiled/*.{js,css}");

    vscode.watchers[0].listeners.change();
    vscode.watchers[0].listeners.create();
    await wait(25);

    assert.equal(sidebarReloads, 1);
    assert.equal(resultReloads, 1);
    assert.ok(context.subscriptions.length >= 5);
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

function createVscodeStub() {
    const watchers: Array<{
        pattern: { base: unknown; pattern: string };
        listeners: Record<"create" | "change" | "delete", Listener>;
    }> = [];

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
    };
}

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
