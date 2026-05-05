import { spawn } from "child_process";
import * as path from "path";
import * as vscode from "vscode";

import type { DisplayFile } from "./yamlService";
import {
    assertDsePathNames,
    buildHgboImplVerifyArgs,
    buildHgboDseArgs,
    type DseOptions,
    type HgboProgress,
    parseHgboImplVerificationProgress,
    parseHgboProgress,
} from "./hgboDseConfig";
import {
    getPackagedSourceFileName,
    shouldCopyProjectFile,
    shouldTraverseProjectDirectory,
} from "./hgboDseProjectFiles";
import {
    attachDseVerificationToManifest,
    attachDseVerificationToPlot,
    buildDseVerificationComparisons,
    buildDsePlotData,
    buildTrialManifest,
    groupRunFilesByProject,
    parseHgboTrialPoints,
    type DseTrialManifestEntry,
    type DseVerificationActual,
    type DseVerificationComparison,
    type DsePlotData,
    type RunFileGroup,
} from "./hgboDseResults";

export interface DseStatusPayload {
    running: boolean;
    stage: string;
    progress: number;
    message: string;
    current?: number;
    total?: number;
    error?: string;
    logPath?: string;
}

export interface DseLogPayload {
    stream: "stdout" | "stderr" | "system";
    text: string;
}

export interface DseGraphArtifact {
    name: string;
    uri: string;
    content: string;
}

export interface HgboRunSummary {
    id: string;
    label: string;
    fileCount: number;
    isLatest: boolean;
}

export interface HgboRunResultsPayload {
    runId: string;
    runs: HgboRunSummary[];
    logs: DisplayFile[];
    fileGroups: RunFileGroup[];
    svgs: DseGraphArtifact[];
    plot: DsePlotData;
    trialManifest: DseTrialManifestEntry[];
    verification: DseVerificationComparison[];
    loading?: boolean;
    message?: string;
}

export interface CompassDsePackage {
    packageRootUri: vscode.Uri;
    configUri: vscode.Uri;
    paramsUri: vscode.Uri;
    projectUri: vscode.Uri;
    manifestUri: vscode.Uri;
    files: string[];
}

export interface HgboDseRunResult {
    exitCode: number | null;
    runUri: vscode.Uri;
    logUri: vscode.Uri;
}

export interface HgboDseRunCallbacks {
    onStatus?: (status: DseStatusPayload) => void;
    onLog?: (log: DseLogPayload) => void;
    onProgress?: (progress: HgboProgress) => void;
}

export interface RemoteInferenceRuntime {
    endpoint: string;
    apiKey: string;
    timeoutSec?: number;
}

export interface RemoteInferenceOutputRedactor {
    push(text: string): string;
    flush(): string;
}

const PACKAGE_DIR = "hgbo-package";
const RUNS_DIR = "runs";
const MANIFEST_FILE = "manifest.json";
const LOG_FILE = "hgbo-dse.log";
const TEXT_RESULT_PATTERN = /\.(txt|log|json|ya?ml|tcl|csv|md)$/i;
const SVG_RESULT_PATTERN = /\.svg$/i;
const SOURCE_SEARCH_EXCLUDES = "{**/node_modules/**,**/.git/**,**/.compass/**,**/dist/**,**/out/**,**/3rdParty/**,**/readme_assets/**}";

export function buildHgboDseEnvironment(
    baseEnv: NodeJS.ProcessEnv,
    remoteInference?: RemoteInferenceRuntime
): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
        ...baseEnv,
        PYTHONUNBUFFERED: "1",
    };

    if (remoteInference) {
        env.HGBO_MCP_URL = remoteInference.endpoint;
        env.HGBO_MCP_API_KEY = remoteInference.apiKey;
        env.HGBO_REMOTE_TIMEOUT_SEC = String(remoteInference.timeoutSec ?? 600);
    } else {
        delete env.HGBO_MCP_URL;
        delete env.HGBO_MCP_API_KEY;
        delete env.HGBO_REMOTE_TIMEOUT_SEC;
    }

    return env;
}

export function redactRemoteInferenceOutput(
    text: string,
    remoteInference?: RemoteInferenceRuntime
): string {
    const apiKey = remoteInference?.apiKey;
    if (!apiKey) {
        return text;
    }
    return text.split(apiKey).join("[redacted]");
}

