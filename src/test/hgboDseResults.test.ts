import assert from "node:assert/strict";
import test from "node:test";

import {
    attachDseVerificationToManifest,
    attachDseVerificationToPlot,
    buildDseVerificationComparisons,
    buildDsePlotData,
    buildTrialManifest,
    groupRunFilesByProject,
    parseHgboTrialPoints,
    type DseTrialPoint,
} from "../services/hgboDseResults";
import type { DisplayFile } from "../services/yamlService";

test("parses HGBO-DSE trial values from Optuna log output", () => {
    const log = [
        "[I 2026-05-04 19:22:19,474] Trial 0 finished with values: [1.06827309236948, 1.12381703470032, 3.04745410460686] and parameters: {'IPF_0': 0.545}.",
        "[I 2026-05-04 19:22:31,863] Trial 1 finished with values: [1.06827309236948, 1.63091482649842, 2.37218565985452] and parameters: {'IPF_0': 0.930}.",
    ].join("\n");

    assert.deepEqual(parseHgboTrialPoints(log), [
        { trial: 0, values: [1.06827309236948, 1.12381703470032, 3.04745410460686], pareto: false },
        { trial: 1, values: [1.06827309236948, 1.63091482649842, 2.37218565985452], pareto: false },
    ]);
});

test("attaches implementation verification results to the trial study manifest", () => {
    const manifest = [
        {
            trial: 8,
            projectId: "prj_8",
            projectLabel: "prj_8",
            pareto: true,
            params: { LP_0: 0.6 },
            predicted: { power: 1.0, cp: 2.0, area: 3.0 },
        },
    ];
    const verification = buildDseVerificationComparisons(manifest, [
        {
            trial: 8,
            actual: { power: 1.25, cp: 1.75, area: 3.5 },
            rawPpa: { IMPL: { PWR: 1.25, CP: 17.5 } },
        },
    ]);

    assert.deepEqual(attachDseVerificationToManifest(manifest, verification), [
        {
            trial: 8,
            projectId: "prj_8",
            projectLabel: "prj_8",
            pareto: true,
            params: { LP_0: 0.6 },
            predicted: { power: 1.0, cp: 2.0, area: 3.0 },
            implementation: {
                actual: { power: 1.25, cp: 1.75, area: 3.5 },
                error: {
                    powerAbs: 0.25,
                    powerRelPct: 25,
                    cpAbs: -0.25,
                    cpRelPct: -12.5,
                    areaAbs: 0.5,
                    areaRelPct: 16.666667,
                },
                rawPpa: { IMPL: { PWR: 1.25, CP: 17.5 } },
            },
        },
    ]);
});

test("builds a PPA plot using power, CP, and area with Pareto points marked", () => {
    const trials: DseTrialPoint[] = [
        { trial: 0, values: [1, 5, 5], pareto: false },
        { trial: 1, values: [2, 2, 2], pareto: false },
        { trial: 2, values: [3, 3, 3], pareto: false },
    ];

    const plot = buildDsePlotData(trials);

    assert.deepEqual(plot.axes, {
        x: "Power",
        y: "CP",
        z: "Area",
    });
    assert.deepEqual(
        plot.points.map(point => ({ trial: point.trial, pareto: point.pareto, x: point.x, y: point.y, z: point.z })),
        [
            { trial: 0, pareto: true, x: 1, y: 5, z: 5 },
            { trial: 1, pareto: true, x: 2, y: 2, z: 2 },
            { trial: 2, pareto: false, x: 3, y: 3, z: 3 },
        ]
    );
});

test("builds a PPA plot from four-objective runs by using CP as performance", () => {
    const plot = buildDsePlotData([
        { trial: 7, values: [0.9, 1.2, 3.4, 5.6], pareto: false },
    ]);

    assert.deepEqual(plot.axes, {
        x: "Power",
        y: "CP",
        z: "Area",
    });
    assert.deepEqual(plot.points[0], {
        trial: 7,
        projectId: "prj_7",
        projectLabel: "prj_7",
        x: 0.9,
        y: 3.4,
        z: 5.6,
        pareto: true,
    });
});

test("adds project instance identity to PPA plot points", () => {
    const plot = buildDsePlotData([
        { trial: 12, values: [1, 2, 3], pareto: false },
    ]);

    assert.deepEqual(
        plot.points.map(point => ({
            trial: point.trial,
            projectId: point.projectId,
            projectLabel: point.projectLabel,
        })),
        [
            { trial: 12, projectId: "prj_12", projectLabel: "prj_12" },
        ]
    );
});

