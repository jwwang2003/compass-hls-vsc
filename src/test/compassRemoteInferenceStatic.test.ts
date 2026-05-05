import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const sidebarSource = () => readFileSync(path.join(process.cwd(), "src", "providers", "CompassSidebar.ts"), "utf8");
const extensionSource = () => readFileSync(path.join(process.cwd(), "src", "extension.ts"), "utf8");

test("CompassSidebar wires VS Code SecretStorage through RemoteInferenceSecrets", () => {
    const source = sidebarSource();

    assert.match(source, /RemoteInferenceSecrets/);
    assert.match(source, /SecretStorageLike/);
    assert.match(source, /remoteInferenceSecrets\s*=\s*new\s+RemoteInferenceSecrets\(secretStorage\)/);
    assert.match(extensionSource(), /new\s+CompassSidebar\([\s\S]*context\.secrets/);
});

test("CompassSidebar exposes remote inference config messages without returning the key", () => {
    const source = sidebarSource();

    for (const messageType of [
        "getRemoteInferenceConfig",
        "saveRemoteInferenceApiKey",
        "clearRemoteInferenceApiKey",
        "testRemoteInferenceConnection",
    ]) {
        assert.match(source, new RegExp(`case\\s+["']${messageType}["']`));
    }

    assert.match(source, /type:\s*["']remoteInferenceConfig["']/);
    assert.match(source, /hasApiKey/);
    assert.doesNotMatch(source, /apiKey:\s*apiKey/);
    assert.doesNotMatch(source, /apiKey:\s*await\s+this\.remoteInferenceSecrets\.getApiKey/);
});

test("CompassSidebar stores endpoint in VS Code settings and API key only in secrets", () => {
    const source = sidebarSource();

    assert.match(source, /DEFAULT_MCP_ENDPOINT/);
    assert.match(source, /normalizeMcpEndpoint/);
    assert.match(source, /getConfiguration\(["']compass["']\)[\s\S]*get<string>\(["']remoteInferenceMcpEndpoint["']/);
    assert.match(source, /getConfiguration\(["']compass["']\)[\s\S]*update\(["']remoteInferenceMcpEndpoint["']/);
    assert.match(source, /this\.remoteInferenceSecrets\.storeApiKey/);
    assert.match(source, /this\.remoteInferenceSecrets\.clearApiKey/);
    assert.doesNotMatch(source, /update\(["']remoteInferenceApiKey["']/);
    assert.doesNotMatch(source, /\.compass[\s\S]{0,120}apiKey/i);
});

test("CompassSidebar saves API key before endpoint and supports endpoint-only save for stored keys", () => {
    const source = sidebarSource();
    const saveHandler = source.match(/private async handleSaveRemoteInferenceApiKey[\s\S]*?\n    }\n/)?.[0] ?? "";

    assert.match(saveHandler, /const hasApiKey = await this\.remoteInferenceSecrets\.hasApiKey\(\)/);
    assert.match(saveHandler, /if \(!apiKey && !hasApiKey\)/);
    assert.match(saveHandler, /if \(apiKey\)[\s\S]*this\.remoteInferenceSecrets\.storeApiKey\(apiKey\)[\s\S]*this\.updateRemoteInferenceEndpoint\(endpoint\)/);
    assert.match(saveHandler, /if \(!apiKey && !hasApiKey\)[\s\S]*throw new Error\(["']Remote inference API key is required/);
});

test("CompassSidebar wraps Clear and Test in controlled error handling", () => {
    const source = sidebarSource();
    const clearHandler = source.match(/private async handleClearRemoteInferenceApiKey[\s\S]*?\n    }\n/)?.[0] ?? "";
    const testHandler = source.match(/private async handleTestRemoteInferenceConnection[\s\S]*?\n    }\n/)?.[0] ?? "";

    assert.match(clearHandler, /try\s*\{/);
    assert.match(clearHandler, /catch \(err: unknown\)/);
    assert.match(clearHandler, /Failed to clear remote inference API key/);
    assert.match(testHandler, /try\s*\{/);
    assert.match(testHandler, /catch \(err: unknown\)/);
    assert.match(testHandler, /Remote inference MCP connection failed/);
    assert.doesNotMatch(testHandler, /updateRemoteInferenceEndpoint/);
});

test("CompassSidebar blocks remote inference without a stored key and passes runtime only for remote mode", () => {
    const source = sidebarSource();

    assert.match(source, /dseOptions\.inferenceMode\s*===\s*["']remote["']/);
    assert.match(source, /Remote inference API key is required/);
    assert.match(source, /RemoteInferenceRuntime/);
    assert.match(source, /timeoutSec:\s*600/);
    assert.match(source, /runHgboDse\([\s\S]*remoteRuntime/);
});

test("CompassSidebar redacts remote runtime secrets before forwarding DSE output callbacks", () => {
    const source = sidebarSource();

    assert.match(source, /createRemoteDseCallbacks/);
    assert.match(source, /redactRemoteInferenceOutput\(log\.text,\s*remoteRuntime\)/);
    assert.match(source, /redactRemoteInferenceOutput\(status\.message,\s*remoteRuntime\)/);
    assert.match(source, /redactRemoteInferenceOutput\(status\.error,\s*remoteRuntime\)/);
    assert.match(source, /buildHgboDseEnvironment\(process\.env,\s*remoteRuntime\)/);
});

test("CompassSidebar tests remote MCP connection without logging the secret", () => {
    const source = sidebarSource();

    assert.match(source, /backend\.mcp_client/);
    assert.match(source, /--list-tools/);
    assert.match(source, /buildHgboDseEnvironment\(process\.env,\s*remoteRuntime\)/);
    assert.doesNotMatch(source, /showInformationMessage\([^)]*apiKey/i);
    assert.doesNotMatch(source, /postDseLog\([^)]*apiKey/i);
});
