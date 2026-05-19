export interface DictOpIntHoverInput {
    loopRef: string;
    operation: string;
    variableName: string;
}

export interface DictOpIntHoverAction {
    commandArguments: [string, string, "int"];
    commandUri: string;
    configKey: string;
    markdown: string;
    operation: string;
    typeName: "int";
}

const PREFIXED_INT_OPERATIONS: Record<string, string> = {
    fadd: "add",
    dadd: "add",
    hadd: "add",
    fsub: "sub",
    dsub: "sub",
    hsub: "sub",
    fmul: "mul",
    dmul: "mul",
    hmul: "mul",
    fdiv: "div",
    ddiv: "div",
    hdiv: "div",
};

export function buildDictOpIntHoverAction(input: DictOpIntHoverInput): DictOpIntHoverAction {
    const operation = normalizeIntOperation(input.operation);
    const configKey = `${input.loopRef} ${input.variableName}`;
    const commandArguments: [string, string, "int"] = [configKey, operation, "int"];
    const commandUri = `command:tdmOptimizer.addVariable?${encodeURIComponent(JSON.stringify(commandArguments))}`;

    return {
        commandArguments,
        commandUri,
        configKey,
        markdown: `[Add to Loop Ops](${commandUri})`,
        operation,
        typeName: "int",
    };
}

function normalizeIntOperation(operation: string): string {
    return PREFIXED_INT_OPERATIONS[operation] ?? operation;
}