export function createRemoteInferenceOutputRedactor(
    remoteInference?: RemoteInferenceRuntime
): RemoteInferenceOutputRedactor {
    const apiKey = remoteInference?.apiKey;
    if (!apiKey) {
        return {
            push: text => text,
            flush: () => "",
        };
    }

    let pending = "";

    return {
        push: text => {
            let output = "";
            for (const char of text) {
                pending += char;
                if (pending.endsWith(apiKey)) {
                    output += `${pending.slice(0, -apiKey.length)}[redacted]`;
                    pending = "";
                    continue;
                }

                const keepLength = longestSecretPrefixSuffix(pending, apiKey);
                const emitLength = pending.length - keepLength;
                if (emitLength > 0) {
                    output += pending.slice(0, emitLength);
                    pending = pending.slice(emitLength);
                }
            }
            return output;
        },
        flush: () => {
            const output = pending;
            pending = "";
            return output;
        },
    };
}

function longestSecretPrefixSuffix(value: string, secret: string): number {
    const maxLength = Math.min(secret.length - 1, value.length);
    for (let length = maxLength; length > 0; length -= 1) {
        if (value.endsWith(secret.slice(0, length))) {
            return length;
        }
    }
    return 0;
}

export async function prepareHgboDsePackage(
    workspaceFolder: vscode.WorkspaceFolder,
    options: DseOptions,
    progress?: vscode.Progress<{ message?: string; increment?: number }>
): Promise<CompassDsePackage> {
    assertDsePathNames(options);

    const compassUri = vscode.Uri.joinPath(workspaceFolder.uri, ".compass");
    const packageRootUri = vscode.Uri.joinPath(compassUri, PACKAGE_DIR);
    const configSourceUri = await findFirstExisting([
        vscode.Uri.joinPath(compassUri, "config.yaml"),
        vscode.Uri.joinPath(workspaceFolder.uri, "config.yaml"),
    ]);
    const paramsSourceUri = await findFirstExisting([
        vscode.Uri.joinPath(compassUri, "params.yaml"),
        vscode.Uri.joinPath(workspaceFolder.uri, "params.yaml"),
    ]);

    if (!configSourceUri || !paramsSourceUri) {
        throw new Error("Generate config.yaml and params.yaml before packaging .compass.");
    }

    const sourceUri = await getSourceFileUri(workspaceFolder.uri);
    if (!sourceUri) {
        throw new Error("Open a .c file, or make sure the workspace contains a .c file.");
    }

    await resetDirectory(packageRootUri);

    progress?.report({ increment: 10, message: "Copying HGBO-DSE YAML configuration" });
    const configUri = vscode.Uri.joinPath(packageRootUri, "config.yaml");
    const paramsUri = vscode.Uri.joinPath(packageRootUri, "params.yaml");
    await copyFile(configSourceUri, configUri);
    await copyFile(paramsSourceUri, paramsUri);

    const projectUri = vscode.Uri.joinPath(
        packageRootUri,
        "benchmark",
        options.bench,
        options.caseName,
        options.ver
    );
    await vscode.workspace.fs.createDirectory(projectUri);

    progress?.report({ increment: 35, message: "Copying HLS source inputs" });
    await copySourceDirectory(sourceUri, projectUri, options.caseName);

    const manifestUri = vscode.Uri.joinPath(packageRootUri, MANIFEST_FILE);
    const manifest = {
        version: 1,
        createdAt: new Date().toISOString(),
        dse: options,
        paths: {
            config: configUri.fsPath,
            params: paramsUri.fsPath,
            project: projectUri.fsPath,
        },
    };
    await vscode.workspace.fs.writeFile(manifestUri, Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));

    const files = await collectRelativeFiles(packageRootUri);
    progress?.report({ increment: 55, message: "Compass package ready" });

    return {
        packageRootUri,
        configUri,
        paramsUri,
        projectUri,
        manifestUri,
        files,
    };
}

