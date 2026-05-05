import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { posix as path } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const COMPATIBLE_VIVADO_VERSION = "2022.1";

const COMMON_XILINX_ROOTS = [
    "/tools/Xilinx",
    "/opt/Xilinx",
    "/usr/local/Xilinx",
];

const PRODUCT_NAMES = ["Vivado", "Vitis", "Vitis_HLS"] as const;
const PRODUCT_PRIORITY: Record<VivadoProduct, number> = {
    Vitis: 0,
    Vitis_HLS: 1,
    Vivado: 2,
};

export type VivadoProduct = typeof PRODUCT_NAMES[number];

type EnvironmentMap = Record<string, string | undefined>;

type ExecFileFunction = (
    file: string,
    args: readonly string[],
    options: {
        env?: NodeJS.ProcessEnv;
        maxBuffer?: number;
        timeout?: number;
    }
) => Promise<{ stdout: string; stderr: string }>;

type ReadFileFunction = (candidatePath: string) => Promise<Buffer | Uint8Array | string>;

export interface VivadoCandidate {
    product: VivadoProduct;
    version: string;
    installDir: string;
    settings64Path: string;
}

export interface VivadoInstallationStatus extends VivadoCandidate {
    selected: boolean;
    supported: boolean;
    selectable: boolean;
    tooltip: string;
    signatureState: "same-version-same-signature" | "same-version-different-signature" | "unsupported" | "unknown";
    sha256?: string;
}

export interface VivadoDiscoveryStatus {
    installations: VivadoInstallationStatus[];
    selectedVersion?: string;
    selectedSettings64Path?: string;
}

export interface VivadoScriptSignature {
    settings64Path: string;
    sha256: string;
}

export interface VivadoSignatureMismatch {
    version: string;
    scripts: VivadoScriptSignature[];
}

export interface VivadoSelectionOptions {
    compatibleVersion?: string;
    readFile?: ReadFileFunction;
}

export interface VivadoSelectionResult {
    candidate?: VivadoCandidate;
    status: VivadoDiscoveryStatus;
    signatureMismatch?: VivadoSignatureMismatch;
}

export interface VivadoDiscoveryStatusOptions {
    compatibleVersion?: string;
    signatures?: readonly VivadoScriptSignature[];
    selectableSettings64Paths?: readonly string[];
}

export interface VivadoDiscoveryOptions {
    platform?: NodeJS.Platform;
    env?: EnvironmentMap;
    roots?: readonly string[];
    pathExists?: (candidatePath: string) => Promise<boolean>;
    readDirectory?: (candidatePath: string) => Promise<string[]>;
    fileExists?: (candidatePath: string) => Promise<boolean>;
}

export interface VivadoEnvironmentOptions {
    env?: NodeJS.ProcessEnv;
    execFile?: ExecFileFunction;
}

export function buildVivadoSearchRoots(env: EnvironmentMap = process.env): string[] {
    return uniquePaths([
        ...COMMON_XILINX_ROOTS,
        ...getEnvironmentInstallHints(env).map(hint => getXilinxRoot(hint.installDir)).filter(isDefined),
    ]);
}

export async function discoverVivadoCandidates(
    options: VivadoDiscoveryOptions = {}
): Promise<VivadoCandidate[]> {
    const platform = options.platform ?? process.platform;
    if (platform !== "linux") {
        return [];
    }

    const env = options.env ?? process.env;
    const pathExists = options.pathExists ?? defaultPathExists;
    const readDirectory = options.readDirectory ?? defaultReadDirectory;
    const fileExists = options.fileExists ?? defaultFileExists;
    const roots = options.roots ?? buildVivadoSearchRoots(env);
    const candidates: VivadoCandidate[] = [];
    const seen = new Set<string>();

    const addCandidate = async (candidate: VivadoCandidate) => {
        if (seen.has(candidate.settings64Path)) {
            return;
        }
        if (!await fileExists(candidate.settings64Path)) {
            return;
        }

        candidates.push(candidate);
        seen.add(candidate.settings64Path);
    };

    for (const hint of getEnvironmentInstallHints(env)) {
        const directCandidate = createCandidateFromInstallDir(hint.installDir, hint.product);
        if (directCandidate) {
            await addCandidate(directCandidate);
            continue;
        }

        await scanProductDirectory(hint.installDir, hint.product, readDirectory, addCandidate);
    }

    for (const root of roots) {
        for (const product of PRODUCT_NAMES) {
            const productDir = path.join(root, product);
            if (!await pathExists(productDir)) {
                continue;
            }

            await scanProductDirectory(productDir, product, readDirectory, addCandidate);
        }

        await scanVersionFirstRoot(root, readDirectory, addCandidate);
    }

    return candidates.sort(compareCandidates);
}

