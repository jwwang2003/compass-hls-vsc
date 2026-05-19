import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const entrypoints = ["MainSidebar.ts", "Result.ts"];

for (const entrypoint of entrypoints) {
    test(`${entrypoint} mounts its Svelte app with the Svelte 5 API`, () => {
        const source = readFileSync(path.join(process.cwd(), "webviews", "pages", entrypoint), "utf8");

        assert.match(source, /import\s*\{\s*mount\s*,\s*unmount\s*\}\s*from\s*["']svelte["']/);
        assert.match(source, /mount\s*\(\s*App\s*,\s*\{\s*target:\s*document\.body\s*\}\s*\)/s);
        assert.match(source, /unmount\s*\(\s*window\.__compassWebviewApp\s*\)/);
        assert.doesNotMatch(source, /new\s+App\s*\(/);
    });
}

test("MainSidebar exposes Flow and More display modes", () => {
    const source = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "MainSidebar.svelte"), "utf8");

    assert.match(source, /type\s+DisplayMode\s*=\s*["']flow["']\s*\|\s*["']more["']/);
    assert.match(source, /let\s+displayMode:\s*DisplayMode\s*=\s*["']flow["']/);
    assert.match(source, /Flow/);
    assert.match(source, /More/);
    assert.doesNotMatch(source, /DenseDashboard/);
    assert.doesNotMatch(source, /["']dense["']/);
});

test("MainSidebar preserves Compass workflow command messages", () => {
    const source = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "MainSidebar.svelte"), "utf8");

    for (const messageType of [
        "initCompass",
        "exportCompass",
        "removeCompass",
        "generateYamls",
        "packageUpload",
        "runInference",
        "showInference",
        "runAll",
        "resetProject",
        "toggleAutoDiscover",
        "selectVivadoSettings64Path",
    ]) {
        assert.match(source, new RegExp(`type:\\s*["']${messageType}["']`));
    }
});

test("MainSidebar sends params.yaml metric values with YAML generation requests", () => {
    const source = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "MainSidebar.svelte"), "utf8");

    assert.match(source, /paramValues/);
    assert.match(source, /type:\s*["']generateYamls["'],\s*value:\s*buildGenerateYamlPayload\(\)/s);
    assert.match(source, /type:\s*["']runAll["'],\s*value:\s*buildGenerateYamlPayload\(\)/s);
});

test("MainSidebar sends DSE options with package and inference requests", () => {
    const source = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "MainSidebar.svelte"), "utf8");

    assert.match(source, /dseOptions/);
    assert.match(source, /buildDsePayload/);
    assert.match(source, /type:\s*["']packageUpload["'],\s*value:\s*buildDsePayload\(\)/s);
    assert.match(source, /type:\s*["']runInference["'],\s*value:\s*buildDsePayload\(\)/s);
    assert.match(source, /dse:\s*dseOptions/);
});

test("webview DSE defaults use custom as the packaged benchmark namespace", () => {
    const source = readFileSync(path.join(process.cwd(), "webviews", "modules", "dseOptions.ts"), "utf8");

    assert.match(source, /bench:\s*["']custom["']/);
    assert.doesNotMatch(source, /bench:\s*["']MachSuite["']/);
});

test("DSE config text and number inputs share the same control height", () => {
    const source = readFileSync(path.join(process.cwd(), "webviews", "components", "DseConfig.svelte"), "utf8");

    assert.match(source, /vscode-text-field,\s*\.compact-input\s*\{/);
    assert.match(source, /height:\s*var\(--dse-control-height\)/);
    assert.match(source, /box-sizing:\s*border-box/);
});

test("MainSidebar renders HGBO-DSE process status", () => {
    const source = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "MainSidebar.svelte"), "utf8");

    assert.match(source, /type:\s*["']dseStatus["']/);
    assert.match(source, /type:\s*["']dseLog["']/);
    assert.match(source, /DseRunMonitor/);
});

test("MainSidebar exposes a project reset action for generated artifacts", () => {
    const mainSource = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "MainSidebar.svelte"), "utf8");
    const workflowSource = readFileSync(path.join(process.cwd(), "webviews", "components", "WorkflowSteps.svelte"), "utf8");
    const moreSource = readFileSync(path.join(process.cwd(), "webviews", "components", "MoreDashboard.svelte"), "utf8");
    const sidebarSource = readFileSync(path.join(process.cwd(), "src", "providers", "CompassSidebar.ts"), "utf8");

    assert.match(mainSource, /function\s+resetProject\(\)/);
    assert.match(mainSource, /type:\s*["']resetProject["']/);
    assert.match(mainSource, /case\s+["']projectReset["']/);
    assert.match(mainSource, /dseLogs\s*=\s*\[\]/);
    assert.match(workflowSource, /Reset Project/);
    assert.match(workflowSource, /onResetProject/);
    assert.match(moreSource, /Reset Project/);
    assert.match(moreSource, /onResetProject/);
    assert.match(sidebarSource, /case\s+["']resetProject["']/);
    assert.match(sidebarSource, /handleResetProject/);
    assert.match(sidebarSource, /resetCompassProjectArtifacts/);
});

test("MainSidebar accepts and renders Vivado discovery status", () => {
    const source = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "MainSidebar.svelte"), "utf8");

    assert.match(source, /type\s+VivadoDiscoveryStatus/);
    assert.match(source, /vivadoDiscovery\?:\s*VivadoDiscoveryStatus/);
    assert.match(source, /vivadoDiscovery\s*=\s*msg\.vivadoDiscovery/);
    assert.match(source, /<VivadoInstallations\s+\{vivadoDiscovery\}/);
    assert.match(source, /<ProjectSummary[\s\S]*\{vivadoDiscovery\}/);
    assert.match(source, /<MoreDashboard[\s\S]*\{vivadoDiscovery\}/);
});

test("VivadoInstallations lists installs and marks the selected version", () => {
    const source = readFileSync(path.join(process.cwd(), "webviews", "components", "VivadoInstallations.svelte"), "utf8");

    assert.match(source, /export\s+let\s+vivadoDiscovery:\s*VivadoDiscoveryStatus/);
    assert.match(source, /\{#each\s+vivadoDiscovery\.installations\s+as\s+installation\}/);
    assert.match(source, /installation\.selected/);
    assert.match(source, /installation\.tooltip/);
    assert.match(source, /installation\.selectable/);
    assert.match(source, /class:unsupported=\{!installation\.supported\}/);
    assert.match(source, /onSelectVivadoSettings64Path\(installation\.settings64Path\)/);
    assert.match(source, /Selected/);
    assert.match(source, /settings64\.sh/);
});

test("ProjectSummary shows the selected Vivado version", () => {
    const source = readFileSync(path.join(process.cwd(), "webviews", "components", "ProjectSummary.svelte"), "utf8");

    assert.match(source, /export\s+let\s+vivadoDiscovery:\s*VivadoDiscoveryStatus/);
    assert.match(source, /vivadoDiscovery\.selectedVersion/);
    assert.match(source, /Vivado\s+\{vivadoDiscovery\.selectedVersion\}/);
});

test("CompassSidebar posts Vivado discovery details with local support", () => {
    const source = readFileSync(path.join(process.cwd(), "src", "providers", "CompassSidebar.ts"), "utf8");

    assert.match(source, /VivadoDiscoveryStatus/);
    assert.match(source, /setLocalSupport\(isSupported:\s*boolean,\s*vivadoDiscovery\?:\s*VivadoDiscoveryStatus\)/);
    assert.match(source, /vivadoDiscovery:\s*this\.vivadoDiscovery/);
    assert.match(source, /case\s+["']selectVivadoSettings64Path["']/);
});

test("package.json contributes a manual Vivado settings64 path setting", () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    const properties = packageJson.contributes.configuration.properties;

    assert.equal(properties["compass.vivadoSettings64Path"].type, "string");
    assert.match(properties["compass.vivadoSettings64Path"].description, /settings64\.sh/);
});

test("webview labels package .compass and name inference as Inference + DSE", () => {
    const workflowSource = readFileSync(path.join(process.cwd(), "webviews", "components", "WorkflowSteps.svelte"), "utf8");
    const moreSource = readFileSync(path.join(process.cwd(), "webviews", "components", "MoreDashboard.svelte"), "utf8");

    assert.match(workflowSource, /Package \.compass/);
    assert.match(workflowSource, /Inference \+ DSE/);
    assert.match(moreSource, /Package \.compass/);
    assert.match(moreSource, /Inference \+ DSE/);
});

test("CompassSidebar packages .compass for Inference + DSE", () => {
    const source = readFileSync(path.join(process.cwd(), "src", "providers", "CompassSidebar.ts"), "utf8");

    assert.match(source, /vscode\.Uri\.joinPath\(workspaceFolder\.uri,\s*["']\.compass["']\)/);
    assert.match(source, /Packaging \.compass/);
    assert.match(source, /Inference \+ DSE/);
    assert.doesNotMatch(source, /No root-level files found to upload/);
});

test("CompassSidebar runs HGBO-DSE instead of simulated Inference + DSE iterations", () => {
    const source = readFileSync(path.join(process.cwd(), "src", "providers", "CompassSidebar.ts"), "utf8");

    assert.match(source, /runHgboDse/);
    assert.match(source, /prepareHgboDsePackage/);
    assert.match(source, /postDseStatus/);
    assert.doesNotMatch(source, /setTimeout\(resolve => setTimeout/);
    assert.doesNotMatch(source, /Iteration \$\{i\}\/\$\{totalIterations\}/);
});

test("CompassSidebar reads result artifacts from .compass runs instead of mock artifacts", () => {
    const source = readFileSync(path.join(process.cwd(), "src", "providers", "CompassSidebar.ts"), "utf8");

    assert.match(source, /readLatestHgboRunFiles\(workspaceFolder\.uri\)/);
    assert.doesNotMatch(source, /copyMockArtifactsToWorkspace/);
    assert.doesNotMatch(source, /mock/);
});

test("Result panel supports run selection and structured DSE plots", () => {
    const panelSource = readFileSync(path.join(process.cwd(), "src", "providers", "ResultPanel.ts"), "utf8");
    const resultSource = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "Results.svelte"), "utf8");

    assert.match(panelSource, /message\.type\s*===\s*["']selectRun["']/);
    assert.match(panelSource, /onSelectRun/);
    assert.match(resultSource, /<select/);
    assert.match(resultSource, /type:\s*["']selectRun["']/);
    assert.match(resultSource, /DSE Graphs/);
    assert.match(resultSource, /Pareto PPA/);
    assert.match(resultSource, /plot\.points/);
});

test("Results view can request implementation verification for selected Pareto studies", () => {
    const runnerSource = readFileSync(path.join(process.cwd(), "src", "services", "hgboDseRunner.ts"), "utf8");
    const sidebarSource = readFileSync(path.join(process.cwd(), "src", "providers", "CompassSidebar.ts"), "utf8");
    const panelSource = readFileSync(path.join(process.cwd(), "src", "providers", "ResultPanel.ts"), "utf8");
    const resultSource = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "Results.svelte"), "utf8");

    assert.match(runnerSource, /const\s+trialManifest\s*=\s*buildTrialManifest\(dseLog,\s*logs\)/);
    assert.match(runnerSource, /trialManifest:\s*attachDseVerificationToManifest\(trialManifest,\s*verification\)/);
    assert.match(runnerSource, /const\s+verification\s*=\s*readImplVerificationResults\(logs,\s*trialManifest\)/);
    assert.match(runnerSource, /verification,/);
    assert.match(runnerSource, /export async function runHgboImplVerification/);
    assert.match(runnerSource, /parseHgboImplVerificationProgress/);
    assert.match(runnerSource, /selectedEntries\.map\(entry\s*=>\s*entry\.trial\)/);
    assert.match(panelSource, /setImplVerificationHandler/);
    assert.match(panelSource, /message\.type\s*===\s*["']verifyImpl["']/);
    assert.match(sidebarSource, /handleVerifyImpl/);
    assert.match(sidebarSource, /runHgboImplVerification/);
    assert.match(resultSource, /let\s+selectedImplTrials:\s*Set<number>/);
    assert.match(resultSource, /toggleImplTrialSelection/);
    assert.match(resultSource, /type:\s*["']verifyImpl["']/);
    assert.match(resultSource, /Run Impl Verification/);
    assert.match(resultSource, /Verification Accuracy/);
    assert.match(resultSource, /implementation-link/);
    assert.match(resultSource, /implementation-plot-point/);
    assert.match(resultSource, /axis-tick-label/);
    assert.match(resultSource, /formatAxisTickValue/);
});

test("Result panel groups run files by project instances", () => {
    const runnerSource = readFileSync(path.join(process.cwd(), "src", "services", "hgboDseRunner.ts"), "utf8");
    const panelSource = readFileSync(path.join(process.cwd(), "src", "providers", "ResultPanel.ts"), "utf8");
    const resultSource = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "Results.svelte"), "utf8");

    assert.match(runnerSource, /groupRunFilesByProject/);
    assert.match(runnerSource, /fileGroups:\s*groupRunFilesByProject\(logs\)/);
    assert.match(panelSource, /fileGroups:\s*\[\]/);
    assert.match(resultSource, /interface\s+RunFileGroup/);
    assert.match(resultSource, /let\s+fileGroups:\s*RunFileGroup\[\]/);
    assert.match(resultSource, /displayedFileGroups/);
    assert.match(resultSource, /data-project-id=\{group\.projectId\}/);
    assert.match(resultSource, /\{#each\s+displayedFileGroups\s+as\s+group/);
});

test("Pareto PPA plot supports dragging, zooming, selection, and project jumps", () => {
    const resultSource = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "Results.svelte"), "utf8");

    assert.match(resultSource, /let\s+zoom\s*=/);
    assert.match(resultSource, /startPlotDrag/);
    assert.match(resultSource, /dragPlot/);
    assert.match(resultSource, /zoomPlot/);
    assert.match(resultSource, /selectPlotPoint/);
    assert.match(resultSource, /jumpToSelectedProject/);
    assert.match(resultSource, /scrollIntoView/);
    assert.match(resultSource, /on:pointerdown=\{startPlotDrag\}/);
    assert.match(resultSource, /on:wheel=\{zoomPlot\}/);
    assert.match(resultSource, /on:click=\{\(event\)\s*=>\s*selectPlotPoint\(point,\s*event\)\}/);
    assert.match(resultSource, /on:dblclick=\{\(event\)\s*=>\s*jumpToSelectedProject\(point,\s*event\)\}/);
});

test("Result graph point selection stays synchronized across plot views", () => {
    const resultSource = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "Results.svelte"), "utf8");

    assert.match(resultSource, /syncSelectedGraphElements/);
    assert.match(resultSource, /selectedPoint\?\.trial/);
    assert.match(resultSource, /querySelectorAll\("\.scatterlayer \.points \.point"\)/);
    assert.match(resultSource, /interactive-graph-selected/);
});

test("Pareto PPA drag keeps point identity stable and avoids accidental selections", () => {
    const resultSource = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "Results.svelte"), "utf8");

    assert.match(resultSource, /\{#each\s+projected\.points\s+as\s+point\s+\(point\.projectId\)\}/);
    assert.match(resultSource, /captureTarget:\s*Element/);
    assert.match(resultSource, /dragState\.captureTarget/);
    assert.match(resultSource, /moved:\s*false/);
    assert.match(resultSource, /dragState\.moved\s*=/);
    assert.match(resultSource, /suppressNextPointClick/);
    assert.match(resultSource, /if\s*\(suppressNextPointClick\)/);
    assert.match(resultSource, /on:pointerdown=\{\(event\)\s*=>\s*startPlotDrag\(event\)\}/);
    assert.match(resultSource, /\.plot\.dragging\s+\.plot-point\s*\{[\s\S]*transition:\s*none/s);
    assert.doesNotMatch(resultSource, /on:pointerdown=\{stopPlotEvent\}/);
});

test("Pareto PPA plot fills its panel without a dark framed plot rectangle", () => {
    const resultSource = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "Results.svelte"), "utf8");

    assert.match(resultSource, /class=["']plot-stage["']/);
    assert.match(resultSource, /\.plot-panel\s*\{[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/s);
    assert.match(resultSource, /\.plot-stage\s*\{[\s\S]*flex:\s*1/s);
    assert.match(resultSource, /\.plot\s*\{[\s\S]*height:\s*100%/s);
    assert.match(resultSource, /class=["']plot-hit-area["']/);
    assert.match(resultSource, /\.plot-hit-area\s*\{[\s\S]*fill:\s*transparent/s);
    assert.doesNotMatch(resultSource, /class=["']plot-background["']/);
});

test("Selected Pareto study details avoid overlapping long metric values", () => {
    const resultSource = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "Results.svelte"), "utf8");

    assert.match(resultSource, /function\s+formatPlotValue\(value:\s*number\)/);
    assert.match(resultSource, /\{formatPlotValue\(selectedPoint\.x\)\}/);
    assert.match(resultSource, /\{formatPlotValue\(selectedPoint\.y\)\}/);
    assert.match(resultSource, /\{formatPlotValue\(selectedPoint\.z\)\}/);
    assert.match(resultSource, /\.selected-study\s*\{[\s\S]*grid-template-columns:\s*minmax\(120px,\s*max-content\)\s+minmax\(0,\s*1fr\)\s+auto/s);
    assert.match(resultSource, /\.selected-study\s+dl\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(86px,\s*1fr\)\)/s);
    assert.match(resultSource, /\.selected-study\s+dl\s+>\s+div\s*\{[\s\S]*min-width:\s*0/s);
    assert.match(resultSource, /\.selected-study\s+dd\s*\{[\s\S]*overflow-wrap:\s*anywhere/s);
    assert.doesNotMatch(resultSource, /repeat\(5,\s*minmax\(58px,\s*max-content\)\)/);
});

test("DSE graph artifacts are rendered as inline interactive SVG plots", () => {
    const runnerSource = readFileSync(path.join(process.cwd(), "src", "services", "hgboDseRunner.ts"), "utf8");
    const resultSource = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "Results.svelte"), "utf8");

    assert.match(runnerSource, /export interface DseGraphArtifact[\s\S]*content:\s*string/);
    assert.match(runnerSource, /content:\s*sanitizeSvgContent/);
    assert.match(resultSource, /interface\s+DseGraphArtifact[\s\S]*content:\s*string/);
    assert.match(resultSource, /\{@html\s+svg\.content\}/);
    assert.doesNotMatch(resultSource, /<img\s+src=\{svg\.uri\}/);
    assert.match(resultSource, /class=["']graph-viewport["']/);
    assert.match(resultSource, /startGraphDrag/);
    assert.match(resultSource, /dragGraph/);
    assert.match(resultSource, /zoomGraph/);
    assert.match(resultSource, /handleGraphClick/);
    assert.match(resultSource, /handleGraphDoubleClick/);
});

test("DSE graph cards support fullscreen open and close controls", () => {
    const resultSource = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "Results.svelte"), "utf8");

    assert.match(resultSource, /let\s+fullscreenGraphName\s*=/);
    assert.match(resultSource, /openFullscreenGraph/);
    assert.match(resultSource, /closeFullscreenGraph/);
    assert.match(resultSource, /class=["']graph-fullscreen["']/);
    assert.match(resultSource, /aria-label=\{`Open \$\{svg\.name\} fullscreen`\}/);
    assert.match(resultSource, /aria-label=["']Close fullscreen graph["']/);
    assert.match(resultSource, /\{#if\s+fullscreenGraph\}/);
});

test("graph controls use compact icon buttons that isolate pointer events", () => {
    const resultSource = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "Results.svelte"), "utf8");

    assert.match(resultSource, /type\s+IconName\s*=/);
    assert.match(resultSource, /\{#snippet\s+icon\(name:\s*IconName\)\}/);
    assert.match(resultSource, /class=["']icon-button["']/);
    assert.match(resultSource, /function\s+handleGraphControlPointer\(event:\s*PointerEvent\)/);
    assert.match(resultSource, /function\s+handleGraphControlClick\(event:\s*MouseEvent\)/);
    assert.match(resultSource, /on:pointerdown=\{handleGraphControlPointer\}/);
    assert.match(resultSource, /handleGraphControlClick\(event\);[\s\S]*zoomGraphBy\(svg,\s*-0\.15\)/);
    assert.match(resultSource, /title=\{`Open \$\{svg\.name\} fullscreen`\}/);
    assert.match(resultSource, /aria-hidden=["']true["']/);
    assert.doesNotMatch(resultSource, />Fullscreen<\/button>/);
    assert.doesNotMatch(resultSource, />Reset<\/button>/);
});

test("DSE graph zoom controls update a Svelte-tracked graph state dependency", () => {
    const resultSource = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "Results.svelte"), "utf8");

    assert.match(resultSource, /function\s+graphTransformStyle\(\s*graphName:\s*string,\s*states:\s*Record<string,\s*GraphViewState>\s*\)/);
    assert.match(resultSource, /style=\{graphTransformStyle\(svg\.name,\s*graphStates\)\}/);
    assert.match(resultSource, /style=\{graphTransformStyle\(fullscreenGraph\.name,\s*graphStates\)\}/);
    assert.match(resultSource, /function\s+updateGraphState\(graphName:\s*string,\s*patch:\s*Partial<GraphViewState>\)/);
    assert.match(resultSource, /graphStates\s*=\s*\{/);
});

test("Pareto PPA plot supports fullscreen open and close controls", () => {
    const resultSource = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "Results.svelte"), "utf8");

    assert.match(resultSource, /let\s+fullscreenPlotOpen\s*=/);
    assert.match(resultSource, /openFullscreenPlot/);
    assert.match(resultSource, /closeFullscreenPlot/);
    assert.match(resultSource, /class=["']plot-fullscreen["']/);
    assert.match(resultSource, /aria-label=["']Open Pareto PPA fullscreen["']/);
    assert.match(resultSource, /aria-label=["']Close fullscreen plot["']/);
    assert.match(resultSource, /\{#if\s+fullscreenPlotOpen\s+&&\s+plot\.points\.length\s+>\s+0\}/);
});

test("Result panel shows loading feedback before run artifacts are read", () => {
    const sidebarSource = readFileSync(path.join(process.cwd(), "src", "providers", "CompassSidebar.ts"), "utf8");
    const panelSource = readFileSync(path.join(process.cwd(), "src", "providers", "ResultPanel.ts"), "utf8");
    const resultSource = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "Results.svelte"), "utf8");

    assert.match(sidebarSource, /renderLoading/);
    assert.ok(
        sidebarSource.indexOf("const panel = ResultPanel.createOrShow") <
            sidebarSource.indexOf("const runs = await listHgboRuns"),
        "results panel should be created before run discovery"
    );
    assert.match(panelSource, /renderLoading/);
    assert.match(panelSource, /loading:\s*true/);
    assert.match(resultSource, /progress-bar/);
    assert.match(resultSource, /Loading run artifacts/);
});

test("Result panel discovers runs before lazily loading selected run details", () => {
    const sidebarSource = readFileSync(path.join(process.cwd(), "src", "providers", "CompassSidebar.ts"), "utf8");
    const runnerSource = readFileSync(path.join(process.cwd(), "src", "services", "hgboDseRunner.ts"), "utf8");
    const panelSource = readFileSync(path.join(process.cwd(), "src", "providers", "ResultPanel.ts"), "utf8");

    assert.match(sidebarSource, /listHgboRuns/);
    assert.match(sidebarSource, /readHgboRunOverview/);
    assert.match(sidebarSource, /resultsLoadRequestId/);
    assert.ok(
        sidebarSource.indexOf("const runs = await listHgboRuns") <
            sidebarSource.indexOf("await this.loadRunDetails"),
        "run list should load before selected run details"
    );
    assert.match(runnerSource, /export async function readHgboRunOverview/);
    assert.match(runnerSource, /export async function readHgboRunArtifact/);
    assert.doesNotMatch(runnerSource, /const runs = await listHgboRuns\(workspaceUri\);\s*if \(runs\.length === 0\)/);
    assert.match(panelSource, /renderRunList/);
});

test("extension hot reloads active webviews from rebuilt compiled assets in development mode", () => {
    const extensionSource = readFileSync(path.join(process.cwd(), "src", "extension.ts"), "utf8");
    const hotReloadSource = readFileSync(path.join(process.cwd(), "src", "utilities", "webviewHotReload.ts"), "utf8");
    const sidebarSource = readFileSync(path.join(process.cwd(), "src", "providers", "CompassSidebar.ts"), "utf8");
    const panelSource = readFileSync(path.join(process.cwd(), "src", "providers", "ResultPanel.ts"), "utf8");
    const mainSidebarSource = readFileSync(path.join(process.cwd(), "webviews", "sveltePages", "MainSidebar.svelte"), "utf8");
    const mainEntrypointSource = readFileSync(path.join(process.cwd(), "webviews", "pages", "MainSidebar.ts"), "utf8");
    const resultEntrypointSource = readFileSync(path.join(process.cwd(), "webviews", "pages", "Result.ts"), "utf8");

    assert.match(hotReloadSource, /ExtensionMode\.Development/);
    assert.match(hotReloadSource, /out\/compiled\/\*\.\{js,css\}/);
    assert.match(hotReloadSource, /createWebviewHotReloadScript/);
    assert.match(hotReloadSource, /createDevelopmentWebviewHotReloadScript/);
    assert.match(hotReloadSource, /compassHotReload/);
    assert.match(extensionSource, /registerWebviewHotReload/);
    assert.match(extensionSource, /context\.extensionMode/);
    assert.match(extensionSource, /ResultPanel\.reloadCurrentWebview/);
    assert.match(sidebarSource, /webviewResourceVersion/);
    assert.match(sidebarSource, /public reloadWebview\(\)/);
    assert.match(sidebarSource, /public hotReloadWebview\(/);
    assert.match(sidebarSource, /createDevelopmentWebviewHotReloadScript/);
    assert.match(sidebarSource, /data-compass-hot-script/);
    assert.match(sidebarSource, /case\s+["']ready["']/);
    assert.match(panelSource, /webviewResourceVersion/);
    assert.match(panelSource, /public static reloadCurrentWebview\(\)/);
    assert.match(panelSource, /public hotReloadWebview\(/);
    assert.match(panelSource, /createDevelopmentWebviewHotReloadScript/);
    assert.match(panelSource, /data-compass-hot-script/);
    assert.match(mainSidebarSource, /postMessage\(\{\s*type:\s*["']ready["']/);
    assert.match(mainEntrypointSource, /unmount/);
    assert.match(mainEntrypointSource, /__compassWebviewApp/);
    assert.match(resultEntrypointSource, /unmount/);
    assert.match(resultEntrypointSource, /__compassWebviewApp/);
});

test("yaml generation uses HGBO-DSE params.yaml filename", () => {
    const source = readFileSync(path.join(process.cwd(), "src", "services", "yamlService.ts"), "utf8");

    assert.match(source, /path\.join\(outputDirectory\.fsPath,\s*["']params\.yaml["']\)/);
    assert.match(source, /\["config\.yaml",\s*"params\.yaml"\]/);
    assert.doesNotMatch(source, /["']param\.yaml["']/);
});
