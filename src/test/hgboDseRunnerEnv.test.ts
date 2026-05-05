import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

type ModuleLoad = (request: string, parent: unknown, isMain: boolean) => unknown;

const requireModule = createRequire(__filename);
const moduleWithLoad = requireModule("node:module") as { _load: ModuleLoad };
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = (request, parent, isMain) => {
    if (request === "vscode") {
        return {};
    }
    return originalLoad(request, parent, isMain);
};
const {
    buildHgboDseEnvironment,
    createRemoteInferenceOutputRedactor,
    redactRemoteInferenceOutput,
} = requireModule("../services/hgboDseRunner") as typeof import("../services/hgboDseRunner");
moduleWithLoad._load = originalLoad;

test("buildHgboDseEnvironment preserves host env without mutating it", () => {
    const baseEnv: NodeJS.ProcessEnv = {
        PATH: "/usr/bin",
        PYTHONUNBUFFERED: "0",
        HGBO_MCP_URL: "https://stale.example/mcp",
        HGBO_MCP_API_KEY: "host-secret",
        HGBO_REMOTE_TIMEOUT_SEC: "30",
    };

    const env = buildHgboDseEnvironment(baseEnv);

    assert.deepEqual(baseEnv, {
        PATH: "/usr/bin",
        PYTHONUNBUFFERED: "0",
        HGBO_MCP_URL: "https://stale.example/mcp",
        HGBO_MCP_API_KEY: "host-secret",
        HGBO_REMOTE_TIMEOUT_SEC: "30",
    });
    assert.equal(env.PATH, "/usr/bin");
    assert.equal(env.PYTHONUNBUFFERED, "1");
    assert.equal(env.HGBO_MCP_URL, undefined);
    assert.equal(env.HGBO_MCP_API_KEY, undefined);
    assert.equal(env.HGBO_REMOTE_TIMEOUT_SEC, undefined);
    assert.notEqual(env, baseEnv);
});

test("buildHgboDseEnvironment injects remote MCP runtime env", () => {
    const baseEnv: NodeJS.ProcessEnv = {
        PATH: "/usr/bin",
        HGBO_REMOTE_TIMEOUT_SEC: "30",
    };

    const env = buildHgboDseEnvironment(baseEnv, {
        endpoint: "https://remote.example/mcp",
        apiKey: "sk-secret",
    });

    assert.equal(env.PYTHONUNBUFFERED, "1");
    assert.equal(env.HGBO_MCP_URL, "https://remote.example/mcp");
    assert.equal(env.HGBO_MCP_API_KEY, "sk-secret");
    assert.equal(env.HGBO_REMOTE_TIMEOUT_SEC, "600");
    assert.equal(baseEnv.HGBO_REMOTE_TIMEOUT_SEC, "30");
    assert.equal(baseEnv.HGBO_MCP_URL, undefined);
});

test("buildHgboDseEnvironment uses explicit remote timeout", () => {
    const env = buildHgboDseEnvironment({}, {
        endpoint: "https://remote.example/mcp",
        apiKey: "sk-secret",
        timeoutSec: 45,
    });

    assert.equal(env.HGBO_REMOTE_TIMEOUT_SEC, "45");
});

test("redactRemoteInferenceOutput removes the remote API key only when runtime is provided", () => {
    assert.equal(
        redactRemoteInferenceOutput(
            "Authorization: Bearer sk-secret",
            { endpoint: "https://remote.example/mcp", apiKey: "sk-secret" }
        ),
        "Authorization: Bearer [redacted]"
    );
    assert.equal(
        redactRemoteInferenceOutput("Authorization: Bearer sk-secret"),
        "Authorization: Bearer sk-secret"
    );
});

test("createRemoteInferenceOutputRedactor redacts keys split across stream chunks", () => {
    const redactor = createRemoteInferenceOutputRedactor({
        endpoint: "https://remote.example/mcp",
        apiKey: "sk-secret",
    });

    const chunks = [
        redactor.push("before sk-"),
        redactor.push("sec"),
        redactor.push("ret after"),
        redactor.flush(),
    ];

    assert.equal(chunks.join(""), "before [redacted] after");
});
