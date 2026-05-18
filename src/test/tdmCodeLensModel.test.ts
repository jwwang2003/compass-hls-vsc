import assert from "node:assert/strict";
import test from "node:test";

import { buildTdmCodeLensItems } from "../parser/tdmCodeLensModel";
import { createDefaultConfig, setLoopDirectivesInConfig } from "../parser/tdmConfigModel";

const range = undefined as never;
const lineRange = (line: number) => ({ start: { line }, end: { line } }) as never;

test("buildTdmCodeLensItems collapses parameter and loop controls", () => {
    const config = createDefaultConfig();
    config.interList.push("bfs nodes");
    setLoopDirectivesInConfig(config, "group_bfs_loop_i", "bfs/loop_i", ["level", "pipeline"]);

    const items = buildTdmCodeLensItems({
        functions: [{
            name: "bfs",
            range,
            parameters: [
                { functionName: "bfs", name: "nodes", ref: "bfs nodes", range },
                { functionName: "bfs", name: "edges", ref: "bfs edges", range },
            ],
        }],
        parameters: [
            { functionName: "bfs", name: "nodes", ref: "bfs nodes", range },
            { functionName: "bfs", name: "edges", ref: "bfs edges", range },
        ],
        loops: [
            {
                functionName: "bfs",
                label: "loop_i",
                ref: "bfs/loop_i",
                group: "group_bfs_loop_i",
                range,
            },
            {
                functionName: "bfs",
                label: "loop_j",
                ref: "bfs/loop_j",
                group: "group_bfs_loop_j",
                range,
            },
        ],
    }, config);

    assert.equal(items.length, 4);
    assert.deepEqual(items.map(item => item.command), [
        "tdmOptimizer.toggleFunction",
        "tdmOptimizer.pickFunctionInterList",
        "tdmOptimizer.pickLoopDirectives",
        "tdmOptimizer.pickLoopDirectives",
    ]);
    assert.equal(items[1].title, "$(list-selection)InterList\u00a0\u00a0$(symbol-method)[bfs] (1/2)");
    assert.deepEqual(items[1].arguments, [
        "bfs",
        [
            { name: "nodes", ref: "bfs nodes" },
            { name: "edges", ref: "bfs edges" },
        ],
    ]);
    assert.equal(items[2].title, "$(settings-gear)Directives\u00a0\u00a0$(tag)[loop_i] (2/4)");
    assert.deepEqual(items[2].arguments, ["group_bfs_loop_i", "bfs/loop_i", "loop_i"]);
});

test("buildTdmCodeLensItems groups dictOp int hints by loop", () => {
    const config = createDefaultConfig();
    config.dictOp.int = {
        "bfs/loop_i i": ["add"],
    };

    const items = buildTdmCodeLensItems({
        functions: [],
        parameters: [],
        loops: [{
            functionName: "bfs",
            label: "loop_i",
            ref: "bfs/loop_i",
            group: "group_bfs_loop_i",
            range: lineRange(4),
        }],
    }, config, [{
        configKey: "bfs/loop_i i",
        loopRef: "bfs/loop_i",
        operation: "add",
        range: lineRange(4),
        variableName: "i",
    }, {
        configKey: "bfs/loop_i cnt",
        loopRef: "bfs/loop_i",
        operation: "add",
        range: lineRange(6),
        variableName: "cnt",
    }]);

    assert.deepEqual(items.map(item => item.command), [
        "tdmOptimizer.pickLoopDirectives",
        "tdmOptimizer.pickDictOpInt",
    ]);
    assert.equal(items[1].title, "| $(symbol-operator)dictOp.int\u00a0\u00a0$(tag)[bfs/loop_i] (1/2)");
    assert.deepEqual(items[1].arguments, [
        "bfs/loop_i",
        [
            { configKey: "bfs/loop_i i", variableName: "i", operation: "add" },
            { configKey: "bfs/loop_i cnt", variableName: "cnt", operation: "add" },
        ],
    ]);
});

test("buildTdmCodeLensItems groups dictOp hints separately by loop", () => {
    const config = createDefaultConfig();
    const items = buildTdmCodeLensItems({
        functions: [],
        parameters: [],
        loops: [],
    }, config, [{
        configKey: "bfs/loop_i i",
        loopRef: "bfs/loop_i",
        operation: "add",
        range: lineRange(4),
        variableName: "i",
    }, {
        configKey: "bfs/loop_j j",
        loopRef: "bfs/loop_j",
        operation: "add",
        range: lineRange(9),
        variableName: "j",
    }]);

    assert.deepEqual(items.map(item => item.title), [
        "$(symbol-operator)dictOp.int\u00a0\u00a0$(tag)[bfs/loop_i] (0/1)",
        "$(symbol-operator)dictOp.int\u00a0\u00a0$(tag)[bfs/loop_j] (0/1)",
    ]);
    assert.deepEqual(items.map(item => item.arguments[0]), ["bfs/loop_i", "bfs/loop_j"]);
});

test("buildTdmCodeLensItems only shows selected top function candidates", () => {
    const config = createDefaultConfig();
    config.top.push("kernel");

    const items = buildTdmCodeLensItems({
        functions: [
            { name: "kernel", range: lineRange(1), parameters: [] },
            { name: "wrapper", range: lineRange(8), parameters: [] },
        ],
        parameters: [],
        loops: [
            {
                functionName: "kernel",
                label: "loop_i",
                ref: "kernel/loop_i",
                group: "group_kernel_loop_i",
                range: lineRange(2),
            },
            {
                functionName: "wrapper",
                label: "loop_tb",
                ref: "wrapper/loop_tb",
                group: "group_wrapper_loop_tb",
                range: lineRange(9),
            },
        ],
    }, config, [
        {
            configKey: "kernel/loop_i i",
            loopRef: "kernel/loop_i",
            operation: "add",
            range: lineRange(2),
            variableName: "i",
        },
        {
            configKey: "wrapper/loop_tb j",
            loopRef: "wrapper/loop_tb",
            operation: "add",
            range: lineRange(9),
            variableName: "j",
        },
    ]);

    assert.deepEqual(items.map(item => item.arguments[0]), [
        "kernel",
        "group_kernel_loop_i",
        "kernel/loop_i",
    ]);
});
