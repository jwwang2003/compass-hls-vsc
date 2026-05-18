import assert from "node:assert/strict";
import test from "node:test";

import { findTopFunctions } from "../analysis/findTopFunctions";

const testbenchSource = `
static int helper(int value) {
  return value + 1;
}

void kernel(int input[16], int output[16]) {
  loop_i: for (int i = 0; i < 16; ++i) {
    output[i] = helper(input[i]);
  }
}

int main(void) {
  int input[16];
  int output[16];
  kernel(input, output);
  return output[0];
}
`.trimStart();

const multipleRootsSource = `
void local_support(void) {}

void edge_detect(int input[64], int output[64]) {
  row_loop: for (int row = 0; row < 8; ++row) {
    output[row] = input[row];
  }
}
`.trimStart();

test("top function detection prefers the HLS kernel over a testbench main", () => {
    assert.equal(findTopFunctions(testbenchSource)[0], "kernel");
});

test("top function detection prefers interface and loop rich roots over support roots", () => {
    assert.equal(findTopFunctions(multipleRootsSource)[0], "edge_detect");
});
