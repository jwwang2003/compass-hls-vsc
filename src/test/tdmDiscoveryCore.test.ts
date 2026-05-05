import assert from "node:assert/strict";
import test from "node:test";

import { getParser } from "../analysis/getParser";
import { discoverTdmCandidatesFromRoot } from "../parser/tdmDiscoveryCore";

const nestedLoopSource = `
void bfs(int nodes[10], int edges[20], int starting_node) {
  int h, n, e;
  loop_horizons: for (h = 0; h < 10; h++) {
    loop_nodes: for (n = 0; n < 10; n++) {
      for (e = 0; e < 20; e++) {
        edges[e] += nodes[n];
      }
    }
  }
}
`.trimStart();

test("discovers all function parameters and nested for loops with CodeLens-compatible names", () => {
    const parser = getParser();
    const tree = parser.parse(nestedLoopSource);

    const candidates = discoverTdmCandidatesFromRoot(tree.rootNode);

    assert.deepEqual(candidates.functions.map(fn => fn.name), ["bfs"]);
    assert.deepEqual(candidates.parameters.map(param => param.ref), [
        "bfs nodes",
        "bfs edges",
        "bfs starting_node",
    ]);
    assert.deepEqual(candidates.loops.map(loop => loop.ref), [
        "bfs/loop_horizons",
        "bfs/loop_nodes",
        "bfs/loop_5",
    ]);
    assert.deepEqual(candidates.loops.map(loop => loop.group), [
        "group_bfs_loop_horizons",
        "group_bfs_loop_nodes",
        "group_bfs_loop_5",
    ]);
});
