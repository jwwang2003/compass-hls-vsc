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

test("HGBO-DSE packaging preserves project source file names", () => {
    assert.equal(getPackagedSourceFileName("edge_detect.c"), "edge_detect.c");
    assert.equal(getPackagedSourceFileName("bfs.h"), "bfs.h");
});

test("HGBO-DSE packaging keeps MachSuite local_support.c under its expected name", () => {
    assert.equal(getPackagedSourceFileName("local_support.c"), "local_support.c");
});
