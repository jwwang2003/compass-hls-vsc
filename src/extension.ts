// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { TdmCodeLensProvider } from './parser/providers/tdmCodeLensProvider';
import { TdmDictOpDecorationProvider } from './parser/providers/tdmDictOpDecorationProvider';
import { TdmHoverProvider } from './parser/providers/tdmHoverProvider';
import { TdmConfigService } from './parser/tdmConfigService';
import {
	clearAstCache,
	initializeWebTreeSitter,
	invalidateCachedTree,
	updateCachedTree,
} from './parser/webTreeSitter';
import {
	getTdmAnalysisSnapshot,
	invalidateTdmAnalysis,
} from './parser/tdmAnalysis';
import {
	isLoopDirectiveSelected,
	isParamSelected,
	isVariableOperationSelected,
	LOOP_DIRECTIVES,
} from './parser/tdmConfigModel';
import { CompassSidebar } from './providers/CompassSidebar';
import { ResultPanel } from './providers/ResultPanel';

import { getVitisHLSInfo } from './utilities/checkVitis';
import { registerWebviewHotReload } from './utilities/webviewHotReload';
import {
	applyVivadoEnvironment,
	COMPATIBLE_VIVADO_VERSION,
	createVivadoCandidateFromSettings64Path,
	createVivadoDiscoveryStatus,
	discoverVivadoCandidates,
	getDetectedVivadoVersions,
	selectCompatibleVivado,
	sourceVivadoEnvironment,
	type VivadoCandidate,
	type VivadoDiscoveryStatus,
} from './utilities/vivadoDiscovery';

let activeTdmConfigService: TdmConfigService | undefined;

