import Parser from 'tree-sitter';

/**
 * 自动检测顶层函数（最外层调用者）
 * @param rootNode AST 根节点
 * @param sourceCode C 源码字符串
 * @returns [顶层函数名, 调用关系映射]
 */
export function detectTopFunctionViaCallGraph(rootNode: Parser.SyntaxNode, sourceCode: string): [string | null, Record<string, Set<string>>] {
    const calls: Record<string, Set<string>> = {};
    const definedFunctions = new Set<string>();

    function extractIdentifierFromDeclarator(declaratorNode: Parser.SyntaxNode | null): string | null {
        if (!declaratorNode) {return null;}
        const stack = [declaratorNode];
        while (stack.length) {
            const node = stack.pop()!;
            if (node.type === 'identifier') {
                return sourceCode.slice(node.startIndex, node.endIndex);
            }
            stack.push(...node.namedChildren.reverse());
        }
        return null;
    }

    function traverse(n: Parser.SyntaxNode | null, currentFunction: string | null = null) {
        if (!n) {return;}
        if (n.type === 'function_definition') {
            let declarator = null;
            if (n && typeof (n as any).childForFieldName === 'function') {
                // @ts-ignore
                declarator = (n as any).childForFieldName('declarator');
            }
            const functionName = extractIdentifierFromDeclarator(declarator);
            if (functionName) {
                currentFunction = functionName;
                definedFunctions.add(currentFunction);
                if (!calls[currentFunction]) {calls[currentFunction] = new Set();}
            }
        } else if (n.type === 'call_expression') {
            let functionNode = null;
            if (n && typeof (n as any).childForFieldName === 'function') {
                // @ts-ignore
                functionNode = (n as any).childForFieldName('function');
            }
            if (functionNode && functionNode.type === 'identifier') {
                const callee = sourceCode.slice(functionNode.startIndex, functionNode.endIndex);
                if (currentFunction) {
                    if (!calls[currentFunction]) {calls[currentFunction] = new Set();}
                    calls[currentFunction].add(callee);
                }
            }
        }
        n.namedChildren.forEach(child => traverse(child, currentFunction));
    }
    traverse(rootNode);

    const allCallees = new Set<string>();
    Object.values(calls).forEach(callees => {
        callees.forEach(callee => allCallees.add(callee));
    });
    const topFunctions = Object.keys(calls).filter(func => !allCallees.has(func));

    let topFunction: string | null = null;
    if (topFunctions.includes('main')) {
        topFunction = 'main';
    } else if (topFunctions.length > 0) {
        topFunction = topFunctions.sort()[0];
    }
    return [topFunction, calls];
}
