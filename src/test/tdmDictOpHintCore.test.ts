import assert from "node:assert/strict";
import test from "node:test";

import { getParser } from "../analysis/getParser";
import { discoverDictOpIntHintsFromRoot } from "../parser/tdmDictOpHintCore";

const source = `
void bfs(int *nodes, int *edges) {
  int i;
  int cnt;
  int total;
  loop_neighbors: for (i = 0; i < 10; i++) {
    cnt = cnt + 1;
    ++total;
    edges[i] += nodes[i];
  }
}
`.trimStart();

test("discovers arithmetic variables that can be added to dictOp int", () => {
    const parser = getParser();
    const tree = parser.parse(source);

    const hints = discoverDictOpIntHintsFromRoot(tree.rootNode);

    assert.deepEqual(hints.map(hint => [hint.configKey, hint.operation]), [
        ["bfs/loop_neighbors i", "add"],
        ["bfs/loop_neighbors cnt", "add"],
        ["bfs/loop_neighbors total", "add"],
    ]);
});

test("does not hint read-only variables or array element assignments", () => {
    const parser = getParser();
    const tree = parser.parse(source);

    const keys = discoverDictOpIntHintsFromRoot(tree.rootNode).map(hint => hint.configKey);

    assert.equal(keys.includes("bfs/loop_neighbors nodes"), false);
    assert.equal(keys.includes("bfs/loop_neighbors edges"), false);
});