export async function runHgboDse(
    extensionUri: vscode.Uri,
    workspaceFolder: vscode.WorkspaceFolder,
    options: DseOptions,
    dsePackage: CompassDsePackage,
    pythonPath: string,
    callbacks: HgboDseRunCallbacks = {},
    remoteInference?: RemoteInferenceRuntime
): Promise<HgboDseRunResult> {
    assertDsePathNames(options);

    const hgboRootUri = vscode.Uri.joinPath(extensionUri, "3rdParty", "HGBO-DSE");
    await vscode.workspace.fs.stat(hgboRootUri);

    const runId = createRunId();
    const runUri = vscode.Uri.joinPath(workspaceFolder.uri, ".compass", RUNS_DIR, runId);
    await vscode.workspace.fs.createDirectory(runUri);
    const runPackageRootUri = vscode.Uri.joinPath(runUri, "package");
    await copyDirectory(dsePackage.packageRootUri, runPackageRootUri);
    const runPackage = {
        configUri: vscode.Uri.joinPath(runPackageRootUri, "config.yaml"),
        paramsUri: vscode.Uri.joinPath(runPackageRootUri, "params.yaml"),
        projectUri: vscode.Uri.joinPath(runPackageRootUri, "benchmark", options.bench, options.caseName, options.ver),
    };
    const logUri = vscode.Uri.joinPath(runUri, LOG_FILE);
    const args = buildHgboDseArgs(options, {
        configPath: runPackage.configUri.fsPath,
        paramsPath: runPackage.paramsUri.fsPath,
        projectPath: runPackage.projectUri.fsPath,
        isolatedPath: runUri.fsPath,
    });
    const logChunks: string[] = [];

    callbacks.onStatus?.({
        running: true,
        stage: "Launching HGBO-DSE",
        progress: 0,
        message: `${pythonPath} ${args.join(" ")}`,
        logPath: logUri.fsPath,
    });
    callbacks.onLog?.({ stream: "system", text: `Launching: ${pythonPath} ${args.join(" ")}\n` });

    return new Promise((resolve, reject) => {
        const child = spawn(pythonPath, args, {
            cwd: hgboRootUri.fsPath,
            env: buildHgboDseEnvironment(process.env, remoteInference),
        });

        const handleText = createProcessTextHandler(options, callbacks, logChunks, remoteInference);

        child.stdout.on("data", chunk => handleText("stdout", chunk));
        child.stderr.on("data", chunk => handleText("stderr", chunk));
        child.on("error", async error => {
            handleText.flush("stdout");
            handleText.flush("stderr");
            const message = redactRemoteInferenceOutput(error.message, remoteInference);
            callbacks.onLog?.({ stream: "system", text: `${message}\n` });
            logChunks.push(message, "\n");
            await writeRunLog(logUri, logChunks);
            reject(new Error(message));
        });
        child.on("close", async code => {
            handleText.flush("stdout");
            handleText.flush("stderr");
            await writeRunLog(logUri, logChunks);

            if (code === 0) {
                callbacks.onStatus?.({
                    running: false,
                    stage: "Complete",
                    progress: 100,
                    message: "HGBO-DSE process completed.",
                    logPath: logUri.fsPath,
                });
                resolve({ exitCode: code, runUri, logUri });
                return;
            }

            const error = new Error(`HGBO-DSE exited with code ${code ?? "unknown"}. See ${logUri.fsPath}`);
            callbacks.onStatus?.({
                running: false,
                stage: "Failed",
                progress: 100,
                message: error.message,
                error: error.message,
                logPath: logUri.fsPath,
            });
            reject(error);
        });
    });
}