test("adds verified post-implementation PPA pairs to the 3D plot", () => {
    const plot = buildDsePlotData([
        { trial: 8, values: [1, 2, 3], pareto: false },
        { trial: 9, values: [2, 3, 4], pareto: false },
    ]);

    const verifiedPlot = attachDseVerificationToPlot(plot, [
        {
            trial: 8,
            projectId: "prj_8",
            projectLabel: "prj_8",
            predicted: { power: 1, cp: 2, area: 3 },
            actual: { power: 1.25, cp: 1.75, area: 3.5 },
            error: {},
        },
    ]);

    assert.deepEqual(verifiedPlot.verificationPairs, [
        {
            trial: 8,
            projectId: "prj_8",
            projectLabel: "prj_8",
            predicted: { x: 1, y: 2, z: 3 },
            actual: { x: 1.25, y: 1.75, z: 3.5 },
        },
    ]);
});

test("groups run files by HGBO project instance before run-level files", () => {
    const files: DisplayFile[] = [
        { name: "hgbo-dse.log", content: "run log" },
        { name: "artifacts/MachSuite/motpe_fl_ds/bfs/bulk/p1/script/hls_12.tcl", content: "hls 12" },
        { name: "artifacts/MachSuite/motpe_fl_ds/bfs/bulk/p1/script/dir_12.json", content: "dir 12" },
        { name: "artifacts/MachSuite/motpe_fl_ds/bfs/bulk/p1/prj_12/report/csynth.rpt", content: "report 12" },
        { name: "artifacts/MachSuite/motpe_fl_ds/bfs/bulk/p1/script/ppa_2.json", content: "ppa 2" },
    ];

    const groups = groupRunFilesByProject(files);

    assert.deepEqual(
        groups.map(group => ({
            id: group.id,
            projectId: group.projectId,
            projectLabel: group.projectLabel,
            trial: group.trial,
            fileNames: group.files.map(file => file.name),
        })),
        [
            {
                id: "prj_2",
                projectId: "prj_2",
                projectLabel: "prj_2",
                trial: 2,
                fileNames: [
                    "artifacts/MachSuite/motpe_fl_ds/bfs/bulk/p1/script/ppa_2.json",
                ],
            },
            {
                id: "prj_12",
                projectId: "prj_12",
                projectLabel: "prj_12",
                trial: 12,
                fileNames: [
                    "artifacts/MachSuite/motpe_fl_ds/bfs/bulk/p1/prj_12/report/csynth.rpt",
                    "artifacts/MachSuite/motpe_fl_ds/bfs/bulk/p1/script/dir_12.json",
                    "artifacts/MachSuite/motpe_fl_ds/bfs/bulk/p1/script/hls_12.tcl",
                ],
            },
            {
                id: "run-level",
                projectId: "run-level",
                projectLabel: "Run-level files",
                trial: undefined,
                fileNames: [
                    "hgbo-dse.log",
                ],
            },
        ]
    );
});

test("builds a trial manifest with predicted values, params, and raw PPA artifacts", () => {
    const log = [
        "[I] Trial 1 finished with values: [1.2, 1.5, 2.5] and parameters: {'IPF_0': 0.25}.",
        "2026-05-04 - INFO - [Inference] Iteration: 1, Duration: 0:00:10, Params: {'IPF_0': 0.25, 'LU_0': 0.75}",
    ].join("\n");
    const files: DisplayFile[] = [
        {
            name: "artifacts/MachSuite/motpe_fl_ds/bfs/bulk/p1/script/ppa_1.json",
            content: JSON.stringify({
                IMPL: { PWR: 1.8, CP: 7.5, LUT: 120, FF: 240, DSP: 0, BRAM: 1 },
            }),
        },
    ];

    assert.deepEqual(buildTrialManifest(log, files), [
        {
            trial: 1,
            projectId: "prj_1",
            projectLabel: "prj_1",
            pareto: true,
            params: { IPF_0: 0.25, LU_0: 0.75 },
            predicted: { power: 1.2, cp: 1.5, area: 2.5 },
            rawPpa: {
                IMPL: { PWR: 1.8, CP: 7.5, LUT: 120, FF: 240, DSP: 0, BRAM: 1 },
            },
        },
    ]);
});

test("compares selected trial predictions against implementation results", () => {
    const comparisons = buildDseVerificationComparisons(
        [
            {
                trial: 4,
                projectId: "prj_4",
                projectLabel: "prj_4",
                pareto: true,
                params: { LP_0: 0.1 },
                predicted: { power: 1.0, cp: 2.0, area: 4.0 },
            },
        ],
        [
            {
                trial: 4,
                actual: { power: 1.2, cp: 1.5, area: 5.0 },
                rawPpa: { IMPL: { PWR: 1.2, CP: 7.5 } },
            },
        ]
    );

    assert.deepEqual(comparisons, [
        {
            trial: 4,
            projectId: "prj_4",
            projectLabel: "prj_4",
            predicted: { power: 1.0, cp: 2.0, area: 4.0 },
            actual: { power: 1.2, cp: 1.5, area: 5.0 },
            error: {
                powerAbs: 0.2,
                powerRelPct: 20,
                cpAbs: -0.5,
                cpRelPct: -25,
                areaAbs: 1,
                areaRelPct: 25,
            },
            rawPpa: { IMPL: { PWR: 1.2, CP: 7.5 } },
        },
    ]);
});
