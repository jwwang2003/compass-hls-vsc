import {
    discoverTdmCandidatesFromRoot,
    type SyntaxNodeLike,
    type TdmCandidatesCore,
} from "./tdmDiscoveryCore";
import {
    discoverDictOpIntHintsFromRoot,
    type DictOpIntHint,
} from "./tdmDictOpHintCore";

export interface TdmAnalysisDocumentLike {
    uri: { toString(): string };
    version: number;
    languageId: string;
}

export interface TdmAnalysisTreeLike {
    rootNode: SyntaxNodeLike;
}

export interface TdmAnalysisSnapshot {
    uri: string;
    version: number;
    candidates: TdmCandidatesCore;
    dictOpHints: DictOpIntHint[];
    hasTree: boolean;
    stale: boolean;
}

interface TdmAnalysisCoreOptions {
    getTree: (document: TdmAnalysisDocumentLike) => TdmAnalysisTreeLike | undefined;
    discoverCandidates?: (rootNode: SyntaxNodeLike) => TdmCandidatesCore;
    discoverDictOpHints?: (rootNode: SyntaxNodeLike) => DictOpIntHint[];
    scheduleRecompute?: (document: TdmAnalysisDocumentLike) => void;
}

const emptyCandidates: TdmCandidatesCore = {
    functions: [],
    parameters: [],
    loops: [],
};

export class TdmAnalysisCore {
    private readonly snapshots = new Map<string, TdmAnalysisSnapshot>();
    private readonly pendingRecomputeKeys = new Set<string>();

    constructor(private readonly options: TdmAnalysisCoreOptions) { }

    public getSnapshot(document: TdmAnalysisDocumentLike): TdmAnalysisSnapshot {
        const key = document.uri.toString();
        const cached = this.snapshots.get(key);
        if (cached?.version === document.version) {
            return cached;
        }

        this.pendingRecomputeKeys.delete(recomputeKey(document));
        return this.computeSnapshot(document);
    }

    public getCodeLensSnapshot(document: TdmAnalysisDocumentLike): TdmAnalysisSnapshot {
        const key = document.uri.toString();
        const cached = this.snapshots.get(key);
        if (!cached) {
            return this.getSnapshot(document);
        }

        if (cached.version === document.version) {
            return cached;
        }

        this.scheduleRecompute(document);
        return {
            ...cached,
            stale: true,
        };
    }

    public recompute(document: TdmAnalysisDocumentLike): TdmAnalysisSnapshot {
        this.pendingRecomputeKeys.delete(recomputeKey(document));
        return this.computeSnapshot(document);
    }

    public invalidate(uri?: { toString(): string }) {
        if (!uri) {
            this.snapshots.clear();
            this.pendingRecomputeKeys.clear();
            return;
        }

        const key = uri.toString();
        this.snapshots.delete(key);
        for (const pendingKey of [...this.pendingRecomputeKeys]) {
            if (pendingKey.startsWith(`${key}@`)) {
                this.pendingRecomputeKeys.delete(pendingKey);
            }
        }
    }

    private computeSnapshot(document: TdmAnalysisDocumentLike): TdmAnalysisSnapshot {
        const key = document.uri.toString();
        if (document.languageId !== "c") {
            const snapshot = createEmptySnapshot(key, document.version);
            this.snapshots.set(key, snapshot);
            return snapshot;
        }

        const tree = this.options.getTree(document);
        if (!tree) {
            const snapshot = createEmptySnapshot(key, document.version);
            this.snapshots.set(key, snapshot);
            return snapshot;
        }

        const candidates = (this.options.discoverCandidates ?? discoverTdmCandidatesFromRoot)(tree.rootNode);
        const dictOpHints = (this.options.discoverDictOpHints ?? discoverDictOpIntHintsFromRoot)(tree.rootNode);
        const snapshot: TdmAnalysisSnapshot = {
            uri: key,
            version: document.version,
            candidates,
            dictOpHints,
            hasTree: true,
            stale: false,
        };
        this.snapshots.set(key, snapshot);
        return snapshot;
    }

    private scheduleRecompute(document: TdmAnalysisDocumentLike) {
        if (!this.options.scheduleRecompute) {
            return;
        }

        const key = recomputeKey(document);
        if (this.pendingRecomputeKeys.has(key)) {
            return;
        }

        this.pendingRecomputeKeys.add(key);
        this.options.scheduleRecompute(document);
    }
}

function createEmptySnapshot(uri: string, version: number): TdmAnalysisSnapshot {
    return {
        uri,
        version,
        candidates: emptyCandidates,
        dictOpHints: [],
        hasTree: false,
        stale: false,
    };
}

function recomputeKey(document: TdmAnalysisDocumentLike): string {
    return `${document.uri.toString()}@${document.version}`;
}
