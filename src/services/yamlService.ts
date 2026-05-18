import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { main as generateConfigYaml } from "../analysis/launch";
import { pickPreferredCSourceFile, type CSourceCandidate } from "./hlsSourceSelection";
import { buildParamYaml, type ParamYamlMetricInputs } from "./paramYaml";

export interface DisplayFile {
    name: string;
    content: string;
}

export interface GenerateYamlFilesOptions {
    afterGenerate?: (sourceDocument: vscode.TextDocument, outputDirectory: vscode.Uri) => Promise<void>;
    paramValues?: ParamYamlMetricInputs;
}

const SEARCH_EXCLUDES = "{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/mock/**,**/readme_assets/**,**/compass-add-fileDir/**,**/compass-add-yaml-0323-main/**}";

export async function chooseYamlOutputDirectory(defaultUri: vscode.Uri): Promise<vscode.Uri> {
    const selectedUri = await vscode.window.showOpenDialog({
        defaultUri,
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "Select output folder",
        title: "Choose where to generate YAML files",
    });

    return selectedUri?.[0] ?? defaultUri;
}

export async function generateYamlFiles(
    outputDirectory: vscode.Uri,
    options: GenerateYamlFilesOptions = {}
): Promise<DisplayFile[]> {
    const cFile = await getCFilePath();
    if (!cFile) {
        throw new Error("Open a .c file, or make sure the workspace contains a .c file.");
    }

    await vscode.workspace.fs.createDirectory(outputDirectory);

    const configPath = path.join(outputDirectory.fsPath, "config.yaml");
    const paramPath = path.join(outputDirectory.fsPath, "params.yaml");

    generateConfigYaml({
        source: cFile.fsPath,
        expandMacros: true,
        drawCallgraph: true,
        output: configPath,
    });

    await fs.promises.writeFile(paramPath, buildParamYaml(options.paramValues), "utf-8");
    if (options.afterGenerate) {
        const sourceDocument = await vscode.workspace.openTextDocument(cFile);
        await options.afterGenerate(sourceDocument, outputDirectory);
    }
    return readYamlFiles(outputDirectory);
}

export async function readYamlFiles(directory: vscode.Uri): Promise<DisplayFile[]> {
    const filesData: DisplayFile[] = [];

    for (const name of ["config.yaml", "params.yaml"]) {
        const fileUri = vscode.Uri.joinPath(directory, name);
        try {
            const bytes = await vscode.workspace.fs.readFile(fileUri);
            filesData.push({
                name,
                content: Buffer.from(bytes).toString("utf8"),
            });
        } catch {
            // Optional generated/sample file was not present.
        }
    }

    return filesData;
}

async function getCFilePath(): Promise<vscode.Uri | null> {
    const candidates: CSourceCandidate[] = [];
    const uriByKey = new Map<string, vscode.Uri>();
    const editor = vscode.window.activeTextEditor;
    const activeDocument = editor?.document;

    if (activeDocument?.uri.scheme === "file" && activeDocument.fileName.toLowerCase().endsWith(".c")) {
        const key = activeDocument.uri.toString();
        uriByKey.set(key, activeDocument.uri);
        candidates.push({
            uri: key,
            source: activeDocument.getText(),
            active: true,
        });
    }

    const matches = await vscode.workspace.findFiles("**/*.c", SEARCH_EXCLUDES, 200);
    for (const match of matches) {
        const key = match.toString();
        if (uriByKey.has(key)) {
            continue;
        }

        try {
            const bytes = await vscode.workspace.fs.readFile(match);
            uriByKey.set(key, match);
            candidates.push({
                uri: key,
                source: Buffer.from(bytes).toString("utf8"),
            });
        } catch {
            // Ignore unreadable files and keep considering other workspace sources.
        }
    }

    const selected = pickPreferredCSourceFile(candidates);
    return selected ? uriByKey.get(selected.uri) ?? vscode.Uri.parse(selected.uri) : null;
}
