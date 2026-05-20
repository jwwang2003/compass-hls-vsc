import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildParamYaml } from "../services/paramYaml";

test("buildParamYaml defaults match mock0 bfs_bulk_p.yaml", () => {
    const expected = readFileSync(path.join(process.cwd(), "mock0", "bfs_bulk_p.yaml"), "utf8");

    assert.equal(buildParamYaml(), expected);
});

test("buildParamYaml emits user metric values as single-item lists", () => {
    const text = buildParamYaml({
        POW: 1.25,
        CLK: "4.5",
        LATENCY: 2000,
        LUT: 111,
        FF: 222,
        DSP: 3,
        BRAM: 4,
        URAM: 5,
        SRL: 6,
    });

    assert.match(text, /POW:\n  - 1\.25\n/);
    assert.match(text, /CLK:\n  - 4\.5\n/);
    assert.match(text, /LATENCY:\n  - 2000\n/);
    assert.match(text, /LUT:\n  - 111\n/);
    assert.match(text, /FF:\n  - 222\n/);
    assert.match(text, /DSP:\n  - 3\n/);
    assert.match(text, /BRAM:\n  - 4\n/);
    assert.match(text, /URAM:\n  - 5\n/);
    assert.match(text, /SRL:\n  - 6$/);
});

test("buildParamYaml falls back to defaults for invalid metric values", () => {
    const text = buildParamYaml({
        POW: "",
        CLK: "not-a-number",
        LATENCY: Number.POSITIVE_INFINITY,
    });

    assert.match(text, /POW:\n  - 0\.249\n/);
    assert.match(text, /CLK:\n  - 3\.804\n/);
    assert.match(text, /LATENCY:\n  - 1000\n/);
});
