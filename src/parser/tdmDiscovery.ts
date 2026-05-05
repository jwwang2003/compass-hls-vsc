import * as vscode from "vscode";
import { Node } from "web-tree-sitter";

import { getCachedTree } from "./webTreeSitter";
import {
    createLoopCandidateFromNode,
    discoverTdmCandidatesFromRoot,
    rangeFromNodeLike,
    type SourceRange,
} from "./tdmDiscoveryCore";

export interface FunctionCandidate {
    name: string;
    range: vscode.Range;
    parameters: ParameterCandidate[];
}

export interface ParameterCandidate {
    functionName: string;
    name: string;
    ref: string;
    range: vscode.Range;
}

export interface LoopCandidate {
    functionName: string;
    label: string;
    ref: string;
    group: string;
    range: vscode.Range;
}

export interface TdmCandidates {
    functions: FunctionCandidate[];
    parameters: ParameterCandidate[];
    loops: LoopCandidate[];
}

interface CandidateCacheEntry {
    version: number;
    candidates: TdmCandidates;
}

const candidateCache = new Map<string, CandidateCacheEntry>();

export function discoverTdmCandidates(document: vscode.TextDocument): TdmCandidates {
    const tree = getCachedTree(document);
    if (!tree) {
        return {
            functions: [],
            parameters: [],
            loops: [],
        };
    }

    const cacheKey = document.uri.toString();
    const cached = candidateCache.get(cacheKey);
    if (cached?.version === document.version) {
        return cached.candidates;
    }

    const candidates = discoverTdmCandidatesFromRoot(tree.rootNode);
    const converted = {
        functions: candidates.functions.map(fn => ({
            ...fn,
            range: rangeFromSourceRange(fn.range),
            parameters: fn.parameters.map(param => ({
                ...param,
                range: rangeFromSourceRange(param.range),
            })),
        })),
        parameters: candidates.parameters.map(param => ({
            ...param,
            range: rangeFromSourceRange(param.range),
        })),
        loops: candidates.loops.map(loop => ({
            ...loop,
            range: rangeFromSourceRange(loop.range),
        })),
    };
    candidateCache.set(cacheKey, {
        version: document.version,
        candidates: converted,
    });
    return converted;
}

export function clearTdmCandidateCache(uri?: vscode.Uri) {
    if (!uri) {
        candidateCache.clear();
        return;
    }

    candidateCache.delete(uri.toString());
}

export function createLoopCandidate(node: Node, functionName: string, label?: string): LoopCandidate {
    const candidate = createLoopCandidateFromNode(node, functionName, label);
    return {
        ...candidate,
        range: rangeFromSourceRange(candidate.range),
    };
}

export function rangeFromNode(node: Node): vscode.Range {
    return rangeFromSourceRange(rangeFromNodeLike(node));
}

function rangeFromSourceRange(range: SourceRange): vscode.Range {
    return new vscode.Range(
        new vscode.Position(range.start.row, range.start.column),
        new vscode.Position(range.end.row, range.end.column)
    );
}
