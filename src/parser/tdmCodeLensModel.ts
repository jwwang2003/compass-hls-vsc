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
            title: `${selected ? "$(check)" : "$(plus)"} ${selected ? "Function in" : "Add function to"} config.yaml`,
            command: "tdmOptimizer.toggleFunction",
            arguments: [fn.name],
        });
        if (fn.parameters.length > 0) {
            const selectedCount = fn.parameters.filter(param => isParamSelected(config, param.ref)).length;
            items.push({
                range: fn.range,
                title: `$(list-selection) InterList ${formatHighlightedCodeLensValue("symbol-method", fn.name)} (${selectedCount}/${fn.parameters.length})`,
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
            title: `$(settings-gear) Directives ${formatHighlightedCodeLensValue("tag", loop.label)} (${selectedCount}/${LOOP_DIRECTIVES.length})`,
            command: "tdmOptimizer.pickLoopDirectives",
            arguments: [loop.group, loop.ref, loop.label],
        });
    }

    for (const hint of dictOpHints.filter(hint => isSelectedTopFunctionRef(config, hint.configKey))) {
        const separator = hasItemOnLine(items, getRangeLine(hint.range)) ? "| " : "";
        const selected = isVariableOperationSelected(config, hint.configKey, hint.operation, "int");
        items.push({
            range: hint.range,
            title: `${separator}${selected ? "$(check)" : "$(plus)"} dictOp.int ${formatHighlightedCodeLensValue("symbol-variable", hint.variableName)} ${hint.operation}`,
            command: "tdmOptimizer.toggleVariable",
            arguments: [hint.configKey, hint.operation, "int"],
        });
    }

    return items;
}

function formatHighlightedCodeLensValue(icon: string, value: string): string {
    return `$(${icon}) [${value}]`;
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
