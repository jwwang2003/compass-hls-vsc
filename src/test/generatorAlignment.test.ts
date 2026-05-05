import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { extractLoops } from "../analysis/extractLoops";
import { getParser } from "../analysis/getParser";
import { generateConfigFromCFile, generateYamlFromCFile } from "../analysis/generateYamlFromCFile";

const source = `
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

const bfsReferenceSource = `
void bfs(node_t nodes[N_NODES], edge_t edges[N_EDGES],
            node_index_t starting_node, level_t level[N_NODES],
            edge_index_t level_counts[N_LEVELS])
{
  node_index_t n;
  edge_index_t e;
  level_t horizon;
  edge_index_t cnt;

  level[starting_node] = 0;
  level_counts[0] = 1;

  loop_horizons: for( horizon=0; horizon<N_LEVELS; horizon++ ) {
    cnt = 0;
    loop_nodes: for( n=0; n<N_NODES; n++ ) {
      if( level[n]==horizon ) {
        edge_index_t tmp_begin = nodes[n].edge_begin;
        edge_index_t tmp_end = nodes[n].edge_end;
        loop_neighbors: for( e=tmp_begin; e<tmp_end; e++ ) {
          node_index_t tmp_dst = edges[e].dst;
          level_t tmp_level = level[tmp_dst];

          if( tmp_level ==MAX_LEVEL ) {
            level[tmp_dst] = horizon+1;
            ++cnt;
          }
        }
      }
    }
    if( (level_counts[horizon+1]=cnt)==0 )
      break;
  }
}
`.trimStart();

test("generated config matches the reference YAML schema for nested BFS loops", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "compass-generator-"));
    const sourcePath = path.join(directory, "bfs.c");
    fs.writeFileSync(sourcePath, bfsReferenceSource, "utf8");

    const config = generateConfigFromCFile(sourcePath, false);

    assert.deepEqual(config.interList, [
        "bfs nodes",
        "bfs edges",
        "bfs level",
        "bfs level_counts",
    ]);
    assert.deepEqual(config.loopList, {
        group1: {
            level: [
                "bfs/loop_horizons",
                "bfs/loop_nodes",
                "bfs/loop_neighbors",
            ],
            unroll: [
                "bfs/loop_horizons",
                "bfs/loop_nodes",
                "bfs/loop_neighbors",
            ],
            pipeline: ["bfs/loop_neighbors"],
            flatten: [],
        },
    });
    assert.deepEqual(config.dictOp, {
        int: {
            "bfs/loop_horizons horizon": ["add"],
            "bfs/loop_nodes n": ["add"],
            "bfs/loop_neighbors e": ["add"],
            "bfs/loop_neighbors cnt": ["add"],
        },
        float: [],
        double: [],
        half: [],
    });
});

test("generated YAML text keeps the reference list formatting without anchors", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "compass-generator-"));
    const sourcePath = path.join(directory, "bfs.c");
    const outputPath = path.join(directory, "bfs.yaml");
    fs.writeFileSync(sourcePath, bfsReferenceSource, "utf8");

    generateYamlFromCFile(sourcePath, false, outputPath);
    const yamlText = fs.readFileSync(outputPath, "utf8");

    assert.equal(yamlText.includes("&ref_"), false);
    assert.equal(yamlText.includes("funcList: []"), false);
    assert.match(yamlText, /funcList:\n {4}-\s*\n/);
    assert.match(yamlText, /flatten:\n {12}-\s*\n/);
    assert.match(yamlText, /float:\n {8}-\s*\n/);
    assert.ok(yamlText.indexOf("arrList:") < yamlText.indexOf("interList:"));
});

test("native analysis loop extraction gives every nested for loop a distinct aligned label", () => {
    const parser = getParser();
    const tree = parser.parse(source);
    const functionNode = tree.rootNode.descendantsOfType("function_definition")[0];

    const loops = extractLoops(functionNode, source);
    const labels = flattenLoopLabels(loops);

    assert.deepEqual(labels, ["loop_horizons", "loop_nodes", "loop_5"]);
});

function flattenLoopLabels(loops: Array<{ label: string; innerLoops?: unknown[] }>): string[] {
    const labels: string[] = [];
    for (const loop of loops) {
        labels.push(loop.label);
        labels.push(...flattenLoopLabels((loop.innerLoops ?? []) as Array<{ label: string; innerLoops?: unknown[] }>));
    }
    return labels;
}
