import assert from "node:assert/strict";
import test from "node:test";

import {
    COMPATIBLE_VIVADO_VERSION,
    buildVivadoSearchRoots,
    chooseCompatibleVivado,
    createVivadoDiscoveryStatus,
    discoverVivadoCandidates,
    parseEnvironmentOutput,
    selectCompatibleVivado,
} from "../utilities/vivadoDiscovery";

test("selects Vivado 2022.1 when multiple versions are discovered", async () => {
    const candidates = await discoverVivadoCandidates({
        platform: "linux",
        env: {},
        roots: ["/opt/Xilinx"],
        pathExists: async path => path === "/opt/Xilinx/Vivado",
        readDirectory: async path => {
            if (path === "/opt/Xilinx/Vivado") {
                return ["2021.2", "2022.1", "2023.1"];
            }
            return [];
        },
        fileExists: async path => path.endsWith("/2022.1/settings64.sh"),
    });

    const selected = chooseCompatibleVivado(candidates);

    assert.equal(COMPATIBLE_VIVADO_VERSION, "2022.1");
    assert.equal(selected?.version, "2022.1");
    assert.equal(selected?.product, "Vivado");
    assert.equal(selected?.installDir, "/opt/Xilinx/Vivado/2022.1");
    assert.equal(selected?.settings64Path, "/opt/Xilinx/Vivado/2022.1/settings64.sh");
});

test("reports unsupported versions when Vivado 2022.1 is missing", async () => {
    const candidates = await discoverVivadoCandidates({
        platform: "linux",
        env: {},
        roots: ["/tools/Xilinx"],
        pathExists: async path => path === "/tools/Xilinx/Vivado",
        readDirectory: async path => path === "/tools/Xilinx/Vivado" ? ["2021.2", "2023.2"] : [],
        fileExists: async path => path.endsWith("/settings64.sh"),
    });

    assert.equal(chooseCompatibleVivado(candidates), undefined);
    assert.deepEqual(candidates.map(candidate => candidate.version), ["2021.2", "2023.2"]);
});

test("uses XILINX_VIVADO as a candidate root", async () => {
    const candidates = await discoverVivadoCandidates({
        platform: "linux",
        env: {
            XILINX_VIVADO: "/eda/Xilinx/Vivado/2022.1",
        },
        roots: [],
        pathExists: async path => path === "/eda/Xilinx/Vivado/2022.1",
        readDirectory: async () => [],
        fileExists: async path => path === "/eda/Xilinx/Vivado/2022.1/settings64.sh",
    });

    assert.deepEqual(candidates, [
        {
            product: "Vivado",
            version: "2022.1",
            installDir: "/eda/Xilinx/Vivado/2022.1",
            settings64Path: "/eda/Xilinx/Vivado/2022.1/settings64.sh",
        },
    ]);
});

test("discovers version-first Xilinx install layouts", async () => {
    const candidates = await discoverVivadoCandidates({
        platform: "linux",
        env: {},
        roots: ["/opt/Xilinx"],
        pathExists: async () => false,
        readDirectory: async path => path === "/opt/Xilinx" ? ["2025.1"] : [],
        fileExists: async path => [
            "/opt/Xilinx/2025.1/Vivado/settings64.sh",
            "/opt/Xilinx/2025.1/Vitis/settings64.sh",
        ].includes(path),
    });

    assert.deepEqual(candidates.map(candidate => `${candidate.product}:${candidate.version}`), [
        "Vitis:2025.1",
        "Vivado:2025.1",
    ]);
});

test("builds Linux search roots from common Xilinx install locations and environment hints", () => {
    const roots = buildVivadoSearchRoots({
        XILINX_VIVADO: "/eda/Xilinx/Vivado/2022.1",
        XILINX_VITIS: "/eda/Xilinx/Vitis/2022.1",
    });

    assert.deepEqual(roots.slice(0, 3), ["/tools/Xilinx", "/opt/Xilinx", "/usr/local/Xilinx"]);
    assert.ok(roots.includes("/eda/Xilinx"));
});

test("parses environment output from sourced settings64.sh", () => {
    const env = parseEnvironmentOutput([
        "PATH=/opt/Xilinx/Vitis/2022.1/bin:/usr/bin",
        "XILINX_VIVADO=/opt/Xilinx/Vivado/2022.1",
        "EMPTY=",
        "SHLVL=2",
    ].join("\n"));

    assert.equal(env.PATH, "/opt/Xilinx/Vitis/2022.1/bin:/usr/bin");
    assert.equal(env.XILINX_VIVADO, "/opt/Xilinx/Vivado/2022.1");
    assert.equal(env.EMPTY, "");
    assert.equal(env.SHLVL, "2");
});

