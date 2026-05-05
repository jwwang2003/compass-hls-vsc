import assert from "node:assert/strict";
import test from "node:test";

import { versionedWebviewUri } from "../utilities/webviewCacheBust";

test("versionedWebviewUri leaves initial resource URIs unchanged", () => {
    assert.equal(
        versionedWebviewUri({ toString: () => "vscode-webview-resource:/out/compiled/MainSidebar.js" } as any, 0),
        "vscode-webview-resource:/out/compiled/MainSidebar.js"
    );
});

test("versionedWebviewUri appends reload version query parameters", () => {
    assert.equal(
        versionedWebviewUri({ toString: () => "vscode-webview-resource:/out/compiled/MainSidebar.js" } as any, 12),
        "vscode-webview-resource:/out/compiled/MainSidebar.js?v=12"
    );
    assert.equal(
        versionedWebviewUri({ toString: () => "vscode-webview-resource:/out/compiled/MainSidebar.js?root=1" } as any, 12),
        "vscode-webview-resource:/out/compiled/MainSidebar.js?root=1&v=12"
    );
});