export function chooseCompatibleVivado(
    candidates: readonly VivadoCandidate[],
    compatibleVersion = COMPATIBLE_VIVADO_VERSION
): VivadoCandidate | undefined {
    return [...candidates]
        .filter(candidate => candidate.version === compatibleVersion)
        .sort((a, b) => PRODUCT_PRIORITY[a.product] - PRODUCT_PRIORITY[b.product]
            || a.settings64Path.localeCompare(b.settings64Path))[0];
}

export async function selectCompatibleVivado(
    candidates: readonly VivadoCandidate[],
    options: VivadoSelectionOptions = {}
): Promise<VivadoSelectionResult> {
    const compatibleVersion = options.compatibleVersion ?? COMPATIBLE_VIVADO_VERSION;
    const compatibleCandidates = candidates.filter(candidate => candidate.version === compatibleVersion);
    if (compatibleCandidates.length === 0) {
        return {
            status: createVivadoDiscoveryStatus(candidates, undefined, { compatibleVersion }),
        };
    }

    const signatures = await getVivadoScriptSignatures(
        compatibleCandidates,
        options.readFile ?? defaultReadFile
    );
    const signatureCount = new Set(signatures.map(signature => signature.sha256)).size;
    if (signatureCount > 1) {
        return {
            status: createVivadoDiscoveryStatus(candidates, undefined, {
                compatibleVersion,
                signatures,
                selectableSettings64Paths: compatibleCandidates.map(candidate => candidate.settings64Path),
            }),
            signatureMismatch: {
                version: compatibleVersion,
                scripts: signatures,
            },
        };
    }

    const selectedCandidate = chooseCompatibleVivado(compatibleCandidates, compatibleVersion);
    return {
        candidate: selectedCandidate,
        status: createVivadoDiscoveryStatus(candidates, selectedCandidate, {
            compatibleVersion,
            signatures,
        }),
    };
}

export function createVivadoDiscoveryStatus(
    candidates: readonly VivadoCandidate[],
    selectedCandidate: VivadoCandidate | undefined,
    options: VivadoDiscoveryStatusOptions = {}
): VivadoDiscoveryStatus {
    const compatibleVersion = options.compatibleVersion ?? COMPATIBLE_VIVADO_VERSION;
    const signatureByPath = new Map((options.signatures ?? [])
        .map(signature => [signature.settings64Path, signature.sha256]));
    const selectablePaths = new Set(options.selectableSettings64Paths ?? []);
    const compatibleSignatures = candidates
        .filter(candidate => candidate.version === compatibleVersion)
        .map(candidate => signatureByPath.get(candidate.settings64Path))
        .filter(isDefined);
    const compatibleSignatureCount = new Set(compatibleSignatures).size;

    return {
        installations: candidates.map(candidate => {
            const supported = candidate.version === compatibleVersion;
            const selected = candidate.settings64Path === selectedCandidate?.settings64Path;
            const sha256 = signatureByPath.get(candidate.settings64Path);
            const signatureState = getInstallationSignatureState(supported, sha256, compatibleSignatureCount);

            return {
                ...candidate,
                selected,
                supported,
                selectable: supported && selectablePaths.has(candidate.settings64Path),
                tooltip: getInstallationTooltip(signatureState),
                signatureState,
                sha256,
            };
        }),
        selectedVersion: selectedCandidate?.version,
        selectedSettings64Path: selectedCandidate?.settings64Path,
    };
}

