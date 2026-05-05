<script lang="ts">
  import { onMount, tick } from "svelte";
  import { provideVSCodeDesignSystem, vsCodeDivider } from "@vscode/webview-ui-toolkit";

  interface VSCodeMessage<T> {
    type: string;
    value: T;
  }

  interface RunSummary {
    id: string;
    label: string;
    fileCount: number;
    isLatest: boolean;
  }

  interface DisplayFile {
    name: string;
    content: string;
  }

  interface DseGraphArtifact {
    name: string;
    uri: string;
    content: string;
  }

  interface DsePlotPoint {
    trial: number;
    projectId: string;
    projectLabel: string;
    x: number;
    y: number;
    z: number;
    pareto: boolean;
  }

  interface DsePlotMetricPoint {
    x: number;
    y: number;
    z: number;
  }

  interface DsePlotVerificationPair {
    trial: number;
    projectId: string;
    projectLabel: string;
    predicted: DsePlotMetricPoint;
    actual: DsePlotMetricPoint;
  }

  interface DsePlotData {
    axes: {
      x: string;
      y: string;
      z: string;
    };
    points: DsePlotPoint[];
    verificationPairs?: DsePlotVerificationPair[];
  }

  interface RunFileGroup {
    id: string;
    projectId: string;
    projectLabel: string;
    trial?: number;
    files: DisplayFile[];
  }

  interface DseMetricValues {
    power: number;
    cp: number;
    area: number;
    latency?: number;
  }

  interface DseTrialManifestEntry {
    trial: number;
    projectId: string;
    projectLabel: string;
    pareto: boolean;
    params: Record<string, string | number | boolean>;
    predicted: DseMetricValues;
    implementation?: {
      actual: DseMetricValues;
      error: DseVerificationError;
      rawPpa?: unknown;
    };
    rawPpa?: unknown;
  }

  interface DseVerificationError {
    powerAbs?: number;
    powerRelPct?: number;
    cpAbs?: number;
    cpRelPct?: number;
    areaAbs?: number;
    areaRelPct?: number;
    latencyAbs?: number;
    latencyRelPct?: number;
  }

  interface DseVerificationComparison {
    trial: number;
    projectId: string;
    projectLabel: string;
    predicted: DseMetricValues;
    actual: DseMetricValues;
    error: DseVerificationError;
    rawPpa?: unknown;
  }

  interface ResultsPayload {
    runId: string;
    runs: RunSummary[];
    logs: DisplayFile[];
    fileGroups: RunFileGroup[];
    svgs: DseGraphArtifact[];
    plot: DsePlotData;
    trialManifest: DseTrialManifestEntry[];
    verification: DseVerificationComparison[];
    loading?: boolean;
    message?: string;
  }

  type IncomingMessage =
    | (VSCodeMessage<ResultsPayload> & { type: "render" });

  type IconName = "zoomOut" | "zoomIn" | "reset" | "fullscreen" | "close";

  interface ProjectedPoint extends DsePlotPoint {
    screenX: number;
    screenY: number;
    depth: number;
  }

  interface ProjectedMetricPoint extends DsePlotMetricPoint {
    screenX: number;
    screenY: number;
    depth: number;
  }

  interface ProjectedVerificationPair extends Omit<DsePlotVerificationPair, "predicted" | "actual"> {
    predicted: ProjectedMetricPoint;
    actual: ProjectedMetricPoint;
    depth: number;
  }

  interface ProjectedAxis {
    label: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    ticks: ProjectedAxisTick[];
  }

  interface ProjectedAxisTick {
    x: number;
    y: number;
    label: string;
  }

  interface GraphViewState {
    zoom: number;
    panX: number;
    panY: number;
  }

  interface GraphDragState {
    graphName: string;
    pointerId: number;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    captureTarget: Element;
    moved: boolean;
  }

  interface SelectedGraphItem {
    graphName: string;
    kind: "study" | "bar";
    label: string;
    value?: string;
    trial?: number;
    projectId?: string;
  }

  const emptyPlot: DsePlotData = {
    axes: {
      x: "Power",
      y: "CP",
      z: "Area",
    },
    points: [],
    verificationPairs: [],
  };

  const iconPaths: Record<IconName, string[]> = {
    zoomOut: [
      "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z",
      "M7.5 10.5h6",
      "M16 16l5 5",
    ],
    zoomIn: [
      "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z",
      "M7.5 10.5h6",
      "M10.5 7.5v6",
      "M16 16l5 5",
    ],
    reset: [
      "M4 4v6h6",
      "M5.5 14a7 7 0 1 0 1.8-7L4 10",
    ],
    fullscreen: [
      "M8 3H3v5",
      "M16 3h5v5",
      "M21 16v5h-5",
      "M3 16v5h5",
    ],
    close: [
      "M6 6l12 12",
      "M18 6L6 18",
    ],
  };

  let runs: RunSummary[] = [];
  let selectedRunId = "";
  let logs: DisplayFile[] = [];
  let fileGroups: RunFileGroup[] = [];
  let svgs: DseGraphArtifact[] = [];
  let plot: DsePlotData = emptyPlot;
  let trialManifest: DseTrialManifestEntry[] = [];
  let verification: DseVerificationComparison[] = [];
  let loading = false;
  let message = "";
  let yaw = 38;
  let pitch = 24;
  let zoom = 1;
  let selectedPoint: DsePlotPoint | undefined;
  let dragState: {
    pointerId: number;
    startX: number;
    startY: number;
    startYaw: number;
    startPitch: number;
    captureTarget: Element;
    moved: boolean;
  } | undefined;
  let suppressNextPointClick = false;
  let graphStates: Record<string, GraphViewState> = {};
  let graphDragState: GraphDragState | undefined;
  let suppressNextGraphClick = false;
  let selectedGraphItem: SelectedGraphItem | undefined;
  let fullscreenGraphName = "";
  let fullscreenPlotOpen = false;
  let selectedImplTrials: Set<number> = new Set();

  $: displayedFileGroups = fileGroups.length > 0
    ? fileGroups
    : logs.length > 0
      ? [{ id: "run-level", projectId: "run-level", projectLabel: "Run-level files", files: logs }]
      : [];
  $: projected = projectPlot(plot, yaw, pitch, zoom);
  $: paretoCount = plot.points.filter(point => point.pareto).length;
  $: paretoTrialManifest = trialManifest.filter(entry => entry.pareto);
  $: selectedImplCount = selectedImplTrials.size;
  $: verificationByTrial = new Map(verification.map(entry => [entry.trial, entry]));
  $: selectedProjectGroup = selectedPoint
    ? displayedFileGroups.find(group => group.projectId === selectedPoint?.projectId)
    : undefined;
  $: fullscreenGraph = svgs.find(svg => svg.name === fullscreenGraphName);
  $: if (selectedPoint && !plot.points.some(point => point.projectId === selectedPoint?.projectId)) {
    selectedPoint = undefined;
  }
  $: void syncSelectedGraphElements(selectedPoint?.trial);
  $: {
    const validTrials = new Set(trialManifest.map(entry => entry.trial));
    if ([...selectedImplTrials].some(trial => !validTrials.has(trial))) {
      selectedImplTrials = new Set([...selectedImplTrials].filter(trial => validTrials.has(trial)));
    }
  }

  function handleMessage(event: MessageEvent<IncomingMessage>) {
    const msg = event.data;
    switch (msg.type) {
      case "render":
        selectedRunId = msg.value.runId;
        runs = msg.value.runs;
        logs = msg.value.logs;
        fileGroups = msg.value.fileGroups ?? [];
        svgs = msg.value.svgs;
        plot = msg.value.plot;
        trialManifest = msg.value.trialManifest ?? [];
        verification = msg.value.verification ?? [];
        loading = Boolean(msg.value.loading);
        message = msg.value.message ?? "";
        selectedPoint = undefined;
        selectedGraphItem = undefined;
        fullscreenGraphName = "";
        fullscreenPlotOpen = false;
        selectedImplTrials = new Set();
        break;
    }
  }

  function selectRun(event: Event) {
    const runId = (event.target as HTMLSelectElement).value;
    selectedRunId = runId;
    vscode_comm.postMessage({ type: "selectRun", value: runId });
  }

  function projectPlot(plotData: DsePlotData, yawDegrees: number, pitchDegrees: number, zoomLevel: number) {
    const width = 720;
    const height = 540;
    const verificationPairs = plotData.verificationPairs ?? [];
    const coordinates = [
      ...plotData.points,
      ...verificationPairs.flatMap(pair => [pair.predicted, pair.actual]),
    ];
    const xRange = rangeFor(coordinates.map(point => point.x));
    const yRange = rangeFor(coordinates.map(point => point.y));
    const zRange = rangeFor(coordinates.map(point => point.z));
    const yawRadians = toRadians(yawDegrees);
    const pitchRadians = toRadians(pitchDegrees);
    const projectMetricPoint = (point: DsePlotMetricPoint): ProjectedMetricPoint => ({
      ...point,
      ...projectCoordinate(
        normalize(point.x, xRange),
        normalize(point.y, yRange),
        normalize(point.z, zRange),
        yawRadians,
        pitchRadians,
        width,
        height,
        zoomLevel
      ),
    });
    const points = plotData.points
      .map(point => {
        return {
          ...point,
          ...projectMetricPoint(point),
        };
      })
      .sort((a, b) => a.depth - b.depth);
    const projectedVerificationPairs = verificationPairs
      .map(pair => {
        const predicted = projectMetricPoint(pair.predicted);
        const actual = projectMetricPoint(pair.actual);
        return {
          trial: pair.trial,
          projectId: pair.projectId,
          projectLabel: pair.projectLabel,
          predicted,
          actual,
          depth: Math.min(predicted.depth, actual.depth),
        };
      })
      .sort((a, b) => a.depth - b.depth);

    return {
      width,
      height,
      points,
      verificationPairs: projectedVerificationPairs,
      axes: [
        buildAxis(plotData.axes.x, [-1, -1, -1], [1, -1, -1], xRange, yawRadians, pitchRadians, width, height, zoomLevel),
        buildAxis(plotData.axes.y, [-1, -1, -1], [-1, 1, -1], yRange, yawRadians, pitchRadians, width, height, zoomLevel),
        buildAxis(plotData.axes.z, [-1, -1, -1], [-1, -1, 1], zRange, yawRadians, pitchRadians, width, height, zoomLevel),
      ],
    };
  }

  function buildAxis(
    label: string,
    start: [number, number, number],
    end: [number, number, number],
    valueRange: { min: number; max: number },
    yawRadians: number,
    pitchRadians: number,
    width: number,
    height: number,
    zoomLevel: number
  ): ProjectedAxis {
    const startPoint = projectCoordinate(start[0], start[1], start[2], yawRadians, pitchRadians, width, height, zoomLevel);
    const endPoint = projectCoordinate(end[0], end[1], end[2], yawRadians, pitchRadians, width, height, zoomLevel);
    const tickValues = [valueRange.min, (valueRange.min + valueRange.max) / 2, valueRange.max];
    const ticks = [-1, 0, 1].map((position, index) => {
      const axisT = (position + 1) / 2;
      const x = start[0] + (end[0] - start[0]) * axisT;
      const y = start[1] + (end[1] - start[1]) * axisT;
      const z = start[2] + (end[2] - start[2]) * axisT;
      const projectedTick = projectCoordinate(x, y, z, yawRadians, pitchRadians, width, height, zoomLevel);

      return {
        x: projectedTick.screenX,
        y: projectedTick.screenY,
        label: formatAxisTickValue(tickValues[index]),
      };
    });

    return {
      label,
      x1: startPoint.screenX,
      y1: startPoint.screenY,
      x2: endPoint.screenX,
      y2: endPoint.screenY,
      ticks,
    };
  }

  function projectCoordinate(
    x: number,
    y: number,
    z: number,
    yawRadians: number,
    pitchRadians: number,
    width: number,
    height: number,
    zoomLevel: number
  ) {
    const yawX = x * Math.cos(yawRadians) - z * Math.sin(yawRadians);
    const yawZ = x * Math.sin(yawRadians) + z * Math.cos(yawRadians);
    const pitchY = y * Math.cos(pitchRadians) - yawZ * Math.sin(pitchRadians);
    const depth = y * Math.sin(pitchRadians) + yawZ * Math.cos(pitchRadians);
    const scale = Math.min(width, height) * 0.39 * zoomLevel / (1 + (depth + 1.4) * 0.08);

    return {
      screenX: width / 2 + yawX * scale,
      screenY: height / 2 - pitchY * scale,
      depth,
    };
  }

  function rangeFor(values: number[]) {
    if (values.length === 0) {
      return { min: 0, max: 1 };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
      return { min: min - 1, max: max + 1 };
    }

    return { min, max };
  }

  function normalize(value: number, range: { min: number; max: number }) {
    return ((value - range.min) / (range.max - range.min)) * 2 - 1;
  }

  function toRadians(degrees: number) {
    return degrees * Math.PI / 180;
  }

  function formatPlotValue(value: number) {
    if (!Number.isFinite(value)) {
      return String(value);
    }

    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 4,
      maximumSignificantDigits: 6,
    }).format(value);
  }

  function formatAxisTickValue(value: number) {
    if (!Number.isFinite(value)) {
      return String(value);
    }

    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 3,
      maximumSignificantDigits: 4,
    }).format(value);
  }

  function formatOptionalMetric(value: number | undefined) {
    return value === undefined ? "-" : formatPlotValue(value);
  }

  function formatErrorPct(value: number | undefined) {
    return value === undefined ? "-" : `${formatPlotValue(value)}%`;
  }

  function toggleImplTrialSelection(entry: DseTrialManifestEntry, event?: Event) {
    const nextSelection = new Set(selectedImplTrials);
    const checked = event?.target instanceof HTMLInputElement ? event.target.checked : !nextSelection.has(entry.trial);

    if (checked) {
      nextSelection.add(entry.trial);
    } else {
      nextSelection.delete(entry.trial);
    }

    selectedImplTrials = nextSelection;
  }

  function selectAllParetoTrials() {
    selectedImplTrials = new Set(paretoTrialManifest.map(entry => entry.trial));
  }

  function clearImplTrialSelection() {
    selectedImplTrials = new Set();
  }

  function requestImplVerification() {
    if (!selectedRunId || selectedImplTrials.size === 0 || loading) {
      return;
    }

    vscode_comm.postMessage({
      type: "verifyImpl",
      value: {
        runId: selectedRunId,
        trials: [...selectedImplTrials].sort((a, b) => a - b),
      },
    });
  }

  function startPlotDrag(event: PointerEvent) {
    if (!(event.currentTarget instanceof Element)) {
      return;
    }

    const captureTarget = event.currentTarget;
    if (!(captureTarget instanceof SVGSVGElement)) {
      event.stopPropagation();
    }

    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startYaw: yaw,
      startPitch: pitch,
      captureTarget,
      moved: false,
    };
    captureTarget.setPointerCapture(event.pointerId);
  }

  function dragPlot(event: PointerEvent) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (Math.hypot(deltaX, deltaY) > 3) {
      dragState.moved = true;
    }

    yaw = clamp(dragState.startYaw + deltaX * 0.35, -180, 180);
    pitch = clamp(dragState.startPitch - deltaY * 0.28, -65, 65);
  }

  function endPlotDrag(event: PointerEvent) {
    if (dragState?.pointerId !== event.pointerId) {
      return;
    }

    const moved = dragState.moved;
    if (dragState.captureTarget.hasPointerCapture(event.pointerId)) {
      dragState.captureTarget.releasePointerCapture(event.pointerId);
    }
    dragState = undefined;
    if (moved) {
      suppressNextPointClick = true;
      window.setTimeout(() => {
        suppressNextPointClick = false;
      }, 0);
    }
  }

  function zoomPlot(event: WheelEvent) {
    event.preventDefault();
    zoom = clamp(zoom + (event.deltaY < 0 ? 0.08 : -0.08), 0.65, 2.4);
  }

  function openFullscreenPlot() {
    fullscreenPlotOpen = true;
  }

  function closeFullscreenPlot() {
    fullscreenPlotOpen = false;
  }

  function handleGraphControlPointer(event: PointerEvent) {
    event.stopPropagation();
  }

  function handleGraphControlClick(event: MouseEvent) {
    event.stopPropagation();
  }

  function selectPlotPoint(point: DsePlotPoint, event?: MouseEvent) {
    event?.stopPropagation();
    if (suppressNextPointClick) {
      suppressNextPointClick = false;
      return;
    }

    selectedPoint = point;
  }

  async function jumpToSelectedProject(point: DsePlotPoint, event?: MouseEvent) {
    event?.stopPropagation();
    if (suppressNextPointClick) {
      suppressNextPointClick = false;
      return;
    }

    selectedPoint = point;
    fullscreenPlotOpen = false;
    await scrollToProject(point.projectId);
  }

  function handlePointKeydown(point: DsePlotPoint, event: KeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    selectedPoint = point;
  }

  function selectImplementationPlotPoint(pair: DsePlotVerificationPair, event?: MouseEvent) {
    const matchingPoint = plot.points.find(point => point.trial === pair.trial);
    if (matchingPoint) {
      selectPlotPoint(matchingPoint, event);
    }
  }

  async function jumpToImplementationPlotPoint(pair: DsePlotVerificationPair, event?: MouseEvent) {
    const matchingPoint = plot.points.find(point => point.trial === pair.trial);
    if (matchingPoint) {
      await jumpToSelectedProject(matchingPoint, event);
    }
  }

  function handleImplementationPointKeydown(pair: DsePlotVerificationPair, event: KeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    const matchingPoint = plot.points.find(point => point.trial === pair.trial);
    if (matchingPoint) {
      selectedPoint = matchingPoint;
    }
  }

  async function scrollToSelectedProject() {
    if (!selectedPoint) {
      return;
    }

    await scrollToProject(selectedPoint.projectId);
  }

  async function scrollToProject(projectId: string) {
    await tick();
    const target = Array
      .from(document.querySelectorAll<HTMLElement>("[data-project-id]"))
      .find(element => element.dataset.projectId === projectId);
    if (!target) {
      return;
    }

    if (target instanceof HTMLDetailsElement) {
      target.open = true;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("project-group-highlight");
    window.setTimeout(() => target.classList.remove("project-group-highlight"), 1200);
  }

  function graphState(graphName: string, states: Record<string, GraphViewState> = graphStates): GraphViewState {
    return states[graphName] ?? { zoom: 1, panX: 0, panY: 0 };
  }

  function graphTransformStyle(graphName: string, states: Record<string, GraphViewState>) {
    const state = graphState(graphName, states);
    return `transform: translate(${state.panX}px, ${state.panY}px) scale(${state.zoom});`;
  }

  function updateGraphState(graphName: string, patch: Partial<GraphViewState>) {
    graphStates = {
      ...graphStates,
      [graphName]: {
        ...graphState(graphName),
        ...patch,
      },
    };
  }

  function startGraphDrag(graph: DseGraphArtifact, event: PointerEvent) {
    if (!(event.currentTarget instanceof Element)) {
      return;
    }

    const state = graphState(graph.name);
    const captureTarget = event.target instanceof Element ? event.target : event.currentTarget;
    graphDragState = {
      graphName: graph.name,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPanX: state.panX,
      startPanY: state.panY,
      captureTarget,
      moved: false,
    };
    captureTarget.setPointerCapture(event.pointerId);
  }

  function dragGraph(event: PointerEvent) {
    if (!graphDragState || graphDragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - graphDragState.startX;
    const deltaY = event.clientY - graphDragState.startY;
    if (Math.hypot(deltaX, deltaY) > 3) {
      graphDragState.moved = true;
    }

    updateGraphState(graphDragState.graphName, {
      panX: graphDragState.startPanX + deltaX,
      panY: graphDragState.startPanY + deltaY,
    });
  }

  function endGraphDrag(event: PointerEvent) {
    if (graphDragState?.pointerId !== event.pointerId) {
      return;
    }

    const moved = graphDragState.moved;
    if (graphDragState.captureTarget.hasPointerCapture(event.pointerId)) {
      graphDragState.captureTarget.releasePointerCapture(event.pointerId);
    }
    graphDragState = undefined;

    if (moved) {
      suppressNextGraphClick = true;
      window.setTimeout(() => {
        suppressNextGraphClick = false;
      }, 0);
    }
  }

  function zoomGraph(graph: DseGraphArtifact, event: WheelEvent) {
    event.preventDefault();
    zoomGraphBy(graph, event.deltaY < 0 ? 0.12 : -0.12);
  }

  function zoomGraphBy(graph: DseGraphArtifact, delta: number) {
    updateGraphState(graph.name, {
      zoom: clamp(graphState(graph.name).zoom + delta, 0.5, 3.5),
    });
  }

  function resetGraphView(graph: DseGraphArtifact) {
    updateGraphState(graph.name, { zoom: 1, panX: 0, panY: 0 });
  }

  function openFullscreenGraph(graph: DseGraphArtifact) {
    fullscreenGraphName = graph.name;
    void syncSelectedGraphElements(selectedPoint?.trial);
  }

  function closeFullscreenGraph() {
    fullscreenGraphName = "";
  }

  function handleGraphClick(graph: DseGraphArtifact, event: MouseEvent) {
    event.stopPropagation();
    if (suppressNextGraphClick) {
      suppressNextGraphClick = false;
      return;
    }

    const item = getGraphItemFromEvent(graph, event);
    if (!item) {
      return;
    }

    selectGraphItem(item);
    markSelectedGraphElement(event.currentTarget, event.target);
  }

  async function handleGraphDoubleClick(graph: DseGraphArtifact, event: MouseEvent) {
    event.stopPropagation();
    if (suppressNextGraphClick) {
      suppressNextGraphClick = false;
      return;
    }

    const item = getGraphItemFromEvent(graph, event);
    if (!item) {
      return;
    }

    selectGraphItem(item);
    markSelectedGraphElement(event.currentTarget, event.target);
    if (item.projectId) {
      fullscreenGraphName = "";
      await scrollToProject(item.projectId);
    }
  }

  function handleGraphKeydown(graph: DseGraphArtifact, event: KeyboardEvent) {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomGraphBy(graph, 0.15);
      return;
    }

    if (event.key === "-") {
      event.preventDefault();
      zoomGraphBy(graph, -0.15);
      return;
    }

    if (event.key === "0") {
      event.preventDefault();
      resetGraphView(graph);
      return;
    }

    if (event.key === "Escape" && fullscreenGraphName) {
      event.preventDefault();
      closeFullscreenGraph();
    }
  }

  function selectGraphItem(item: SelectedGraphItem) {
    selectedGraphItem = item;
    if (item.kind !== "study" || item.trial === undefined) {
      return;
    }

    const matchingPoint = plot.points.find(point => point.trial === item.trial);
    if (matchingPoint) {
      selectedPoint = matchingPoint;
    }
  }

  function getGraphItemFromEvent(graph: DseGraphArtifact, event: MouseEvent): SelectedGraphItem | undefined {
    if (!(event.currentTarget instanceof HTMLElement) || !(event.target instanceof Element)) {
      return undefined;
    }

    if (isOptimizationHistoryGraph(graph.name)) {
      return getOptimizationHistoryItem(graph, event.currentTarget, event.target);
    }

    if (isParamImportanceGraph(graph.name)) {
      return getParamImportanceItem(graph, event.currentTarget, event.target);
    }

    return undefined;
  }

  function getOptimizationHistoryItem(
    graph: DseGraphArtifact,
    container: HTMLElement,
    target: Element
  ): SelectedGraphItem | undefined {
    const pointElement = target.closest(".scatterlayer .points .point");
    if (!pointElement || !container.contains(pointElement)) {
      return undefined;
    }

    const pointElements = Array.from(container.querySelectorAll(".scatterlayer .points .point"));
    const trial = pointElements.indexOf(pointElement);
    if (trial < 0) {
      return undefined;
    }

    const matchingPoint = plot.points.find(point => point.trial === trial);
    return {
      graphName: graph.name,
      kind: "study",
      label: matchingPoint?.projectLabel ?? `prj_${trial}`,
      trial,
      projectId: matchingPoint?.projectId ?? `prj_${trial}`,
      value: getGraphMetricLabel(graph.name),
    };
  }

  function getParamImportanceItem(
    graph: DseGraphArtifact,
    container: HTMLElement,
    target: Element
  ): SelectedGraphItem | undefined {
    const barElement = target.closest(".barlayer .point");
    if (!barElement || !container.contains(barElement)) {
      return undefined;
    }

    const barElements = Array.from(container.querySelectorAll(".barlayer .point"));
    const index = barElements.indexOf(barElement);
    if (index < 0) {
      return undefined;
    }

    const labels = Array.from(container.querySelectorAll(".yaxislayer-above .ytick text"))
      .map(label => label.textContent?.trim() ?? "")
      .filter(Boolean);
    const value = barElement.querySelector(".bartext")?.textContent?.trim();

    return {
      graphName: graph.name,
      kind: "bar",
      label: labels[index] ?? `Parameter ${index + 1}`,
      value,
    };
  }

  function markSelectedGraphElement(currentTarget: EventTarget | null, target: EventTarget | null) {
    if (!(currentTarget instanceof HTMLElement) || !(target instanceof Element)) {
      return;
    }

    currentTarget
      .querySelectorAll(".interactive-graph-selected")
      .forEach(element => element.classList.remove("interactive-graph-selected"));

    const selectedElement = target.closest(".scatterlayer .points .point, .barlayer .point");
    if (selectedElement && currentTarget.contains(selectedElement)) {
      selectedElement.classList.add("interactive-graph-selected");
    }
  }

  async function syncSelectedGraphElements(trial: number | undefined) {
    await tick();

    document
      .querySelectorAll(".interactive-graph-selected")
      .forEach(element => element.classList.remove("interactive-graph-selected"));

    if (trial === undefined) {
      return;
    }

    const graphContainers = document.querySelectorAll<HTMLElement>(".graph-viewport, .fullscreen-graph-viewport");
    for (const container of graphContainers) {
      const pointElements = Array.from(container.querySelectorAll(".scatterlayer .points .point"));
      const selectedElement = pointElements[trial];
      if (selectedElement) {
        selectedElement.classList.add("interactive-graph-selected");
      }
    }
  }

  function isOptimizationHistoryGraph(name: string) {
    return /opt_history/i.test(name);
  }

  function isParamImportanceGraph(name: string) {
    return /param_importance/i.test(name);
  }

  function getGraphMetricLabel(name: string) {
    const match = name.match(/(?:opt_history|param_importance)_([^.]+)/i);
    return match?.[1] ?? name;
  }

  function handleResultsKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.key !== "Escape") {
      return;
    }

    if (fullscreenGraphName) {
      closeFullscreenGraph();
    }

    if (fullscreenPlotOpen) {
      closeFullscreenPlot();
    }
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  onMount(() => {
    provideVSCodeDesignSystem().register(vsCodeDivider());
    window.addEventListener("message", handleMessage);
    window.addEventListener("keydown", handleResultsKeydown);
    vscode_comm.postMessage({ type: "ready", value: "" });

    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("keydown", handleResultsKeydown);
    };
  });
