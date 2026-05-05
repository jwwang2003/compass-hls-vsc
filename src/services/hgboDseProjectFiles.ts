const SOURCE_FILE_PATTERN = /\.(c|cc|cpp|cxx|h|hh|hpp|hxx|ipp|inc|inl|dat|data|txt|csv|tcl)$/i;
const BUILD_FILE_PATTERN = /\.(mk|mak|cmake)$/i;
const BUILD_FILE_NAMES = new Set([
    "makefile",
    "cmakelists.txt",
    "cmakepresets.json",
    "cmakeuserpresets.json",
]);
const SKIPPED_PROJECT_DIRECTORIES = new Set([
    ".compass",
    ".git",
    ".vscode",
    "__pycache__",
    "artifacts",
    "build",
    "dist",
    "dse_ds",
    "node_modules",
    "out",
]);

export function shouldCopyProjectFile(name: string): boolean {
    const normalized = name.toLowerCase();
    return BUILD_FILE_NAMES.has(normalized) || BUILD_FILE_PATTERN.test(name) || SOURCE_FILE_PATTERN.test(name);
}

export function shouldTraverseProjectDirectory(name: string): boolean {
    const normalized = name.toLowerCase();
    return !SKIPPED_PROJECT_DIRECTORIES.has(normalized) && !normalized.startsWith("cmake-build-");
}

export function getPackagedSourceFileName(name: string): string {
    return name;
}