export function createVivadoCandidateFromSettings64Path(
    settings64Path: string
): VivadoCandidate | undefined {
    const normalizedSettingsPath = normalizePath(settings64Path);
    if (path.basename(normalizedSettingsPath) !== "settings64.sh") {
        return undefined;
    }

    return createCandidateFromInstallDir(path.dirname(normalizedSettingsPath));
}

export function parseEnvironmentOutput(output: string): Record<string, string> {
    const env: Record<string, string> = {};

    for (const line of output.split(/\r?\n/)) {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex <= 0) {
            continue;
        }

        env[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
    }

    return env;
}

export async function sourceVivadoEnvironment(
    candidate: VivadoCandidate,
    options: VivadoEnvironmentOptions = {}
): Promise<Record<string, string>> {
    const runExecFile = options.execFile ?? defaultExecFile;
    const command = `source ${quoteForBash(candidate.settings64Path)} >/dev/null 2>&1 && env`;
    const { stdout } = await runExecFile("bash", ["-lc", command], {
        env: options.env ?? process.env,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30_000,
    });

    return parseEnvironmentOutput(stdout);
}

export function applyVivadoEnvironment(
    env: Record<string, string>,
    target: NodeJS.ProcessEnv = process.env
) {
    for (const [key, value] of Object.entries(env)) {
        target[key] = value;
    }
}

export function getDetectedVivadoVersions(candidates: readonly VivadoCandidate[]): string[] {
    return [...new Set(candidates.map(candidate => candidate.version))].sort(compareVersions);
}

function getEnvironmentInstallHints(env: EnvironmentMap): VivadoCandidateHint[] {
    return [
        getEnvironmentInstallHint(env.XILINX_VIVADO, "Vivado"),
        getEnvironmentInstallHint(env.XILINX_VITIS, "Vitis"),
        getEnvironmentInstallHint(env.XILINX_HLS, "Vitis_HLS"),
    ].filter(isDefined);
}

interface VivadoCandidateHint {
    product: VivadoProduct;
    installDir: string;
}

function getEnvironmentInstallHint(
    value: string | undefined,
    product: VivadoProduct
): VivadoCandidateHint | undefined {
    if (!value) {
        return undefined;
    }

    const installDir = path.basename(value) === "settings64.sh" ? path.dirname(value) : value;
    return {
        product,
        installDir: normalizePath(installDir),
    };
}

async function scanProductDirectory(
    productDir: string,
    product: VivadoProduct,
    readDirectory: (candidatePath: string) => Promise<string[]>,
    addCandidate: (candidate: VivadoCandidate) => Promise<void>
) {
    let versions: string[];
    try {
        versions = await readDirectory(productDir);
    } catch {
        return;
    }

    for (const version of versions.filter(isVersionDirectoryName)) {
        const installDir = path.join(productDir, version);
        await addCandidate(createCandidate(product, version, installDir));
    }
}

async function scanVersionFirstRoot(
    root: string,
    readDirectory: (candidatePath: string) => Promise<string[]>,
    addCandidate: (candidate: VivadoCandidate) => Promise<void>
) {
    let versions: string[];
    try {
        versions = await readDirectory(root);
    } catch {
        return;
    }

    for (const version of versions.filter(isVersionDirectoryName)) {
        for (const product of PRODUCT_NAMES) {
            await addCandidate(createCandidate(product, version, path.join(root, version, product)));
        }
    }
}

function createCandidateFromInstallDir(
    installDir: string,
    fallbackProduct: VivadoProduct = "Vivado"
): VivadoCandidate | undefined {
    const normalizedInstallDir = normalizePath(installDir);
    const installDirName = path.basename(normalizedInstallDir);
    const parentDirName = path.basename(path.dirname(normalizedInstallDir));

    if (isVersionDirectoryName(installDirName)) {
        const product = isVivadoProduct(parentDirName) ? parentDirName : fallbackProduct;
        return createCandidate(product, installDirName, normalizedInstallDir);
    }

    if (isVivadoProduct(installDirName) && isVersionDirectoryName(parentDirName)) {
        return createCandidate(installDirName, parentDirName, normalizedInstallDir);
    }

    return undefined;
}