// The method called when the extension is activated
export async function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('compass.helloWorld', () => {
			// The code you place here will be executed every time your command is executed
			// Display a message box to the user
			vscode.window.showInformationMessage('Hello World from Compass extension!');
		})
	);

	// Basic state information
	let isLocalSupported = false;

	try {
		await initializeWebTreeSitter(context);
	} catch (error) {
		vscode.window.showErrorMessage(`Compass C parser failed to initialize: ${getErrorMessage(error)}`);
	}

	const tdmConfigService = new TdmConfigService(context);
	activeTdmConfigService = tdmConfigService;
	await tdmConfigService.initialize();

	const codeLensProvider = new TdmCodeLensProvider(tdmConfigService);
	const dictOpDecorationProvider = new TdmDictOpDecorationProvider(tdmConfigService);
	const cDocumentSelector: vscode.DocumentSelector = [
		{ scheme: "file", language: "c" },
		{ scheme: "untitled", language: "c" },
	];
	let compassSidebar: CompassSidebar;
	compassSidebar = new CompassSidebar(
		context.extensionUri,
		tdmConfigService,
		async (settings64Path: string) => {
			await setConfiguredVivadoSettings64Path(settings64Path);
			await updateLocalSupport(compassSidebar);
		},
		context.secrets
	);

	context.subscriptions.push(
		tdmConfigService,
		codeLensProvider,
		dictOpDecorationProvider,
		vscode.languages.registerCodeLensProvider(cDocumentSelector, codeLensProvider),
		vscode.languages.registerHoverProvider(cDocumentSelector, new TdmHoverProvider(tdmConfigService)),
		vscode.commands.registerCommand("tdm.toggleCodeLens", () => {
			const enabled = codeLensProvider.toggle();
			vscode.window.showInformationMessage(`Compass CodeLens ${enabled ? "enabled" : "disabled"}.`);
		}),
		vscode.commands.registerCommand("tdm.toggleAutoDiscover", async () => {
			const enabled = await tdmConfigService.toggleAutoDiscover();
			compassSidebar.postAutoDiscoverStatus();
			vscode.window.showInformationMessage(`Compass auto-discovery ${enabled ? "enabled" : "disabled"}.`);
		}),
		vscode.commands.registerCommand("tdm.refreshAst", async () => {
			const document = vscode.window.activeTextEditor?.document;
			if (!document || document.languageId !== "c") {
				vscode.window.showInformationMessage("Open a C file before refreshing the Compass AST.");
				return;
			}

			invalidateCachedTree(document.uri);
			invalidateTdmAnalysis(document.uri);
			getTdmAnalysisSnapshot(document);
			const changedConfig = await tdmConfigService.autoDiscoverDocument(document);
			if (changedConfig) {
				codeLensProvider.invalidate();
				codeLensProvider.refreshNow();
			}
			vscode.window.showInformationMessage("Compass AST refreshed.");
		}),
		vscode.commands.registerCommand("tdmOptimizer.noop", () => { }),
		vscode.commands.registerCommand("tdmOptimizer.toggleFunction", async (name: string) => {
			await tdmConfigService.toggleFunction(name);
			codeLensProvider.invalidate();
			codeLensProvider.refreshNow();
			dictOpDecorationProvider.refresh();
		}),
		vscode.commands.registerCommand("tdmOptimizer.toggleParam", async (ref: string) => {
			await tdmConfigService.toggleParam(ref);
			codeLensProvider.invalidate();
			codeLensProvider.refreshNow();
			dictOpDecorationProvider.refresh();
		}),
		vscode.commands.registerCommand(
			"tdmOptimizer.pickFunctionInterList",
			async (functionName: string, params: FunctionParamPickArg[]) => {
				await pickFunctionInterList(functionName, params, tdmConfigService, codeLensProvider);
			}
		),
		vscode.commands.registerCommand(
			"tdmOptimizer.toggleLoopDirective",
			async (group: string, directive: string, ref: string) => {
				await tdmConfigService.toggleLoopDirective(group, directive, ref);
				codeLensProvider.invalidate();
				codeLensProvider.refreshNow();
				dictOpDecorationProvider.refresh();
			}
		),
		vscode.commands.registerCommand(
			"tdmOptimizer.pickLoopDirectives",
			async (group: string, ref: string, label: string) => {
				await pickLoopDirectives(group, ref, label, tdmConfigService, codeLensProvider);
			}
		),
		vscode.commands.registerCommand(
			"tdmOptimizer.pickDictOpInt",
			async (loopRef: string, variables: DictOpPickArg[]) => {
				await pickDictOpInt(loopRef, variables, tdmConfigService, codeLensProvider, dictOpDecorationProvider);
			}
		),
		vscode.commands.registerCommand(
			"tdmOptimizer.addVariable",
			async (name: string, operation?: string, typeName?: string) => {
				await tdmConfigService.addVariable(name, operation, typeName);
				codeLensProvider.invalidate();
				codeLensProvider.refreshNow();
				dictOpDecorationProvider.refresh();
			}
		),
		vscode.commands.registerCommand(
			"tdmOptimizer.toggleVariable",
			async (name: string, operation?: string, typeName?: string) => {
				await tdmConfigService.toggleVariable(name, operation, typeName);
				codeLensProvider.invalidate();
				codeLensProvider.refreshNow();
				dictOpDecorationProvider.refresh();
			}
		)
	);

	const configWatcher = vscode.workspace.createFileSystemWatcher("**/config.yaml");
	context.subscriptions.push(
		configWatcher,
		configWatcher.onDidCreate(uri => {
			tdmConfigService.invalidateConfigCache(uri);
			codeLensProvider.invalidate();
			codeLensProvider.refresh();
			dictOpDecorationProvider.refresh();
		}),
		configWatcher.onDidChange(uri => {
			tdmConfigService.invalidateConfigCache(uri);
			codeLensProvider.invalidate();
			codeLensProvider.refresh();
			dictOpDecorationProvider.refresh();
		}),
		configWatcher.onDidDelete(uri => {
			tdmConfigService.invalidateConfigCache(uri);
			codeLensProvider.invalidate();
			codeLensProvider.refresh();
			dictOpDecorationProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(async document => {
			if (document.languageId !== "c") {
				return;
			}

			getTdmAnalysisSnapshot(document);
			const changedConfig = await tdmConfigService.autoDiscoverDocument(document);
			dictOpDecorationProvider.refresh();
			if (changedConfig) {
				codeLensProvider.invalidate();
				codeLensProvider.refresh();
			}
		}),
		vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.languageId !== "c") {
				return;
			}

			updateCachedTree(event.document, event.contentChanges);
			codeLensProvider.refresh();
			dictOpDecorationProvider.refresh();
		}),
		vscode.workspace.onDidSaveTextDocument(async document => {
			if (document.languageId !== "c") {
				return;
			}

			getTdmAnalysisSnapshot(document);
			const changedConfig = await tdmConfigService.autoDiscoverDocument(document);
			dictOpDecorationProvider.refresh();
			if (changedConfig) {
				codeLensProvider.invalidate();
				codeLensProvider.refresh();
			}
		}),
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor?.document.languageId === "c") {
				getTdmAnalysisSnapshot(editor.document);
			}
			dictOpDecorationProvider.refresh();
		})
	);

	const activeDocument = vscode.window.activeTextEditor?.document;
	if (activeDocument?.languageId === "c") {
		void warmActiveDocument(activeDocument, tdmConfigService, codeLensProvider, dictOpDecorationProvider);
	}

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"compass-sidebar",
			compassSidebar,
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	);

	registerWebviewHotReload(context, [
		compassSidebar,
		{ reloadWebview: () => ResultPanel.reloadCurrentWebview() },
	]);

	// ===========================================================================
	// ======================= Debugging tools & commands ========================
	// ===========================================================================

	// Debugging (refresh)
	context.subscriptions.push(
		vscode.commands.registerCommand("compass.debug-refresh", () => {
			// Closes & reopens the sidebar
			vscode.commands.executeCommand("workbench.action.closeSidebar");
			vscode.commands.executeCommand("workbench.action.toggleSidebarVisibility");

			// Open the debugging panel
			vscode.commands.executeCommand("workbench.action.toggleDevTools");
		})
	);

	compassSidebar.setLocalSupport(isLocalSupported);
	void updateLocalSupport(compassSidebar);
}

