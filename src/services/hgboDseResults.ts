import type { DisplayFile } from "./yamlService";

export interface DseTrialPoint {
    trial: number;
    values: number[];
    pareto: boolean;
}

export interface DsePlotPoint {
    trial: number;
    projectId: string;
    projectLabel: string;
    x: number;
    y: number;
    z: number;
    pareto: boolean;
}

export interface DsePlotMetricPoint {
    x: number;
    y: number;
    z: number;
}

export interface DsePlotVerificationPair {
    trial: number;
    projectId: string;
    projectLabel: string;
    predicted: DsePlotMetricPoint;
    actual: DsePlotMetricPoint;
}

export interface DsePlotData {
    axes: {
        x: string;
        y: string;
        z: string;
    };
    points: DsePlotPoint[];
    verificationPairs?: DsePlotVerificationPair[];
}

export interface DseMetricValues {
    power: number;
    cp: number;
    area: number;
    latency?: number;
}

export interface DseTrialManifestEntry {
    trial: number;
    projectId: string;
    projectLabel: string;
    pareto: boolean;
    params: Record<string, string | number | boolean>;
    predicted: DseMetricValues;
    implementation?: DseImplementationResult;
    rawPpa?: unknown;
}

export interface DseVerificationActual {
    trial: number;
    actual: DseMetricValues;
    rawPpa?: unknown;
}

export interface DseVerificationError {
    powerAbs?: number;
    powerRelPct?: number;
    cpAbs?: number;
    cpRelPct?: number;
    areaAbs?: number;
    areaRelPct?: number;
    latencyAbs?: number;
    latencyRelPct?: number;
}

export interface DseImplementationResult {
    actual: DseMetricValues;
    error: DseVerificationError;
    rawPpa?: unknown;
}

export interface DseVerificationComparison {
    trial: number;
    projectId: string;
    projectLabel: string;
    predicted: DseMetricValues;
    actual: DseMetricValues;
    error: DseVerificationError;
    rawPpa?: unknown;
}

export interface RunFileGroup {
    id: string;
    projectId: string;
    projectLabel: string;
    trial?: number;
    files: DisplayFile[];
}

const TRIAL_VALUES_PATTERN = /Trial\s+(\d+)\s+finished\s+with\s+values:\s+\[([^\]]+)\]/g;
const TRIAL_FINISHED_PARAMS_PATTERN = /Trial\s+(\d+)\s+finished\s+with\s+values:\s+\[[^\]]+\]\s+and\s+parameters:\s+(\{[^\n]+\})/g;
const INFERENCE_PARAMS_PATTERN = /\[Inference\]\s+Iteration:\s+(\d+),[^\n]*Params:\s+(\{[^\n]+\})/g;
const RUN_LEVEL_GROUP_ID = "run-level";

export function parseHgboTrialPoints(log: string): DseTrialPoint[] {
    const points: DseTrialPoint[] = [];

    for (const match of log.matchAll(TRIAL_VALUES_PATTERN)) {
        const trial = Number.parseInt(match[1], 10);
        const values = match[2]
            .split(",")
            .map(value => Number.parseFloat(value.trim()))
            .filter(Number.isFinite);

        if (!Number.isFinite(trial) || values.length < 3) {
            continue;
        }

        points.push({
            trial,
            values,
            pareto: false,
        });
    }

    return points.sort((a, b) => a.trial - b.trial);
}

export function buildDsePlotData(trials: DseTrialPoint[]): DsePlotData {
    const points = trials
        .map(toPlotPoint)
        .filter((point): point is DsePlotPoint => Boolean(point));
    const paretoTrials = new Set(getParetoPoints(points).map(point => point.trial));

    return {
        axes: {
            x: "Power",
            y: "CP",
            z: "Area",
        },
        points: points.map(point => ({
            ...point,
            pareto: paretoTrials.has(point.trial),
        })),
    };
}

export function buildTrialManifest(log: string, files: DisplayFile[]): DseTrialManifestEntry[] {
    const paramsByTrial = parseHgboTrialParams(log);
    const rawPpaByTrial = parseRawPpaFiles(files);
    const plot = buildDsePlotData(parseHgboTrialPoints(log));

    return plot.points.map(point => ({
        trial: point.trial,
        projectId: point.projectId,
        projectLabel: point.projectLabel,
        pareto: point.pareto,
        params: paramsByTrial.get(point.trial) ?? {},
        predicted: plotPointToMetrics(point),
        rawPpa: rawPpaByTrial.get(point.trial),
    }));
}

