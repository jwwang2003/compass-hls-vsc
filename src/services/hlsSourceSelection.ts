import { scoreCSourceForTopFunction } from "../analysis/topFunctionDetection";

export interface CSourceCandidate {
    uri: string;
    source: string;
    active?: boolean;
}

interface ScoredSourceCandidate {
    candidate: CSourceCandidate;
    score: number;
    order: number;
}

const ACTIVE_SOURCE_BONUS = 3;
const MIN_VIABLE_ACTIVE_SCORE = 0;

export function pickPreferredCSourceFile(candidates: readonly CSourceCandidate[]): CSourceCandidate | undefined {
    return candidates
        .map((candidate, order): ScoredSourceCandidate => ({
            candidate,
            score: scoreSourceCandidate(candidate),
            order,
        }))
        .sort((a, b) => b.score - a.score || a.order - b.order)[0]?.candidate;
}

function scoreSourceCandidate(candidate: CSourceCandidate): number {
    const sourceScore = scoreCSourceForTopFunction(candidate.source);
    if (!Number.isFinite(sourceScore)) {
        return Number.NEGATIVE_INFINITY;
    }

    const activeBonus = candidate.active && sourceScore >= MIN_VIABLE_ACTIVE_SCORE
        ? ACTIVE_SOURCE_BONUS
        : 0;
    return sourceScore + activeBonus;
}
