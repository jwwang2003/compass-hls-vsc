import * as vscode from "vscode";
import * as yaml from "js-yaml";

import { discoverTdmCandidates } from "./tdmDiscovery";
import { cloneConfig, serializeConfig } from "./tdmConfigIO";
import {
    addVariableToConfig,
    applyAutoDiscovery,
    createDefaultConfig,
    functionConfigKey,
    isFunctionSelected,
    isLoopDirectiveSelected,
    isParamSelected,
    isSelectedTopFunctionRef,
    isVariableOperationSelected,
    LOOP_DIRECTIVES,
    loopConfigKey,
    normalizeConfig,
    paramConfigKey,
    pruneDisabledCandidates,
    setLoopDirectivesInConfig,
    setParamsInConfig,
    toggleFunctionInConfig,
    toggleLoopDirectiveInConfig,
    toggleParamInConfig,
    toggleVariableInConfig,
    type TdmConfigSchema,
} from "./tdmConfigModel";
import { LazyTextWriter } from "../utilities/lazyTextWriter";

interface CompassSelectionState {
    autoDiscover: boolean;
    disabled: string[];
}

interface ConfigCacheEntry {
    config: TdmConfigSchema;
    exists: boolean;
    serialized: string;
}

export class TdmConfigService {
    private static readonly WRITE_DELAY_MS = 150;
    private state: CompassSelectionState = {
        autoDiscover: true,
        disabled: [],
    };
    private readonly configCache = new Map<string, ConfigCacheEntry>();
    private readonly configWriter = new LazyTextWriter<string>(
        TdmConfigService.WRITE_DELAY_MS,
        error => vscode.window.showErrorMessage(`Compass failed to save config.yaml: ${getErrorMessage(error)}`)
    );
    private readonly selectionStateWriter = new LazyTextWriter<string>(
        TdmConfigService.WRITE_DELAY_MS,
        error => vscode.window.showErrorMessage(`Compass failed to save selection state: ${getErrorMessage(error)}`)
    );

    constructor(private readonly context: vscode.ExtensionContext) { }

    public async initialize() {
        this.state = await this.readSelectionState();
    }

    public get autoDiscoverEnabled(): boolean {
        return this.state.autoDiscover;
    }

    public async toggleAutoDiscover(): Promise<boolean> {
        this.state.autoDiscover = !this.state.autoDiscover;
        await this.saveSelectionState();
        return this.state.autoDiscover;
    }

    public async autoDiscoverDocument(document: vscode.TextDocument, directory?: vscode.Uri): Promise<boolean> {
        if (!this.state.autoDiscover || document.languageId !== "c") {
            return false;
        }

        const config = await this.readConfig(directory);
        const candidates = discoverTdmCandidates(document);
        applyAutoDiscovery(config, candidates, this.isDisabled.bind(this));
        return this.writeConfig(config, directory);
    }

    public async pruneDisabledDocumentItems(document: vscode.TextDocument, directory?: vscode.Uri): Promise<boolean> {
        const config = await this.readConfig(directory);
        const candidates = discoverTdmCandidates(document);
        pruneDisabledCandidates(config, candidates, this.isDisabled.bind(this));

        return this.writeConfig(config, directory);
    }

    public async getSelectionSnapshot(directory?: vscode.Uri): Promise<TdmConfigSchema> {
        return this.readConfig(directory);
    }

    public async isFunctionSelected(name: string): Promise<boolean> {
        const config = await this.readConfig();
        return isFunctionSelected(config, name);
    }

    public async isParamSelected(ref: string): Promise<boolean> {
        const config = await this.readConfig();
        return isParamSelected(config, ref);
    }

    public async isLoopDirectiveSelected(group: string, directive: string, ref: string): Promise<boolean> {
        const config = await this.readConfig();
        return isLoopDirectiveSelected(config, group, directive, ref);
    }

    public async toggleFunction(name: string): Promise<boolean> {
        const config = await this.readConfig();
        if (!this.canChangeFunction(config, name)) {
            return false;
        }

        const key = functionConfigKey(name);
        if (toggleFunctionInConfig(config, name) === "disabled") {
            this.disable(key);
        } else {
            this.enable(key);
        }
        const wroteConfig = await this.writeConfig(config);
        await this.saveSelectionState();
        return wroteConfig;
    }

