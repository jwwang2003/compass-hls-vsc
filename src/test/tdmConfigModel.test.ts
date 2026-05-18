import assert from "node:assert/strict";
import test from "node:test";

import {
    applyAutoDiscovery,
    createDefaultConfig,
    isLoopDirectiveSelected,
    isSelectedTopFunctionRef,
    pruneDisabledCandidates,
    setParamsInConfig,
    setVariableOperationsInConfig,
    setLoopDirectivesInConfig,
    toggleVariableInConfig,
    toggleFunctionInConfig,
    toggleLoopDirectiveInConfig,
    toggleParamInConfig,
} from "../parser/tdmConfigModel";

const range = undefined as never;

test("auto discovery adds functions, parameters, and loop directives unless disabled", () => {
    const config = createDefaultConfig();
    const disabled = new Set([
        "param:bfs edges",
        "loop:group_bfs_loop_i:pipeline:bfs/loop_i",
    ]);

    applyAutoDiscovery(config, {
        functions: [{ name: "bfs", range, parameters: [] }],
        parameters: [
            { functionName: "bfs", name: "nodes", ref: "bfs nodes", range },
            { functionName: "bfs", name: "edges", ref: "bfs edges", range },
        ],
        loops: [{
            functionName: "bfs",
            label: "loop_i",
            ref: "bfs/loop_i",
            group: "group_bfs_loop_i",
            range,
        }],
    }, key => disabled.has(key));

    assert.deepEqual(config.top, ["bfs"]);
    assert.deepEqual(config.interList, ["bfs nodes"]);
    assert.equal(isLoopDirectiveSelected(config, "group_bfs_loop_i", "level", "bfs/loop_i"), true);
    assert.equal(isLoopDirectiveSelected(config, "group_bfs_loop_i", "unroll", "bfs/loop_i"), true);
    assert.equal(isLoopDirectiveSelected(config, "group_bfs_loop_i", "pipeline", "bfs/loop_i"), false);
});

test("auto discovery chooses the best kernel candidate when helper appears first", () => {
    const config = createDefaultConfig();

    applyAutoDiscovery(config, {
        functions: [
            { name: "helper", range, parameters: [] },
            {
                name: "kernel",
                range,
                parameters: [
                    { functionName: "kernel", name: "input", ref: "kernel input", range },
                    { functionName: "kernel", name: "output", ref: "kernel output", range },
                ],
            },
        ],
        parameters: [
            { functionName: "kernel", name: "input", ref: "kernel input", range },
            { functionName: "kernel", name: "output", ref: "kernel output", range },
        ],
        loops: [{
            functionName: "kernel",
            label: "loop_i",
            ref: "kernel/loop_i",
            group: "group_kernel_loop_i",
            range,
        }],
    }, () => false);

    assert.deepEqual(config.top, ["kernel"]);
    assert.deepEqual(config.interList, ["kernel input", "kernel output"]);
    assert.deepEqual(Object.keys(config.loopList), ["group_kernel_loop_i"]);
});

test("auto discovery only adds candidates from the selected top function", () => {
    const config = createDefaultConfig();
    config.top.push("kernel");

    applyAutoDiscovery(config, {
        functions: [
            { name: "kernel", range, parameters: [] },
            { name: "wrapper", range, parameters: [] },
        ],
        parameters: [
            { functionName: "kernel", name: "data", ref: "kernel data", range },
            { functionName: "wrapper", name: "args", ref: "wrapper args", range },
        ],
        loops: [
            {
                functionName: "kernel",
                label: "loop_i",
                ref: "kernel/loop_i",
                group: "group_kernel_loop_i",
                range,
            },
            {
                functionName: "wrapper",
                label: "loop_tb",
                ref: "wrapper/loop_tb",
                group: "group_wrapper_loop_tb",
                range,
            },
        ],
    }, () => false);

    assert.deepEqual(config.top, ["kernel"]);
    assert.deepEqual(config.funcList, []);
    assert.deepEqual(config.interList, ["kernel data"]);
    assert.deepEqual(Object.keys(config.loopList), ["group_kernel_loop_i"]);
});

test("toggle helpers remove selected config items and return disabled keys", () => {
    const config = createDefaultConfig();

    assert.equal(toggleFunctionInConfig(config, "bfs"), "enabled");
    assert.equal(toggleParamInConfig(config, "bfs nodes"), "enabled");
    assert.equal(toggleLoopDirectiveInConfig(config, "group_bfs_loop_i", "unroll", "bfs/loop_i"), "enabled");

    assert.equal(toggleFunctionInConfig(config, "bfs"), "disabled");
    assert.equal(toggleParamInConfig(config, "bfs nodes"), "disabled");
    assert.equal(toggleLoopDirectiveInConfig(config, "group_bfs_loop_i", "unroll", "bfs/loop_i"), "disabled");

    assert.deepEqual(config.top, []);
    assert.deepEqual(config.interList, []);
    assert.equal(isLoopDirectiveSelected(config, "group_bfs_loop_i", "unroll", "bfs/loop_i"), false);
});

