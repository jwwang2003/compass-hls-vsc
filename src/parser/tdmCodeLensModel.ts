import type { TdmCandidates } from "./tdmDiscovery";
import {
    isFunctionSelected,
    isLoopDirectiveSelected,
    isParamSelected,
    isSelectedTopFunctionRef,
    isVariableOperationSelected,
    LOOP_DIRECTIVES,
    type TdmConfigSchema,
} from "./tdmConfigModel";

export interface TdmCodeLensItem {
    range: unknown;
    title: string;
    command: string;
    arguments: unknown[];
}

export interface TdmCodeLensDictOpHint {
    configKey: string;
    loopRef: string;
    operation: string;
    range: unknown;
    variableName: string;
}

export interface TdmCodeLensDictOpPickArg {
    configKey: string;
    operation: string;
    variableName: string;
}

const CODE_LENS_PAIR_SPACING = "\u00a0\u00a0";

export function buildTdmCodeLensItems(
    candidates: TdmCandidates,
    config: TdmConfigSchema,
    dictOpHints: TdmCodeLensDictOpHint[] = []
): TdmCodeLensItem[] {
    const items: TdmCodeLensItem[] = [];

    for (const fn of candidates.functions.filter(fn => isSelectedTopFunctionRef(config, fn.name))) {
        const selected = isFunctionSelected(config, fn.name);
        items.push({
            range: fn.range,
            title: formatCodeLensPair(
                selected ? "$(check)" : "$(plus)",
                `${selected ? "Function in" : "Add function to"} config.yaml`
            ),
            command: "tdmOptimizer.toggleFunction",
            arguments: [fn.name],
        });
        if (fn.parameters.length > 0) {
            const selectedCount = fn.parameters.filter(param => isParamSelected(config, param.ref)).length;
            items.push({
                range: fn.range,
                title: `${formatCodeLensPair("$(list-selection)", "Params")}${CODE_LENS_PAIR_SPACING}${formatHighlightedCodeLensValue("symbol-method", fn.name)} (${selectedCount}/${fn.parameters.length})`,
                command: "tdmOptimizer.pickFunctionInterList",
                arguments: [
                    fn.name,
                    fn.parameters.map(param => ({
                        name: param.name,
                        ref: param.ref,
                    })),
                ],
            });
        }
    }

    for (const loop of candidates.loops.filter(loop => isSelectedTopFunctionRef(config, loop.ref))) {
        const selectedCount = LOOP_DIRECTIVES.filter(directive =>
            isLoopDirectiveSelected(config, loop.group, directive, loop.ref)
        ).length;
        items.push({
            range: loop.range,
            title: `${formatCodeLensPair("$(settings-gear)", "Directives")}${CODE_LENS_PAIR_SPACING}${formatHighlightedCodeLensValue("tag", loop.label)} (${selectedCount}/${LOOP_DIRECTIVES.length})`,
            command: "tdmOptimizer.pickLoopDirectives",
            arguments: [loop.group, loop.ref, loop.label],
        });
    }

    for (const group of groupDictOpHintsByLoop(dictOpHints.filter(hint => isSelectedTopFunctionRef(config, hint.configKey)))) {
        const firstHint = group.hints[0];
        const selectedCount = group.hints.filter(hint =>
            isVariableOperationSelected(config, hint.configKey, hint.operation, "int")
        ).length;
        items.push({
            range: firstHint.range,
            title: `${formatCodeLensPair("$(symbol-operator)", "Loop Ops")}${CODE_LENS_PAIR_SPACING}${formatHighlightedCodeLensValue("tag", group.loopRef)} (${selectedCount}/${group.hints.length})`,
            command: "tdmOptimizer.pickDictOpInt",
            arguments: [
                group.loopRef,
                group.hints.map(hint => ({
                    configKey: hint.configKey,
                    variableName: hint.variableName,
                    operation: hint.operation,
                })),
            ],
        });
    }

    return items;
}

function groupDictOpHintsByLoop(hints: readonly TdmCodeLensDictOpHint[]): {
    loopRef: string;
    hints: TdmCodeLensDictOpHint[];
}[] {
    const groups: {
        loopRef: string;
        hints: TdmCodeLensDictOpHint[];
        hintKeys: Set<string>;
    }[] = [];
    const groupByLoopRef = new Map<string, (typeof groups)[number]>();

    for (const hint of hints) {
        let group = groupByLoopRef.get(hint.loopRef);
        if (!group) {
            group = {
                loopRef: hint.loopRef,
                hints: [],
                hintKeys: new Set(),
            };
            groupByLoopRef.set(hint.loopRef, group);
            groups.push(group);
        }

        const hintKey = dictOpHintKey(hint);
        if (group.hintKeys.has(hintKey)) {
            continue;
        }

        group.hintKeys.add(hintKey);
        group.hints.push(hint);
    }

    return groups;
}

function dictOpHintKey(hint: TdmCodeLensDictOpHint): string {
    return JSON.stringify([hint.configKey, hint.operation]);
}

function formatCodeLensPair(icon: string, label: string): string {
    return `${icon}${label}`;
}

function formatHighlightedCodeLensValue(icon: string, value: string): string {
    return formatCodeLensPair(`$(${icon})`, `[${value}]`);
}

function hasItemOnLine(items: TdmCodeLensItem[], line: number | undefined): boolean {
    if (line === undefined) {
        return false;
    }

    return items.some(item => getRangeLine(item.range) === line);
}

function getRangeLine(range: unknown): number | undefined {
    if (!range || typeof range !== "object" || !("start" in range)) {
        return undefined;
    }

    const start = (range as { start?: { line?: unknown; row?: unknown } }).start;
    if (typeof start?.line === "number") {
        return start.line;
    }
    if (typeof start?.row === "number") {
        return start.row;
    }

    return undefined;
}