    public async toggleParam(ref: string): Promise<boolean> {
        const config = await this.readConfig();
        if (!isSelectedTopFunctionRef(config, ref) && !isParamSelected(config, ref)) {
            return false;
        }

        const key = paramConfigKey(ref);
        if (toggleParamInConfig(config, ref) === "disabled") {
            this.disable(key);
        } else {
            this.enable(key);
        }
        const wroteConfig = await this.writeConfig(config);
        await this.saveSelectionState();
        return wroteConfig;
    }

    public async setParams(refs: readonly string[], selectedRefs: readonly string[]): Promise<boolean> {
        const config = await this.readConfig();
        const allowedRefs = refs.filter(ref => isSelectedTopFunctionRef(config, ref) || isParamSelected(config, ref));
        if (allowedRefs.length === 0 && refs.length > 0) {
            return false;
        }

        const allowedRefSet = new Set(allowedRefs);
        const allowedSelectedRefs = selectedRefs.filter(ref =>
            allowedRefSet.has(ref) && isSelectedTopFunctionRef(config, ref)
        );
        const selected = new Set(allowedSelectedRefs);

        setParamsInConfig(config, allowedRefs, allowedSelectedRefs);
        for (const ref of allowedRefs) {
            const key = paramConfigKey(ref);
            if (selected.has(ref)) {
                this.enable(key);
            } else {
                this.disable(key);
            }
        }

        const wroteConfig = await this.writeConfig(config);
        await this.saveSelectionState();
        return wroteConfig;
    }

    public async toggleLoopDirective(group: string, directive: string, ref: string): Promise<boolean> {
        const config = await this.readConfig();
        if (!isSelectedTopFunctionRef(config, ref) && !isLoopDirectiveSelected(config, group, directive, ref)) {
            return false;
        }

        const key = loopConfigKey(group, directive, ref);
        if (toggleLoopDirectiveInConfig(config, group, directive, ref) === "disabled") {
            this.disable(key);
        } else {
            this.enable(key);
        }
        const wroteConfig = await this.writeConfig(config);
        await this.saveSelectionState();
        return wroteConfig;
    }

    public async setLoopDirectives(
        group: string,
        ref: string,
        directives: readonly string[]
    ): Promise<boolean> {
        const config = await this.readConfig();
        const selectedDirectives = LOOP_DIRECTIVES.filter(directive =>
            isLoopDirectiveSelected(config, group, directive, ref)
        );
        const canWriteSelectedTop = isSelectedTopFunctionRef(config, ref);
        if (!canWriteSelectedTop && selectedDirectives.length === 0) {
            return false;
        }

        const enabled = new Set(canWriteSelectedTop ? directives : []);

        setLoopDirectivesInConfig(config, group, ref, [...enabled]);
        for (const directive of LOOP_DIRECTIVES) {
            const key = loopConfigKey(group, directive, ref);
            if (enabled.has(directive)) {
                this.enable(key);
            } else {
                this.disable(key);
            }
        }

        const wroteConfig = await this.writeConfig(config);
        await this.saveSelectionState();
        return wroteConfig;
    }

    public async addVariable(name: string, operation = "add", typeName = "int"): Promise<boolean> {
        const config = await this.readConfig();
        if (!isSelectedTopFunctionRef(config, name)) {
            return false;
        }

        addVariableToConfig(config, name, operation, typeName);
        return this.writeConfig(config);
    }

    public async toggleVariable(name: string, operation = "add", typeName = "int"): Promise<boolean> {
        const config = await this.readConfig();
        if (!isSelectedTopFunctionRef(config, name)
            && !isVariableOperationSelected(config, name, operation, typeName)) {
            return false;
        }

        toggleVariableInConfig(config, name, operation, typeName);
        return this.writeConfig(config);
    }

    public invalidateConfigCache(uri?: vscode.Uri) {
        if (!uri) {
            this.configCache.clear();
            return;
        }

        const key = uri.toString();
        if (!this.configWriter.hasPending(key)) {
            this.configCache.delete(key);
        }
    }

    public async flushPendingWrites(): Promise<void> {
        await Promise.all([
            this.configWriter.flush(),
            this.selectionStateWriter.flush(),
        ]);
    }

    public dispose() {
        this.configWriter.dispose();
        this.selectionStateWriter.dispose();
    }

