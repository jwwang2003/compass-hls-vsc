import assert from "node:assert/strict";
import test from "node:test";

import { pickPreferredCSourceFile, type CSourceCandidate } from "../services/hlsSourceSelection";

const supportSource = `
void local_support(void) {}
`.trimStart();

const designSource = `
void edge_detect(int input[64], int output[64]) {
  row_loop: for (int row = 0; row < 8; ++row) {
    output[row] = input[row];
  }
}
`.trimStart();

test("source selection prefers design files over active support files", () => {
    const candidates: CSourceCandidate[] = [
        { uri: "file:///workspace/local_support.c", source: supportSource, active: true },
        { uri: "file:///workspace/edge_detect.c", source: designSource },
    ];

    assert.equal(pickPreferredCSourceFile(candidates)?.uri, "file:///workspace/edge_detect.c");
});

test("source selection keeps the active file when it has a viable top function", () => {
    const candidates: CSourceCandidate[] = [
        { uri: "file:///workspace/edge_detect.c", source: designSource, active: true },
        { uri: "file:///workspace/local_support.c", source: supportSource },
    ];

    assert.equal(pickPreferredCSourceFile(candidates)?.uri, "file:///workspace/edge_detect.c");
});
