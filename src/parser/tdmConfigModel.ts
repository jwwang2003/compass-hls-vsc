import type { TdmCandidates } from "./tdmDiscovery";

export type DictOpValue = Record<string, string[]> | string[];

export interface TdmConfigSchema {
    top: string[];
    funcList: string[];
    loopList: Record<string, Record<string, string[]>>;
    arrList: string[];
    interList: string[];
    dictOp: Record<string, DictOpValue>;
}

export type ToggleResult = "enabled" | "disabled";

export const AUTO_LOOP_DIRECTIVES = ["level", "unroll", "pipeline"] as const;
export const LOOP_DIRECTIVES = ["level", "unroll", "pipeline", "flatten"] as const;
const DICT_OP_TYPES = ["int", "float", "double", "half"] as const;

const DEFAULT_CONFIG: TdmConfigSchema = {
    top: [],
    funcList: [],
    loopList: {},
    arrList: [],
    interList: [],
    dictOp: {
        int: {},
        float: [],
        double: [],
        half: [],
    },
};

export function createDefaultConfig(): TdmConfigSchema {
    return cloneConfig(DEFAULT_CONFIG);
}

export function normalizeConfig(parsed: Partial<TdmConfigSchema> | undefined): TdmConfigSchema {
    return {
        top: normalizeStringArray(parsed?.top),
        funcList: normalizeStringArray(parsed?.funcList),
        loopList: normalizeLoopList(parsed?.loopList),
        arrList: normalizeStringArray(parsed?.arrList),
        interList: normalizeStringArray(parsed?.interList),
        dictOp: normalizeDictOp(parsed?.dictOp),
    };
}

export function applyAutoDiscovery(
    config: TdmConfigSchema,
    candidates: TdmCandidates,
    isDisabled: (key: string) => boolean
) {
    const targetFunctions = getAutoDiscoveryTargetFunctions(config, candidates);

    for (const fn of candidates.functions.filter(fn => targetFunctions.has(fn.name))) {
        if (!isDisabled(functionConfigKey(fn.name))) {
            addFunctionToConfig(config, fn.name);
        }
    }

    for (const param of candidates.parameters.filter(param => targetFunctions.has(param.functionName))) {
        if (!isDisabled(paramConfigKey(param.ref))) {
            addUnique(config.interList, param.ref);
        }
    }

    for (const loop of candidates.loops.filter(loop => targetFunctions.has(loop.functionName))) {
        for (const directive of AUTO_LOOP_DIRECTIVES) {
            if (!isDisabled(loopConfigKey(loop.group, directive, loop.ref))) {
                addLoopDirectiveToConfig(config, loop.group, directive, loop.ref);
            }
        }
    }
}

export function pruneDisabledCandidates(
    config: TdmConfigSchema,
    candidates: TdmCandidates,
    isDisabled: (key: string) => boolean
) {
    for (const fn of candidates.functions) {
        if (isDisabled(functionConfigKey(fn.name))) {
            removeItem(config.top, fn.name);
            removeItem(config.funcList, fn.name);
        }
    }

    for (const param of candidates.parameters) {
        if (isDisabled(paramConfigKey(param.ref))) {
            removeItem(config.interList, param.ref);
        }
    }

    for (const loop of candidates.loops) {
        for (const directive of LOOP_DIRECTIVES) {
            if (isDisabled(loopConfigKey(loop.group, directive, loop.ref))) {
                removeLoopDirectiveFromConfig(config, loop.group, directive, loop.ref);
            }
        }
    }
}

export function addFunctionToConfig(config: TdmConfigSchema, name: string) {
    if (config.top.length === 0) {
        config.top.push(name);
        return;
    }

    if (!config.top.includes(name)) {
        addUnique(config.funcList, name);
    }
}

export function toggleFunctionInConfig(config: TdmConfigSchema, name: string): ToggleResult {
    if (isFunctionSelected(config, name)) {
        removeItem(config.top, name);
        removeItem(config.funcList, name);
        return "disabled";
    }

    addFunctionToConfig(config, name);
    return "enabled";
}

