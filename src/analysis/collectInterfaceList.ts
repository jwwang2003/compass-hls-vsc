import { getParser } from './getParser';

/**
 * 提取顶层父函数的参数名列表
 * @param code C 源码字符串
 * @returns 形如 ["main arr", "main size"] 的参数名数组
 */
export function collectInterfaceList(code: string): string[] {
    const parser = getParser();
    const tree = parser.parse(code);

    const functionNames: string[] = [];
    const calledFunctionNames: string[] = [];
    const topFunctionNames: string[] = [];
    const interfaceRefs: string[] = [];

    // 1. 找出所有函数名和被调用函数名
    tree.rootNode.children.forEach((node: any) => {
        if (node.type === 'function_definition') {
            const declarator = node.namedChildren.find((child: any) => child.type === 'function_declarator');
            if (declarator) {
                const idNode = declarator.namedChildren.find((child: any) => child.type === 'identifier');
                if (idNode) {functionNames.push(idNode.text);}
            }
            // 查找被调用函数
            node.descendantsOfType('call_expression').forEach((callNode: any) => {
                const idNode = callNode.namedChildren[0];
                if (idNode) {calledFunctionNames.push(idNode.text);}
            });
        }
    });

    // 2. 找出顶层父函数
    functionNames.forEach(name => {
        if (!calledFunctionNames.includes(name)) {topFunctionNames.push(name);}
    });

    // 3. 提取顶层父函数的参数
    tree.rootNode.children.forEach((node: any) => {
        if (node.type === 'function_definition') {
            const declarator = node.namedChildren.find((child: any) => child.type === 'function_declarator');
            const idNode = declarator?.namedChildren.find((child: any) => child.type === 'identifier');
            if (idNode && topFunctionNames.includes(idNode.text)) {
                const paramList = declarator?.namedChildren.find((child: any) => child.type === 'parameter_list');
                if (paramList) {
                    paramList.namedChildren.forEach((param: any) => {
                        if (param.type === 'parameter_declaration') {
                            const varNode = param.namedChildren[param.namedChildren.length - 1];
                            if (varNode) {interfaceRefs.push(`${idNode.text} ${varNode.text}`);}
                        }
                    });
                }
            }
        }
    });

    return interfaceRefs;
}