export async function runHgboImplVerification(
    extensionUri: vscode.Uri,
    workspaceFolder: vscode.WorkspaceFolder,
    sourceRunId: string,
    options: DseOptions,
    trialManifest: DseTrialManifestEntry[],
    selectedTrials: number[],
    pythonPath: string,
    callbacks: HgboDseRunCallbacks = {}
): Promise<void> {
    assertDsePathNames(options);

    const hgboRootUri = vscode.Uri.joinPath(extensionUri, "3rdParty", "HGBO-DSE");
    await vscode.workspace.fs.stat(hgboRootUri);

    const sourceRunUri = getHgboRunUri(workspaceFolder.uri, sourceRunId);
    const selectedTrialSet = new Set(selectedTrials);
    const selectedEntries = trialManifest.filter(entry => selectedTrialSet.has(entry.trial));
    if (selectedEntries.length === 0) {
        throw new Error("Select at least one Pareto PPA study with saved trial parameters.");
    }

    const packageRootUri = await findFirstExisting([
        vscode.Uri.joinPath(sourceRunUri, "package"),
        vscode.Uri.joinPath(workspaceFolder.uri, ".compass", PACKAGE_DIR),
    ]);
    if (!packageRootUri) {
        throw new Error("No packaged HGBO-DSE inputs found for implementation verification.");
    }

    const verificationUri = vscode.Uri.joinPath(sourceRunUri, "impl-verification", createVerificationId());
    await vscode.workspace.fs.createDirectory(verificationUri);
    const selectionUri = vscode.Uri.joinPath(verificationUri, "selected_trials.json");
    const outputUri = vscode.Uri.joinPath(sourceRunUri, "impl_verification.json");
    const logUri = vscode.Uri.joinPath(verificationUri, "impl-verification.log");
    await vscode.workspace.fs.writeFile(selectionUri, Buffer.from(JSON.stringify({
        sourceRunId,
        trials: selectedEntries,
    }, null, 2), "utf8"));

    const args = buildHgboImplVerifyArgs(options, {
        configPath: vscode.Uri.joinPath(packageRootUri, "config.yaml").fsPath,
        paramsPath: vscode.Uri.joinPath(packageRootUri, "params.yaml").fsPath,
        projectPath: vscode.Uri.joinPath(packageRootUri, "benchmark", options.bench, options.caseName, options.ver).fsPath,
        isolatedPath: verificationUri.fsPath,
        selectionPath: selectionUri.fsPath,
        outputPath: outputUri.fsPath,
    });
    const logChunks: string[] = [];

    callbacks.onStatus?.({
        running: true,
        stage: "Running implementation verification",
        progress: 0,
        message: `${pythonPath} ${args.join(" ")}`,
        logPath: logUri.fsPath,
    });
    callbacks.onLog?.({ stream: "system", text: `Launching: ${pythonPath} ${args.join(" ")}\n` });

    await new Promise<void>((resolve, reject) => {
        const child = spawn(pythonPath, args, {
            cwd: hgboRootUri.fsPath,
            env: buildHgboDseEnvironment(process.env),
        });
        const selectedTrialOrder = selectedEntries.map(entry => entry.trial);
        const handleText = createImplVerificationTextHandler(selectedTrialOrder, callbacks, logChunks, logUri.fsPath);

        child.stdout.on("data", chunk => handleText("stdout", chunk));
        child.stderr.on("data", chunk => handleText("stderr", chunk));
        child.on("error", async error => {
            callbacks.onLog?.({ stream: "system", text: `${error.message}\n` });
            logChunks.push(error.message, "\n");
            await writeRunLog(logUri, logChunks);
            reject(error);
        });
        child.on("close", async code => {
            await writeRunLog(logUri, logChunks);
            if (code === 0) {
                callbacks.onStatus?.({
                    running: false,
                    stage: "Implementation verification complete",
                    progress: 100,
                    message: "Implementation verification completed.",
                    logPath: logUri.fsPath,
                });
                resolve();
                return;
            }

            const error = new Error(`Implementation verification exited with code ${code ?? "unknown"}. See ${logUri.fsPath}`);
            callbacks.onStatus?.({
                running: false,
                stage: "Failed",
                progress: 100,
                message: error.message,
                error: error.message,
                logPath: logUri.fsPath,
            });
            reject(error);
        });
    });
}

export async function readLatestHgboRunFiles(workspaceUri: vscode.Uri): Promise<DisplayFile[]> {
    const latestRunId = await getLatestHgboRunId(workspaceUri);
    if (!latestRunId) {
        return [];
    }

    return readHgboRunFiles(getHgboRunUri(workspaceUri, latestRunId));
}

export async function readHgboRunFiles(runUri: vscode.Uri): Promise<DisplayFile[]> {
    return readResultFiles(runUri, "");
}

export async function listHgboRuns(workspaceUri: vscode.Uri): Promise<HgboRunSummary[]> {
    const runIds = await getHgboRunIds(workspaceUri);
    const latestRunId = runIds.at(-1);

    return runIds
        .map(id => ({
            id,
            label: formatRunLabel(id),
            fileCount: 0,
            isLatest: id === latestRunId,
        }))
        .reverse();
}