export function toggleParamInConfig(config: TdmConfigSchema, ref: string): ToggleResult {
    if (isParamSelected(config, ref)) {
        removeItem(config.interList, ref);
        return "disabled";
    }

    addUnique(config.interList, ref);
    return "enabled";
}

export function setParamsInConfig(
    config: TdmConfigSchema,
    refs: readonly string[],
    selectedRefs: readonly string[]
) {
    for (const ref of refs) {
        removeItem(config.interList, ref);
    }
    for (const ref of selectedRefs) {
        addUnique(config.interList, ref);
    }
}

export function addLoopDirectiveToConfig(
    config: TdmConfigSchema,
    groupName: string,
    directive: string,
    ref: string
) {
    const group = ensureLoopGroup(config, groupName);

    if (!group[directive]) {
        group[directive] = [];
    }
    addUnique(group[directive], ref);
}

export function toggleLoopDirectiveInConfig(
    config: TdmConfigSchema,
    groupName: string,
    directive: string,
    ref: string
): ToggleResult {
    if (isLoopDirectiveSelected(config, groupName, directive, ref)) {
        removeLoopDirectiveFromConfig(config, groupName, directive, ref);
        return "disabled";
    }

    addLoopDirectiveToConfig(config, groupName, directive, ref);
    return "enabled";
}

export function setLoopDirectivesInConfig(
    config: TdmConfigSchema,
    groupName: string,
    ref: string,
    directives: readonly string[]
) {
    const enabled = new Set(directives);
    for (const directive of LOOP_DIRECTIVES) {
        if (enabled.has(directive)) {
            addLoopDirectiveToConfig(config, groupName, directive, ref);
        } else {
            removeLoopDirectiveFromConfig(config, groupName, directive, ref);
        }
    }
}

export function removeLoopDirectiveFromConfig(
    config: TdmConfigSchema,
    groupName: string,
    directive: string,
    ref: string
) {
    const group = config.loopList[groupName];
    if (!group?.[directive]) {
        return;
    }

    removeItem(group[directive], ref);

    const hasValues = Object.values(group).some(values => values.length > 0);
    if (!hasValues) {
        delete config.loopList[groupName];
    }
}

export function addVariableToConfig(
    config: TdmConfigSchema,
    key: string,
    operation = "add",
    typeName = "int"
) {
    const entries = ensureDictObject(config, typeName);
    if (!entries[key]) {
        entries[key] = [];
    }
    addUnique(entries[key], operation);
}

export function toggleVariableInConfig(
    config: TdmConfigSchema,
    key: string,
    operation = "add",
    typeName = "int"
): ToggleResult {
    if (isVariableOperationSelected(config, key, operation, typeName)) {
        removeVariableFromConfig(config, key, operation, typeName);
        return "disabled";
    }

    addVariableToConfig(config, key, operation, typeName);
    return "enabled";
}

export function removeVariableFromConfig(
    config: TdmConfigSchema,
    key: string,
    operation = "add",
    typeName = "int"
) {
    const entries = config.dictOp[typeName];
    if (!entries || Array.isArray(entries) || !entries[key]) {
        return;
    }

    removeItem(entries[key], operation);
    if (entries[key].length === 0) {
        delete entries[key];
    }
}

export function isFunctionSelected(config: TdmConfigSchema, name: string): boolean {
    return config.top.includes(name) || config.funcList.includes(name);
}

export function isParamSelected(config: TdmConfigSchema, ref: string): boolean {
    return config.interList.includes(ref);
}

export function isLoopDirectiveSelected(
    config: TdmConfigSchema,
    groupName: string,
    directive: string,
    ref: string
): boolean {
    return Boolean(config.loopList[groupName]?.[directive]?.includes(ref));
}

export function isVariableOperationSelected(
    config: TdmConfigSchema,
    key: string,
    operation = "add",
    typeName = "int"
): boolean {
    const entries = config.dictOp[typeName];
    return Boolean(entries && !Array.isArray(entries) && entries[key]?.includes(operation));
}

