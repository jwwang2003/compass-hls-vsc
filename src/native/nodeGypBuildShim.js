const path = require("path");

const treeSitterBinding = require("tree-sitter/build/Release/tree_sitter_runtime_binding.node");

const treeSitterCBindings = {
    "darwin-arm64": () => require("tree-sitter-c/prebuilds/darwin-arm64/tree-sitter-c.node"),
    "darwin-x64": () => require("tree-sitter-c/prebuilds/darwin-x64/tree-sitter-c.node"),
    "linux-arm64": () => require("tree-sitter-c/prebuilds/linux-arm64/tree-sitter-c.node"),
    "linux-x64": () => require("tree-sitter-c/prebuilds/linux-x64/tree-sitter-c.node"),
    "win32-arm64": () => require("tree-sitter-c/prebuilds/win32-arm64/tree-sitter-c.node"),
    "win32-x64": () => require("tree-sitter-c/prebuilds/win32-x64/tree-sitter-c.node"),
};

function loadTreeSitterCBinding() {
    const key = `${process.platform}-${process.arch}`;
    const loadBinding = treeSitterCBindings[key];
    if (!loadBinding) {
        throw new Error(`Unsupported tree-sitter-c platform: ${key}`);
    }

    return loadBinding();
}

function load(dir) {
    if (path.resolve(dir || ".") === __dirname) {
        return treeSitterBinding;
    }

    return loadTreeSitterCBinding();
}

load.resolve = load.path = function resolve(dir) {
    return path.resolve(dir || ".");
};

module.exports = load;
