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
