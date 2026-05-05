import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { collectFunctionList } from './collectFunctionList';
import { findTopFunctions } from './findTopFunctions';
import { findArrayList } from './findArrayList';
import { getParser } from './getParser';
import { generateCallGraphImage } from './generateCallGraphImage';
import { parseHeaderMacros } from './parseHeaderMacros';
import { extractLoops } from './extractLoops';
import { extractFunctionCalls } from './extractFunctionCalls';
import { generateDictOp } from './generateDictOp';
import { collectAssignments } from './collectAssignments';
import { collectVariableDeclarations } from './collectVariableDeclarations';
import { loopRef } from '../parser/tdmDiscoveryCore';
import Parser from 'tree-sitter';

function findIdentifierDeep(node: Parser.SyntaxNode, sourceCode: string): string | null {
    if (node.type === 'identifier') {
        return sourceCode.slice(node.startIndex, node.endIndex);
    }
    for (const child of node.namedChildren) {
        const result = findIdentifierDeep(child, sourceCode);
        if (result) {return result;}
    }
    return null;
}

function getChildField(node: Parser.SyntaxNode | null | undefined, fieldName: string): Parser.SyntaxNode | null {
    if (!node) {
        return null;
    }

    if (typeof (node as any).childForFieldName === 'function') {
        const field = (node as any).childForFieldName(fieldName);
        if (field) {
            return field;
        }
    }

    const nodeField = (node as any)[`${fieldName}Node`];
    return nodeField && typeof nodeField === 'object' ? nodeField : null;
}

function firstDescendantOfType(node: Parser.SyntaxNode | null | undefined, type: string): Parser.SyntaxNode | null {
    if (!node) {
        return null;
    }

    if (node.type === type) {
        return node;
    }

    const descendants = typeof (node as any).descendantsOfType === 'function'
        ? (node as any).descendantsOfType(type)
        : [];
    if (descendants[0]) {
        return descendants[0];
    }

    for (const child of node.namedChildren) {
        const match = firstDescendantOfType(child, type);
        if (match) {
            return match;
        }
    }

    return null;
}

function hasDescendantOfType(node: Parser.SyntaxNode | null | undefined, types: Set<string>): boolean {
    if (!node) {
        return false;
    }

    if (types.has(node.type)) {
        return true;
    }

    return node.namedChildren.some(child => hasDescendantOfType(child, types));
}

function collectTopInterfaceParameters(
    mainFuncNode: Parser.SyntaxNode | null,
    topFunctionName: string,
    sourceCode: string
): string[] {
    const declarator = getChildField(mainFuncNode, 'declarator')
        ?? mainFuncNode?.namedChildren.find(child => child.type === 'function_declarator');
    const parametersNode = getChildField(declarator, 'parameters')
        ?? declarator?.namedChildren.find(child => child.type === 'parameter_list');
    const refs: string[] = [];

    if (!parametersNode) {
        return refs;
    }

    for (const parameter of parametersNode.namedChildren) {
        if (parameter.type !== 'parameter_declaration') {
            continue;
        }

        const declaratorNode = getChildField(parameter, 'declarator')
            ?? parameter.namedChildren.find(child => child.type.endsWith('declarator') || child.type === 'identifier');
        if (!hasDescendantOfType(declaratorNode, new Set(['array_declarator', 'pointer_declarator']))) {
            continue;
        }

        const identifier = firstDescendantOfType(declaratorNode, 'identifier');
        if (identifier) {
            refs.push(`${topFunctionName} ${sourceCode.slice(identifier.startIndex, identifier.endIndex)}`);
        }
    }

    return refs;
}

function collectLoopRefs(topFunctionName: string, loop: any): { all: string[]; leaves: string[] } {
    const currentRef = loopRef(topFunctionName, loop.label);
    const children = loop.innerLoops ?? [];
    if (children.length === 0) {
        return { all: [currentRef], leaves: [currentRef] };
    }

    const all = [currentRef];
    const leaves: string[] = [];
    for (const child of children) {
        const childRefs = collectLoopRefs(topFunctionName, child);
        all.push(...childRefs.all);
        leaves.push(...childRefs.leaves);
    }

    return { all, leaves };
}

function buildReferenceLoopList(topFunctionName: string, loops: any[]): Record<string, any> {
    const loopList: Record<string, any> = {};

    loops.forEach((loop, index) => {
        const refs = collectLoopRefs(topFunctionName, loop);
        loopList[`group${index + 1}`] = {
            level: [...refs.all],
            unroll: [...refs.all],
            pipeline: [...refs.leaves],
            flatten: []
        };
    });

    return loopList;
}

