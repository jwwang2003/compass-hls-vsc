export const DEFAULT_MCP_ENDPOINT = "http://localhost:8000/mcp";
export const MCP_API_KEY_SECRET_KEY = "compass.remoteInference.apiKey";

type MaybePromise<T> = T | PromiseLike<T>;

export interface SecretStorageLike {
    get(key: string): MaybePromise<string | undefined>;
    store(key: string, value: string): MaybePromise<void>;
    delete(key: string): MaybePromise<void>;
}

export interface RemoteInferenceConfig {
    endpoint: string;
    apiKeyStored: boolean;
}

export function normalizeMcpEndpoint(endpoint: string | undefined): string {
    const normalized = endpoint?.trim();
    return normalized ? normalized : DEFAULT_MCP_ENDPOINT;
}

export class RemoteInferenceSecrets {
    constructor(private readonly storage: SecretStorageLike) {}

    async getApiKey(): Promise<string | undefined> {
        const apiKey = await this.storage.get(MCP_API_KEY_SECRET_KEY);
        const normalized = apiKey?.trim();
        return normalized ? normalized : undefined;
    }

    async hasApiKey(): Promise<boolean> {
        const apiKey = await this.getApiKey();
        return Boolean(apiKey);
    }

    async storeApiKey(apiKey: string): Promise<void> {
        const normalized = apiKey.trim();
        if (!normalized) {
            throw new Error("API key cannot be blank.");
        }
        await this.storage.store(MCP_API_KEY_SECRET_KEY, normalized);
    }

    async clearApiKey(): Promise<void> {
        await this.storage.delete(MCP_API_KEY_SECRET_KEY);
    }
}