</script>

{#snippet icon(name: IconName)}
  <svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {#each iconPaths[name] as path}
      <path d={path}></path>
    {/each}
  </svg>
{/snippet}

<main class="results-view">
  <header class="run-toolbar">
    <div>
      <h1>Compass Results</h1>
      <p>{message || `${plot.points.length} trials · ${paretoCount} Pareto solutions`}</p>
    </div>
    <label class="run-picker">
      <span>Run</span>
      <select bind:value={selectedRunId} on:change={selectRun}>
        {#each runs as run}
          <option value={run.id}>
            {run.label}{run.isLatest ? " · latest" : ""}{run.fileCount > 0 ? ` · ${run.fileCount} files` : ""}
          </option>
        {/each}
      </select>
    </label>
  </header>

  {#if loading}
    <section class="loading-panel" aria-live="polite">
      <div class="loading-copy">
        <h2>Loading run artifacts</h2>
        <p>{message || "Loading run artifacts and studies..."}</p>
      </div>
      <div class="progress-track" role="progressbar" aria-label="Loading run artifacts">
        <div class="progress-bar"></div>
      </div>
    </section>
  {/if}

  <section class="visual-grid">
    <section class="plot-panel">
      <div class="section-heading">
        <h2>Pareto PPA</h2>
        <div class="plot-controls">
          <label>
            <span>Rotate</span>
            <input type="range" min="-70" max="70" bind:value={yaw} />
          </label>
          <label>
            <span>Tilt</span>
            <input type="range" min="-10" max="65" bind:value={pitch} />
          </label>
          <label>
            <span>Zoom</span>
            <input type="range" min="0.65" max="2.4" step="0.05" bind:value={zoom} />
          </label>
          <button
            class="icon-button"
            type="button"
            title="Open Pareto PPA fullscreen"
            aria-label="Open Pareto PPA fullscreen"
            on:pointerdown={handleGraphControlPointer}
            on:click={(event) => {
              handleGraphControlClick(event);
              openFullscreenPlot();
            }}
          >
            {@render icon("fullscreen")}
          </button>
        </div>
      </div>

      {#if plot.points.length > 0}
        <div class="plot-stage">
          <svg
            class="plot"
            class:dragging={Boolean(dragState)}
            viewBox={`0 0 ${projected.width} ${projected.height}`}
            role="img"
            aria-label="3D Pareto PPA plot"
            preserveAspectRatio="xMidYMid meet"
            on:pointerdown={startPlotDrag}
            on:pointermove={dragPlot}
            on:pointerup={endPlotDrag}
            on:pointercancel={endPlotDrag}
            on:wheel={zoomPlot}
          >
            <rect class="plot-hit-area" x="0" y="0" width={projected.width} height={projected.height} />
            {#each projected.axes as axis}
              <line class="plot-axis" x1={axis.x1} y1={axis.y1} x2={axis.x2} y2={axis.y2} />
              <text class="axis-label" x={axis.x2} y={axis.y2 - 8}>{axis.label}</text>
              {#each axis.ticks as tick}
                <circle class="axis-tick" cx={tick.x} cy={tick.y} r="2" />
                <text class="axis-tick-label" x={tick.x + 5} y={tick.y + 13}>{tick.label}</text>
              {/each}
            {/each}
            {#each projected.verificationPairs as pair (pair.projectId)}
              <line
                class="implementation-link"
                x1={pair.predicted.screenX}
                y1={pair.predicted.screenY}
                x2={pair.actual.screenX}
                y2={pair.actual.screenY}
              >
                <title>
                  {pair.projectLabel} · Trial {pair.trial}
                  Predicted to verified implementation PPA
                </title>
              </line>
            {/each}
            {#each projected.points as point (point.projectId)}
              <circle
                class:pareto-point={point.pareto}
                class:selected-plot-point={selectedPoint?.projectId === point.projectId}
                class="plot-point"
                cx={point.screenX}
                cy={point.screenY}
                r={selectedPoint?.projectId === point.projectId ? 7 : point.pareto ? 5.5 : 3.5}
                role="button"
                tabindex="0"
                aria-label={`${point.projectLabel}, trial ${point.trial}`}
                on:pointerdown={(event) => startPlotDrag(event)}
                on:click={(event) => selectPlotPoint(point, event)}
                on:dblclick={(event) => jumpToSelectedProject(point, event)}
                on:keydown={(event) => handlePointKeydown(point, event)}
              >
                <title>
                  {point.projectLabel} · Trial {point.trial}
                  {plot.axes.x}: {point.x}
                  {plot.axes.y}: {point.y}
                  {plot.axes.z}: {point.z}
                </title>
              </circle>
            {/each}
            {#each projected.verificationPairs as pair (pair.projectId)}
              <circle
                class:selected-plot-point={selectedPoint?.projectId === pair.projectId}
                class="implementation-plot-point"
                cx={pair.actual.screenX}
                cy={pair.actual.screenY}
                r={selectedPoint?.projectId === pair.projectId ? 6.5 : 5}
                role="button"
                tabindex="0"
                aria-label={`${pair.projectLabel}, trial ${pair.trial}, verified implementation PPA`}
                on:pointerdown={(event) => startPlotDrag(event)}
                on:click={(event) => selectImplementationPlotPoint(pair, event)}
                on:dblclick={(event) => jumpToImplementationPlotPoint(pair, event)}
                on:keydown={(event) => handleImplementationPointKeydown(pair, event)}
              >
                <title>
                  {pair.projectLabel} · Trial {pair.trial} · Verified implementation
                  {plot.axes.x}: {pair.actual.x}
                  {plot.axes.y}: {pair.actual.y}
                  {plot.axes.z}: {pair.actual.z}
                </title>
              </circle>
            {/each}
          </svg>
        </div>
        {#if selectedPoint}
          <div class="selected-study" aria-live="polite">
            <div>
              <span class="selected-label">Selected Study</span>
              <strong>{selectedPoint.projectLabel}</strong>
            </div>
            <dl>
              <div>
                <dt>Trial</dt>
                <dd>{selectedPoint.trial}</dd>
              </div>
              <div>
                <dt>{plot.axes.x}</dt>
                <dd title={String(selectedPoint.x)}>{formatPlotValue(selectedPoint.x)}</dd>
              </div>
              <div>
                <dt>{plot.axes.y}</dt>
                <dd title={String(selectedPoint.y)}>{formatPlotValue(selectedPoint.y)}</dd>
              </div>
              <div>
                <dt>{plot.axes.z}</dt>
                <dd title={String(selectedPoint.z)}>{formatPlotValue(selectedPoint.z)}</dd>
              </div>
              <div>
                <dt>Files</dt>
                <dd>{selectedProjectGroup?.files.length ?? 0}</dd>
              </div>
            </dl>
            <button type="button" on:click={scrollToSelectedProject}>Show Files</button>
          </div>
        {/if}
      {:else}
        <div class="empty-state">No PPA trial values found in this run.</div>
      {/if}

      {#if trialManifest.length > 0}
        <div class="impl-verify-panel">
          <div class="impl-verify-heading">
            <div>
              <h3>Implementation Verification</h3>
              <p>{selectedImplCount} of {paretoTrialManifest.length} Pareto studies selected</p>
            </div>
            <div class="impl-actions">
              <button type="button" on:click={selectAllParetoTrials} disabled={paretoTrialManifest.length === 0 || loading}>
                Select Pareto
              </button>
              <button type="button" on:click={clearImplTrialSelection} disabled={selectedImplCount === 0 || loading}>
                Clear
              </button>
              <button
                class="primary-action"
                type="button"
                on:click={requestImplVerification}
                disabled={selectedImplCount === 0 || loading}
              >
                Run Impl Verification
              </button>
            </div>
          </div>

          {#if paretoTrialManifest.length > 0}
            <div class="table-scroll">
              <table class="study-table">
                <thead>
                  <tr>
                    <th scope="col">Use</th>
                    <th scope="col">Study</th>
                    <th scope="col">Pred Power</th>
                    <th scope="col">Pred CP</th>
                    <th scope="col">Pred Area</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {#each paretoTrialManifest as entry (entry.trial)}
                    {@const verified = entry.implementation ?? verificationByTrial.get(entry.trial)}
                    <tr
                      class:selected-row={selectedImplTrials.has(entry.trial)}
                      on:click={() => toggleImplTrialSelection(entry)}
                      on:dblclick={() => scrollToProject(entry.projectId)}
                    >
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${entry.projectLabel} for implementation verification`}
                          checked={selectedImplTrials.has(entry.trial)}
                          disabled={loading}
                          on:click={(event) => event.stopPropagation()}
                          on:change={(event) => toggleImplTrialSelection(entry, event)}
                        />
                      </td>
                      <td>
                        <button class="link-button" type="button" on:click={(event) => {
                          event.stopPropagation();
                          scrollToProject(entry.projectId);
                        }}>
                          {entry.projectLabel}
                        </button>
                        <span class="trial-meta">Trial {entry.trial}</span>
                      </td>
                      <td>{formatOptionalMetric(entry.predicted.power)}</td>
                      <td>{formatOptionalMetric(entry.predicted.cp)}</td>
                      <td>{formatOptionalMetric(entry.predicted.area)}</td>
                      <td>{verified ? "Verified" : Object.keys(entry.params).length > 0 ? "Ready" : "Missing params"}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="empty-state compact">No Pareto studies found for implementation verification.</div>
          {/if}

          {#if verification.length > 0}
            <div class="verification-results">
              <h3>Verification Accuracy</h3>
              <div class="table-scroll">
                <table class="accuracy-table">
                  <thead>
                    <tr>
                      <th scope="col">Study</th>
                      <th scope="col">Power Pred</th>
                      <th scope="col">Power Actual</th>
                      <th scope="col">Power Err</th>
                      <th scope="col">CP Pred</th>
                      <th scope="col">CP Actual</th>
                      <th scope="col">CP Err</th>
                      <th scope="col">Area Pred</th>
                      <th scope="col">Area Actual</th>
                      <th scope="col">Area Err</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each verification as row (row.trial)}
                      <tr on:dblclick={() => scrollToProject(row.projectId)}>
                        <td>
                          <button class="link-button" type="button" on:click={() => scrollToProject(row.projectId)}>
                            {row.projectLabel}
                          </button>
                        </td>
                        <td>{formatOptionalMetric(row.predicted.power)}</td>
                        <td>{formatOptionalMetric(row.actual.power)}</td>
                        <td>{formatErrorPct(row.error.powerRelPct)}</td>
                        <td>{formatOptionalMetric(row.predicted.cp)}</td>
                        <td>{formatOptionalMetric(row.actual.cp)}</td>
                        <td>{formatErrorPct(row.error.cpRelPct)}</td>
                        <td>{formatOptionalMetric(row.predicted.area)}</td>
                        <td>{formatOptionalMetric(row.actual.area)}</td>
                        <td>{formatErrorPct(row.error.areaRelPct)}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </section>

    <section class="graphs-panel">
      <div class="section-heading">
        <h2>DSE Graphs</h2>
      </div>
      {#if svgs.length > 0}
        <div class="graphs">
          {#each svgs as svg}
            <figure class="graph-card">
              <figcaption>
                <span>{svg.name}</span>
                <span class="graph-actions">
                  <button
                    class="icon-button"
                    type="button"
                    title={`Zoom out ${svg.name}`}
                    aria-label={`Zoom out ${svg.name}`}
                    on:pointerdown={handleGraphControlPointer}
                    on:click={(event) => {
                      handleGraphControlClick(event);
                      zoomGraphBy(svg, -0.15);
                    }}
                  >
                    {@render icon("zoomOut")}
                  </button>
                  <button
                    class="icon-button"
                    type="button"
                    title={`Zoom in ${svg.name}`}
                    aria-label={`Zoom in ${svg.name}`}
                    on:pointerdown={handleGraphControlPointer}
                    on:click={(event) => {
                      handleGraphControlClick(event);
                      zoomGraphBy(svg, 0.15);
                    }}
                  >
                    {@render icon("zoomIn")}
                  </button>
                  <button
                    class="icon-button"
                    type="button"
                    title={`Reset ${svg.name}`}
                    aria-label={`Reset ${svg.name}`}
                    on:pointerdown={handleGraphControlPointer}
                    on:click={(event) => {
                      handleGraphControlClick(event);
                      resetGraphView(svg);
                    }}
                  >
                    {@render icon("reset")}
                  </button>
                  <button
                    class="icon-button"
                    type="button"
                    title={`Open ${svg.name} fullscreen`}
                    aria-label={`Open ${svg.name} fullscreen`}
                    on:pointerdown={handleGraphControlPointer}
                    on:click={(event) => {
                      handleGraphControlClick(event);
                      openFullscreenGraph(svg);
                    }}
                  >
                    {@render icon("fullscreen")}
                  </button>
                </span>
              </figcaption>
              <div
                class="graph-viewport"
                class:dragging={graphDragState?.graphName === svg.name}
                role="button"
                tabindex="0"
                aria-label={svg.name}
                on:pointerdown={(event) => startGraphDrag(svg, event)}
                on:pointermove={dragGraph}
                on:pointerup={endGraphDrag}
                on:pointercancel={endGraphDrag}
                on:wheel={(event) => zoomGraph(svg, event)}
                on:click={(event) => handleGraphClick(svg, event)}
                on:dblclick={(event) => handleGraphDoubleClick(svg, event)}
                on:keydown={(event) => handleGraphKeydown(svg, event)}
              >
                <div class="graph-svg-content" style={graphTransformStyle(svg.name, graphStates)}>
                  {@html svg.content}
                </div>
              </div>
            </figure>
          {/each}
        </div>
        {#if selectedGraphItem}
          <div class="selected-graph-item" aria-live="polite">
            <div>
              <span class="selected-label">Selected Graph Item</span>
              <strong>{selectedGraphItem.label}</strong>
            </div>
            <dl>
              <div>
                <dt>Graph</dt>
                <dd>{selectedGraphItem.graphName}</dd>
              </div>
              {#if selectedGraphItem.trial !== undefined}
                <div>
                  <dt>Trial</dt>
                  <dd>{selectedGraphItem.trial}</dd>
                </div>
              {/if}
              {#if selectedGraphItem.value}
                <div>
                  <dt>{selectedGraphItem.kind === "study" ? "Metric" : "Value"}</dt>
                  <dd>{selectedGraphItem.value}</dd>
                </div>
              {/if}
            </dl>
          </div>
        {/if}
      {:else}
        <div class="empty-state">No DSE graph SVGs found in this run.</div>
      {/if}
    </section>
  </section>

  {#if fullscreenGraph}
    <div class="graph-fullscreen" role="dialog" aria-modal="true" aria-label={`Fullscreen graph ${fullscreenGraph.name}`}>
      <div class="fullscreen-toolbar">
        <h2>{fullscreenGraph.name}</h2>
        <div class="graph-actions">
          <button
            class="icon-button"
            type="button"
            title={`Zoom out ${fullscreenGraph.name}`}
            aria-label={`Zoom out ${fullscreenGraph.name}`}
            on:pointerdown={handleGraphControlPointer}
            on:click={(event) => {
              handleGraphControlClick(event);
              zoomGraphBy(fullscreenGraph, -0.15);
            }}
          >
            {@render icon("zoomOut")}
          </button>
          <button
            class="icon-button"
            type="button"
            title={`Zoom in ${fullscreenGraph.name}`}
            aria-label={`Zoom in ${fullscreenGraph.name}`}
            on:pointerdown={handleGraphControlPointer}
            on:click={(event) => {
              handleGraphControlClick(event);
              zoomGraphBy(fullscreenGraph, 0.15);
            }}
          >
            {@render icon("zoomIn")}
          </button>
          <button
            class="icon-button"
            type="button"
            title={`Reset ${fullscreenGraph.name}`}
            aria-label={`Reset ${fullscreenGraph.name}`}
            on:pointerdown={handleGraphControlPointer}
            on:click={(event) => {
              handleGraphControlClick(event);
              resetGraphView(fullscreenGraph);
            }}
          >
            {@render icon("reset")}
          </button>
          <button
            class="icon-button"
            type="button"
            title="Close fullscreen graph"
            aria-label="Close fullscreen graph"
            on:pointerdown={handleGraphControlPointer}
            on:click={(event) => {
              handleGraphControlClick(event);
              closeFullscreenGraph();
            }}
          >
            {@render icon("close")}
          </button>
        </div>
      </div>
      <div
        class="graph-viewport fullscreen-graph-viewport"
        class:dragging={graphDragState?.graphName === fullscreenGraph.name}
        role="button"
        tabindex="0"
        aria-label={fullscreenGraph.name}
        on:pointerdown={(event) => startGraphDrag(fullscreenGraph, event)}
        on:pointermove={dragGraph}
        on:pointerup={endGraphDrag}
        on:pointercancel={endGraphDrag}
        on:wheel={(event) => zoomGraph(fullscreenGraph, event)}
        on:click={(event) => handleGraphClick(fullscreenGraph, event)}
        on:dblclick={(event) => handleGraphDoubleClick(fullscreenGraph, event)}
        on:keydown={(event) => handleGraphKeydown(fullscreenGraph, event)}
      >
        <div class="graph-svg-content" style={graphTransformStyle(fullscreenGraph.name, graphStates)}>
          {@html fullscreenGraph.content}
        </div>
      </div>
    </div>
  {/if}

  {#if fullscreenPlotOpen && plot.points.length > 0}
    <div class="plot-fullscreen" role="dialog" aria-modal="true" aria-label="Fullscreen Pareto PPA plot">
      <div class="fullscreen-toolbar">
        <h2>Pareto PPA</h2>
        <div class="plot-controls fullscreen-plot-controls">
          <label>
            <span>Rotate</span>
            <input type="range" min="-70" max="70" bind:value={yaw} />
          </label>
          <label>
            <span>Tilt</span>
            <input type="range" min="-10" max="65" bind:value={pitch} />
          </label>
          <label>
            <span>Zoom</span>
            <input type="range" min="0.65" max="2.4" step="0.05" bind:value={zoom} />
          </label>
          <button
            class="icon-button"
            type="button"
            title="Close fullscreen plot"
            aria-label="Close fullscreen plot"
            on:pointerdown={handleGraphControlPointer}
            on:click={(event) => {
              handleGraphControlClick(event);
              closeFullscreenPlot();
            }}
          >
            {@render icon("close")}
          </button>
        </div>
      </div>
      <div class="plot-stage fullscreen-plot-stage">
        <svg
          class="plot fullscreen-plot"
          class:dragging={Boolean(dragState)}
          viewBox={`0 0 ${projected.width} ${projected.height}`}
          role="img"
          aria-label="3D Pareto PPA plot"
          preserveAspectRatio="xMidYMid meet"
          on:pointerdown={startPlotDrag}
          on:pointermove={dragPlot}
          on:pointerup={endPlotDrag}
          on:pointercancel={endPlotDrag}
          on:wheel={zoomPlot}
        >
          <rect class="plot-hit-area" x="0" y="0" width={projected.width} height={projected.height} />
          {#each projected.axes as axis}
            <line class="plot-axis" x1={axis.x1} y1={axis.y1} x2={axis.x2} y2={axis.y2} />
            <text class="axis-label" x={axis.x2} y={axis.y2 - 8}>{axis.label}</text>
            {#each axis.ticks as tick}
              <circle class="axis-tick" cx={tick.x} cy={tick.y} r="2" />
              <text class="axis-tick-label" x={tick.x + 5} y={tick.y + 13}>{tick.label}</text>
            {/each}
          {/each}
          {#each projected.verificationPairs as pair (pair.projectId)}
            <line
              class="implementation-link"
              x1={pair.predicted.screenX}
              y1={pair.predicted.screenY}
              x2={pair.actual.screenX}
              y2={pair.actual.screenY}
            >
              <title>
                {pair.projectLabel} · Trial {pair.trial}
                Predicted to verified implementation PPA
              </title>
            </line>
          {/each}
          {#each projected.points as point (point.projectId)}
            <circle
              class:pareto-point={point.pareto}
              class:selected-plot-point={selectedPoint?.projectId === point.projectId}
              class="plot-point"
              cx={point.screenX}
              cy={point.screenY}
              r={selectedPoint?.projectId === point.projectId ? 7 : point.pareto ? 5.5 : 3.5}
              role="button"
              tabindex="0"
              aria-label={`${point.projectLabel}, trial ${point.trial}`}
              on:pointerdown={(event) => startPlotDrag(event)}
              on:click={(event) => selectPlotPoint(point, event)}
              on:dblclick={(event) => jumpToSelectedProject(point, event)}
              on:keydown={(event) => handlePointKeydown(point, event)}
            >
              <title>
                {point.projectLabel} · Trial {point.trial}
                {plot.axes.x}: {point.x}
                {plot.axes.y}: {point.y}
                {plot.axes.z}: {point.z}
              </title>
            </circle>
          {/each}
          {#each projected.verificationPairs as pair (pair.projectId)}
            <circle
              class:selected-plot-point={selectedPoint?.projectId === pair.projectId}
              class="implementation-plot-point"
              cx={pair.actual.screenX}
              cy={pair.actual.screenY}
              r={selectedPoint?.projectId === pair.projectId ? 6.5 : 5}
              role="button"
              tabindex="0"
              aria-label={`${pair.projectLabel}, trial ${pair.trial}, verified implementation PPA`}
              on:pointerdown={(event) => startPlotDrag(event)}
              on:click={(event) => selectImplementationPlotPoint(pair, event)}
              on:dblclick={(event) => jumpToImplementationPlotPoint(pair, event)}
              on:keydown={(event) => handleImplementationPointKeydown(pair, event)}
            >
              <title>
                {pair.projectLabel} · Trial {pair.trial} · Verified implementation
                {plot.axes.x}: {pair.actual.x}
                {plot.axes.y}: {pair.actual.y}
                {plot.axes.z}: {pair.actual.z}
              </title>
            </circle>
          {/each}
        </svg>
      </div>
    </div>
  {/if}

  <section class="logs-panel">
    <div class="section-heading">
      <h2>Run Files</h2>
    </div>
    {#if displayedFileGroups.length > 0}
      <div class="logs">
        {#each displayedFileGroups as group}
          <details
            class="project-group"
            data-project-id={group.projectId}
            open={group.projectId === "run-level" || selectedPoint?.projectId === group.projectId}
          >
            <summary>
              <span>{group.projectLabel}</span>
              <span class="group-meta">
                {group.trial !== undefined ? `Trial ${group.trial}` : "Run"} · {group.files.length} files
              </span>
            </summary>
            <div class="project-files">
              {#each group.files as log}
                <details class="file-detail" open={log.name === "hgbo-dse.log"}>
                  <summary>{log.name}</summary>
                  <pre>{log.content}</pre>
                </details>
              {/each}
            </div>
          </details>
        {/each}
      </div>
    {:else}
      <div class="empty-state">No readable run files found.</div>
    {/if}
  </section>
</main>

<style>
  .results-view {
    min-height: 100vh;
    padding: 16px;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    font-family: var(--vscode-font-family);
  }

  .run-toolbar {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  h1 {
    font-size: 1.35rem;
    font-weight: 650;
  }

  h2 {
    font-size: 1rem;
    font-weight: 650;
  }

  h3 {
    font-size: 0.88rem;
    font-weight: 650;
  }

  p {
    margin-top: 4px;
    color: var(--vscode-descriptionForeground);
  }

  .run-picker,
  .plot-controls label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: var(--vscode-descriptionForeground);
    font-size: 0.78rem;
  }

  select {
    min-width: min(440px, 72vw);
    padding: 7px 9px;
    color: var(--vscode-dropdown-foreground);
    background: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border);
    border-radius: 4px;
  }

  .visual-grid {
    display: grid;
    grid-template-columns: minmax(360px, 0.9fr) minmax(420px, 1.1fr);
    gap: 14px;
    margin-top: 14px;
  }

  .loading-panel {
    margin-top: 14px;
    padding: 14px;
    border: 1px solid var(--vscode-progressBar-background);
    border-radius: 6px;
    background: var(--vscode-sideBar-background);
  }

  .loading-copy {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 12px;
  }

  .loading-copy p {
    text-align: right;
  }

  .progress-track {
    position: relative;
    height: 6px;
    overflow: hidden;
    background: var(--vscode-input-background);
    border-radius: 999px;
  }

  .progress-bar {
    position: absolute;
    inset-block: 0;
    width: 42%;
    background: var(--vscode-progressBar-background);
    border-radius: inherit;
    animation: loading-progress 1.25s ease-in-out infinite;
  }

  @keyframes loading-progress {
    0% {
      transform: translateX(-110%);
    }
    55% {
      transform: translateX(90%);
    }
    100% {
      transform: translateX(245%);
    }
  }

  .plot-panel,
  .graphs-panel,
  .logs-panel {
    min-width: 0;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    background: var(--vscode-sideBar-background);
  }

  .plot-panel,
  .graphs-panel {
    min-height: 460px;
  }

  .plot-panel {
    display: flex;
    flex-direction: column;
    min-height: clamp(540px, 64vh, 780px);
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .plot-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .plot-controls .icon-button {
    align-self: end;
  }

  input[type="range"] {
    width: 120px;
  }

  .plot-stage {
    flex: 1;
    min-height: 440px;
    padding: 4px 6px 0;
  }

  .plot {
    display: block;
    width: 100%;
    height: 100%;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }

  .plot.dragging {
    cursor: grabbing;
  }

  .plot.dragging .plot-point {
    transition: none;
  }

  .plot-hit-area {
    width: 100%;
    height: 100%;
    fill: transparent;
    pointer-events: all;
  }

  .plot-axis {
    stroke: var(--vscode-descriptionForeground);
    stroke-width: 1.5;
  }

  .axis-tick {
    fill: var(--vscode-descriptionForeground);
    opacity: 0.74;
    pointer-events: none;
  }

  .axis-tick-label {
    fill: var(--vscode-descriptionForeground);
    font-size: 11px;
    opacity: 0.86;
    paint-order: stroke;
    stroke: var(--vscode-sideBar-background);
    stroke-width: 3px;
    pointer-events: none;
  }

  .implementation-link {
    stroke: var(--vscode-charts-purple);
    stroke-width: 2;
    stroke-dasharray: 5 4;
    stroke-linecap: round;
    opacity: 0.78;
    pointer-events: none;
  }

  .axis-label {
    fill: var(--vscode-descriptionForeground);
    font-size: 12px;
  }

  .plot-point {
    fill: var(--vscode-charts-blue);
    fill-opacity: 0.42;
    stroke: var(--vscode-editor-background);
    stroke-width: 1;
    cursor: pointer;
    outline: none;
    transition: fill-opacity 120ms ease, r 120ms ease, stroke-width 120ms ease;
  }

  .plot-point.pareto-point {
    fill: var(--vscode-charts-orange);
    fill-opacity: 0.94;
    stroke: var(--vscode-charts-yellow);
  }

  .implementation-plot-point {
    fill: var(--vscode-charts-purple);
    fill-opacity: 0.96;
    stroke: var(--vscode-editor-background);
    stroke-width: 1.5;
    cursor: pointer;
    outline: none;
    transition: fill-opacity 120ms ease, r 120ms ease, stroke-width 120ms ease;
  }

  .plot-point.selected-plot-point {
    fill-opacity: 1;
    stroke: var(--vscode-focusBorder);
    stroke-width: 2.5;
  }

  .implementation-plot-point.selected-plot-point {
    fill-opacity: 1;
    stroke: var(--vscode-focusBorder);
    stroke-width: 2.5;
  }

  .selected-study {
    display: grid;
    grid-template-columns: minmax(120px, max-content) minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    margin: 0 12px 12px;
    padding: 10px 12px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 5px;
    background: var(--vscode-editor-background);
  }

  .selected-study strong {
    display: block;
    margin-top: 2px;
    font-size: 0.95rem;
    overflow-wrap: anywhere;
  }

  .selected-label,
  .group-meta {
    color: var(--vscode-descriptionForeground);
    font-size: 0.76rem;
  }

  .selected-study dl {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(86px, 1fr));
    gap: 8px 14px;
    min-width: 0;
    margin: 0;
  }

  .selected-study dl > div {
    min-width: 0;
  }

  .selected-study dt {
    color: var(--vscode-descriptionForeground);
    font-size: 0.72rem;
  }

  .selected-study dd {
    margin: 2px 0 0;
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
  }

  .selected-study button {
    padding: 6px 10px;
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }

  .impl-verify-panel {
    margin: 0 12px 12px;
    padding: 10px 12px 12px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 5px;
    background: var(--vscode-editor-background);
  }

  .impl-verify-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }

  .impl-verify-heading p {
    margin-top: 3px;
    font-size: 0.78rem;
  }

  .impl-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
  }

  .impl-actions button,
  .link-button {
    color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
    background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 4px;
    cursor: pointer;
  }

  .impl-actions button {
    min-height: 26px;
    padding: 4px 8px;
    font-size: 0.78rem;
  }

  .impl-actions .primary-action {
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
  }

  .impl-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }

  .table-scroll {
    max-width: 100%;
    overflow: auto;
  }

  .study-table,
  .accuracy-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.78rem;
  }

  .study-table th,
  .study-table td,
  .accuracy-table th,
  .accuracy-table td {
    padding: 6px 8px;
    border-top: 1px solid var(--vscode-panel-border);
    text-align: left;
    vertical-align: middle;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .study-table th,
  .accuracy-table th {
    color: var(--vscode-descriptionForeground);
    font-weight: 600;
  }

  .study-table tbody tr,
  .accuracy-table tbody tr {
    cursor: pointer;
  }

  .study-table tbody tr:hover,
  .accuracy-table tbody tr:hover,
  .study-table tbody tr.selected-row {
    background: var(--vscode-list-hoverBackground);
  }

  .study-table input[type="checkbox"] {
    width: 14px;
    height: 14px;
    margin: 0;
  }

  .link-button {
    padding: 2px 5px;
    font: inherit;
  }

  .trial-meta {
    display: block;
    margin-top: 2px;
    color: var(--vscode-descriptionForeground);
    font-size: 0.72rem;
  }

  .verification-results {
    margin-top: 12px;
  }

  .verification-results h3 {
    margin-bottom: 8px;
  }

  .graphs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
    padding: 12px;
  }

  .graph-card {
    margin: 0;
    overflow: hidden;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    background: var(--vscode-editor-background);
  }

  .graph-card figcaption {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--vscode-panel-border);
    color: var(--vscode-descriptionForeground);
    font-size: 0.82rem;
  }

  .graph-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: flex-end;
  }

  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    min-width: 24px;
    padding: 0;
    color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
    background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 4px;
    cursor: pointer;
  }

  .icon-button:hover {
    background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground));
  }

  .icon-button:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: 2px;
  }

  .button-icon {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    pointer-events: none;
  }

  .graph-viewport {
    position: relative;
    width: 100%;
    min-height: 280px;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    background: #ffffff;
  }

  .graph-viewport.dragging {
    cursor: grabbing;
  }

  .graph-svg-content {
    width: 100%;
    height: 100%;
    transform-origin: center center;
  }

  .graph-svg-content :global(svg) {
    display: block;
    width: 100%;
    height: auto;
    min-height: 280px;
    user-select: none;
  }

  .graph-svg-content :global(.scatterlayer .points .point),
  .graph-svg-content :global(.barlayer .point) {
    cursor: pointer;
  }

  .graph-svg-content :global(path.interactive-graph-selected),
  .graph-svg-content :global(.interactive-graph-selected path) {
    stroke: var(--vscode-focusBorder) !important;
    stroke-width: 3px !important;
    filter: drop-shadow(0 0 3px var(--vscode-focusBorder));
  }

  .selected-graph-item {
    display: grid;
    grid-template-columns: minmax(130px, max-content) minmax(0, 1fr);
    gap: 12px;
    margin: 0 12px 12px;
    padding: 10px 12px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 5px;
    background: var(--vscode-editor-background);
  }

  .selected-graph-item strong,
  .selected-graph-item dd {
    overflow-wrap: anywhere;
  }

  .selected-graph-item dl {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
    gap: 8px 14px;
    min-width: 0;
    margin: 0;
  }

  .selected-graph-item dt {
    color: var(--vscode-descriptionForeground);
    font-size: 0.72rem;
  }

  .selected-graph-item dd {
    margin: 2px 0 0;
  }

  .graph-fullscreen,
  .plot-fullscreen {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    padding: 14px;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
  }

  .fullscreen-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .fullscreen-plot-controls {
    align-items: end;
  }

  .fullscreen-plot-stage {
    flex: 1;
    min-height: 0;
    padding: 12px 0 0;
  }

  .fullscreen-plot {
    height: 100%;
  }

  .fullscreen-graph-viewport {
    flex: 1;
    min-height: 0;
    margin-top: 12px;
  }

  .fullscreen-graph-viewport .graph-svg-content :global(svg) {
    height: 100%;
  }

  .logs-panel {
    margin-top: 14px;
  }

  .logs {
    max-height: 38vh;
    overflow: auto;
    padding: 10px 12px 14px;
  }

  details {
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  summary {
    cursor: pointer;
    padding: 9px 0;
    font-weight: 600;
  }

  .project-group {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 5px;
    margin-bottom: 10px;
    background: var(--vscode-editor-background);
  }

  .project-group:last-child {
    margin-bottom: 0;
  }

  .project-group > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
  }

  .project-files {
    padding: 0 12px 10px;
    border-top: 1px solid var(--vscode-panel-border);
  }

  .file-detail:last-child {
    border-bottom: 0;
  }

  :global(.project-group-highlight) {
    animation: project-highlight 1.2s ease-out;
  }

  @keyframes project-highlight {
    0% {
      border-color: var(--vscode-focusBorder);
      box-shadow: 0 0 0 1px var(--vscode-focusBorder);
    }
    100% {
      border-color: var(--vscode-panel-border);
      box-shadow: none;
    }
  }

  pre {
    margin: 0 0 12px;
    padding: 10px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    border-radius: 4px;
    font-family: var(--vscode-editor-font-family);
    font-size: 0.82rem;
    line-height: 1.35;
  }

  .empty-state {
    padding: 24px 14px;
    color: var(--vscode-descriptionForeground);
  }

  @media (max-width: 900px) {
    .run-toolbar,
    .section-heading {
      align-items: stretch;
      flex-direction: column;
    }

    .visual-grid {
      grid-template-columns: 1fr;
    }

    .selected-study {
      align-items: stretch;
      grid-template-columns: 1fr;
    }

    .selected-study dl {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    select {
      min-width: 0;
      width: 100%;
    }
  }
</style>