export function buildDseVerificationComparisons(
    manifest: DseTrialManifestEntry[],
    actuals: DseVerificationActual[]
): DseVerificationComparison[] {
    const manifestByTrial = new Map(manifest.map(entry => [entry.trial, entry]));
    const comparisons: DseVerificationComparison[] = [];

    for (const actual of actuals) {
        const predicted = manifestByTrial.get(actual.trial);
        if (!predicted) {
            continue;
        }

        comparisons.push({
            trial: actual.trial,
            projectId: predicted.projectId,
            projectLabel: predicted.projectLabel,
            predicted: predicted.predicted,
            actual: actual.actual,
            error: calculateMetricError(predicted.predicted, actual.actual),
            rawPpa: actual.rawPpa,
        });
    }

    return comparisons.sort((a, b) => a.trial - b.trial);
}

export function attachDseVerificationToManifest(
    manifest: DseTrialManifestEntry[],
    verification: DseVerificationComparison[]
): DseTrialManifestEntry[] {
    const verificationByTrial = new Map(verification.map(entry => [entry.trial, entry]));

    return manifest.map(entry => {
        const implementation = verificationByTrial.get(entry.trial);
        if (!implementation) {
            return entry;
        }

        return {
            ...entry,
            implementation: {
                actual: implementation.actual,
                error: implementation.error,
                rawPpa: implementation.rawPpa,
            },
        };
    });
}

export function attachDseVerificationToPlot(
    plot: DsePlotData,
    verification: DseVerificationComparison[]
): DsePlotData {
    const pointsByTrial = new Map(plot.points.map(point => [point.trial, point]));
    const verificationPairs = verification
        .map(entry => {
            const predictedPoint = pointsByTrial.get(entry.trial);
            if (!predictedPoint || !hasFinitePpa(entry.actual)) {
                return undefined;
            }

            return {
                trial: entry.trial,
                projectId: entry.projectId,
                projectLabel: entry.projectLabel,
                predicted: {
                    x: predictedPoint.x,
                    y: predictedPoint.y,
                    z: predictedPoint.z,
                },
                actual: {
                    x: entry.actual.power,
                    y: entry.actual.cp,
                    z: entry.actual.area,
                },
            };
        })
        .filter((pair): pair is DsePlotVerificationPair => Boolean(pair));

    return {
        ...plot,
        verificationPairs,
    };
}

export function groupRunFilesByProject(files: DisplayFile[]): RunFileGroup[] {
    const projectGroups = new Map<number, RunFileGroup>();
    const runLevelFiles: DisplayFile[] = [];

    for (const file of files) {
        const trial = extractProjectTrial(file.name);
        if (trial === undefined) {
            runLevelFiles.push(file);
            continue;
        }

        const existingGroup = projectGroups.get(trial);
        const group = existingGroup ?? createProjectFileGroup(trial);
        group.files.push(file);
        projectGroups.set(trial, group);
    }

    const groups = [...projectGroups.values()]
        .sort((a, b) => (a.trial ?? 0) - (b.trial ?? 0));

    for (const group of groups) {
        group.files.sort(compareDisplayFiles);
    }

    if (runLevelFiles.length > 0) {
        groups.push({
            id: RUN_LEVEL_GROUP_ID,
            projectId: RUN_LEVEL_GROUP_ID,
            projectLabel: "Run-level files",
            files: runLevelFiles.sort(compareDisplayFiles),
        });
    }

    return groups;
}

function parseHgboTrialParams(log: string): Map<number, Record<string, string | number | boolean>> {
    const paramsByTrial = new Map<number, Record<string, string | number | boolean>>();

    for (const pattern of [TRIAL_FINISHED_PARAMS_PATTERN, INFERENCE_PARAMS_PATTERN]) {
        for (const match of log.matchAll(pattern)) {
            const trial = Number.parseInt(match[1], 10);
            if (!Number.isFinite(trial)) {
                continue;
            }

            paramsByTrial.set(trial, parsePythonDictLiteral(match[2]));
        }
    }

    return paramsByTrial;
}

function parsePythonDictLiteral(value: string): Record<string, string | number | boolean> {
    const record: Record<string, string | number | boolean> = {};

    for (const match of value.matchAll(/['"]([^'"]+)['"]\s*:\s*([^,}]+)/g)) {
        record[match[1]] = parsePythonScalar(match[2]);
    }

    return record;
}

