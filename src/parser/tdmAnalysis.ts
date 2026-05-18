import * as vscode from "vscode";

import { DebouncedAction } from "../utilities/debounce";
import { TdmAnalysisCore, type TdmAnalysisSnapshot } from "./tdmAnalysisCore";
import { getCachedTree } from "./webTreeSitter";

const recomputeActions = new Map<string, DebouncedAction>();

const analysisCore = new TdmAnalysisCore({
    getTree: document => getCachedTree(document as vscode.TextDocument),
    scheduleRecompute: document => scheduleAnalysisRecompute(document as vscode.TextDocument),
});

export function getTdmAnalysisSnapshot(document: vscode.TextDocument): TdmAnalysisSnapshot {
    return analysisCore.getSnapshot(document);
}

export function getCodeLensAnalysisSnapshot(document: vscode.TextDocument): TdmAnalysisSnapshot {
    return analysisCore.getCodeLensSnapshot(document);
}

export function recomputeTdmAnalysisSnapshot(document: vscode.TextDocument): TdmAnalysisSnapshot {
    return analysisCore.recompute(document);
}

export function invalidateTdmAnalysis(uri?: vscode.Uri) {
    analysisCore.invalidate(uri);
    if (!uri) {
        for (const action of recomputeActions.values()) {
            action.dispose();
        }
        recomputeActions.clear();
        return;
    }

    const key = uri.toString();
    recomputeActions.get(key)?.dispose();
    recomputeActions.delete(key);
}

function scheduleAnalysisRecompute(document: vscode.TextDocument) {
    const key = document.uri.toString();
    recomputeActions.get(key)?.dispose();
    const action = new DebouncedAction(() => {
        recomputeActions.delete(key);
        recomputeTdmAnalysisSnapshot(document);
    }, 100);
    recomputeActions.set(key, action);
    action.schedule();
}
