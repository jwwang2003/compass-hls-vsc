import { getParser } from './getParser';

/**
 * 提取所有顶层父函数名，并打印所有被调用的函数和主函数
 * @param code C 源码字符串
 * @returns 顶层父函数名数组
 */
export function findTopFunctions(code: string): string[] {
    const parser = getParser();
    const tree = parser.parse(code);

    const functionNames: string[] = [];
    const calledFunctionNames: string[] = [];
    const topFunctionNames: string[] = [];

    // 1. 找出所有函数名和被调用函数名
    tree.rootNode.children.forEach(node => {
        if (node.type === 'function_definition') {
            const declarator = node.namedChildren.find(child => child.type === 'function_declarator');
            const idNode = declarator?.namedChildren.find(child => child.type === 'identifier');
            if (idNode) {functionNames.push(idNode.text);}

            node.descendantsOfType('call_expression').forEach(callNode => {
                const idNode = callNode.namedChildren[0];
                if (idNode) {calledFunctionNames.push(idNode.text);}
            });
        }
    });

    // 2. 找出顶层父函数
    functionNames.forEach(name => {
        if (!calledFunctionNames.includes(name)) {topFunctionNames.push(name);}
    });

    return topFunctionNames;
}
