import Parser from "tree-sitter";

import { getParser } from "./getParser";

export interface TopFunctionSignal {
    name: string;
    order?: number;
    parameterCount?: number;
    interfaceParameterCount?: number;
    loopCount?: number;
    localCallCount?: number;
    calledByLocalFunctionCount?: number;
    calledByTestbenchCount?: number;
    calledOnlyByTestbench?: boolean;
    isRoot?: boolean;
    isStatic?: boolean;
}

export interface RankedTopFunction<T extends TopFunctionSignal = TopFunctionSignal> {
    candidate: T;
    score: number;
}

interface ParameterInfo {
    name: string;
    isInterfaceParameter: boolean;
}

interface FunctionInfo extends TopFunctionSignal {
    node: Parser.SyntaxNode;
    parameters: ParameterInfo[];
    localCalls: Set<string>;
    calledBy: Set<string>;
}

const LOOP_NODE_TYPES = new Set(["for_statement", "while_statement", "do_statement"]);
const INTERFACE_DECLARATOR_TYPES = new Set(["array_declarator", "pointer_declarator"]);

export function findLikelyTopFunctions(code: string): string[] {
    return rankTopFunctions(code).map(item => item.candidate.name);
}

export function selectTopFunction(code: string): string | undefined {
    return findLikelyTopFunctions(code)[0];
}

export function scoreCSourceForTopFunction(code: string): number {
    const candidate = rankTopFunctions(code)[0];
    return candidate?.score ?? Number.NEGATIVE_INFINITY;
}

export function rankTopFunctions(code: string): RankedTopFunction<FunctionInfo>[] {
    const parser = getParser();
    const tree = parser.parse(code);
    return rankTopFunctionSignals(extractFunctionInfo(tree.rootNode, code));
}

export function rankTopFunctionSignals<T extends TopFunctionSignal>(
    signals: readonly T[]
): RankedTopFunction<T>[] {
    return signals
        .map((candidate, index) => ({
            candidate,
            score: scoreTopFunctionSignal(candidate),
            index,
        }))
        .sort((a, b) => compareRankedTopFunctions(a, b))
        .map(({ candidate, score }) => ({ candidate, score }));
}

export function scoreTopFunctionSignal(signal: TopFunctionSignal): number {
    const parameterCount = signal.parameterCount ?? 0;
    const interfaceParameterCount = signal.interfaceParameterCount ?? 0;
    const loopCount = signal.loopCount ?? 0;
    const localCallCount = signal.localCallCount ?? 0;
    const calledByLocalFunctionCount = signal.calledByLocalFunctionCount ?? 0;
    const calledByTestbenchCount = signal.calledByTestbenchCount ?? 0;

    let score = 0;
    score += interfaceParameterCount * 25;
    score += loopCount * 12;
    score += parameterCount * 4;
    score += localCallCount * 3;

    if (signal.isRoot) {
        score += 6;
    }

    if (signal.calledOnlyByTestbench && calledByTestbenchCount > 0) {
        score += 14;
    } else if (calledByLocalFunctionCount > 0) {
        score -= calledByLocalFunctionCount * 10;
    }

    if (signal.isStatic) {
        score -= 5;
    }

    if (parameterCount === 0 && interfaceParameterCount === 0 && loopCount === 0 && localCallCount === 0) {
        score -= 8;
    }

    score += nameRoleScore(signal.name);
    return score;
}

function compareRankedTopFunctions<T extends TopFunctionSignal>(
    a: RankedTopFunction<T> & { index: number },
    b: RankedTopFunction<T> & { index: number }
): number {
    return b.score - a.score
        || (b.candidate.interfaceParameterCount ?? 0) - (a.candidate.interfaceParameterCount ?? 0)
        || (b.candidate.loopCount ?? 0) - (a.candidate.loopCount ?? 0)
        || (b.candidate.parameterCount ?? 0) - (a.candidate.parameterCount ?? 0)
        || (b.candidate.localCallCount ?? 0) - (a.candidate.localCallCount ?? 0)
        || (a.candidate.order ?? a.index) - (b.candidate.order ?? b.index);
}

function extractFunctionInfo(rootNode: Parser.SyntaxNode, sourceCode: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];

    for (const node of rootNode.namedChildren) {
        if (node.type !== "function_definition") {
            continue;
        }

        const info = getFunctionInfo(node, sourceCode, functions.length);
        if (info) {
            functions.push(info);
        }
    }

    const localNames = new Set(functions.map(fn => fn.name));
    const byName = new Map(functions.map(fn => [fn.name, fn]));

    for (const fn of functions) {
        fn.localCalls = new Set([...fn.localCalls].filter(name => localNames.has(name)));
        fn.localCallCount = fn.localCalls.size;

        for (const callee of fn.localCalls) {
            byName.get(callee)?.calledBy.add(fn.name);
        }
    }

    for (const fn of functions) {
        const callers = [...fn.calledBy];
        fn.calledByLocalFunctionCount = callers.length;
        fn.calledByTestbenchCount = callers.filter(isTestbenchName).length;
        fn.calledOnlyByTestbench = callers.length > 0 && callers.every(isTestbenchName);
        fn.isRoot = callers.length === 0;
    }

    return functions;
}

