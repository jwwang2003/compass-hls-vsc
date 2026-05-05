/**
 * 生成 dictOp 配置（变量-操作-循环标签映射）
 * @param topFunctionName 顶层函数名
 * @param variables 变量类型映射
 * @param assignments 赋值操作元组数组 [变量名, 操作类型, 循环标签]
 * @returns dictOp 配置对象
 */
export function generateDictOp(
    topFunctionName: string,
    variables: Record<string, string>,
    assignments: [string, string, string | null][]
): Record<string, any> {
    const dictOp: Record<string, any> = { int: {}, float: {}, double: {}, half: {} };
    const typeMap: Record<string, [string, string]> = {
        int: ['int', ''],
        float: ['float', 'f'],
        double: ['double', 'd'],
        half: ['half', 'h']
    };
    for (const [varName, opType, loopLabel] of assignments) {
        if (!varName) {
            console.warn(`[WARN] 跳过变量名为空的赋值: ${opType}, 循环标签: ${loopLabel}`);
            continue;
        }
        if (!loopLabel || loopLabel.trim() === '') {
            console.warn(`[WARN] 跳过无效循环标签的变量: ${varName}`);
            continue;
        }
        // 类型推断逻辑（修复大小写敏感问题）
        const varType = (variables[varName] || 'int').toLowerCase();
        let targetType = 'int';
        let prefix = '';
        for (const baseType of ['half', 'double', 'float']) {
            if (varType === baseType) {
                targetType = baseType;
                prefix = typeMap[baseType][1];
                break;
            }
        }
        // 生成操作符和循环路径
        const fullOp = prefix ? `${prefix}${opType}` : opType;
        const loopPath = `${topFunctionName}/${loopLabel}`;
        const dictKey = `${loopPath} ${varName}`;
        if (!dictOp[targetType][dictKey]) {dictOp[targetType][dictKey] = [];}
        dictOp[targetType][dictKey].push(fullOp);
    }

    for (const typeKey of Object.keys(dictOp)) {
        const entries = dictOp[typeKey];
        const normalized: Record<string, string[]> = {};

        for (const [key, values] of Object.entries(entries)) {
            if (Array.isArray(values) && values.length > 0) {
                normalized[key] = Array.from(new Set(values as string[])).sort();
            }
        }

        dictOp[typeKey] = Object.keys(normalized).length > 0 ? normalized : [];
    }

    return dictOp;
}
