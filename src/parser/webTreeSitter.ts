import * as vscode from "vscode";
import { Edit, Language, Parser, Point, Tree } from "web-tree-sitter";

let parser: Parser | undefined;

interface CachedTree {
    version: number;
    tree: Tree;
    text: string;
}

const treeCache = new Map<string, CachedTree>();

export async function initializeWebTreeSitter(context: vscode.ExtensionContext) {
    if (parser) {
        return;
    }

    await Parser.init({
        locateFile: (fileName: string) => vscode.Uri.joinPath(context.extensionUri, "dist", fileName).fsPath,
    });
    const cLanguage = await Language.load(
        vscode.Uri.joinPath(context.extensionUri, "resources", "tree-sitter-c.wasm").fsPath
    );

    parser = new Parser();
    parser.setLanguage(cLanguage);
}

export function getCachedTree(document: vscode.TextDocument): Tree | undefined {
    if (!parser) {
        return undefined;
    }

    const key = document.uri.toString();
    const cached = treeCache.get(key);
    if (cached?.version === document.version) {
        return cached.tree;
    }

    const tree = parser.parse(document.getText());
    if (!tree) {
        return undefined;
    }

    treeCache.set(key, { version: document.version, tree, text: document.getText() });
    return tree;
}

export function updateCachedTree(
    document: vscode.TextDocument,
    contentChanges: readonly vscode.TextDocumentContentChangeEvent[]
): boolean {
    if (!parser || document.languageId !== "c") {
        return false;
    }

    const key = document.uri.toString();
    const cached = treeCache.get(key);
    if (!cached) {
        return false;
    }

    if (contentChanges.length !== 1) {
        invalidateCachedTree(document.uri);
        return false;
    }

    const change = contentChanges[0];
    const oldText = cached.text;
    const oldEndOffset = change.rangeOffset + change.rangeLength;
    if (oldEndOffset > oldText.length) {
        invalidateCachedTree(document.uri);
        return false;
    }

    const edit = createTreeEdit(oldText, change);
    cached.tree.edit(edit);

    const newText = document.getText();
    const updatedTree = parser.parse(newText, cached.tree);
    cached.tree.delete();

    if (!updatedTree) {
        invalidateCachedTree(document.uri);
        return false;
    }

    treeCache.set(key, {
        version: document.version,
        tree: updatedTree,
        text: newText,
    });
    return true;
}

export function invalidateCachedTree(uri: vscode.Uri) {
    const key = uri.toString();
    const cached = treeCache.get(key);
    cached?.tree.delete();
    treeCache.delete(key);
}

export function clearAstCache() {
    for (const cached of treeCache.values()) {
        cached.tree.delete();
    }
    treeCache.clear();
}

function createTreeEdit(oldText: string, change: vscode.TextDocumentContentChangeEvent): Edit {
    const startIndex = Buffer.byteLength(oldText.slice(0, change.rangeOffset), "utf8");
    const oldEndIndex = Buffer.byteLength(oldText.slice(0, change.rangeOffset + change.rangeLength), "utf8");
    const newEndIndex = startIndex + Buffer.byteLength(change.text, "utf8");
    const startPosition = pointForOffset(oldText, change.rangeOffset, change.range.start);

    return new Edit({
        startIndex,
        oldEndIndex,
        newEndIndex,
        startPosition,
        oldEndPosition: pointForOffset(oldText, change.rangeOffset + change.rangeLength, change.range.end),
        newEndPosition: advancePoint(startPosition, change.text),
    });
}

function pointForOffset(text: string, offset: number, position?: vscode.Position): Point {
    const lineStart = text.lastIndexOf("\n", offset - 1) + 1;

    return {
        row: position?.line ?? countRows(text, offset),
        column: Buffer.byteLength(text.slice(lineStart, offset), "utf8"),
    };
}

function countRows(text: string, offset: number): number {
    let row = 0;
    for (let index = 0; index < offset; index++) {
        if (text.charCodeAt(index) === 10) {
            row += 1;
        }
    }
    return row;
}

function advancePoint(start: Point, text: string): Point {
    const lines = text.split("\n");
    if (lines.length === 1) {
        return {
            row: start.row,
            column: start.column + Buffer.byteLength(text, "utf8"),
        };
    }

    return {
        row: start.row + lines.length - 1,
        column: Buffer.byteLength(lines[lines.length - 1], "utf8"),
    };
}
