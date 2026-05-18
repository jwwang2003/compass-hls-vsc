import assert from "node:assert/strict";
import test from "node:test";

import { TdmAnalysisCore, type TdmAnalysisDocumentLike } from "../parser/tdmAnalysisCore";
import type { SyntaxNodeLike, TdmCandidatesCore } from "../parser/tdmDiscoveryCore";
import type { DictOpIntHint } from "../parser/tdmDictOpHintCore";

const emptyCandidates: TdmCandidatesCore = {
    functions: [],
    parameters: [],
    loops: [],
};

const rootNode: SyntaxNodeLike = {
    type: "translation_unit",
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: 0 },
    startIndex: 0,
    endIndex: 0,
    namedChildren: [],
};

test("analysis core computes candidates and dictOp hints once per document version", () => {
    let candidateComputes = 0;
    let hintComputes = 0;
    const service = new TdmAnalysisCore({
        getTree: () => ({ rootNode }),
        discoverCandidates: () => {
            candidateComputes += 1;
            return emptyCandidates;
        },
        discoverDictOpHints: () => {
            hintComputes += 1;
            return [];
        },
    });
    const document = documentLike("file:///kernel.c", 4);

    const first = service.getSnapshot(document);
    const second = service.getSnapshot(document);

    assert.equal(first, second);
    assert.equal(candidateComputes, 1);
    assert.equal(hintComputes, 1);
});

test("analysis core returns stale snapshot and schedules recompute for CodeLens", () => {
    let candidateComputes = 0;
    const scheduled: string[] = [];
    const service = new TdmAnalysisCore({
        getTree: () => ({ rootNode }),
        discoverCandidates: () => {
            candidateComputes += 1;
            return emptyCandidates;
        },
        discoverDictOpHints: () => [],
        scheduleRecompute: document => scheduled.push(`${document.uri.toString()}@${document.version}`),
    });

    const first = service.getSnapshot(documentLike("file:///kernel.c", 1));
    const stale = service.getCodeLensSnapshot(documentLike("file:///kernel.c", 2));

    assert.equal(stale.version, first.version);
    assert.equal(stale.stale, true);
    assert.equal(candidateComputes, 1);
    assert.deepEqual(scheduled, ["file:///kernel.c@2"]);
});

test("analysis core can invalidate one document without clearing other snapshots", () => {
    let candidateComputes = 0;
    const service = new TdmAnalysisCore({
        getTree: () => ({ rootNode }),
        discoverCandidates: () => {
            candidateComputes += 1;
            return emptyCandidates;
        },
        discoverDictOpHints: () => [],
    });

    const first = documentLike("file:///first.c", 1);
    const second = documentLike("file:///second.c", 1);
    service.getSnapshot(first);
    const secondSnapshot = service.getSnapshot(second);

    service.invalidate(first.uri);
    service.getSnapshot(first);

    assert.equal(service.getSnapshot(second), secondSnapshot);
    assert.equal(candidateComputes, 3);
});

function documentLike(uri: string, version: number): TdmAnalysisDocumentLike {
    return {
        uri: { toString: () => uri },
        version,
        languageId: "c",
    };
}
