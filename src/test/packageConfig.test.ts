import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("package.json contributes remote inference MCP endpoint setting", () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    const setting = packageJson.contributes.configuration.properties["compass.remoteInferenceMcpEndpoint"];

    assert.equal(setting.type, "string");
    assert.equal(setting.default, "http://localhost:8000/mcp");
    assert.match(setting.description, /MCP/i);
});

test("package.json test script runs the compiled node test suite", () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));

    assert.equal(packageJson.scripts.test, "node --test out/test/**/*.test.js");
});

test("CodeLens picker UI uses human-readable workflow names", () => {
    const extensionSource = readFileSync(path.join(process.cwd(), "src", "extension.ts"), "utf8");
    const hoverProviderSource = readFileSync(path.join(process.cwd(), "src", "parser", "providers", "tdmHoverProvider.ts"), "utf8");
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    const commandTitles = packageJson.contributes.commands.map((command: { title: string }) => command.title);

    assert.match(extensionSource, /Select interface parameters for config\.yaml/);
    assert.match(extensionSource, /Compass interface parameters:/);
    assert.match(extensionSource, /Select loop operation variables for config\.yaml/);
    assert.match(extensionSource, /Compass loop operations:/);
    assert.ok(commandTitles.includes("Compass: Select Loop Operation Variables"));

    assert.doesNotMatch(extensionSource, /Select parameters for interList/);
    assert.doesNotMatch(extensionSource, /Compass interList:/);
    assert.doesNotMatch(extensionSource, /Select variables for dictOp\.int/);
    assert.doesNotMatch(extensionSource, /Compass dictOp\.int:/);
    assert.ok(!commandTitles.includes("Compass: Select dictOp.int Variables"));

    assert.match(hoverProviderSource, /Compass loop operation hint/);
    assert.match(hoverProviderSource, /Target: \\`Loop Ops\\`/);
    assert.doesNotMatch(hoverProviderSource, /Compass dictOp hint/);
    assert.doesNotMatch(hoverProviderSource, /Target: \\`dictOp\.int\\`/);
});
