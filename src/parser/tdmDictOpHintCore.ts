import {
    createLoopCandidateFromNode,
    rangeFromNodeLike,
    type SourceRange,
    type SyntaxNodeLike,
} from "./tdmDiscoveryCore";

interface SyntaxNodeWithTreeLinks extends SyntaxNodeLike {
    children?: Array<SyntaxNodeWithTreeLinks | null>;
    firstNamedChild?: SyntaxNodeWithTreeLinks | null;
    isNamed?: boolean;
    parent?: SyntaxNodeWithTreeLinks | null;
    equals?: (other: SyntaxNodeWithTreeLinks) => boolean;
    childForFieldName?: (name: string) => SyntaxNodeWithTreeLinks | null;
    namedChildren: Array<SyntaxNodeWithTreeLinks | null>;
}

export interface DictOpIntHint {
    configKey: string;
    loopRef: string;
    operation: string;
    range: SourceRange;
    variableName: string;
}

const OPERATOR_TO_CONFIG: Record<string, string> = {
    "+": "add",
    "+=": "add",
    "++": "add",
    "-": "sub",
    "-=": "sub",
    "--": "sub",
    "*": "mul",
    "*=": "mul",
    "/": "div",
    "/=": "div",
};
const OPERATOR_TEXTS = new Set([...Object.keys(OPERATOR_TO_CONFIG), "="]);

export function discoverDictOpIntHintsFromRoot(rootNode: SyntaxNodeLike): DictOpIntHint[] {
    const hints: DictOpIntHint[] = [];
    const seen = new Set<string>();

    visit(rootNode as SyntaxNodeWithTreeLinks, node => {
        if (node.type !== "identifier" || isFunctionCallTarget(node)) {
            return;
        }

        const hint = createDictOpIntHintFromIdentifier(node);
        if (!hint) {
            return;
        }

        const key = `${node.startIndex}:${node.endIndex}:${hint.configKey}:${hint.operation}`;
        if (!seen.has(key)) {
            seen.add(key);
            hints.push(hint);
        }
    });

    return hints;
}

export function createDictOpIntHintFromIdentifier(node: SyntaxNodeLike): DictOpIntHint | undefined {
    if (node.type !== "identifier") {
        return undefined;
    }

    const linkedNode = node as SyntaxNodeWithTreeLinks;
    if (isFunctionCallTarget(linkedNode)) {
        return undefined;
    }

    const loopNode = findAncestor(linkedNode, "for_statement");
    const functionNode = findAncestor(linkedNode, "function_definition");
    if (!loopNode || !functionNode) {
        return undefined;
    }

    const operation = findVariableOperation(linkedNode, loopNode);
    if (!operation) {
        return undefined;
    }

    const functionName = getFunctionName(functionNode);
    if (!functionName) {
        return undefined;
    }

    const loop = createLoopCandidateFromNode(loopNode, functionName, getLoopLabel(loopNode));
    const variableName = nodeText(linkedNode);
    const configKey = `${loop.ref} ${variableName}`;

    return {
        configKey,
        loopRef: loop.ref,
        operation,
        range: rangeFromNodeLike(linkedNode),
        variableName,
    };
}

function visit(node: SyntaxNodeWithTreeLinks, visitor: (node: SyntaxNodeWithTreeLinks) => void) {
    visitor(node);
    for (const child of namedChildren(node)) {
        visit(child, visitor);
    }
}

function findAncestor(node: SyntaxNodeWithTreeLinks, type: string): SyntaxNodeWithTreeLinks | null {
    let current = node.parent ?? null;
    while (current) {
        if (current.type === type) {
            return current;
        }
        current = current.parent ?? null;
    }
    return null;
}

function findVariableOperation(node: SyntaxNodeWithTreeLinks, stopNode: SyntaxNodeWithTreeLinks): string | undefined {
    let current = node.parent ?? null;
    while (current) {
        if (current.type === "update_expression" && containsNode(current, node)) {
            return OPERATOR_TO_CONFIG[getOperatorText(current)];
        }

        if (current.type === "assignment_expression") {
            const operation = getAssignmentOperation(current, node);
            if (operation) {
                return operation;
            }
        }

        if (nodeEquals(current, stopNode)) {
            return undefined;
        }
        current = current.parent ?? null;
    }

    return undefined;
}

function isFunctionCallTarget(node: SyntaxNodeWithTreeLinks): boolean {
    const parent = node.parent;
    if (parent?.type !== "call_expression") {
        return false;
    }

    const functionNode = getField(parent, "function");
    return Boolean(functionNode && nodeEquals(functionNode, node));
}