export async function readHgboRunResults(
    workspaceUri: vscode.Uri,
    requestedRunId?: string
): Promise<HgboRunResultsPayload | undefined> {
    const availableRuns = await listHgboRuns(workspaceUri);
    if (availableRuns.length === 0) {
        return undefined;
    }

    const selectedRunId = availableRuns.some(run => run.id === requestedRunId)
        ? requestedRunId as string
        : availableRuns.find(run => run.isLatest)?.id ?? availableRuns[0].id;

    return readHgboRunDetails(workspaceUri, selectedRunId, availableRuns);
}

export async function readHgboRunDetails(
    workspaceUri: vscode.Uri,
    runId: string,
    runs: HgboRunSummary[] = []
): Promise<HgboRunResultsPayload | undefined> {
    const runUri = getHgboRunUri(workspaceUri, runId);
    if (!await pathExists(runUri)) {
        return undefined;
    }

    const logs = await readHgboRunFiles(runUri);
    const svgs = await readSvgArtifacts(runUri, "");
    const dseLog = logs.find(file => file.name === LOG_FILE)?.content
        ?? logs.find(file => file.name.endsWith(".log"))?.content
        ?? "";

    const trialManifest = buildTrialManifest(dseLog, logs);
    const verification = readImplVerificationResults(logs, trialManifest);
    const plot = attachDseVerificationToPlot(buildDsePlotData(parseHgboTrialPoints(dseLog)), verification);

    return {
        runId,
        runs,
        logs,
        fileGroups: groupRunFilesByProject(logs),
        svgs,
        plot,
        trialManifest: attachDseVerificationToManifest(trialManifest, verification),
        verification,
    };
}

function readImplVerificationResults(
    files: DisplayFile[],
    trialManifest: DseTrialManifestEntry[]
): DseVerificationComparison[] {
    const verificationFile = files.find(file => file.name === "impl_verification.json")
        ?? files.find(file => file.name.endsWith("/impl_verification.json"));
    if (!verificationFile) {
        return [];
    }

    try {
        const parsed = JSON.parse(verificationFile.content) as { results?: DseVerificationActual[] };
        return buildDseVerificationComparisons(trialManifest, parsed.results ?? []);
    } catch {
        return [];
    }
}

function createProcessTextHandler(
    options: DseOptions,
    callbacks: HgboDseRunCallbacks,
    logChunks: string[],
    remoteInference?: RemoteInferenceRuntime
) {
    let stdoutRemainder = "";
    let stderrRemainder = "";
    const stdoutRedactor = createRemoteInferenceOutputRedactor(remoteInference);
    const stderrRedactor = createRemoteInferenceOutputRedactor(remoteInference);

    const emitText = (stream: "stdout" | "stderr", text: string) => {
        if (!text) {
            return;
        }

        callbacks.onLog?.({ stream, text });
        logChunks.push(text);

        const previous = stream === "stdout" ? stdoutRemainder : stderrRemainder;
        const lines = `${previous}${text}`.split(/\r?\n/);
        const remainder = lines.pop() ?? "";
        if (stream === "stdout") {
            stdoutRemainder = remainder;
        } else {
            stderrRemainder = remainder;
        }

        for (const line of lines) {
            const progress = parseHgboProgress(line, options.num);
            if (!progress) {
                continue;
            }
            callbacks.onProgress?.(progress);
            callbacks.onStatus?.({
                running: true,
                stage: "Executing Inference + DSE",
                progress: progress.percent,
                message: progress.message,
                current: progress.current,
                total: progress.total,
            });
        }
    };

    const handleText = ((stream: "stdout" | "stderr", chunk: Buffer) => {
        const redactor = stream === "stdout" ? stdoutRedactor : stderrRedactor;
        emitText(stream, redactor.push(chunk.toString("utf8")));
    }) as ((stream: "stdout" | "stderr", chunk: Buffer) => void) & {
        flush: (stream: "stdout" | "stderr") => void;
    };

    handleText.flush = (stream: "stdout" | "stderr") => {
        const redactor = stream === "stdout" ? stdoutRedactor : stderrRedactor;
        emitText(stream, redactor.flush());
    };

    return handleText;
}

