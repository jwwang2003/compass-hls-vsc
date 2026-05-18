import * as path from "path";
import * as vscode from "vscode";

export interface ProjectResetOptions {
    yamlDirectories?: vscode.Uri[];
    useTrash?: boolean;
}

export interface ProjectResetFailure {
    path: string;
    message: string;
}

export interface ProjectResetSummary {
    deleted: string[];
    missing: string[];
    skipped: string[];
    failed: ProjectResetFailure[];
}

interface ResetTarget {
    uri: vscode.Uri;
    recursive: boolean;
    kind: "path" | "generated-yaml";
}

const GENERATED_YAML_FILES = ["config.yaml", "params.yaml"] as const;
const GENERATED_COMPASS_DIRECTORIES = ["hgbo-package", "runs"] as const;
const GENERATED_COMPASS_FILES = ["config.yaml", "params.yaml", "hgbo-dse.log"] as const;

export async function resetCompassProjectArtifacts(
    workspaceUri: vscode.Uri,
    options: ProjectResetOptions = {}
): Promise<ProjectResetSummary> {
    const summary: ProjectResetSummary = {
        deleted: [],
        missing: [],
        skipped: [],
        failed: [],
    };

    for (const target of buildProjectResetTargets(workspaceUri, options)) {
        await deleteIfPresent(target, options.useTrash ?? true, summary);
    }

    return summary;
}

function buildProjectResetTargets(
    workspaceUri: vscode.Uri,
    options: ProjectResetOptions
): ResetTarget[] {
    const compassUri = vscode.Uri.joinPath(workspaceUri, ".compass");
    const targets: ResetTarget[] = [];

    for (const file of GENERATED_YAML_FILES) {
        targets.push({ uri: vscode.Uri.joinPath(workspaceUri, file), recursive: false, kind: "generated-yaml" });
    }

    for (const file of GENERATED_COMPASS_FILES) {
        targets.push({
            uri: vscode.Uri.joinPath(compassUri, file),
            recursive: false,
            kind: file.endsWith(".yaml") ? "generated-yaml" : "path",
        });
    }

    for (const directory of GENERATED_COMPASS_DIRECTORIES) {
        targets.push({ uri: vscode.Uri.joinPath(compassUri, directory), recursive: true, kind: "path" });
    }

    for (const directory of options.yamlDirectories ?? []) {
        if (!isWithinDirectory(directory, workspaceUri)) {
            continue;
        }

        for (const file of GENERATED_YAML_FILES) {
            targets.push({ uri: vscode.Uri.joinPath(directory, file), recursive: false, kind: "generated-yaml" });
        }
    }

    return uniqueTargets(targets);
}

async function deleteIfPresent(
    target: ResetTarget,
    useTrash: boolean,
    summary: ProjectResetSummary
) {
    try {
        await vscode.workspace.fs.stat(target.uri);
    } catch {
        summary.missing.push(target.uri.fsPath);
        return;
    }

    try {
        if (target.kind === "generated-yaml" && !await isGeneratedCompassYaml(target.uri)) {
            summary.skipped.push(target.uri.fsPath);
            return;
        }

        await vscode.workspace.fs.delete(target.uri, {
            recursive: target.recursive,
            useTrash,
        });
        summary.deleted.push(target.uri.fsPath);
    } catch (err: unknown) {
        summary.failed.push({
            path: target.uri.fsPath,
            message: err instanceof Error ? err.message : String(err),
        });
    }
}

function uniqueTargets(targets: ResetTarget[]): ResetTarget[] {
    const seen = new Set<string>();
    const unique: ResetTarget[] = [];

    for (const target of targets) {
        if (seen.has(target.uri.fsPath)) {
            continue;
        }
        seen.add(target.uri.fsPath);
        unique.push(target);
    }

    return unique;
}

async function isGeneratedCompassYaml(uri: vscode.Uri): Promise<boolean> {
    const fileName = path.basename(uri.fsPath).toLowerCase();
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString("utf8");

    if (fileName === "config.yaml") {
        return ["top", "funcList", "loopList", "arrList", "interList", "dictOp"]
            .every(key => new RegExp(`(^|\\n)${key}:`).test(text));
    }

    if (fileName === "params.yaml") {
        return ["inline", "balance", "style", "POW", "LATENCY"]
            .every(key => new RegExp(`(^|\\n)${key}:`).test(text));
    }

    return false;
}

function isWithinDirectory(candidate: vscode.Uri, parent: vscode.Uri): boolean {
    const relative = path.relative(parent.fsPath, candidate.fsPath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