// The method called when the extension is deactivated
export async function deactivate() {
	await activeTdmConfigService?.flushPendingWrites();
	clearAstCache();
	invalidateTdmAnalysis();
	activeTdmConfigService = undefined;
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function warmActiveDocument(
	document: vscode.TextDocument,
	tdmConfigService: TdmConfigService,
	codeLensProvider: TdmCodeLensProvider,
	dictOpDecorationProvider: TdmDictOpDecorationProvider
) {
	getTdmAnalysisSnapshot(document);
	const changedConfig = await tdmConfigService.autoDiscoverDocument(document);
	dictOpDecorationProvider.refresh();
	if (changedConfig) {
		codeLensProvider.invalidate();
		codeLensProvider.refresh();
	}
}

interface DirectivePickItem extends vscode.QuickPickItem {
	directive: string;
}

interface FunctionParamPickArg {
	name: string;
	ref: string;
}

interface FunctionParamPickItem extends vscode.QuickPickItem {
	ref: string;
}

interface DictOpPickArg {
	configKey: string;
	operation: string;
	variableName: string;
}

interface DictOpPickItem extends vscode.QuickPickItem {
	configKey: string;
	operation: string;
}

async function pickFunctionInterList(
	functionName: string,
	params: FunctionParamPickArg[],
	tdmConfigService: TdmConfigService,
	codeLensProvider: TdmCodeLensProvider
) {
	const config = await tdmConfigService.getSelectionSnapshot();
	const items: FunctionParamPickItem[] = params.map(param => ({
		label: param.name,
		description: param.ref,
		picked: isParamSelected(config, param.ref),
		ref: param.ref,
	}));
	const selected = await vscode.window.showQuickPick(items, {
		canPickMany: true,
		placeHolder: "Select interface parameters for config.yaml",
		title: `Compass interface parameters: ${functionName}`,
	});

	if (!selected) {
		return;
	}

	await tdmConfigService.setParams(params.map(param => param.ref), selected.map(item => item.ref));
	codeLensProvider.invalidate();
	codeLensProvider.refreshNow();
}

async function pickLoopDirectives(
	group: string,
	ref: string,
	label: string,
	tdmConfigService: TdmConfigService,
	codeLensProvider: TdmCodeLensProvider
) {
	const config = await tdmConfigService.getSelectionSnapshot();
	const items: DirectivePickItem[] = LOOP_DIRECTIVES.map(directive => ({
		label: directive,
		picked: isLoopDirectiveSelected(config, group, directive, ref),
		directive,
	}));
	const selected = await vscode.window.showQuickPick(items, {
		canPickMany: true,
		placeHolder: "Select directives for this loop",
		title: `Compass directives: ${label}`,
	});

	if (!selected) {
		return;
	}

	await tdmConfigService.setLoopDirectives(group, ref, selected.map(item => item.directive));
	codeLensProvider.invalidate();
	codeLensProvider.refreshNow();
}

async function pickDictOpInt(
	loopRef: string,
	variables: DictOpPickArg[],
	tdmConfigService: TdmConfigService,
	codeLensProvider: TdmCodeLensProvider,
	dictOpDecorationProvider: TdmDictOpDecorationProvider
) {
	const config = await tdmConfigService.getSelectionSnapshot();
	const items: DictOpPickItem[] = variables.map(variable => ({
		label: `${variable.variableName} ${variable.operation}`,
		description: variable.configKey,
		picked: isVariableOperationSelected(config, variable.configKey, variable.operation, "int"),
		configKey: variable.configKey,
		operation: variable.operation,
	}));
	const selected = await vscode.window.showQuickPick(items, {
		canPickMany: true,
		placeHolder: "Select loop operation variables for config.yaml",
		title: `Compass loop operations: ${loopRef}`,
	});

	if (!selected) {
		return;
	}

	await tdmConfigService.setVariableOperations(
		variables.map(variable => ({
			configKey: variable.configKey,
			operation: variable.operation,
		})),
		selected.map(item => ({
			configKey: item.configKey,
			operation: item.operation,
		})),
		"int"
	);
	codeLensProvider.invalidate();
	codeLensProvider.refreshNow();
	dictOpDecorationProvider.refresh();
}

async function updateLocalSupport(compassSidebar: CompassSidebar) {
	if (process.platform !== "linux") {
		vscode.window.showWarningMessage("Compass local mode is disabled. Vivado auto-detection currently supports Linux only.");
		compassSidebar.setLocalSupport(false);
		return;
	}

	const candidates = await discoverVivadoCandidates();
	const configuredCandidate = getConfiguredVivadoCandidate();
	if (configuredCandidate === null) {
		compassSidebar.setLocalSupport(false, createVivadoDiscoveryStatus(candidates, undefined));
		return;
	}
	if (configuredCandidate) {
		const configuredCandidates = mergeVivadoCandidates(candidates, configuredCandidate);
		const vivadoDiscovery = createVivadoDiscoveryStatus(configuredCandidates, configuredCandidate);
		await initializeSelectedVivado(compassSidebar, configuredCandidate, vivadoDiscovery);
		return;
	}

	let selection;
	try {
		selection = await selectCompatibleVivado(candidates);
	} catch (e: unknown) {
		const vivadoDiscovery = createVivadoDiscoveryStatus(candidates, undefined);
		vscode.window.showWarningMessage(
			`Compass could not compare Vivado/Vitis settings64.sh scripts; local mode is disabled. (${getErrorMessage(e)})`
		);
		compassSidebar.setLocalSupport(false, vivadoDiscovery);
		return;
	}

	const selectedCandidate = selection.candidate;
	const vivadoDiscovery = selection.status;
	if (selection.signatureMismatch) {
		void showConfigurableVivadoWarning(
			`Multiple Vivado/Vitis ${selection.signatureMismatch.version} settings64.sh scripts were found with different signatures. Set compass.vivadoSettings64Path to the intended script; local mode is disabled.`
		);
		compassSidebar.setLocalSupport(false, vivadoDiscovery);
		return;
	}

	if (!selectedCandidate) {
		const detectedVersions = getDetectedVivadoVersions(candidates);
		if (detectedVersions.length > 0) {
			vscode.window.showWarningMessage(
				`Vivado/Vitis ${detectedVersions.join(", ")} detected, but Compass DSE inference requires ${COMPATIBLE_VIVADO_VERSION}; local mode is disabled.`
			);
		} else {
			vscode.window.showWarningMessage(
				`Vivado/Vitis ${COMPATIBLE_VIVADO_VERSION} was not found; local mode is disabled.`
			);
		}
		compassSidebar.setLocalSupport(false, vivadoDiscovery);
		return;
	}

	await initializeSelectedVivado(compassSidebar, selectedCandidate, vivadoDiscovery);
}

async function initializeSelectedVivado(
	compassSidebar: CompassSidebar,
	selectedCandidate: VivadoCandidate,
	vivadoDiscovery: VivadoDiscoveryStatus
) {
	try {
		const vivadoEnv = await sourceVivadoEnvironment(selectedCandidate);
		const verificationEnv: NodeJS.ProcessEnv = { ...process.env, ...vivadoEnv };
		const hlsInfo = await getVitisHLSInfo(verificationEnv);
		const expectedHlsVersion = `v${COMPATIBLE_VIVADO_VERSION}`;
		if (hlsInfo.version !== expectedHlsVersion) {
			vscode.window.showWarningMessage(
				`${selectedCandidate.settings64Path} initialized vitis_hls ${hlsInfo.version}, but Compass DSE inference requires ${expectedHlsVersion}; local mode is disabled.`
			);
			compassSidebar.setLocalSupport(false, vivadoDiscovery);
			return;
		}

		applyVivadoEnvironment(vivadoEnv);
		compassSidebar.setLocalSupport(true, vivadoDiscovery);
	} catch (e: unknown) {
		vscode.window.showWarningMessage(
			`Vivado/Vitis ${COMPATIBLE_VIVADO_VERSION} was found at ${selectedCandidate.installDir}, but Compass could not initialize ${selectedCandidate.settings64Path}; local mode is disabled. (${getErrorMessage(e)})`
		);
		compassSidebar.setLocalSupport(false, vivadoDiscovery);
	}
}

function getConfiguredVivadoCandidate(): VivadoCandidate | null | undefined {
	const configuredPath = vscode.workspace
		.getConfiguration("compass")
		.get<string>("vivadoSettings64Path", "")
		.trim();
	if (!configuredPath) {
		return undefined;
	}

	const candidate = createVivadoCandidateFromSettings64Path(configuredPath);
	if (!candidate) {
		void showConfigurableVivadoWarning(
			`Compass could not understand compass.vivadoSettings64Path (${configuredPath}). Set it to a settings64.sh script.`
		);
		return null;
	}

	if (candidate.version !== COMPATIBLE_VIVADO_VERSION) {
		void showConfigurableVivadoWarning(
			`compass.vivadoSettings64Path points to ${candidate.version}, but Compass DSE inference requires ${COMPATIBLE_VIVADO_VERSION}; local mode is disabled.`
		);
		return null;
	}

	return candidate;
}

function mergeVivadoCandidates(
	candidates: readonly VivadoCandidate[],
	configuredCandidate: VivadoCandidate
): VivadoCandidate[] {
	if (candidates.some(candidate => candidate.settings64Path === configuredCandidate.settings64Path)) {
		return [...candidates];
	}

	return [...candidates, configuredCandidate];
}

async function showConfigurableVivadoWarning(message: string) {
	const selection = await vscode.window.showWarningMessage(message, "Open Settings");
	if (selection === "Open Settings") {
		await vscode.commands.executeCommand(
			"workbench.action.openSettings",
			"compass.vivadoSettings64Path"
		);
	}
}

async function setConfiguredVivadoSettings64Path(settings64Path: string) {
	await vscode.workspace
		.getConfiguration("compass")
		.update("vivadoSettings64Path", settings64Path, vscode.ConfigurationTarget.Global);
	vscode.window.showInformationMessage(`Compass Vivado settings script set to ${settings64Path}`);
}