    private async readConfig(directory?: vscode.Uri): Promise<TdmConfigSchema> {
        const configUri = this.getConfigUri(directory);
        if (!configUri) {
            return createDefaultConfig();
        }

        const cacheKey = configUri.toString();
        const cached = this.configCache.get(cacheKey);
        if (cached) {
            return cloneConfig(cached.config);
        }

        try {
            const bytes = await vscode.workspace.fs.readFile(configUri);
            const parsed = yaml.load(Buffer.from(bytes).toString("utf8")) as Partial<TdmConfigSchema> | undefined;
            const config = normalizeConfig(parsed);
            this.configCache.set(cacheKey, {
                config: cloneConfig(config),
                exists: true,
                serialized: serializeConfig(config),
            });
            return cloneConfig(config);
        } catch {
            const config = createDefaultConfig();
            this.configCache.set(cacheKey, {
                config: cloneConfig(config),
                exists: false,
                serialized: serializeConfig(config),
            });
            return config;
        }
    }

    private async writeConfig(config: TdmConfigSchema, directory?: vscode.Uri): Promise<boolean> {
        const configUri = this.getConfigUri(directory);
        if (!configUri) {
            return false;
        }

        const normalized = normalizeConfig(config);
        const text = serializeConfig(normalized);
        const cacheKey = configUri.toString();
        const cached = this.configCache.get(cacheKey);
        if (cached?.exists && cached.serialized === text) {
            this.configCache.set(cacheKey, {
                config: cloneConfig(normalized),
                exists: true,
                serialized: text,
            });
            return false;
        }

        this.configCache.set(cacheKey, {
            config: cloneConfig(normalized),
            exists: true,
            serialized: text,
        });
        this.configWriter.queue(cacheKey, text, async latestText => {
            await vscode.workspace.fs.createDirectory(this.getConfigDirectoryUri(directory));
            await vscode.workspace.fs.writeFile(configUri, Buffer.from(latestText, "utf8"));
        });
        return true;
    }

    private getConfigUri(directory?: vscode.Uri): vscode.Uri | undefined {
        const base = directory ?? vscode.workspace.workspaceFolders?.[0]?.uri;
        return base ? vscode.Uri.joinPath(base, "config.yaml") : undefined;
    }

    private async readSelectionState(): Promise<CompassSelectionState> {
        try {
            const bytes = await vscode.workspace.fs.readFile(this.stateUri());
            const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as Partial<CompassSelectionState>;
            return {
                autoDiscover: parsed.autoDiscover ?? true,
                disabled: Array.isArray(parsed.disabled) ? parsed.disabled : [],
            };
        } catch {
            return { autoDiscover: true, disabled: [] };
        }
    }

    private async saveSelectionState() {
        const uri = this.stateUri();
        const text = JSON.stringify(this.state, null, 2);
        this.selectionStateWriter.queue(uri.toString(), text, async latestText => {
            await vscode.workspace.fs.createDirectory(this.stateDirectoryUri());
            await vscode.workspace.fs.writeFile(uri, Buffer.from(latestText, "utf8"));
        });
    }

    private stateUri(): vscode.Uri {
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (workspaceUri) {
            return vscode.Uri.joinPath(workspaceUri, ".compass", "tdm-selection.json");
        }
        return vscode.Uri.joinPath(this.context.globalStorageUri, "tdm-selection.json");
    }

    private getConfigDirectoryUri(directory?: vscode.Uri): vscode.Uri {
        return directory ?? vscode.workspace.workspaceFolders?.[0]?.uri ?? this.context.globalStorageUri;
    }

    private isDisabled(key: string): boolean {
        return this.state.disabled.includes(key);
    }

    private canChangeFunction(config: TdmConfigSchema, name: string): boolean {
        return isSelectedTopFunctionRef(config, name) || isFunctionSelected(config, name);
    }

    private disable(key: string) {
        addUnique(this.state.disabled, key);
    }

    private enable(key: string) {
        removeItem(this.state.disabled, key);
    }

    private stateDirectoryUri(): vscode.Uri {
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        return workspaceUri ? vscode.Uri.joinPath(workspaceUri, ".compass") : this.context.globalStorageUri;
    }
}

function addUnique(values: string[], item: string) {
    if (!values.includes(item)) {
        values.push(item);
    }
}

function removeItem(values: string[], item: string) {
    const index = values.indexOf(item);
    if (index >= 0) {
        values.splice(index, 1);
    }
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
