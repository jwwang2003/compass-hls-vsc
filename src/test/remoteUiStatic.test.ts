import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const readWebview = (relativePath: string) => readFileSync(path.join(process.cwd(), "webviews", ...relativePath.split("/")), "utf8");

test("HostApiConfig renders endpoint, password key entry, stored status, and actions", () => {
    const source = readWebview("components/HostApiConfig.svelte");

    assert.match(source, /endpoint/);
    assert.match(source, /type=["']password["']/);
    assert.match(source, /hasApiKey|stored/i);
    for (const action of ["save", "test", "clear"]) {
        assert.match(source, new RegExp(action, "i"));
    }
    assert.match(source, /apiKey\s*=\s*["']["']/);
});

test("HostApiConfig allows blank save only when a key is already stored", () => {
    const source = readWebview("components/HostApiConfig.svelte");

    assert.match(source, /if \(!hasApiKey\) \{/);
    assert.match(source, /validateApiKey\(\)/);
    assert.match(source, /if \(!endpointValid \|\| !apiKeyValid\) return/);
    assert.match(source, /dispatch\(["']save["'], \{ endpoint, apiKey \}\)/);
});

test("MainSidebar requests and handles remote inference config", () => {
    const source = readWebview("sveltePages/MainSidebar.svelte");

    assert.match(source, /type:\s*["']getRemoteInferenceConfig["']/);
    assert.match(source, /type:\s*["']remoteInferenceConfig["']/);
    assert.match(source, /remoteInferenceEndpoint/);
    assert.match(source, /remoteInferenceHasApiKey/);
});

test("MainSidebar wires remote inference UI actions to extension messages", () => {
    const source = readWebview("sveltePages/MainSidebar.svelte");

    assert.match(source, /type:\s*["']saveRemoteInferenceApiKey["']/);
    assert.match(source, /type:\s*["']clearRemoteInferenceApiKey["']/);
    assert.match(source, /type:\s*["']testRemoteInferenceConnection["']/);
    assert.match(source, /apiKey/);
    assert.match(source, /endpoint/);
});

test("Remote config visibility follows DSE inference mode in flow and more views", () => {
    const mainSource = readWebview("sveltePages/MainSidebar.svelte");
    const moreSource = readWebview("components/MoreDashboard.svelte");

    assert.match(mainSource, /dseOptions\.inferenceMode\s*===\s*["']remote["']/);
    assert.match(moreSource, /dseOptions\.inferenceMode\s*===\s*["']remote["']/);
    assert.doesNotMatch(mainSource, /hostMode\s*===\s*["']remote["'][\s\S]{0,160}<HostApiConfig/);
    assert.doesNotMatch(moreSource, /hostMode\s*===\s*["']remote["'][\s\S]{0,160}<HostApiConfig/);
});

test("MoreDashboard receives and forwards the same remote inference controls", () => {
    const source = readWebview("components/MoreDashboard.svelte");

    assert.match(source, /HostApiConfig/);
    assert.match(source, /remoteInferenceEndpoint/);
    assert.match(source, /remoteInferenceHasApiKey/);
    assert.match(source, /onSaveRemoteInferenceApiKey/);
    assert.match(source, /onClearRemoteInferenceApiKey/);
    assert.match(source, /onTestRemoteInferenceConnection/);
});