function getFunctionInfo(node: Parser.SyntaxNode, sourceCode: string, order: number): FunctionInfo | undefined {
    const declarator = getField(node, "declarator")
        ?? node.namedChildren.find(child => child.type === "function_declarator");
    const identifier = firstDescendantOfType(declarator, "identifier");
    if (!identifier) {
        return undefined;
    }

    const parameters = collectParameters(declarator, sourceCode);
    const calls = collectCalledFunctionNames(node, sourceCode);
    const loopCount = countDescendantTypes(node, LOOP_NODE_TYPES);
    const name = nodeText(identifier, sourceCode);

    return {
        name,
        node,
        order,
        parameters,
        parameterCount: parameters.length,
        interfaceParameterCount: parameters.filter(param => param.isInterfaceParameter).length,
        loopCount,
        localCalls: calls,
        localCallCount: calls.size,
        calledBy: new Set(),
        calledByLocalFunctionCount: 0,
        calledByTestbenchCount: 0,
        calledOnlyByTestbench: false,
        isRoot: false,
        isStatic: isStaticFunction(node, sourceCode),
    };
}

function collectParameters(
    declarator: Parser.SyntaxNode | null | undefined,
    sourceCode: string
): ParameterInfo[] {
    const parametersNode = getField(declarator, "parameters")
        ?? declarator?.namedChildren.find(child => child.type === "parameter_list");
    const parameters: ParameterInfo[] = [];

    if (!parametersNode) {
        return parameters;
    }

    for (const parameter of parametersNode.namedChildren) {
        if (parameter.type !== "parameter_declaration") {
            continue;
        }

        const declaratorNode = getField(parameter, "declarator")
            ?? parameter.namedChildren.find(child => child.type.endsWith("declarator") || child.type === "identifier");
        const identifier = firstDescendantOfType(declaratorNode, "identifier");

        if (identifier) {
            parameters.push({
                name: nodeText(identifier, sourceCode),
                isInterfaceParameter: hasDescendantOfType(declaratorNode, INTERFACE_DECLARATOR_TYPES),
            });
        }
    }

    return parameters;
}

function collectCalledFunctionNames(node: Parser.SyntaxNode, sourceCode: string): Set<string> {
    const calls = new Set<string>();

    for (const callNode of node.descendantsOfType("call_expression")) {
        const functionNode = getField(callNode, "function") ?? callNode.namedChildren[0];
        if (functionNode?.type === "identifier") {
            calls.add(nodeText(functionNode, sourceCode));
        }
    }

    return calls;
}

function getField(
    node: Parser.SyntaxNode | null | undefined,
    name: string
): Parser.SyntaxNode | null {
    if (!node) {
        return null;
    }

    const field = typeof (node as any).childForFieldName === "function"
        ? (node as any).childForFieldName(name)
        : null;
    if (field) {
        return field;
    }

    const nodeField = (node as any)[`${name}Node`];
    return nodeField && typeof nodeField === "object" ? nodeField : null;
}

function firstDescendantOfType(
    node: Parser.SyntaxNode | null | undefined,
    type: string
): Parser.SyntaxNode | null {
    if (!node) {
        return null;
    }

    if (node.type === type) {
        return node;
    }

    for (const child of node.namedChildren) {
        const match = firstDescendantOfType(child, type);
        if (match) {
            return match;
        }
    }

    return null;
}

function hasDescendantOfType(
    node: Parser.SyntaxNode | null | undefined,
    types: Set<string>
): boolean {
    if (!node) {
        return false;
    }

    if (types.has(node.type)) {
        return true;
    }

    return node.namedChildren.some(child => hasDescendantOfType(child, types));
}

function countDescendantTypes(node: Parser.SyntaxNode, types: Set<string>): number {
    let count = types.has(node.type) ? 1 : 0;

    for (const child of node.namedChildren) {
        count += countDescendantTypes(child, types);
    }

    return count;
}

function isStaticFunction(node: Parser.SyntaxNode, sourceCode: string): boolean {
    return node.namedChildren.some(child => {
        if (child.type !== "storage_class_specifier") {
            return false;
        }
        return nodeText(child, sourceCode) === "static";
    });
}

function nodeText(node: Parser.SyntaxNode, sourceCode: string): string {
    return sourceCode.slice(node.startIndex, node.endIndex);
}

function nameRoleScore(name: string): number {
    const normalized = name.toLowerCase();

    if (normalized === "main") {
        return -80;
    }

    if (isTestbenchName(normalized)) {
        return -35;
    }

    if (/(^|_)(helper|support|util|utility|common|stub|mock|golden|verify|check|print|dump|cleanup)($|_)/.test(normalized)) {
        return -25;
    }

    if (/(^|_)(init|setup|teardown)($|_)/.test(normalized)) {
        return -15;
    }

    return 0;
}

function isTestbenchName(name: string): boolean {
    const normalized = name.toLowerCase();
    return normalized === "main"
        || /(^|_)(test|tests|testbench|bench|tb|driver)($|_)/.test(normalized)
        || normalized.endsWith("_test")
        || normalized.endsWith("_tb");
}
