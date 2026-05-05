import assert from "node:assert/strict";
import test from "node:test";

import {
    assertDsePathNames,
    buildHgboImplVerifyArgs,
    buildHgboDseArgs,
    createDefaultDseOptions,
    normalizeDseOptions,
    parseHgboImplVerificationProgress,
    parseHgboProgress,
} from "../services/hgboDseConfig";

test("normalizes DSE options to HGBO-DSE defaults and supported values", () => {
    const options = normalizeDseOptions({
        caseName: "bfs",
        ver: "bulk",
        num: "12",
        alg: "motpe_d",
        mode: "hgp",
        clk: "7.5",
        encode: "discrete",
        space: "tree",
        parallel: true,
        process: "2",
        inferenceMode: "host",
    });

    assert.deepEqual(options, {
        ...createDefaultDseOptions(),
        caseName: "bfs",
        ver: "bulk",
        num: 12,
        alg: "motpe_d",
        mode: "hgp",
        clk: "7.5",
        encode: "discrete",
        space: "tree",
        parallel: true,
        process: 2,
        inferenceMode: "host",
    });
});

test("defaults packaged DSE benchmark namespace to custom", () => {
    assert.equal(createDefaultDseOptions().bench, "custom");
    assert.equal(normalizeDseOptions(undefined).bench, "custom");
    assert.equal(normalizeDseOptions({ bench: "" }).bench, "custom");
});

test("rejects DSE path fields that are not plain path names", () => {
    for (const input of [
        { bench: "../MachSuite" },
        { caseName: "bfs/escape" },
        { ver: ".." },
        { ver: "bulk\\escape" },
    ]) {
        assert.throws(
            () => assertDsePathNames(normalizeDseOptions(input)),
            /must be a single path name/
        );
    }

    assert.doesNotThrow(() => assertDsePathNames(normalizeDseOptions({
        bench: "MachSuite",
        caseName: "bfs",
        ver: "bulk",
    })));
});

test("builds HGBO-DSE CLI args for packaged Compass paths", () => {
    const args = buildHgboDseArgs(
        normalizeDseOptions({ caseName: "viterbi", ver: "viterbi", num: 5 }),
        {
            configPath: "/workspace/.compass/hgbo-package/config.yaml",
            paramsPath: "/workspace/.compass/hgbo-package/params.yaml",
            projectPath: "/workspace/.compass/hgbo-package/benchmark/custom/viterbi/viterbi",
            sourceFile: "edge_detect.c",
            isolatedPath: "/workspace/.compass/runs/run-1",
        }
    );

    assert.deepEqual(args, [
        "-u",
        "-m",
        "bome.hls_dse",
        "--mode",
        "hgp",
        "--bench",
        "custom",
        "--case",
        "viterbi",
        "--ver",
        "viterbi",
        "--num",
        "5",
        "--alg",
        "motpe_fl",
        "--device",
        "xc7vx485tffg1761-2",
        "--clk",
        "10",
        "--encode",
        "float",
        "--space",
        "tree",
        "--parallel",
        "False",
        "--process",
        "1",
        "--isolated",
        "/workspace/.compass/runs/run-1",
        "--inference-mode",
        "host",
        "--config-path",
        "/workspace/.compass/hgbo-package/config.yaml",
        "--params-path",
        "/workspace/.compass/hgbo-package/params.yaml",
        "--project-path",
        "/workspace/.compass/hgbo-package/benchmark/custom/viterbi/viterbi",
        "--source-file",
        "edge_detect.c",
    ]);
});

test("builds HGBO-DSE implementation verification CLI args for selected trials", () => {
    const args = buildHgboImplVerifyArgs(
        normalizeDseOptions({ caseName: "bfs", ver: "bulk", alg: "motpe_fl" }),
        {
            configPath: "/workspace/.compass/runs/run-1/package/config.yaml",
            paramsPath: "/workspace/.compass/runs/run-1/package/params.yaml",
            projectPath: "/workspace/.compass/runs/run-1/package/benchmark/custom/bfs/bulk",
            sourceFile: "edge_detect.c",
            isolatedPath: "/workspace/.compass/runs/run-1/impl-verification/verify-1",
            selectionPath: "/workspace/.compass/runs/run-1/impl-verification/verify-1/selected_trials.json",
            outputPath: "/workspace/.compass/runs/run-1/impl_verification.json",
        }
    );

    assert.deepEqual(args, [
        "-u",
        "-m",
        "bome.impl_verify",
        "--bench",
        "custom",
        "--case",
        "bfs",
        "--ver",
        "bulk",
        "--alg",
        "motpe_fl",
        "--device",
        "xc7vx485tffg1761-2",
        "--clk",
        "10",
        "--encode",
        "float",
        "--space",
        "tree",
        "--process",
        "1",
        "--isolated",
        "/workspace/.compass/runs/run-1/impl-verification/verify-1",
        "--config-path",
        "/workspace/.compass/runs/run-1/package/config.yaml",
        "--params-path",
        "/workspace/.compass/runs/run-1/package/params.yaml",
        "--project-path",
        "/workspace/.compass/runs/run-1/package/benchmark/custom/bfs/bulk",
        "--source-file",
        "edge_detect.c",
        "--selection-path",
        "/workspace/.compass/runs/run-1/impl-verification/verify-1/selected_trials.json",
        "--output-path",
        "/workspace/.compass/runs/run-1/impl_verification.json",
    ]);
});

test("parses HGBO-DSE iteration logs into frontend progress", () => {
    const progress = parseHgboProgress(
        "2026-05-04 - INFO - [ctx=abc] - [Inference] Iteration: 3, Duration: 0:00:10",
        10
    );

    assert.deepEqual(progress, {
        current: 4,
        total: 10,
        percent: 40,
        message: "Iteration 4/10",
    });
});

test("parses implementation verification trial logs into frontend progress", () => {
    const progress = parseHgboImplVerificationProgress(
        "2026-05-04 - INFO - [ctx=abc] - [ImplVerify] Running implementation for trial 50.",
        [15, 16, 50, 54]
    );

    assert.deepEqual(progress, {
        current: 3,
        total: 4,
        percent: 75,
        message: "Running trial 50 (3/4)",
    });
});

test("parses implementation verification completion logs into frontend progress", () => {
    const progress = parseHgboImplVerificationProgress(
        "2026-05-04 - INFO - [ctx=abc] - [ImplVerify] Completed implementation for trial 16.",
        [15, 16, 50, 54]
    );

    assert.deepEqual(progress, {
        current: 2,
        total: 4,
        percent: 50,
        message: "Completed trial 16 (2/4)",
    });
});
