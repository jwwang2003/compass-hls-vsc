import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const readSource = (relativePath: string) => readFileSync(path.join(process.cwd(), "src", ...relativePath.split("/")), "utf8");

test("CodeLens provider consumes a shared analysis snapshot instead of direct tree discovery", () => {
    const source = readSource("parser/providers/tdmCodeLensProvider.ts");

    assert.match(source, /getCodeLensAnalysisSnapshot/);
    assert.doesNotMatch(source, /getCachedTree/);
    assert.doesNotMatch(source, /discoverTdmCandidates\(document\)/);
    assert.doesNotMatch(source, /discoverDictOpIntHintsFromRoot/);
});

test("dictOp decorations consume shared analysis hints instead of walking the tree", () => {
    const source = readSource("parser/providers/tdmDictOpDecorationProvider.ts");

    assert.match(source, /getTdmAnalysisSnapshot/);
    assert.doesNotMatch(source, /getCachedTree/);
    assert.doesNotMatch(source, /discoverDictOpIntHintsFromRoot/);
});

test("extension text edits preserve analysis snapshots for stale CodeLens fallback", () => {
    const source = readSource("extension.ts");

    assert.doesNotMatch(source, /onDidChangeTextDocument[\s\S]*clearTdmCandidateCache\(event\.document\.uri\)/);
});