export function isSelectedTopFunctionRef(config: TdmConfigSchema, ref: string): boolean {
    if (config.top.length === 0) {
        return true;
    }

    const functionName = functionNameFromConfigRef(ref);
    return Boolean(functionName && config.top.includes(functionName));
}

export function functionConfigKey(name: string): string {
    return `function:${name}`;
}

export function paramConfigKey(ref: string): string {
    return `param:${ref}`;
}

export function loopConfigKey(groupName: string, directive: string, ref: string): string {
    return `loop:${groupName}:${directive}:${ref}`;
}

function ensureLoopGroup(config: TdmConfigSchema, groupName: string): Record<string, string[]> {
    const group = config.loopList[groupName] ?? {
        level: [],
        unroll: [],
        pipeline: [],
        flatten: [],
    };
    config.loopList[groupName] = group;
    return group;
}

function getAutoDiscoveryTargetFunctions(config: TdmConfigSchema, candidates: TdmCandidates): Set<string> {
    if (config.top.length > 0) {
        return new Set(config.top);
    }

    const firstFunction = candidates.functions[0]?.name;
    return new Set(firstFunction ? [firstFunction] : []);
}

function functionNameFromConfigRef(ref: string): string | undefined {
    const separatorIndex = ref.search(/[ /]/);
    if (separatorIndex < 0) {
        return ref || undefined;
    }
    if (separatorIndex === 0) {
        return undefined;
    }
    return ref.slice(0, separatorIndex);
}

function ensureDictObject(config: TdmConfigSchema, typeName: string): Record<string, string[]> {
    const current = config.dictOp[typeName];
    if (!current || Array.isArray(current)) {
        config.dictOp[typeName] = {};
    }
    return config.dictOp[typeName] as Record<string, string[]>;
}

function normalizeDictOp(value: TdmConfigSchema["dictOp"] | undefined): TdmConfigSchema["dictOp"] {
    const normalized: TdmConfigSchema["dictOp"] = {};

    for (const typeName of DICT_OP_TYPES) {
        const typeValue = value?.[typeName];
        normalized[typeName] = normalizeDictOpType(typeValue, typeName === "int");
    }

    for (const [typeName, typeValue] of Object.entries(value ?? {})) {
        if ((DICT_OP_TYPES as readonly string[]).includes(typeName)) {
            continue;
        }
        normalized[typeName] = normalizeDictOpType(typeValue, false);
    }

    return normalized;
}

function normalizeDictOpType(value: unknown, preferObjectWhenEmpty: boolean): DictOpValue {
    if (Array.isArray(value)) {
        return normalizeStringArray(value);
    }

    if (value && typeof value === "object") {
        const entries: Record<string, string[]> = {};
        for (const [key, operations] of Object.entries(value)) {
            const normalizedOperations = normalizeStringArray(operations);
            if (normalizedOperations.length > 0) {
                entries[key] = normalizedOperations;
            }
        }

        if (Object.keys(entries).length > 0 || preferObjectWhenEmpty) {
            return entries;
        }
    }

    return preferObjectWhenEmpty ? {} : [];
}

function normalizeLoopList(value: TdmConfigSchema["loopList"] | undefined): TdmConfigSchema["loopList"] {
    if (!value || typeof value !== "object") {
        return {};
    }

    const normalized: TdmConfigSchema["loopList"] = {};
    for (const [groupName, directives] of Object.entries(value)) {
        if (!directives || typeof directives !== "object") {
            continue;
        }

        normalized[groupName] = {};
        for (const [directive, refs] of Object.entries(directives)) {
            normalized[groupName][directive] = normalizeStringArray(refs);
        }
    }
    return normalized;
}

function normalizeStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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

function cloneConfig(config: TdmConfigSchema): TdmConfigSchema {
    return JSON.parse(JSON.stringify(config)) as TdmConfigSchema;
}
