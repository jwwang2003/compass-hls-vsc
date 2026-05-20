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
        "mock0/**",
        "mock1/**",
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

    assert.ok(!vscodeIgnore.includes("mock/**"), ".vscodeignore must use mock0/mock1 sample names");
    assert.ok(!vscodeIgnore.includes("mock2/**"), ".vscodeignore must use mock0/mock1 sample names");
    assert.ok(!vscodeIgnore.includes("3rdParty/HGBO-DSE/hgp/model/**"), ".vscodeignore must keep original HGBO-DSE weights");
});

test("debug launch opens mock0 by default and keeps mock1 available", () => {
    const launchJson = readFileSync(path.join(process.cwd(), ".vscode", "launch.json"), "utf8");

    assert.match(launchJson, /"name":\s*"Run Extension \(mock0\)"/);
    assert.match(launchJson, /"--extensionDevelopmentPath=\$\{workspaceFolder\}"/);
    assert.match(launchJson, /"\$\{workspaceFolder\}\/mock0"/);
    assert.match(launchJson, /"name":\s*"Run Extension \(mock1\)"/);
    assert.match(launchJson, /"\$\{workspaceFolder\}\/mock1"/);
    assert.doesNotMatch(launchJson, /mock2/);
});

test("sample workspaces point at the relative HGBO-DSE Python 3.9 virtualenv", () => {
    for (const sampleName of ["mock0", "mock1"]) {
        const settings = JSON.parse(readFileSync(path.join(process.cwd(), sampleName, ".vscode", "settings.json"), "utf8"));

        assert.equal(settings["compass.hgboPythonPath"], "../3rdParty/HGBO-DSE/.venv/bin/python");
    }
});

test("HGBO-DSE defaults target Python 3.9 virtualenv and bundled model weights", () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    const sidebarSource = readFileSync(path.join(process.cwd(), "src", "providers", "CompassSidebar.ts"), "utf8");
    const pyproject = readFileSync(path.join(process.cwd(), "3rdParty", "HGBO-DSE", "pyproject.toml"), "utf8");
    const uvLock = readFileSync(path.join(process.cwd(), "3rdParty", "HGBO-DSE", "uv.lock"), "utf8");

    assert.equal(packageJson.contributes.configuration.properties["compass.hgboPythonPath"].default, "python3.9");
    assert.match(sidebarSource, /3rdParty["'],\s*["']HGBO-DSE["'],\s*["']\.venv["'],\s*["']bin["'],\s*["']python/);
    assert.match(sidebarSource, /3rdParty["'],\s*["']HGBO-DSE["'],\s*["']\.venv["'],\s*["']Scripts["'],\s*["']python\.exe/);
    assert.match(pyproject, /requires-python\s*=\s*"?>=3\.9,<3\.10"?/);
    assert.match(uvLock, /requires-python\s*=\s*"==3\.9\.\*"/);

    for (const modelFile of [
        "bram_mae_h64_d0_checkpoint_test.pt",
        "cp_mean_h64_d0_checkpoint_test.pt",
        "dsp_mae_h64_d0_checkpoint_test.pt",
        "ff_h64_d0_checkpoint_test.pt",
        "lut_h64_d0_checkpoint_test.pt",
        "power_mean_h64_d0_checkpoint_test.pt",
    ]) {
        assert.ok(readFileSync(path.join(process.cwd(), "3rdParty", "HGBO-DSE", "hgp", "model", modelFile)).byteLength > 0);
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
