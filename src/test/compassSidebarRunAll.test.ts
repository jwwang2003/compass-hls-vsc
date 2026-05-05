import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

type ModuleLoad = (request: string, parent: unknown, isMain: boolean) => unknown;

const requireModule = createRequire(__filename);
const moduleWithLoad = requireModule("node:module") as { _load: ModuleLoad };
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = (request, parent, isMain) => {
    if (request === "vscode") {
        return {
            ProgressLocation: { Notification: 15 },
            Uri: {
                joinPath: (...parts: Array<{ fsPath?: string } | string>) => ({
                    fsPath: parts.map(part => typeof part === "string" ? part : part.fsPath ?? "").join("/"),
                }),
            },
            window: {},
            workspace: {},
        };
    }
    return originalLoad(request, parent, isMain);
};
const { CompassSidebar } = requireModule("../providers/CompassSidebar") as typeof import("../providers/CompassSidebar");
moduleWithLoad._load = originalLoad;

test("Run All stops after YAML generation fails", async () => {
    const sidebar = new CompassSidebar({} as any) as any;
    const calls: string[] = [];

    sidebar.handleGenerateYamlFiles = async () => {
        calls.push("generate");
        return false;
    };
    sidebar.handleUpload = async () => {
        calls.push("upload");
        return true;
    };
    sidebar.handleRunInference = async () => {
        calls.push("inference");
        return true;
    };
    sidebar.handleShowInference = async () => {
        calls.push("show");
    };

    await sidebar.handleRunAll();

    assert.deepEqual(calls, ["generate"]);
});

test("Run All stops after packaging fails", async () => {
    const sidebar = new CompassSidebar({} as any) as any;
    const calls: string[] = [];

    sidebar.handleGenerateYamlFiles = async () => {
        calls.push("generate");
        return true;
    };
    sidebar.handleUpload = async () => {
        calls.push("upload");
        return false;
    };
    sidebar.handleRunInference = async () => {
        calls.push("inference");
        return true;
    };
    sidebar.handleShowInference = async () => {
        calls.push("show");
    };

    await sidebar.handleRunAll();

    assert.deepEqual(calls, ["generate", "upload"]);
});

test("Run All stops before showing results when inference fails", async () => {
    const sidebar = new CompassSidebar({} as any) as any;
    const calls: string[] = [];

    sidebar.handleGenerateYamlFiles = async () => {
        calls.push("generate");
        return true;
    };
    sidebar.handleUpload = async () => {
        calls.push("upload");
        return true;
    };
    sidebar.handleRunInference = async () => {
        calls.push("inference");
        return false;
    };
    sidebar.handleShowInference = async () => {
        calls.push("show");
    };

    await sidebar.handleRunAll();

    assert.deepEqual(calls, ["generate", "upload", "inference"]);
});