function parsePythonScalar(value: string): string | number | boolean {
    const trimmed = value.trim();
    if (trimmed === "True") {
        return true;
    }
    if (trimmed === "False") {
        return false;
    }
    if (/^['"].*['"]$/.test(trimmed)) {
        return trimmed.slice(1, -1);
    }

    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : trimmed;
}

function parseRawPpaFiles(files: DisplayFile[]): Map<number, unknown> {
    const rawByTrial = new Map<number, unknown>();

    for (const file of files) {
        if (!/(?:^|\/)ppa_\d+\.json$/i.test(file.name)) {
            continue;
        }

        const trial = extractProjectTrial(file.name);
        if (trial === undefined) {
            continue;
        }

        try {
            rawByTrial.set(trial, JSON.parse(file.content));
        } catch {
            rawByTrial.set(trial, file.content);
        }
    }

    return rawByTrial;
}

function plotPointToMetrics(point: DsePlotPoint): DseMetricValues {
    return {
        power: point.x,
        cp: point.y,
        area: point.z,
    };
}

function hasFinitePpa(metrics: DseMetricValues): boolean {
    return Number.isFinite(metrics.power) && Number.isFinite(metrics.cp) && Number.isFinite(metrics.area);
}

function calculateMetricError(predicted: DseMetricValues, actual: DseMetricValues): DseVerificationError {
    return {
        ...metricDelta("power", predicted.power, actual.power),
        ...metricDelta("cp", predicted.cp, actual.cp),
        ...metricDelta("area", predicted.area, actual.area),
        ...metricDelta("latency", predicted.latency, actual.latency),
    };
}

function metricDelta(
    metric: keyof DseMetricValues,
    predicted: number | undefined,
    actual: number | undefined
): DseVerificationError {
    if (predicted === undefined || actual === undefined) {
        return {};
    }

    const abs = roundMetric(actual - predicted);
    const relPct = predicted === 0 ? undefined : roundMetric((abs / predicted) * 100);
    const prefix = metric === "power" ? "power"
        : metric === "cp" ? "cp"
            : metric === "area" ? "area"
                : "latency";

    return relPct === undefined
        ? { [`${prefix}Abs`]: abs } as DseVerificationError
        : { [`${prefix}Abs`]: abs, [`${prefix}RelPct`]: relPct } as DseVerificationError;
}

function roundMetric(value: number): number {
    return Number(value.toFixed(6));
}

function toPlotPoint(trial: DseTrialPoint): DsePlotPoint | undefined {
    const values = trial.values;
    if (values.length >= 4) {
        const projectLabel = getProjectLabel(trial.trial);
        return {
            trial: trial.trial,
            projectId: projectLabel,
            projectLabel,
            x: values[0],
            y: values[2],
            z: values[3],
            pareto: false,
        };
    }

    if (values.length >= 3) {
        const projectLabel = getProjectLabel(trial.trial);
        return {
            trial: trial.trial,
            projectId: projectLabel,
            projectLabel,
            x: values[0],
            y: values[1],
            z: values[2],
            pareto: false,
        };
    }

    return undefined;
}

function createProjectFileGroup(trial: number): RunFileGroup {
    const projectLabel = getProjectLabel(trial);
    return {
        id: projectLabel,
        projectId: projectLabel,
        projectLabel,
        trial,
        files: [],
    };
}

function getProjectLabel(trial: number): string {
    return `prj_${trial}`;
}

function extractProjectTrial(fileName: string): number | undefined {
    const normalizedName = fileName.replace(/\\/g, "/");
    const explicitProjectMatch = normalizedName.match(/(?:^|[/_-])prj_(\d+)(?=$|[/_.-])/i);
    const scriptArtifactMatch = normalizedName.match(/(?:^|\/)(?:hls|dir|ppa)_(\d+)(?=$|\.)/i);
    const match = explicitProjectMatch ?? scriptArtifactMatch;
    if (!match) {
        return undefined;
    }

    const trial = Number.parseInt(match[1], 10);
    return Number.isFinite(trial) ? trial : undefined;
}

function compareDisplayFiles(a: DisplayFile, b: DisplayFile): number {
    return a.name.localeCompare(b.name);
}

function getParetoPoints(points: DsePlotPoint[]): DsePlotPoint[] {
    return points.filter(candidate => {
        return !points.some(other => {
            if (other.trial === candidate.trial) {
                return false;
            }

            return dominates(other, candidate);
        });
    });
}

function dominates(a: DsePlotPoint, b: DsePlotPoint): boolean {
    const noWorse = a.x <= b.x && a.y <= b.y && a.z <= b.z;
    const strictlyBetter = a.x < b.x || a.y < b.y || a.z < b.z;
    return noWorse && strictlyBetter;
}