function createCandidate(
    product: VivadoProduct,
    version: string,
    installDir: string
): VivadoCandidate {
    return {
        product,
        version,
        installDir: normalizePath(installDir),
        settings64Path: path.join(normalizePath(installDir), "settings64.sh"),
    };
}

function getXilinxRoot(installDir: string): string | undefined {
    const normalizedInstallDir = normalizePath(installDir);
    const parts = normalizedInstallDir.split("/").filter(Boolean);
    const productIndex = parts.findIndex(part => isVivadoProduct(part));
    if (productIndex < 0) {
        return undefined;
    }

    return `/${parts.slice(0, productIndex).join("/")}`;
}

async function defaultPathExists(candidatePath: string): Promise<boolean> {
    try {
        await fs.stat(candidatePath);
        return true;
    } catch {
        return false;
    }
}

async function defaultFileExists(candidatePath: string): Promise<boolean> {
    try {
        const stat = await fs.stat(candidatePath);
        return stat.isFile() || stat.isSymbolicLink();
    } catch {
        return false;
    }
}

async function defaultReadDirectory(candidatePath: string): Promise<string[]> {
    const entries = await fs.readdir(candidatePath, { withFileTypes: true });
    return entries
        .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
        .map(entry => entry.name);
}

async function defaultReadFile(candidatePath: string): Promise<Buffer> {
    return fs.readFile(candidatePath);
}

async function defaultExecFile(
    file: string,
    args: readonly string[],
    options: {
        env?: NodeJS.ProcessEnv;
        maxBuffer?: number;
        timeout?: number;
    }
): Promise<{ stdout: string; stderr: string }> {
    const result = await execFileAsync(file, [...args], options);
    return {
        stdout: String(result.stdout),
        stderr: String(result.stderr),
    };
}

function quoteForBash(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
}

async function getVivadoScriptSignatures(
    candidates: readonly VivadoCandidate[],
    readFile: ReadFileFunction
): Promise<VivadoScriptSignature[]> {
    return Promise.all(candidates.map(async candidate => ({
        settings64Path: candidate.settings64Path,
        sha256: hashSettingsScript(await readFile(candidate.settings64Path)),
    })));
}

function hashSettingsScript(content: Buffer | Uint8Array | string): string {
    return createHash("sha256").update(content).digest("hex");
}

function getInstallationSignatureState(
    supported: boolean,
    sha256: string | undefined,
    compatibleSignatureCount: number
): VivadoInstallationStatus["signatureState"] {
    if (!supported) {
        return "unsupported";
    }

    if (!sha256) {
        return "unknown";
    }

    return compatibleSignatureCount <= 1
        ? "same-version-same-signature"
        : "same-version-different-signature";
}

function getInstallationTooltip(
    signatureState: VivadoInstallationStatus["signatureState"]
): string {
    switch (signatureState) {
        case "same-version-same-signature":
            return "Same version, same signature";
        case "same-version-different-signature":
            return "Different signature; click to select";
        case "unsupported":
            return "Unsupported";
        case "unknown":
            return `Vivado/Vitis ${COMPATIBLE_VIVADO_VERSION}`;
    }
}

function normalizePath(candidatePath: string): string {
    return path.normalize(candidatePath).replace(/\/$/, "");
}

function uniquePaths(paths: readonly string[]): string[] {
    return [...new Set(paths.map(normalizePath))];
}

function compareCandidates(a: VivadoCandidate, b: VivadoCandidate): number {
    return compareVersions(a.version, b.version)
        || PRODUCT_PRIORITY[a.product] - PRODUCT_PRIORITY[b.product]
        || a.settings64Path.localeCompare(b.settings64Path);
}

function compareVersions(a: string, b: string): number {
    const [aMajor = 0, aMinor = 0] = a.split(".").map(Number);
    const [bMajor = 0, bMinor = 0] = b.split(".").map(Number);
    return aMajor - bMajor || aMinor - bMinor;
}

function isVersionDirectoryName(value: string): boolean {
    return /^\d{4}\.\d+$/.test(value);
}

function isVivadoProduct(value: string): value is VivadoProduct {
    return (PRODUCT_NAMES as readonly string[]).includes(value);
}

function isDefined<T>(value: T | undefined): value is T {
    return value !== undefined;
}
