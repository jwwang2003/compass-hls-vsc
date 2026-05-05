import assert from "node:assert/strict";
import test from "node:test";

import {
    getPackagedSourceFileName,
    shouldCopyProjectFile,
    shouldTraverseProjectDirectory,
} from "../services/hgboDseProjectFiles";

test("HGBO-DSE packaging keeps C/C++ build inputs and skips generated folders", () => {
    for (const fileName of [
        "Makefile",
        "makefile",
        "CMakeLists.txt",
        "toolchain.cmake",
        "kernel.c",
        "kernel.cpp",
        "kernel.cxx",
        "kernel.hpp",
        "input.data",
        "directives.tcl",
    ]) {
        assert.equal(shouldCopyProjectFile(fileName), true, fileName);
    }

    assert.equal(shouldTraverseProjectDirectory("common"), true);
    assert.equal(shouldTraverseProjectDirectory(".compass"), false);
    assert.equal(shouldTraverseProjectDirectory("node_modules"), false);
    assert.equal(shouldTraverseProjectDirectory("artifacts"), false);
});

test("HGBO-DSE packaging renames only the selected C source to the requested case name", () => {
    assert.equal(getPackagedSourceFileName("bfs.c", true, "kernel"), "kernel.c");
    assert.equal(getPackagedSourceFileName("bfs.h", false, "kernel"), "bfs.h");
});

test("HGBO-DSE packaging keeps MachSuite local_support.c under its expected name", () => {
    assert.equal(getPackagedSourceFileName("local_support.c", true, "bfs"), "local_support.c");
});
