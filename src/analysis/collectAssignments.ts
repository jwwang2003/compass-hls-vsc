// @ts-ignore
import Parser from 'tree-sitter';
// import { getRhsOperation } from './getRhsOperation'; // 需要你实现右值操作类型推断
type SyntaxNode = any;

type SyntaxNodeWithChild = {
    childForFieldName?: (name: string) => SyntaxNodeWithChild | null;
    child?: (index: number) => SyntaxNodeWithChild | null;
    namedChildren: SyntaxNodeWithChild[];
    type: string;
    startIndex: number;
    endIndex: number;
    childCount?: number;
    // 其他你用到的属性可以继续补充
};

/**
 * 收集赋值操作（含循环标签）
 * @param mainFuncNode AST 节点（主函数）
 * @param sourceCode C 源码字符串
 * @param loops 循环信息数组
 * @returns 赋值操作元组数组 [变量名, 操作类型, 循环标签]
 */
export function collectAssignments(mainFuncNode: SyntaxNodeWithChild, sourceCode: string, loops: any[]): [string, string, string | null][] {
    const assignments: [string, string, string | null][] = [];

    // 递归收集所有循环（含嵌套）
    const allLoops: any[] = [];
    function collectLoops(loopList: any[]) {
        for (const loop of loopList) {
            allLoops.push(loop);
            collectLoops(loop.innerLoops || []);
        }
    }
    collectLoops(loops);
    allLoops.sort((a, b) => b.startIndex - a.startIndex || a.endIndex - b.endIndex); // 内层循环优先

    function getChildField(node: SyntaxNodeWithChild, fieldName: string): SyntaxNodeWithChild | null {
        if (typeof node.childForFieldName === 'function') {
            const field = node.childForFieldName(fieldName);
            if (field) {
                return field;
            }
        }

        const nodeField = (node as any)[`${fieldName}Node`];
        return nodeField && typeof nodeField === 'object' ? nodeField : null;
    }

    function getNamedChild(node: SyntaxNodeWithChild, index: number): SyntaxNodeWithChild | null {
        return node.namedChildren[index] ?? null;
    }

    function getOperator(node: SyntaxNodeWithChild): string | null {
        const operatorField = getChildField(node, 'operator');
        if (operatorField) {
            return sourceCode.slice(operatorField.startIndex, operatorField.endIndex);
        }

        if (typeof node.child === 'function' && typeof node.childCount === 'number') {
            for (let index = 0; index < node.childCount; index += 1) {
                const child = node.child(index);
                if (!child || node.namedChildren.includes(child)) {
                    continue;
                }

                const text = sourceCode.slice(child.startIndex, child.endIndex).trim();
                if (['=', '+=', '-=', '*=', '/=', '++', '--', '+', '-', '*', '/'].includes(text)) {
                    return text;
                }
            }
        }

        const text = sourceCode.slice(node.startIndex, node.endIndex);
        return ['+=', '-=', '*=', '/=', '++', '--', '=', '+', '-', '*', '/'].find(op => text.includes(op)) ?? null;
    }

    function identifierName(node: SyntaxNodeWithChild | null): string | null {
        if (!node || node.type !== 'identifier') {
            return null;
        }
        return sourceCode.slice(node.startIndex, node.endIndex);
    }

    function assignmentOpType(
        operator: string | null,
        left: SyntaxNodeWithChild | null,
        right: SyntaxNodeWithChild | null
    ): string | null {
        if (operator === '+=') {return 'add';}
        if (operator === '-=') {return 'sub';}
        if (operator === '*=') {return 'mul';}
        if (operator === '/=') {return 'div';}
        if (operator !== '=' || !left || !right) {
            return null;
        }

        const leftName = identifierName(left);
        if (!leftName || right.type !== 'binary_expression') {
            return null;
        }

        const binaryOperator = getOperator(right);
        if (!['+', '-', '*', '/'].includes(binaryOperator ?? '')) {
            return null;
        }

        const usesLeftValue = right.namedChildren.some(child => identifierName(child) === leftName);
        if (!usesLeftValue) {
            return null;
        }

        return ({ '+': 'add', '-': 'sub', '*': 'mul', '/': 'div' } as Record<string, string>)[binaryOperator!];
    }

    function containingLoopLabel(node: SyntaxNodeWithChild): string | null {
        const currentIndex = node.startIndex;
        const selectedLoop = allLoops.find(loop => loop.startIndex <= currentIndex && currentIndex <= loop.endIndex);
        return selectedLoop ? selectedLoop.label : null;
    }

    function traverse(n: SyntaxNodeWithChild | null) {
        if (!n) {return;}

        // 处理赋值表达式
        if (n.type === 'assignment_expression') {
            const left = getChildField(n, 'left') ?? getNamedChild(n, 0);
            const right = getChildField(n, 'right') ?? getNamedChild(n, 1);
            const varName = identifierName(left);
            const opType = assignmentOpType(getOperator(n), left, right);
            if (varName) {
                const loopLabel = containingLoopLabel(n);
                if (opType) {
                    assignments.push([varName, opType, loopLabel]);
                }
            }
        }
        // 处理自增/自减操作
        else if (n.type === 'update_expression') {
            const operator = getOperator(n) ?? sourceCode.slice(n.startIndex, n.endIndex);
            // 直接找第一个 identifier 子节点
            const operand = n.namedChildren.find(child => child.type === 'identifier');
            if (operand && operand.type === 'identifier') {
                const varName = sourceCode.slice(operand.startIndex, operand.endIndex);
                const opType = operator.includes('++') ? 'add' : 'sub';
                const loopLabel = containingLoopLabel(n);
                if (varName) {
                    assignments.push([varName, opType, loopLabel]);
                }
            }
        }
        // 处理自增/自减操作（unary_expression 形式，for头部常见）
        else if (n.type === 'unary_expression') {
            const text = sourceCode.slice(n.startIndex, n.endIndex);
            let opType: string | null = null;
            if (text.includes('++')) {opType = 'add';}
            else if (text.includes('--')) {opType = 'sub';}
            let varName: string | null = null;
            const arg = getChildField(n, 'argument') ?? n.namedChildren.find(child => child.type === 'identifier');
            if (arg && arg.type === 'identifier') {
                varName = sourceCode.slice(arg.startIndex, arg.endIndex);
            }
            if (opType && varName) {
                const loopLabel = containingLoopLabel(n);
                assignments.push([varName, opType, loopLabel]);
            }
        }
        // 递归所有 namedChildren
        n.namedChildren.forEach(traverse);
    }
    traverse(mainFuncNode);
    return assignments;
}