function createImplVerificationTextHandler(
    selectedTrials: number[],
    callbacks: HgboDseRunCallbacks,
    logChunks: string[],
    logPath: string
) {
    let stdoutRemainder = "";
    let stderrRemainder = "";

    return (stream: "stdout" | "stderr", chunk: Buffer) => {
        const text = chunk.toString("utf8");
        callbacks.onLog?.({ stream, text });
        logChunks.push(text);

        const previous = stream === "stdout" ? stdoutRemainder : stderrRemainder;
        const lines = `${previous}${text}`.split(/\r?\n/);
        const remainder = lines.pop() ?? "";
        if (stream === "stdout") {
            stdoutRemainder = remainder;
        } else {
            stderrRemainder = remainder;
        }

        for (const line of lines) {
            const progress = parseHgboImplVerificationProgress(line, selectedTrials);
            if (!progress) {
                continue;
            }
            callbacks.onProgress?.(progress);
            callbacks.onStatus?.({
                running: true,
                stage: "Running implementation verification",
                progress: progress.percent,
                message: progress.message,
                current: progress.current,
                total: progress.total,
                logPath,
            });
        }
    };
}

async function writeRunLog(logUri: vscode.Uri, chunks: string[]) {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(logUri.fsPath)));
    await vscode.workspace.fs.writeFile(logUri, Buffer.from(chunks.join(""), "utf8"));
}

async function findFirstExisting(candidates: vscode.Uri[]): Promise<vscode.Uri | undefined> {
    for (const candidate of candidates) {
        if (await pathExists(candidate)) {
            return candidate;
        }
    }

    return undefined;
}

async function getSourceFileUri(workspaceUri: vscode.Uri): Promise<vscode.Uri | undefined> {
    const activeDocumentUri = vscode.window.activeTextEditor?.document.uri;
    if (
        activeDocumentUri?.scheme === "file" &&
        activeDocumentUri.fsPath.endsWith(".c") &&
        isWithinWorkspace(activeDocumentUri, workspaceUri)
    ) {
        return activeDocumentUri;
    }

    const matches = await vscode.workspace.findFiles("**/*.c", SOURCE_SEARCH_EXCLUDES, 1);
    return matches.find(match => isWithinWorkspace(match, workspaceUri));
}

async function copySourceDirectory(sourceUri: vscode.Uri, projectUri: vscode.Uri, caseName: string) {
    const sourceDirectory = vscode.Uri.file(path.dirname(sourceUri.fsPath));
    await copyProjectTree(sourceDirectory, projectUri, sourceUri.fsPath, caseName);
}

async function copyProjectTree(
    sourceDirectory: vscode.Uri,
    destinationDirectory: vscode.Uri,
    selectedSourcePath: string,
    caseName: string
) {
    const entries = await vscode.workspace.fs.readDirectory(sourceDirectory);

    for (const [name, type] of entries) {
        const sourceFileUri = vscode.Uri.joinPath(sourceDirectory, name);

        if ((type & vscode.FileType.Directory) !== 0) {
            if (shouldTraverseProjectDirectory(name)) {
                await copyProjectTree(
                    sourceFileUri,
                    vscode.Uri.joinPath(destinationDirectory, name),
                    selectedSourcePath,
                    caseName
                );
            }
            continue;
        }

        if ((type & vscode.FileType.File) === 0 || !shouldCopyProjectFile(name)) {
            continue;
        }

        const destinationName = getPackagedSourceFileName(name, sourceFileUri.fsPath === selectedSourcePath, caseName);
        await copyFile(sourceFileUri, vscode.Uri.joinPath(destinationDirectory, destinationName));
    }
}

async function copyFile(sourceUri: vscode.Uri, destinationUri: vscode.Uri) {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(destinationUri.fsPath)));
    const bytes = await vscode.workspace.fs.readFile(sourceUri);
    await vscode.workspace.fs.writeFile(destinationUri, bytes);
}

async function copyDirectory(sourceDirectory: vscode.Uri, destinationDirectory: vscode.Uri) {
    await resetDirectory(destinationDirectory);
    const entries = await vscode.workspace.fs.readDirectory(sourceDirectory);
    for (const [name, type] of entries) {
        const sourceUri = vscode.Uri.joinPath(sourceDirectory, name);
        const destinationUri = vscode.Uri.joinPath(destinationDirectory, name);
        if ((type & vscode.FileType.Directory) !== 0) {
            await copyDirectory(sourceUri, destinationUri);
        } else if ((type & vscode.FileType.File) !== 0) {
            await copyFile(sourceUri, destinationUri);
        }
    }
}

async function resetDirectory(uri: vscode.Uri) {
    try {
        await vscode.workspace.fs.delete(uri, { recursive: true, useTrash: false });
    } catch {
        // The package directory is recreated below.
    }
    await vscode.workspace.fs.createDirectory(uri);
}

