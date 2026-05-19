import assert from "node:assert/strict";
import test from "node:test";

import { buildDictOpIntHoverAction } from "../parser/tdmHoverModel";

test("hover action adds loop operation variables with a human-readable label", () => {
    const action = buildDictOpIntHoverAction({
        loopRef: "bfs/loop_neighbors",
        operation: "add",
        variableName: "cnt",
    });

    assert.equal(action.configKey, "bfs/loop_neighbors cnt");
    assert.equal(action.operation, "add");
    assert.equal(action.typeName, "int");
    assert.deepEqual(action.commandArguments, ["bfs/loop_neighbors cnt", "add", "int"]);
    assert.match(action.markdown, /Add to Loop Ops/);
    assert.doesNotMatch(action.markdown, /dictOp/);
});

test("hover action strips non-int operation prefixes before writing loop operations", () => {
    const action = buildDictOpIntHoverAction({
        loopRef: "bfs/loop_nodes",
        operation: "fadd",
        variableName: "n",
    });

    assert.deepEqual(action.commandArguments, ["bfs/loop_nodes n", "add", "int"]);
});
