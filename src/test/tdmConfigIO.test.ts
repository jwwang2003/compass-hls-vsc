import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultConfig } from "../parser/tdmConfigModel";
import { cloneConfig, serializeConfig } from "../parser/tdmConfigIO";

test("serializeConfig is stable for cloned configs", () => {
    const config = createDefaultConfig();
    config.top.push("bfs");
    config.loopList.group_bfs_loop_nodes = {
        level: ["bfs/loop_nodes"],
        unroll: ["bfs/loop_nodes"],
        pipeline: ["bfs/loop_nodes"],
        flatten: [],
    };

    assert.equal(serializeConfig(cloneConfig(config)), serializeConfig(config));
});

test("cloneConfig returns an independent copy", () => {
    const config = createDefaultConfig();
    const copy = cloneConfig(config);

    copy.top.push("bfs");

    assert.deepEqual(config.top, []);
    assert.deepEqual(copy.top, ["bfs"]);
});

test("serializeConfig always writes all dictOp type defaults", () => {
    const text = serializeConfig({
        top: [],
        funcList: [],
        loopList: {},
        arrList: [],
        interList: [],
        dictOp: {
            int: {
                "bfs/loop_i i": ["add"],
            },
        },
    });

    assert.match(text, /dictOp:\n/);
    assert.match(text, /    int:\n/);
    assert.match(text, /    float: \[\]\n/);
    assert.match(text, /    double: \[\]\n/);
    assert.match(text, /    half: \[\]\n/);
});
