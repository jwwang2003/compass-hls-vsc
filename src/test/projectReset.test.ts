import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

type ModuleLoad = (request: string, parent: unknown, isMain: boolean) => unknown;

class TestUri {
    constructor(readonly fsPath: string) {}

    static file(fsPath: string): TestUri {
        return new TestUri(fsPath);
    }

    static joinPath(base: TestUri, ...segments: string[]): TestUri {
        return new TestUri(path.join(base.fsPath, ...segments));
    }
}

const fakeVscode = {
    Uri: TestUri,
    FileType: {
        File: 1,
        Directory: 2,
    },
    workspace: {
        fs: {
            async delete(uri: TestUri, options?: { recursive?: boolean }) {
                await fs.rm(uri.fsPath, {
                    recursive: options?.recursive ?? false,
                    force: false,
                });
            },
            async stat(uri: TestUri) {
                const stat = await fs.stat(uri.fsPath);
                return {
                    type: stat.isDirectory() ? 2 : 1,
                    size: stat.size,
                    ctime: stat.ctimeMs,
                    mtime: stat.mtimeMs,
                };
            },
            async readFile(uri: TestUri) {
                return fs.readFile(uri.fsPath);
            },
        },
    },
};

const requireModule = createRequire(__filename);
const moduleWithLoad = requireModule("node:module") as { _load: ModuleLoad };
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = (request, parent, isMain) => {
    if (request === "vscode") {
        return fakeVscode;
    }
    return originalLoad(request, parent, isMain);
};
const { resetCompassProjectArtifacts } = requireModule("../services/projectReset") as typeof import("../services/projectReset");
moduleWithLoad._load = originalLoad;

test("project reset deletes generated Compass artifacts without deleting base code", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "compass-reset-"));
    const workspaceUri = TestUri.file(workspace) as never;
    const generatedYamlDir = path.join(workspace, "generated-yaml");

    await fs.mkdir(path.join(workspace, ".compass", "hgbo-package", "benchmark", "custom", "bfs", "bulk"), { recursive: true });
    await fs.mkdir(path.join(workspace, ".compass", "runs", "run-1"), { recursive: true });
    await fs.mkdir(path.join(workspace, "include"), { recursive: true });
    await fs.mkdir(generatedYamlDir, { recursive: true });

    await writeConfigYaml(path.join(workspace, "config.yaml"));
    await writeParamsYaml(path.join(workspace, "params.yaml"));
    await write(path.join(workspace, "design.c"));
    await write(path.join(workspace, "include", "design.h"));
    await writeConfigYaml(path.join(workspace, ".compass", "config.yaml"));
    await writeParamsYaml(path.join(workspace, ".compass", "params.yaml"));
    await write(path.join(workspace, ".compass", "workspace.json"));
    await write(path.join(workspace, ".compass", "hgbo-package", "benchmark", "custom", "bfs", "bulk", "design.c"));
    await write(path.join(workspace, ".compass", "runs", "run-1", "hgbo-dse.log"));
    await writeConfigYaml(path.join(generatedYamlDir, "config.yaml"));
    await writeParamsYaml(path.join(generatedYamlDir, "params.yaml"));
    await write(path.join(generatedYamlDir, "notes.txt"));

    const summary = await resetCompassProjectArtifacts(workspaceUri, {
        yamlDirectories: [TestUri.file(generatedYamlDir) as never],
    });

    assert.equal(await exists(path.join(workspace, "config.yaml")), false);
    assert.equal(await exists(path.join(workspace, "params.yaml")), false);
    assert.equal(await exists(path.join(workspace, ".compass", "config.yaml")), false);
    assert.equal(await exists(path.join(workspace, ".compass", "params.yaml")), false);
    assert.equal(await exists(path.join(workspace, ".compass", "hgbo-package")), false);
    assert.equal(await exists(path.join(workspace, ".compass", "runs")), false);
    assert.equal(await exists(path.join(generatedYamlDir, "config.yaml")), false);
    assert.equal(await exists(path.join(generatedYamlDir, "params.yaml")), false);

    assert.equal(await exists(path.join(workspace, "design.c")), true);
    assert.equal(await exists(path.join(workspace, "include", "design.h")), true);
    assert.equal(await exists(path.join(workspace, ".compass")), true);
    assert.equal(await exists(path.join(workspace, ".compass", "workspace.json")), true);
    assert.equal(await exists(path.join(generatedYamlDir, "notes.txt")), true);
    assert.deepEqual(summary.failed, []);
    assert.ok(summary.deleted.some(item => item.endsWith(".compass/runs")));
});

async function write(filePath: string) {
    await fs.writeFile(filePath, "generated", "utf8");
}

async function writeConfigYaml(filePath: string) {
    await fs.writeFile(filePath, [
        "top:",
        "funcList:",
        "loopList:",
        "arrList:",
        "interList:",
        "dictOp:",
    ].join("\n"), "utf8");
}

async function writeParamsYaml(filePath: string) {
    await fs.writeFile(filePath, [
        "inline:",
        "balance:",
        "style:",
        "POW:",
        "LATENCY:",
    ].join("\n"), "utf8");
}

async function exists(filePath: string): Promise<boolean> {
    try {
        await fs.stat(filePath);
        return true;
    } catch {
        return false;
    }
}
