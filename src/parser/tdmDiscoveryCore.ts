export interface SourcePosition {
    row: number;
    column: number;
}

export interface SourceRange {
    start: SourcePosition;
    end: SourcePosition;
}

export interface SyntaxNodeLike {
    type: string;
    text?: string;
    startPosition: SourcePosition;
    endPosition: SourcePosition;
    startIndex: number;
    endIndex: number;
    namedChildren: Array<SyntaxNodeLike | null>;
    childForFieldName?: (name: string) => SyntaxNodeLike | null;
    descendantsOfType?: (types: string | string[]) => Array<SyntaxNodeLike | null>;
    bodyNode?: SyntaxNodeLike | null;
    declaratorNode?: SyntaxNodeLike | null;
    parametersNode?: SyntaxNodeLike | null;
}

export interface FunctionCandidateCore {
    name: string;
    range: SourceRange;
    parameters: ParameterCandidateCore[];
}

export interface ParameterCandidateCore {
    functionName: string;
    name: string;
    ref: string;
    range: SourceRange;
}

export interface LoopCandidateCore {
    functionName: string;
    label: string;
    ref: string;
    group: string;
    range: SourceRange;
}

export interface TdmCandidatesCore {
    functions: FunctionCandidateCore[];
    parameters: ParameterCandidateCore[];
    loops: LoopCandidateCore[];
}

export function discoverTdmCandidatesFromRoot(rootNode: SyntaxNodeLike): TdmCandidatesCore {
    const candidates: TdmCandidatesCore = {
        functions: [],
        parameters: [],
        loops: [],
    };

    visit(rootNode, null, candidates);
    return candidates;
}

export function createLoopCandidateFromNode(
    node: SyntaxNodeLike,
    functionName: string,
    label?: string
): LoopCandidateCore {
    const cleanLabel = normalizeLoopLabel(label) ?? defaultLoopLabel(node);

    return {
        functionName,
        label: cleanLabel,
        ref: loopRef(functionName, cleanLabel),
        group: loopGroup(functionName, cleanLabel),
        range: rangeFromNodeLike(node),
    };
}

export function rangeFromNodeLike(node: SyntaxNodeLike): SourceRange {
    return {
        start: {
            row: node.startPosition.row,
            column: node.startPosition.column,
        },
        end: {
            row: node.endPosition.row,
            column: node.endPosition.column,
        },
    };
}

export function parameterRef(functionName: string, parameterName: string): string {
    return `${functionName} ${parameterName}`;
}

export function loopRef(functionName: string, loopLabel: string): string {
    return `${functionName}/${loopLabel}`;
}

export function loopGroup(functionName: string, loopLabel: string): string {
    return sanitizeGroupName(`group_${functionName}_${loopLabel}`);
}

export function normalizeLoopLabel(label?: string): string | undefined {
    const normalized = label?.replace(/:$/, "").trim();
    return normalized || undefined;
}

export function defaultLoopLabel(node: SyntaxNodeLike): string {
    return `loop_${node.startPosition.row + 1}`;
}

export function sanitizeGroupName(name: string): string {
    return name.replace(/[^A-Za-z0-9_]/g, "_");
}

function visit(
    node: SyntaxNodeLike,
    currentFunction: string | null,
    candidates: TdmCandidatesCore
) {
    if (node.type === "function_definition") {
        const functionInfo = getFunctionInfo(node);
        if (functionInfo) {
            candidates.functions.push({
                name: functionInfo.name,
                range: rangeFromNodeLike(functionInfo.identifier),
                parameters: functionInfo.parameters,
            });
            candidates.parameters.push(...functionInfo.parameters);

            const body = getField(node, "body") ?? namedChildren(node).find(child => child.type === "compound_statement");
            if (body) {
                for (const child of namedChildren(body)) {
                    visit(child, functionInfo.name, candidates);
                }
            }
            return;
        }
    }

    if (currentFunction && node.type === "labeled_statement") {
        const loop = namedChildren(node).find(child => child.type === "for_statement");
        if (loop) {
            const labelNode = namedChildren(node)[0];
            visitForStatement(loop, currentFunction, labelNode?.text, candidates);
            return;
        }
    }

    if (currentFunction && node.type === "for_statement") {
        visitForStatement(node, currentFunction, undefined, candidates);
        return;
    }

    for (const child of namedChildren(node)) {
        visit(child, currentFunction, candidates);
    }
}

function visitForStatement(
    node: SyntaxNodeLike,
    currentFunction: string,
    label: string | undefined,
    candidates: TdmCandidatesCore
) {
    candidates.loops.push(createLoopCandidateFromNode(node, currentFunction, label));

    for (const child of namedChildren(node)) {
        visit(child, currentFunction, candidates);
    }
}

function getFunctionInfo(
    node: SyntaxNodeLike
): { name: string; identifier: SyntaxNodeLike; parameters: ParameterCandidateCore[] } | null {
    const declarator = getField(node, "declarator")
        ?? namedChildren(node).find(child => child.type === "function_declarator");
    const identifier = firstDescendantOfType(declarator, "identifier");
    if (!identifier) {
        return null;
    }

    const functionName = nodeText(identifier);
    const parametersNode = getField(declarator, "parameters")
        ?? namedChildren(declarator).find(child => child.type === "parameter_list");
    const parameters: ParameterCandidateCore[] = [];

    if (parametersNode) {
        for (const param of namedChildren(parametersNode)) {
            if (param.type !== "parameter_declaration") {
                continue;
            }
            const paramId = getParameterIdentifier(param);
            if (paramId) {
                const name = nodeText(paramId);
                parameters.push({
                    functionName,
                    name,
                    ref: parameterRef(functionName, name),
                    range: rangeFromNodeLike(paramId),
                });
            }
        }
    }

    return { name: functionName, identifier, parameters };
}

function getParameterIdentifier(param: SyntaxNodeLike): SyntaxNodeLike | undefined {
    const declarator = getField(param, "declarator")
        ?? namedChildren(param).find(child => child.type.endsWith("declarator") || child.type === "identifier");

    return firstDescendantOfType(declarator, "identifier")
        ?? (declarator?.type === "identifier" ? declarator : undefined);
}

function firstDescendantOfType(node: SyntaxNodeLike | null | undefined, type: string): SyntaxNodeLike | undefined {
    if (!node) {
        return undefined;
    }
    if (node.type === type) {
        return node;
    }

    const descendants = node.descendantsOfType?.(type) ?? [];
    const descendant = descendants[0];
    if (descendant) {
        return descendant;
    }

    for (const child of namedChildren(node)) {
        const nested = firstDescendantOfType(child, type);
        if (nested) {
            return nested;
        }
    }

    return undefined;
}

function getField(node: SyntaxNodeLike | null | undefined, name: string): SyntaxNodeLike | undefined {
    if (!node) {
        return undefined;
    }

    const child = node.childForFieldName?.(name);
    if (child) {
        return child;
    }

    const fieldName = `${name}Node` as keyof SyntaxNodeLike;
    const fieldValue = node[fieldName];
    return isNode(fieldValue) ? fieldValue : undefined;
}

function namedChildren(node: SyntaxNodeLike | null | undefined): SyntaxNodeLike[] {
    return node?.namedChildren.filter(isNode) ?? [];
}

function isNode(value: unknown): value is SyntaxNodeLike {
    return Boolean(value && typeof value === "object" && "type" in value);
}

function nodeText(node: SyntaxNodeLike): string {
    return node.text ?? "";
}
