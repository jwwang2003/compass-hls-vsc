import Parser from "tree-sitter";

import { getParser } from "./getParser";
import { selectTopFunction } from "./topFunctionDetection";

/**
 * Collect local function calls made directly inside the selected top function.
 */
export function collectFunctionList(code: string, topFunctionName = selectTopFunction(code)): string[] {
    if (!topFunctionName) {
        return [];
    }

    const parser = getParser();
    const tree = parser.parse(code);
    const functions = collectFunctionNodes(tree.rootNode, code);
    const topNode = functions.get(topFunctionName);

    if (!topNode) {
        return [];
    }

    const localCalls = new Set<string>();
    const localFunctionNames = new Set(functions.keys());

    for (const callNode of topNode.descendantsOfType("call_expression")) {
        const functionNode = getField(callNode, "function") ?? callNode.namedChildren[0];
        if (!functionNode || functionNode.type !== "identifier") {
            continue;
        }

        const calledFunction = nodeText(functionNode, code);
        if (localFunctionNames.has(calledFunction) && calledFunction !== topFunctionName) {
            localCalls.add(calledFunction);
        }
    }

    return [...localCalls].sort();
}

function collectFunctionNodes(rootNode: Parser.SyntaxNode, sourceCode: string): Map<string, Parser.SyntaxNode> {
    const functions = new Map<string, Parser.SyntaxNode>();

    for (const node of rootNode.namedChildren) {
        if (node.type !== "function_definition") {
            continue;
        }

        const name = getFunctionName(node, sourceCode);
        if (name) {
            functions.set(name, node);
        }
    }

    return functions;
}

function getFunctionName(node: Parser.SyntaxNode, sourceCode: string): string | undefined {
    const declarator = getField(node, "declarator")
        ?? node.namedChildren.find(child => child.type === "function_declarator");
    const identifier = firstDescendantOfType(declarator, "identifier");
    return identifier ? nodeText(identifier, sourceCode) : undefined;
}

function getField(node: Parser.SyntaxNode | null | undefined, name: string): Parser.SyntaxNode | null {
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

function nodeText(node: Parser.SyntaxNode, sourceCode: string): string {
    return sourceCode.slice(node.startIndex, node.endIndex);
}
