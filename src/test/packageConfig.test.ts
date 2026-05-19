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

test("package.json declares repository metadata for packaged README asset URLs", () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));

    assert.equal(packageJson.repository.type, "git");
    assert.equal(packageJson.repository.url, "https://github.com/jwwang2003/compass-hls-vsc.git");
});

test("README avoids SVG image references rejected by VSCE packaging", () => {
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");

    assert.doesNotMatch(readme, /<img[^>]+\.svg/i);
});

test("VS Code type dependency matches the extension engine used for packaging", () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));

    assert.equal(
        packageJson.devDependencies["@types/vscode"].replace(/^\^/, ""),
        packageJson.engines.vscode.replace(/^\^/, "")
    );
});

test(".vscodeignore excludes bulky development artifacts while preserving runtime roots", () => {
    const vscodeIgnore = readFileSync(path.join(process.cwd(), ".vscodeignore"), "utf8")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith("#"));

    const expectedIgnoredPatterns = [
        ".pnpm-store/**",
        ".pytest_cache/**",
        "docs/**",
        "references/**",
        "tests/**",
        "out/test/**",
        "out/extension.js",
        "out/analysis/**",
        "out/parser/**",
        "out/providers/**",
        "out/services/**",
        "out/states/**",
        "out/utilities/**",
        "dist/**/*.map",
        "mock/**",
        "mock2/**",
        "3rdParty/HGBO-DSE/.venv/**",
        "3rdParty/HGBO-DSE/.pytest_cache/**",
        "3rdParty/HGBO-DSE/.idea/**",
        "3rdParty/HGBO-DSE/**/__pycache__/**",
        "3rdParty/HGBO-DSE/**/*.pyc",
        "3rdParty/HGBO-DSE/logs/**",
        "3rdParty/HGBO-DSE/_old/**",
        "3rdParty/HGBO-DSE/tests/**",
        "3rdParty/HGBO-DSE/baseline/**",
        "3rdParty/HGBO-DSE/benchmark/**",
        "3rdParty/HGBO-DSE/context0/**",
        "3rdParty/HGBO-DSE/dataset/**",
        "3rdParty/HGBO-DSE/dse_ds/**",
        "3rdParty/HGBO-DSE/img/**",
        "3rdParty/HGBO-DSE/hgp/data_process/case/**",
        "3rdParty/HGBO-DSE/pareto/tidy_data/**",
    ];

    for (const pattern of expectedIgnoredPatterns) {
        assert.ok(vscodeIgnore.includes(pattern), `missing .vscodeignore pattern: ${pattern}`);
    }

    for (const runtimeRoot of ["dist/**", "out/compiled/**", "media/**", "resources/**", "3rdParty/**", "3rdParty/HGBO-DSE/**"]) {
        assert.ok(!vscodeIgnore.includes(runtimeRoot), `.vscodeignore must not exclude runtime root: ${runtimeRoot}`);
    }
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
