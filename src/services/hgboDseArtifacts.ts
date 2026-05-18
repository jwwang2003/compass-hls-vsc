import path from "path";

export type RunArtifactKind = "text" | "svg";

export interface RunArtifactMetadata {
    id: string;
    name: string;
    kind: RunArtifactKind;
    size: number;
}

export interface RunArtifactGroup {
    id: string;
    projectId: string;
    projectLabel: string;
    trial?: number;
    artifacts: RunArtifactMetadata[];
}

const RUN_LEVEL_GROUP_ID = "run-level";

export function groupRunArtifactsByProject(artifacts: RunArtifactMetadata[]): RunArtifactGroup[] {
    const projectGroups = new Map<number, RunArtifactGroup>();
    const runLevelArtifacts: RunArtifactMetadata[] = [];

    for (const artifact of artifacts) {
        const trial = extractProjectTrial(artifact.name);
        if (trial === undefined) {
            runLevelArtifacts.push(artifact);
            continue;
        }

        const existingGroup = projectGroups.get(trial);
        const group = existingGroup ?? createProjectArtifactGroup(trial);
        group.artifacts.push(artifact);
        projectGroups.set(trial, group);
    }

    const groups = [...projectGroups.values()]
        .sort((a, b) => (a.trial ?? 0) - (b.trial ?? 0));

    for (const group of groups) {
        group.artifacts.sort(compareArtifacts);
    }

    if (runLevelArtifacts.length > 0) {
        groups.push({
            id: RUN_LEVEL_GROUP_ID,
            projectId: RUN_LEVEL_GROUP_ID,
            projectLabel: "Run-level files",
            artifacts: runLevelArtifacts.sort(compareArtifacts),
        });
    }

    return groups;
}

export function normalizeRunArtifactId(value: string): string | undefined {
    const normalizedSeparators = value.replace(/\\/g, "/");
    if (!normalizedSeparators || normalizedSeparators.startsWith("/")) {
        return undefined;
    }

    const normalized = path.posix.normalize(normalizedSeparators);
    if (normalized === "." || normalized.startsWith("../") || normalized === "..") {
        return undefined;
    }
    if (normalized.split("/").includes("..")) {
        return undefined;
    }

    return normalized.replace(/^\.\//, "");
}

function createProjectArtifactGroup(trial: number): RunArtifactGroup {
    const projectLabel = getProjectLabel(trial);
    return {
        id: projectLabel,
        projectId: projectLabel,
        projectLabel,
        trial,
        artifacts: [],
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

function compareArtifacts(a: RunArtifactMetadata, b: RunArtifactMetadata): number {
    return a.name.localeCompare(b.name);
}