function getFunctionName(functionNode: SyntaxNodeWithTreeLinks): string | undefined {
    const declarator = getField(functionNode, "declarator");
    return firstDescendantOfType(declarator, "identifier")?.text;
}

function getLoopLabel(loopNode: SyntaxNodeWithTreeLinks): string | undefined {
    const parent = loopNode.parent;
    if (parent?.type !== "labeled_statement") {
        return undefined;
    }

    return parent.firstNamedChild?.text ?? namedChildren(parent)[0]?.text;
}

function getAssignmentOperation(
    assignmentNode: SyntaxNodeWithTreeLinks,
    identifier: SyntaxNodeWithTreeLinks
): string | undefined {
    const operator = getOperatorText(assignmentNode);
    const left = getField(assignmentNode, "left") ?? namedChildren(assignmentNode)[0];
    const target = getScalarTargetIdentifier(left);
    if (!target || !nodeEquals(target, identifier)) {
        return undefined;
    }

    if (operator !== "=") {
        return OPERATOR_TO_CONFIG[operator];
    }

    const right = getField(assignmentNode, "right") ?? namedChildren(assignmentNode)[1];
    if (!right || !containsIdentifier(right, nodeText(target))) {
        return undefined;
    }

    const binaryNode = right.type === "binary_expression"
        ? right
        : firstDescendantOfType(right, "binary_expression");
    if (!binaryNode) {
        return undefined;
    }

    return OPERATOR_TO_CONFIG[getOperatorText(binaryNode)];
}

function getScalarTargetIdentifier(node: SyntaxNodeWithTreeLinks | null | undefined): SyntaxNodeWithTreeLinks | undefined {
    if (node?.type === "identifier") {
        return node;
    }

    return undefined;
}

function getOperatorText(operationNode: SyntaxNodeWithTreeLinks): string {
    const operatorNode = getField(operationNode, "operator")
        ?? children(operationNode).find(child => !child.isNamed && OPERATOR_TEXTS.has(nodeText(child)));

    return operatorNode ? nodeText(operatorNode) : "";
}

function containsIdentifier(node: SyntaxNodeWithTreeLinks, name: string): boolean {
    if (node.type === "identifier" && nodeText(node) === name) {
        return true;
    }

    return namedChildren(node).some(child => containsIdentifier(child, name));
}

function containsNode(container: SyntaxNodeWithTreeLinks, target: SyntaxNodeWithTreeLinks): boolean {
    return nodeEquals(container, target)
        || (container.startIndex <= target.startIndex && target.endIndex <= container.endIndex);
}

function firstDescendantOfType(
    node: SyntaxNodeWithTreeLinks | null | undefined,
    type: string
): SyntaxNodeWithTreeLinks | undefined {
    if (!node) {
        return undefined;
    }

    if (node.type === type) {
        return node;
    }

    const descendants = node.descendantsOfType?.(type) ?? [];
    const descendant = descendants[0] as SyntaxNodeWithTreeLinks | undefined;
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

function getField(node: SyntaxNodeWithTreeLinks | null | undefined, name: string): SyntaxNodeWithTreeLinks | undefined {
    if (!node) {
        return undefined;
    }

    const child = node.childForFieldName?.(name);
    if (child) {
        return child;
    }

    const fieldName = `${name}Node` as keyof SyntaxNodeWithTreeLinks;
    const fieldValue = node[fieldName];
    return isNode(fieldValue) ? fieldValue : undefined;
}

function children(node: SyntaxNodeWithTreeLinks): SyntaxNodeWithTreeLinks[] {
    return node.children?.filter(isNode) ?? [];
}

function namedChildren(node: SyntaxNodeWithTreeLinks | null | undefined): SyntaxNodeWithTreeLinks[] {
    return node?.namedChildren.filter(isNode) ?? [];
}

function isNode(value: unknown): value is SyntaxNodeWithTreeLinks {
    return Boolean(value && typeof value === "object" && "type" in value);
}

function nodeText(node: SyntaxNodeWithTreeLinks): string {
    return node.text ?? "";
}

function nodeEquals(a: SyntaxNodeWithTreeLinks, b: SyntaxNodeWithTreeLinks): boolean {
    return a.equals?.(b) ?? (a.startIndex === b.startIndex && a.endIndex === b.endIndex && a.type === b.type);
}
