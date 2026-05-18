import Parser from "tree-sitter";

import { getParser } from "./getParser";
import { selectTopFunction } from "./topFunctionDetection";

/**
 * Collect local array declarations inside the selected top function.
 */
export function findArrayList(code: string, topFunctionName = selectTopFunction(code)): string[] {
    if (!topFunctionName) {
        return [];
    }

    const parser = getParser();
    const tree = parser.parse(code);
    const topNode = findFunctionNode(tree.rootNode, code, topFunctionName);

    if (!topNode) {
        return [];
    }

    const arrayNames = new Set<string>();
    for (const declaration of topNode.descendantsOfType("declaration")) {
        for (const arrayDeclarator of declaration.descendantsOfType("array_declarator")) {
            const identifier = firstDescendantOfType(arrayDeclarator, "identifier");
            if (identifier) {
                arrayNames.add(nodeText(identifier, code));
            }
        }
    }

    return [...arrayNames];
}

function findFunctionNode(
    rootNode: Parser.SyntaxNode,
    sourceCode: string,
    functionName: string
): Parser.SyntaxNode | undefined {
    for (const node of rootNode.namedChildren) {
        if (node.type === "function_definition" && getFunctionName(node, sourceCode) === functionName) {
            return node;
        }
    }

    return undefined;
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