async function collectRelativeFiles(directory: vscode.Uri, prefix = ""): Promise<string[]> {
    const entries = await vscode.workspace.fs.readDirectory(directory);
    const files: string[] = [];

    for (const [name, type] of entries) {
        const relativePath = prefix ? path.posix.join(prefix, name) : name;
        const childUri = vscode.Uri.joinPath(directory, name);

        if ((type & vscode.FileType.Directory) !== 0) {
            files.push(...await collectRelativeFiles(childUri, relativePath));
        } else if ((type & vscode.FileType.File) !== 0) {
            files.push(relativePath);
        }
    }

    return files.sort();
}

async function getHgboRunIds(workspaceUri: vscode.Uri): Promise<string[]> {
    const runsUri = vscode.Uri.joinPath(workspaceUri, ".compass", RUNS_DIR);
    let entries: [string, vscode.FileType][];
    try {
        entries = await vscode.workspace.fs.readDirectory(runsUri);
    } catch {
        return [];
    }

    return entries
        .filter(([, type]) => (type & vscode.FileType.Directory) !== 0)
        .map(([name]) => name)
        .sort();
}

async function getLatestHgboRunId(workspaceUri: vscode.Uri): Promise<string | undefined> {
    const runIds = await getHgboRunIds(workspaceUri);
    return runIds.at(-1);
}

function getHgboRunUri(workspaceUri: vscode.Uri, runId: string): vscode.Uri {
    return vscode.Uri.joinPath(workspaceUri, ".compass", RUNS_DIR, runId);
}

async function readSvgArtifacts(directory: vscode.Uri, prefix: string): Promise<DseGraphArtifact[]> {
    let entries: [string, vscode.FileType][];
    try {
        entries = await vscode.workspace.fs.readDirectory(directory);
    } catch {
        return [];
    }

    const svgs: DseGraphArtifact[] = [];
    for (const [name, type] of entries) {
        const childUri = vscode.Uri.joinPath(directory, name);
        const relativePath = prefix ? path.posix.join(prefix, name) : name;

        if ((type & vscode.FileType.Directory) !== 0) {
            svgs.push(...await readSvgArtifacts(childUri, relativePath));
            continue;
        }

        if ((type & vscode.FileType.File) !== 0 && SVG_RESULT_PATTERN.test(name)) {
            const bytes = await vscode.workspace.fs.readFile(childUri);
            svgs.push({
                name: relativePath,
                uri: `data:image/svg+xml;base64,${Buffer.from(bytes).toString("base64")}`,
                content: sanitizeSvgContent(Buffer.from(bytes).toString("utf8")),
            });
        }
    }

    return svgs.sort((a, b) => a.name.localeCompare(b.name));
}

function sanitizeSvgContent(svgContent: string): string {
    return svgContent
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, "");
}

async function readResultFiles(directory: vscode.Uri, prefix: string): Promise<DisplayFile[]> {
    let entries: [string, vscode.FileType][];
    try {
        entries = await vscode.workspace.fs.readDirectory(directory);
    } catch {
        return [];
    }

    const files: DisplayFile[] = [];
    for (const [name, type] of entries) {
        const childUri = vscode.Uri.joinPath(directory, name);
        const relativePath = prefix ? path.posix.join(prefix, name) : name;

        if ((type & vscode.FileType.Directory) !== 0) {
            files.push(...await readResultFiles(childUri, relativePath));
            continue;
        }

        if ((type & vscode.FileType.File) !== 0 && TEXT_RESULT_PATTERN.test(name)) {
            const bytes = await vscode.workspace.fs.readFile(childUri);
            files.push({
                name: relativePath,
                content: Buffer.from(bytes).toString("utf8"),
            });
        }
    }

    return files.sort((a, b) => a.name.localeCompare(b.name));
}

function formatRunLabel(runId: string): string {
    const timestamp = runId.replace(/^run-/, "");
    return timestamp || runId;
}

async function pathExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

function createRunId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `run-${timestamp}`;
}

function createVerificationId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `verify-${timestamp}`;
}

function isWithinWorkspace(uri: vscode.Uri, workspaceUri: vscode.Uri): boolean {
    const relative = path.relative(workspaceUri.fsPath, uri.fsPath);
    return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}
