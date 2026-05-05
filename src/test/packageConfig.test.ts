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
