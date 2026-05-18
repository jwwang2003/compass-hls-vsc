import assert from "node:assert/strict";
import test from "node:test";

import {
    groupRunArtifactsByProject,
    normalizeRunArtifactId,
    type RunArtifactMetadata,
} from "../services/hgboDseArtifacts";

test("groups run artifact metadata by project without carrying file contents", () => {
    const artifacts: RunArtifactMetadata[] = [
        { id: "hgbo-dse.log", name: "hgbo-dse.log", kind: "text", size: 42 },
        {
            id: "artifacts/MachSuite/motpe_fl_ds/bfs/bulk/p1/script/ppa_2.json",
            name: "artifacts/MachSuite/motpe_fl_ds/bfs/bulk/p1/script/ppa_2.json",
            kind: "text",
            size: 128,
        },
        {
            id: "graphs/opt_history_power.svg",
            name: "graphs/opt_history_power.svg",
            kind: "svg",
            size: 256,
        },
    ];

    const groups = groupRunArtifactsByProject(artifacts);

    assert.deepEqual(
        groups.map(group => ({
            projectId: group.projectId,
            trial: group.trial,
            artifactIds: group.artifacts.map(artifact => artifact.id),
        })),
        [
            {
                projectId: "prj_2",
                trial: 2,
                artifactIds: ["artifacts/MachSuite/motpe_fl_ds/bfs/bulk/p1/script/ppa_2.json"],
            },
            {
                projectId: "run-level",
                trial: undefined,
                artifactIds: ["graphs/opt_history_power.svg", "hgbo-dse.log"],
            },
        ]
    );
    assert.equal("content" in groups[0].artifacts[0], false);
});

test("normalizes artifact ids and rejects path traversal", () => {
    assert.equal(
        normalizeRunArtifactId("artifacts\\MachSuite\\prj_3\\report\\csynth.rpt"),
        "artifacts/MachSuite/prj_3/report/csynth.rpt"
    );
    assert.equal(normalizeRunArtifactId("../outside.txt"), undefined);
    assert.equal(normalizeRunArtifactId("artifacts/../../outside.txt"), undefined);
    assert.equal(normalizeRunArtifactId("/absolute.txt"), undefined);
});
