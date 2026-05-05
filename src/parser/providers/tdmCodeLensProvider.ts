import * as vscode from "vscode";

import { TdmConfigService } from "../tdmConfigService";
import { discoverTdmCandidates } from "../tdmDiscovery";
import { discoverDictOpIntHintsFromRoot } from "../tdmDictOpHintCore";
import { buildTdmCodeLensItems } from "../tdmCodeLensModel";
import { getCachedTree } from "../webTreeSitter";
import { DebouncedAction } from "../../utilities/debounce";

interface CodeLensCacheEntry {
    version: number;
    lenses: vscode.CodeLens[];
}

export class TdmCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
    private readonly refreshAction = new DebouncedAction(() => this.onDidChangeEmitter.fire(), 150);
    private readonly recomputeActions = new Map<string, DebouncedAction>();
    private readonly lensCache = new Map<string, CodeLensCacheEntry>();
    private enabled = true;

    public readonly onDidChangeCodeLenses = this.onDidChangeEmitter.event;

    constructor(private readonly configService: TdmConfigService) { }

    public toggle(): boolean {
        this.enabled = !this.enabled;
        this.refresh();
        return this.enabled;
    }

    public refresh() {
        this.refreshAction.schedule();
    }

    public refreshNow() {
        this.refreshAction.cancel();
        this.onDidChangeEmitter.fire();
    }

    public dispose() {
        this.refreshAction.dispose();
        for (const action of this.recomputeActions.values()) {
            action.dispose();
        }
        this.onDidChangeEmitter.dispose();
    }

    public invalidate(uri?: vscode.Uri) {
        if (!uri) {
            this.lensCache.clear();
            for (const action of this.recomputeActions.values()) {
                action.dispose();
            }
            this.recomputeActions.clear();
            return;
        }

        const key = uri.toString();
        this.lensCache.delete(key);
        this.recomputeActions.get(key)?.dispose();
        this.recomputeActions.delete(key);
    }

    public async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        if (!this.enabled || document.languageId !== "c" || token.isCancellationRequested) {
            return [];
        }

        const key = document.uri.toString();
        const cached = this.lensCache.get(key);
        if (cached?.version === document.version) {
            return cached.lenses;
        }
        if (cached) {
            this.scheduleRecompute(document);
            return cached.lenses;
        }

        return this.computeAndCache(document, token);
    }

    private scheduleRecompute(document: vscode.TextDocument) {
        const key = document.uri.toString();
        this.recomputeActions.get(key)?.dispose();
        const action = new DebouncedAction(() => {
            this.recomputeActions.delete(key);
            void this.recompute(document);
        }, 100);
        this.recomputeActions.set(key, action);
        action.schedule();
    }

    private async recompute(document: vscode.TextDocument) {
        await this.computeAndCache(document);
        this.onDidChangeEmitter.fire();
    }

    private async computeAndCache(
        document: vscode.TextDocument,
        token?: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        const candidates = discoverTdmCandidates(document);
        const dictOpHints = discoverDictOpIntHints(document);
        const config = await this.configService.getSelectionSnapshot();
        if (token?.isCancellationRequested) {
            return [];
        }

        const lenses = buildTdmCodeLensItems(candidates, config, dictOpHints)
            .map(item => new vscode.CodeLens(item.range as vscode.Range, {
                title: item.title,
                command: item.command,
                arguments: item.arguments,
            }));
        this.lensCache.set(document.uri.toString(), {
            version: document.version,
            lenses,
        });
        return lenses;
    }
}

function discoverDictOpIntHints(document: vscode.TextDocument) {
    const tree = getCachedTree(document);
    if (!tree) {
        return [];
    }

    return discoverDictOpIntHintsFromRoot(tree.rootNode)
        .map(hint => ({
            ...hint,
            range: new vscode.Range(
                new vscode.Position(hint.range.start.row, hint.range.start.column),
                new vscode.Position(hint.range.end.row, hint.range.end.column)
            ),
        }));
}
