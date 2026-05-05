import * as vscode from "vscode";
import { Point } from "web-tree-sitter";

import { rangeFromNode } from "../tdmDiscovery";
import { TdmConfigService } from "../tdmConfigService";
import { isSelectedTopFunctionRef } from "../tdmConfigModel";
import { createDictOpIntHintFromIdentifier } from "../tdmDictOpHintCore";
import { buildDictOpIntHoverAction } from "../tdmHoverModel";
import { getCachedTree } from "../webTreeSitter";

export class TdmHoverProvider implements vscode.HoverProvider {
    constructor(private readonly configService: TdmConfigService) { }

    public async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        if (token.isCancellationRequested || document.languageId !== "c") {
            return undefined;
        }

        const tree = getCachedTree(document);
        if (!tree) {
            return undefined;
        }

        const node = tree.rootNode.descendantForPosition(positionToPoint(position), positionToPoint(position));
        if (!node || node.type !== "identifier") {
            return undefined;
        }

        const hint = createDictOpIntHintFromIdentifier(node);
        if (!hint) {
            return undefined;
        }

        const config = await this.configService.getSelectionSnapshot();
        if (token.isCancellationRequested || !isSelectedTopFunctionRef(config, hint.configKey)) {
            return undefined;
        }

        const action = buildDictOpIntHoverAction({
            loopRef: hint.loopRef,
            operation: hint.operation,
            variableName: hint.variableName,
        });

        const markdown = new vscode.MarkdownString(undefined, true);
        markdown.appendMarkdown(`**Compass dictOp hint**\n\n`);
        markdown.appendMarkdown(`Variable: \`${hint.variableName}\`\n\n`);
        markdown.appendMarkdown(`Target: \`dictOp.int\`\n\n`);
        markdown.appendMarkdown(`Loop: \`${hint.loopRef}\`\n\n`);
        markdown.appendMarkdown(`Operation: \`${action.operation}\`\n\n`);
        markdown.appendMarkdown(action.markdown);
        markdown.isTrusted = true;

        return new vscode.Hover(markdown, rangeFromNode(node));
    }
}

function positionToPoint(position: vscode.Position): Point {
    return { row: position.line, column: position.character };
}
