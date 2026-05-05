import Parser from 'tree-sitter';

/**
 * 收集变量声明（支持类型宏展开）
 * @param mainFuncNode AST 节点（主函数）
 * @param sourceCode C 源码字符串
 * @param macroMap 类型宏映射表
 * @returns 变量名到类型的映射
 */
export function collectVariableDeclarations(
    mainFuncNode: Parser.SyntaxNode,
    sourceCode: string,
    macroMap: Record<string, string> = {}
): Record<string, string> {
    const variables: Record<string, string> = {};

    /**
     * 安全地从节点获取字段
     */
    function getChildField(node: Parser.SyntaxNode, fieldName: string): Parser.SyntaxNode | null {
        if (typeof (node as any).childForFieldName === 'function') {
            const field = (node as any).childForFieldName(fieldName);
            if (field) {
                return field;
            }
        }

        const nodeField = (node as any)[`${fieldName}Node`];
        return nodeField && typeof nodeField === "object" ? nodeField : null;
    }

    /**
     * 从声明器中提取变量名。数组声明会包含维度标识符，取第一个变量标识符即可。
     */
    function extractDeclarator(node: Parser.SyntaxNode): string | null {
        const stack = [node];

        while (stack.length > 0) {
            const current = stack.pop();
            if (!current) {continue;}

            if (current.type === 'identifier') {
                return sourceCode.slice(current.startIndex, current.endIndex);
            }

            if (current.namedChildren) {
                stack.push(...[...current.namedChildren].reverse());
            }
        }

        return null;
    }

    function traverse(node: Parser.SyntaxNode | null) {
        if (!node) {return;}

        if (node.type === 'declaration') {
            const typeNode = getChildField(node, 'type');
            if (!typeNode) {return;}

            const rawType = sourceCode.slice(typeNode.startIndex, typeNode.endIndex);
            const resolvedType = macroMap[rawType] || rawType;
            const finalType = resolvedType.toLowerCase();

            const declarators: string[] = [];

            node.namedChildren.forEach(child => {
                if (child === typeNode) {
                    return;
                }

                if (child.type === 'init_declarator') {
                    const declaratorPart = getChildField(child, 'declarator') ?? child.namedChildren[0];
                    if (declaratorPart) {
                        const varName = extractDeclarator(declaratorPart);
                        if (varName) {
                            declarators.push(varName);
                        }
                    }
                    return;
                }

                if (child.type === 'identifier' || child.type.endsWith('declarator')) {
                    const varName = extractDeclarator(child);
                    if (varName) {
                        declarators.push(varName);
                    }
                }
            });

            declarators.forEach(varName => {
                if (varName) {
                    variables[varName] = finalType;
                }
            });
        }

        // 安全遍历子节点
        if (node.namedChildren) {
            node.namedChildren.forEach(traverse);
        }
    }

    traverse(mainFuncNode);
    return variables;
}
