export const DSE_MODES = ["hgp", "impl"] as const;
export const DSE_ALGORITHMS = ["sa", "motpe_d", "motpe_f", "motpe_fl", "nsga", "random"] as const;
export const DSE_DEVICES = ["xc7vx485tffg1761-2"] as const;
export const DSE_ENCODINGS = ["float", "discrete"] as const;
export const DSE_SPACES = ["homo", "tree"] as const;
export const DSE_INFERENCE_MODES = ["host", "remote"] as const;

export type DseMode = typeof DSE_MODES[number];
export type DseAlgorithm = typeof DSE_ALGORITHMS[number];
export type DseDevice = typeof DSE_DEVICES[number];
export type DseEncoding = typeof DSE_ENCODINGS[number];
export type DseSpace = typeof DSE_SPACES[number];
export type DseInferenceMode = typeof DSE_INFERENCE_MODES[number];

export interface DseOptions {
    mode: DseMode;
    bench: string;
    caseName: string;
    ver: string;
    num: number;
    alg: DseAlgorithm;
    device: DseDevice;
    clk: string;
    encode: DseEncoding;
    space: DseSpace;
    parallel: boolean;
    process: number;
    inferenceMode: DseInferenceMode;
}

export interface HgboDsePathOptions {
    configPath: string;
    paramsPath: string;
    projectPath: string;
    isolatedPath: string;
}

export interface HgboImplVerificationPathOptions extends HgboDsePathOptions {
    selectionPath: string;
    outputPath: string;
}

export interface HgboProgress {
    current: number;
    total: number;
    percent: number;
    message: string;
}

export function createDefaultDseOptions(): DseOptions {
    return {
        mode: "hgp",
        bench: "MachSuite",
        caseName: "bfs",
        ver: "bulk",
        num: 100,
        alg: "motpe_fl",
        device: "xc7vx485tffg1761-2",
        clk: "10",
        encode: "float",
        space: "tree",
        parallel: false,
        process: 1,
        inferenceMode: "host",
    };
}

export function normalizeDseOptions(input: unknown): DseOptions {
    const defaults = createDefaultDseOptions();
    const record = isRecord(input) ? input : {};

    return {
        mode: enumValue(record.mode, DSE_MODES, defaults.mode),
        bench: stringValue(record.bench, defaults.bench),
        caseName: stringValue(record.caseName ?? record.case, defaults.caseName),
        ver: stringValue(record.ver, defaults.ver),
        num: boundedInteger(record.num, defaults.num, 1, 10_000),
        alg: enumValue(record.alg, DSE_ALGORITHMS, defaults.alg),
        device: enumValue(record.device, DSE_DEVICES, defaults.device),
        clk: clockValue(record.clk, defaults.clk),
        encode: enumValue(record.encode, DSE_ENCODINGS, defaults.encode),
        space: enumValue(record.space, DSE_SPACES, defaults.space),
        parallel: booleanValue(record.parallel, defaults.parallel),
        process: boundedInteger(record.process ?? record.processNum, defaults.process, 1, 1024),
        inferenceMode: enumValue(record.inferenceMode, DSE_INFERENCE_MODES, defaults.inferenceMode),
    };
}

export function buildHgboDseArgs(options: DseOptions, paths: HgboDsePathOptions): string[] {
    return [
        "-u",
        "-m",
        "bome.hls_dse",
        "--mode",
        options.mode,
        "--bench",
        options.bench,
        "--case",
        options.caseName,
        "--ver",
        options.ver,
        "--num",
        String(options.num),
        "--alg",
        options.alg,
        "--device",
        options.device,
        "--clk",
        options.clk,
        "--encode",
        options.encode,
        "--space",
        options.space,
        "--parallel",
        options.parallel ? "True" : "False",
        "--process",
        String(options.process),
        "--isolated",
        paths.isolatedPath,
        "--inference-mode",
        options.inferenceMode,
        "--config-path",
        paths.configPath,
        "--params-path",
        paths.paramsPath,
        "--project-path",
        paths.projectPath,
    ];
}

export function buildHgboImplVerifyArgs(options: DseOptions, paths: HgboImplVerificationPathOptions): string[] {
    return [
        "-u",
        "-m",
        "bome.impl_verify",
        "--bench",
        options.bench,
        "--case",
        options.caseName,
        "--ver",
        options.ver,
        "--alg",
        options.alg,
        "--device",
        options.device,
        "--clk",
        options.clk,
        "--encode",
        options.encode,
        "--space",
        options.space,
        "--process",
        String(options.process),
        "--isolated",
        paths.isolatedPath,
        "--config-path",
        paths.configPath,
        "--params-path",
        paths.paramsPath,
        "--project-path",
        paths.projectPath,
        "--selection-path",
        paths.selectionPath,
        "--output-path",
        paths.outputPath,
    ];
}

export function parseHgboProgress(line: string, totalIterations: number): HgboProgress | undefined {
    const match = line.match(/\[Inference\]\s+Iteration:\s+(\d+)/);
    if (!match) {
        return undefined;
    }

    const total = Math.max(1, totalIterations);
    const current = Math.min(total, Number(match[1]) + 1);
    const percent = Math.round((current / total) * 100);

    return {
        current,
        total,
        percent,
        message: `Iteration ${current}/${total}`,
    };
}

export function parseHgboImplVerificationProgress(
    line: string,
    selectedTrials: number[]
): HgboProgress | undefined {
    const match = line.match(/\[ImplVerify\]\s+(Running|Completed) implementation for trial\s+(\d+)\./);
    if (!match) {
        return undefined;
    }

    const trial = Number(match[2]);
    const trialIndex = selectedTrials.indexOf(trial);
    if (trialIndex < 0) {
        return undefined;
    }

    const total = Math.max(1, selectedTrials.length);
    const current = Math.min(total, trialIndex + 1);
    const percent = Math.round((current / total) * 100);
    const action = match[1] === "Running" ? "Running" : "Completed";

    return {
        current,
        total,
        percent,
        message: `${action} trial ${trial} (${current}/${total})`,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function stringValue(value: unknown, fallback: string): string {
    if (typeof value !== "string") {
        return fallback;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

function clockValue(value: unknown, fallback: string): string {
    const normalized = stringValue(value, fallback);
    return Number.isFinite(Number(normalized)) && Number(normalized) > 0 ? normalized : fallback;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
    const numericValue = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numericValue)) {
        return fallback;
    }

    const integer = Math.trunc(numericValue);
    if (integer < min || integer > max) {
        return fallback;
    }

    return integer;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true") {
            return true;
        }
        if (normalized === "false") {
            return false;
        }
    }

    return fallback;
}

function enumValue<const T extends readonly string[]>(
    value: unknown,
    allowed: T,
    fallback: T[number]
): T[number] {
    return typeof value === "string" && allowed.includes(value) ? value : fallback;
}
