import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("analysis TypeScript modules use lower camelCase filenames", () => {
    const files = readdirSync(path.join(root, "src", "analysis"))
        .filter(file => file.endsWith(".ts"));

    for (const file of files) {
        assert.match(file, /^[a-z][A-Za-z0-9]*\.ts$/, `${file} should use lower camelCase`);
    }
});

test("analysis helper exports use descriptive camelCase names", () => {
    const expectedExports = new Map([
        ["addDefaultInitializers.ts", "addDefaultInitializers"],
        ["collectFunctionList.ts", "collectFunctionList"],
        ["collectInterfaceList.ts", "collectInterfaceList"],
        ["findArrayList.ts", "findArrayList"],
        ["findTopFunctions.ts", "findTopFunctions"],
        ["generateYamlFromCFile.ts", "generateConfigFromCFile"],
        ["removeCComments.ts", "removeCCommentsFromFile"],
    ]);

    for (const [file, exportName] of expectedExports) {
        const source = readFileSync(path.join(root, "src", "analysis", file), "utf8");
        assert.match(source, new RegExp(`export\\s+function\\s+${exportName}\\b`));
    }
});

test("provider modules export a type matching their PascalCase filename", () => {
    const files = readdirSync(path.join(root, "src", "providers"))
        .filter(file => file.endsWith(".ts"));

    for (const file of files) {
        const typeName = path.basename(file, ".ts");
        const source = readFileSync(path.join(root, "src", "providers", file), "utf8");
        assert.match(source, new RegExp(`export\\s+(?:class|interface)\\s+${typeName}\\b`));
    }
});