function cloneConfigForYaml(config: any): any {
    const clone = JSON.parse(JSON.stringify(config));

    replaceEmptyArrayWithPlaceholder(clone, 'funcList');
    replaceEmptyArrayWithPlaceholder(clone, 'arrList');

    for (const group of Object.values(clone.loopList ?? {}) as any[]) {
        for (const directive of ['level', 'unroll', 'pipeline', 'flatten']) {
            replaceEmptyArrayWithPlaceholder(group, directive);
        }
    }

    for (const typeName of ['int', 'float', 'double', 'half']) {
        replaceEmptyArrayWithPlaceholder(clone.dictOp ?? {}, typeName);
    }

    return clone;
}

function replaceEmptyArrayWithPlaceholder(container: Record<string, any>, key: string) {
    if (Array.isArray(container[key]) && container[key].length === 0) {
        container[key] = [null];
    }
}

/**
 * 构造 YAML 配置对象
 */
function generateConfigYaml(
    topFunction: string,
    functionCalls: string[],
    loops: any[],
    variables: Record<string, string>,
    assignments: [string, string, string | null][],
    sourceCode: string,
    mainFuncNode: Parser.SyntaxNode | null
) {
    functionCalls = collectFunctionList(sourceCode);
    const topFunctionName = topFunction;
    const topFunctionParameters = collectTopInterfaceParameters(mainFuncNode, topFunctionName, sourceCode);
    const arrayList = findArrayList(sourceCode);
    const config: any = {
        top: [topFunctionName],
        funcList: functionCalls,
        loopList: buildReferenceLoopList(topFunctionName, loops),
        arrList: arrayList.map(i => `${topFunctionName} ${i}`),
        interList: topFunctionParameters,
        dictOp: {
            int: {}, float: [], double: [], half: []
        }
    };

    config.dictOp = generateDictOp(topFunctionName, variables, assignments);
    return config;
}

/**
 * 主处理逻辑
 */
export function generateConfigFromCFile(cFile: string, drawGraph = false): any {
    const filename = path.basename(cFile);
    const filePrefix = path.parse(filename).name;
    const sourceCode = fs.readFileSync(cFile, 'utf-8');
    const macroMap = parseHeaderMacros(cFile, sourceCode);
    const parser = getParser();
    const tree = parser.parse(sourceCode);
    const rootNode = tree.rootNode;
    // 只用 findTopFunctions 查找顶层函数
    const topFunctions = findTopFunctions(sourceCode);
    const topFunction = topFunctions[0] || (filePrefix + '_main');
    // 查找主函数节点
    let mainFuncNode: Parser.SyntaxNode | null = null;
    function findMainFunction(node: Parser.SyntaxNode) {
        if (node.type === 'function_definition') {
            // 递归 function_definition 的所有子节点
            const identifier = findIdentifierDeep(node, sourceCode);
            if (identifier && topFunction && identifier.trim() === topFunction.trim()) {
                mainFuncNode = node;
            }
        }
        node.namedChildren.forEach(findMainFunction);
    }
    findMainFunction(rootNode);
    let loops: any[] = [];
    if (mainFuncNode) {
        loops = extractLoops(mainFuncNode, sourceCode);
    }
    const functionCalls = extractFunctionCalls(rootNode, sourceCode, filePrefix);
    const variables = collectVariableDeclarations(mainFuncNode!, sourceCode, macroMap);
    const assignments = collectAssignments(mainFuncNode!, sourceCode, loops);
    return generateConfigYaml(topFunction, functionCalls, loops, variables, assignments, sourceCode, mainFuncNode);
}

/**
 * YAML 文件生成主入口
 */
export function generateYamlFromCFile(cFile: string, drawGraph = false, output?: string) {
    const config = generateConfigFromCFile(cFile, drawGraph);
    const yamlStr = yaml.dump(cloneConfigForYaml(config), {
        indent: 4,
        sortKeys: false,
        noRefs: true,
        styles: { '!!null': 'empty' }
    });
    console.log('# === 生成的配置文件 (YAML 格式) ===');
    console.log(yamlStr);
    const outPath = output || path.parse(cFile).name + '.yaml';
    fs.writeFileSync(outPath, yamlStr, 'utf-8');
    console.log(`YAML 配置文件已保存到: ${outPath}`);
}