test("loop directives toggle independently", () => {
    const config = createDefaultConfig();

    assert.equal(toggleLoopDirectiveInConfig(config, "group_bfs_loop_i", "unroll", "bfs/loop_i"), "enabled");
    assert.equal(isLoopDirectiveSelected(config, "group_bfs_loop_i", "level", "bfs/loop_i"), false);
    assert.equal(isLoopDirectiveSelected(config, "group_bfs_loop_i", "unroll", "bfs/loop_i"), true);

    assert.equal(toggleLoopDirectiveInConfig(config, "group_bfs_loop_i", "pipeline", "bfs/loop_i"), "enabled");
    assert.equal(toggleLoopDirectiveInConfig(config, "group_bfs_loop_i", "level", "bfs/loop_i"), "enabled");
    assert.equal(toggleLoopDirectiveInConfig(config, "group_bfs_loop_i", "level", "bfs/loop_i"), "disabled");

    assert.equal(isLoopDirectiveSelected(config, "group_bfs_loop_i", "level", "bfs/loop_i"), false);
    assert.equal(isLoopDirectiveSelected(config, "group_bfs_loop_i", "unroll", "bfs/loop_i"), true);
    assert.equal(isLoopDirectiveSelected(config, "group_bfs_loop_i", "pipeline", "bfs/loop_i"), true);
});

test("setLoopDirectivesInConfig replaces directives in one operation", () => {
    const config = createDefaultConfig();

    setLoopDirectivesInConfig(config, "group_bfs_loop_i", "bfs/loop_i", ["level", "unroll"]);
    setLoopDirectivesInConfig(config, "group_bfs_loop_i", "bfs/loop_i", ["pipeline"]);

    assert.deepEqual(config.loopList.group_bfs_loop_i, {
        level: [],
        unroll: [],
        pipeline: ["bfs/loop_i"],
        flatten: [],
    });
});

test("setParamsInConfig replaces only the selected function parameter refs", () => {
    const config = createDefaultConfig();
    config.interList.push("bfs nodes", "bfs edges", "helper value");

    setParamsInConfig(config, ["bfs nodes", "bfs edges", "bfs starting_node"], ["bfs starting_node"]);

    assert.deepEqual(config.interList, ["helper value", "bfs starting_node"]);
});

test("toggleVariableInConfig adds and removes one dictOp operation", () => {
    const config = createDefaultConfig();

    assert.equal(toggleVariableInConfig(config, "bfs/loop_i i", "add", "int"), "enabled");
    assert.deepEqual(config.dictOp.int, { "bfs/loop_i i": ["add"] });

    assert.equal(toggleVariableInConfig(config, "bfs/loop_i i", "mul", "int"), "enabled");
    assert.deepEqual(config.dictOp.int, { "bfs/loop_i i": ["add", "mul"] });

    assert.equal(toggleVariableInConfig(config, "bfs/loop_i i", "add", "int"), "disabled");
    assert.deepEqual(config.dictOp.int, { "bfs/loop_i i": ["mul"] });

    assert.equal(toggleVariableInConfig(config, "bfs/loop_i i", "mul", "int"), "disabled");
    assert.deepEqual(config.dictOp.int, {});
});

test("setVariableOperationsInConfig replaces only the provided dictOp candidates", () => {
    const config = createDefaultConfig();
    config.dictOp.int = {
        "bfs/loop_i i": ["add"],
        "bfs/loop_i cnt": ["add"],
        "bfs/loop_j j": ["add"],
    };

    setVariableOperationsInConfig(config, "int", [
        { configKey: "bfs/loop_i i", operation: "add" },
        { configKey: "bfs/loop_i cnt", operation: "add" },
        { configKey: "bfs/loop_i total", operation: "add" },
    ], [
        { configKey: "bfs/loop_i total", operation: "add" },
    ]);

    assert.deepEqual(config.dictOp.int, {
        "bfs/loop_j j": ["add"],
        "bfs/loop_i total": ["add"],
    });
});

test("isSelectedTopFunctionRef matches function names and config refs", () => {
    const config = createDefaultConfig();

    assert.equal(isSelectedTopFunctionRef(config, "wrapper/loop_i i"), true);

    config.top.push("kernel");

    assert.equal(isSelectedTopFunctionRef(config, "kernel"), true);
    assert.equal(isSelectedTopFunctionRef(config, "kernel data"), true);
    assert.equal(isSelectedTopFunctionRef(config, "kernel/loop_i i"), true);
    assert.equal(isSelectedTopFunctionRef(config, "wrapper"), false);
    assert.equal(isSelectedTopFunctionRef(config, "wrapper data"), false);
    assert.equal(isSelectedTopFunctionRef(config, "wrapper/loop_i i"), false);
});

test("pruning removes disabled generated items without disturbing enabled config", () => {
    const config = createDefaultConfig();
    config.funcList.push("helper");

    applyAutoDiscovery(config, {
        functions: [
            { name: "bfs", range, parameters: [] },
            { name: "helper", range, parameters: [] },
        ],
        parameters: [{ functionName: "bfs", name: "nodes", ref: "bfs nodes", range }],
        loops: [{
            functionName: "bfs",
            label: "loop_i",
            ref: "bfs/loop_i",
            group: "group_bfs_loop_i",
            range,
        }],
    }, () => false);

    const disabled = new Set([
        "function:bfs",
        "param:bfs nodes",
        "loop:group_bfs_loop_i:level:bfs/loop_i",
    ]);

    pruneDisabledCandidates(config, {
        functions: [{ name: "bfs", range, parameters: [] }],
        parameters: [{ functionName: "bfs", name: "nodes", ref: "bfs nodes", range }],
        loops: [{
            functionName: "bfs",
            label: "loop_i",
            ref: "bfs/loop_i",
            group: "group_bfs_loop_i",
            range,
        }],
    }, key => disabled.has(key));

    assert.deepEqual(config.top, []);
    assert.deepEqual(config.funcList, ["helper"]);
    assert.deepEqual(config.interList, []);
    assert.deepEqual(config.loopList.group_bfs_loop_i, {
        level: [],
        unroll: ["bfs/loop_i"],
        pipeline: ["bfs/loop_i"],
        flatten: [],
    });
});