test("creates UI discovery status with the selected Vivado marked", () => {
    const candidates = [
        {
            product: "Vivado" as const,
            version: "2021.2",
            installDir: "/opt/Xilinx/Vivado/2021.2",
            settings64Path: "/opt/Xilinx/Vivado/2021.2/settings64.sh",
        },
        {
            product: "Vivado" as const,
            version: "2022.1",
            installDir: "/opt/Xilinx/Vivado/2022.1",
            settings64Path: "/opt/Xilinx/Vivado/2022.1/settings64.sh",
        },
    ];

    const status = createVivadoDiscoveryStatus(candidates, candidates[1]);

    assert.equal(status.selectedVersion, "2022.1");
    assert.equal(status.selectedSettings64Path, "/opt/Xilinx/Vivado/2022.1/settings64.sh");
    assert.deepEqual(status.installations, [
        {
            product: "Vivado",
            version: "2021.2",
            installDir: "/opt/Xilinx/Vivado/2021.2",
            settings64Path: "/opt/Xilinx/Vivado/2021.2/settings64.sh",
            selected: false,
            supported: false,
            selectable: false,
            tooltip: "Unsupported",
            signatureState: "unsupported",
            sha256: undefined,
        },
        {
            product: "Vivado",
            version: "2022.1",
            installDir: "/opt/Xilinx/Vivado/2022.1",
            settings64Path: "/opt/Xilinx/Vivado/2022.1/settings64.sh",
            selected: true,
            supported: true,
            selectable: false,
            tooltip: "Vivado/Vitis 2022.1",
            signatureState: "unknown",
            sha256: undefined,
        },
    ]);
});

test("selects a compatible Vivado when same-version settings scripts have identical signatures", async () => {
    const candidates = [
        {
            product: "Vitis" as const,
            version: "2022.1",
            installDir: "/opt/Xilinx/Vitis/2022.1",
            settings64Path: "/opt/Xilinx/Vitis/2022.1/settings64.sh",
        },
        {
            product: "Vivado" as const,
            version: "2022.1",
            installDir: "/opt/Xilinx/Vivado/2022.1",
            settings64Path: "/opt/Xilinx/Vivado/2022.1/settings64.sh",
        },
    ];

    const result = await selectCompatibleVivado(candidates, {
        readFile: async () => Buffer.from("same script"),
    });

    assert.equal(result.candidate?.version, "2022.1");
    assert.equal(result.signatureMismatch, undefined);
    assert.equal(result.status.selectedVersion, "2022.1");
    assert.equal(result.status.installations.filter(installation => installation.selected).length, 1);
    assert.deepEqual(result.status.installations.map(installation => installation.tooltip), [
        "Same version, same signature",
        "Same version, same signature",
    ]);
    assert.deepEqual(result.status.installations.map(installation => installation.selectable), [false, false]);
});

test("does not select a compatible Vivado when same-version settings scripts differ", async () => {
    const candidates = [
        {
            product: "Vitis" as const,
            version: "2022.1",
            installDir: "/opt/Xilinx/Vitis/2022.1",
            settings64Path: "/opt/Xilinx/Vitis/2022.1/settings64.sh",
        },
        {
            product: "Vivado" as const,
            version: "2022.1",
            installDir: "/opt/Xilinx/Vivado/2022.1",
            settings64Path: "/opt/Xilinx/Vivado/2022.1/settings64.sh",
        },
    ];

    const result = await selectCompatibleVivado(candidates, {
        readFile: async path => Buffer.from(path.includes("/Vitis/") ? "vitis script" : "vivado script"),
    });

    assert.equal(result.candidate, undefined);
    assert.equal(result.status.selectedVersion, undefined);
    assert.deepEqual(result.status.installations.map(installation => installation.selected), [false, false]);
    assert.deepEqual(result.status.installations.map(installation => installation.selectable), [true, true]);
    assert.deepEqual(result.status.installations.map(installation => installation.tooltip), [
        "Different signature; click to select",
        "Different signature; click to select",
    ]);
    assert.equal(result.signatureMismatch?.version, "2022.1");
    assert.deepEqual(
        result.signatureMismatch?.scripts.map(script => script.settings64Path),
        [
            "/opt/Xilinx/Vitis/2022.1/settings64.sh",
            "/opt/Xilinx/Vivado/2022.1/settings64.sh",
        ]
    );
});

test("marks unsupported discovered Vivado versions as unsupported", () => {
    const status = createVivadoDiscoveryStatus([
        {
            product: "Vivado",
            version: "2025.1",
            installDir: "/opt/Xilinx/2025.1/Vivado",
            settings64Path: "/opt/Xilinx/2025.1/Vivado/settings64.sh",
        },
    ], undefined);

    assert.equal(status.installations[0].supported, false);
    assert.equal(status.installations[0].selectable, false);
    assert.equal(status.installations[0].tooltip, "Unsupported");
    assert.equal(status.installations[0].signatureState, "unsupported");
});
