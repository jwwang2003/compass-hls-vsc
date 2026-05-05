import * as vscode from "vscode";

import { TdmConfigService } from "../tdmConfigService";
import { isSelectedTopFunctionRef } from "../tdmConfigModel";
import { discoverDictOpIntHintsFromRoot } from "../tdmDictOpHintCore";
import { getCachedTree } from "../webTreeSitter";
import { DebouncedAction } from "../../utilities/debounce";

export class TdmDictOpDecorationProvider implements vscode.Disposable {
    private readonly decorationType = vscode.window.createTextEditorDecorationType({
        textDecoration: "underline dotted",
        light: {
            textDecoration: "underline dotted #0969da",
            color: "#cf222e",
            fontWeight: "600",
        },
        dark: {
            textDecoration: "underline dotted #8aadf4",
            color: "#ffb454",
            fontWeight: "600",
        },
    });
    private readonly refreshAction = new DebouncedAction(() => this.refreshNow(), 120);

    constructor(private readonly configService: TdmConfigService) { }

    public refresh() {
        this.refreshAction.schedule();
    }

    public refreshNow() {
        this.refreshAction.cancel();
        for (const editor of vscode.window.visibleTextEditors) {
            void this.updateEditor(editor);
        }
    }

    public dispose() {
        this.refreshAction.dispose();
        this.decorationType.dispose();
    }

    private async updateEditor(editor: vscode.TextEditor) {
        if (editor.document.languageId !== "c") {
            editor.setDecorations(this.decorationType, []);
            return;
        }

        const documentVersion = editor.document.version;
        const tree = getCachedTree(editor.document);
        if (!tree) {
            editor.setDecorations(this.decorationType, []);
            return;
        }

        const config = await this.configService.getSelectionSnapshot();
        if (editor.document.version !== documentVersion) {
            return;
        }

        const ranges = discoverDictOpIntHintsFromRoot(tree.rootNode)
            .filter(hint => isSelectedTopFunctionRef(config, hint.configKey))
            .map(hint => new vscode.Range(
                new vscode.Position(hint.range.start.row, hint.range.start.column),
                new vscode.Position(hint.range.end.row, hint.range.end.column)
            ));

        editor.setDecorations(this.decorationType, ranges);
    }
}
