import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("HGBO-DSE runner exposes lazy run overview and artifact readers", () => {
    const source = readFileSync(path.join(process.cwd(), "src", "services", "hgboDseRunner.ts"), "utf8");

    assert.match(source, /export\s+async\s+function\s+readHgboRunOverview/);
    assert.match(source, /export\s+async\s+function\s+readHgboRunArtifactIndex/);
    assert.match(source, /export\s+async\s+function\s+readHgboRunArtifact/);
    assert.match(source, /readResultFileIndex/);
});
