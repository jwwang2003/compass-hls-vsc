import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

type ModuleLoad = (request: string, parent: unknown, isMain: boolean) => unknown;

const requireModule = createRequire(__filename);
const moduleWithLoad = requireModule("node:module") as { _load: ModuleLoad };
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = (request, parent, isMain) => {
    if (request === "vscode") {
        return {};
    }
    return originalLoad(request, parent, isMain);
};
const { sourceDefinesFunction } = requireModule("../services/hgboDseRunner") as typeof import("../services/hgboDseRunner");
moduleWithLoad._load = originalLoad;

test("source function detection finds the configured top in the design source", () => {
    const source = `
static void helper(void) {}

void edge_detect(pixel_t input[64], edge_pixel_t output[64])
{
  row_loop: for (int r = 0; r < 8; ++r) {}
}
`;

    assert.equal(sourceDefinesFunction(source, "edge_detect"), true);
    assert.equal(sourceDefinesFunction(source, "local_support"), false);
});

test("source function detection ignores commented-out function definitions", () => {
    const source = `
// void edge_detect(pixel_t input[64], edge_pixel_t output[64]) {}
void local_support(void) {}
`;

    assert.equal(sourceDefinesFunction(source, "edge_detect"), false);
});
