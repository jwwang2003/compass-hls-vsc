import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const readSource = (relativePath: string) => readFileSync(path.join(process.cwd(), ...relativePath.split("/")), "utf8");

test("ResultPanel supports lazy artifact content requests", () => {
    const source = readSource("src/providers/ResultPanel.ts");

    assert.match(source, /setArtifactContentHandler/);
    assert.match(source, /message\.type\s*===\s*["']getArtifactContent["']/);
    assert.match(source, /type:\s*["']artifactContent["']/);
});

test("CompassSidebar loads run overview before artifact contents", () => {
    const source = readSource("src/providers/CompassSidebar.ts");

    assert.match(source, /readHgboRunOverview/);
    assert.match(source, /readHgboRunArtifact/);
    assert.doesNotMatch(source, /loadRunDetails[\s\S]*readHgboRunDetails\(workspaceUri,\s*runId,\s*runs\)/);
});

test("Results webview requests artifact content when files or graphs are opened", () => {
    const source = readSource("webviews/sveltePages/Results.svelte");

    assert.match(source, /type:\s*["']getArtifactContent["']/);
    assert.match(source, /case\s+["']artifactContent["']/);
    assert.match(source, /handleFileToggle/);
    assert.match(source, /requestArtifactContent\(svg\.name\)/);
});
