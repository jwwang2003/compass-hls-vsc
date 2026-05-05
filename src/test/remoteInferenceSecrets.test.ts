import assert from "node:assert/strict";
import test from "node:test";

import {
    DEFAULT_MCP_ENDPOINT,
    MCP_API_KEY_SECRET_KEY,
    RemoteInferenceSecrets,
    type SecretStorageLike,
    normalizeMcpEndpoint,
} from "../services/remoteInferenceSecrets";

class MemorySecretStorage implements SecretStorageLike {
    readonly values = new Map<string, string>();

    async get(key: string): Promise<string | undefined> {
        return this.values.get(key);
    }

    async store(key: string, value: string): Promise<void> {
        this.values.set(key, value);
    }

    async delete(key: string): Promise<void> {
        this.values.delete(key);
    }
}

test("normalizeMcpEndpoint trims endpoint and defaults blank values", () => {
    assert.equal(normalizeMcpEndpoint(undefined), DEFAULT_MCP_ENDPOINT);
    assert.equal(normalizeMcpEndpoint(""), DEFAULT_MCP_ENDPOINT);
    assert.equal(normalizeMcpEndpoint("   "), DEFAULT_MCP_ENDPOINT);
    assert.equal(normalizeMcpEndpoint("  https://example.test/mcp  "), "https://example.test/mcp");
});

test("RemoteInferenceSecrets stores trimmed keys and reports presence", async () => {
    const storage = new MemorySecretStorage();
    const secrets = new RemoteInferenceSecrets(storage);

    assert.equal(await secrets.hasApiKey(), false);

    await secrets.storeApiKey("  sk-test  ");

    assert.equal(storage.values.get(MCP_API_KEY_SECRET_KEY), "sk-test");
    assert.equal(await secrets.getApiKey(), "sk-test");
    assert.equal(await secrets.hasApiKey(), true);
});

test("RemoteInferenceSecrets returns trimmed existing keys and treats blank stored values as absent", async () => {
    const storage = new MemorySecretStorage();
    const secrets = new RemoteInferenceSecrets(storage);

    storage.values.set(MCP_API_KEY_SECRET_KEY, "  sk-existing  ");
    assert.equal(await secrets.getApiKey(), "sk-existing");
    assert.equal(await secrets.hasApiKey(), true);

    storage.values.set(MCP_API_KEY_SECRET_KEY, "   ");
    assert.equal(await secrets.getApiKey(), undefined);
    assert.equal(await secrets.hasApiKey(), false);
});

test("RemoteInferenceSecrets rejects blank keys and clears stored keys", async () => {
    const storage = new MemorySecretStorage();
    const secrets = new RemoteInferenceSecrets(storage);

    await assert.rejects(() => secrets.storeApiKey("   "), /API key cannot be blank/);

    await secrets.storeApiKey("sk-test");
    await secrets.clearApiKey();

    assert.equal(await secrets.getApiKey(), undefined);
    assert.equal(await secrets.hasApiKey(), false);
    assert.equal(storage.values.has(MCP_API_KEY_SECRET_KEY), false);
});
