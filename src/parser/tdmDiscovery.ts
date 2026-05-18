import * as vscode from "vscode";
import { Node } from "web-tree-sitter";

import { getTdmAnalysisSnapshot, invalidateTdmAnalysis } from "./tdmAnalysis";
import {
    createLoopCandidateFromNode,
    rangeFromNodeLike,
    type SourceRange,
    type TdmCandidatesCore,
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

export function discoverTdmCandidates(document: vscode.TextDocument): TdmCandidates {
    return tdmCandidatesFromCore(getTdmAnalysisSnapshot(document).candidates);
}

export function clearTdmCandidateCache(uri?: vscode.Uri) {
    invalidateTdmAnalysis(uri);
}

export function tdmCandidatesFromCore(candidates: TdmCandidatesCore): TdmCandidates {
    return {
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
