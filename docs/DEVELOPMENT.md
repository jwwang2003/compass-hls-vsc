# Development Workflow

This document covers the local extension development loop. For user-facing Compass behavior, see [TDM Analysis and Config Workflow](TDM_ANALYSIS_AND_CONFIG.md).

## Watch Mode

Start the development watchers from the repository root:

```bash
pnpm run watch
```

This runs two watchers:

- Rollup watches `webviews/` and rebuilds webview bundles into `out/compiled`.
- Webpack watches `src/extension.ts` and extension-side TypeScript, then rebuilds `dist/extension.js`.

Then launch the extension from VS Code with **Run Extension**.

## Webview HMR

In VS Code Extension Development mode, Compass watches rebuilt Rollup assets:

```text
out/compiled/*.{js,css}
```

When Rollup emits changed assets, Compass sends a hot update message to active webviews.

- CSS changes are swapped in place by updating the active stylesheet URI with a cache-busting version.
- JavaScript changes load the rebuilt webview bundle and remount the Svelte app.
- Before remounting, the entrypoint unmounts the previous Svelte app to avoid duplicate listeners and duplicate DOM.
- If a webview target does not support hot updates, Compass falls back to a full webview reload.

This is HMR-style behavior adapted for VS Code webviews and Rollup IIFE bundles. It is not Vite-style ESM component HMR.

## Extension Host Reloads

Extension backend changes are rebuilt by Webpack watch, but activation-level changes can still require reloading the Extension Development Host. Use VS Code's **Developer: Reload Window** command in the development host if command registrations, activation code, or provider construction changes do not appear immediately.

## Test Commands

Use these commands before committing:

```bash
pnpm run compile-tests
pnpm run lint
pnpm run test
```

`pnpm run test` runs the full pretest chain:

1. TypeScript test compilation.
2. Webview and extension builds.
3. ESLint.
4. The compiled Node test suite.

## Generated Outputs

Common generated outputs are:

- `dist/extension.js`
- `out/compiled/*.js`
- `out/compiled/*.css`
- `out/test/**/*.js`
- `.compass/` workspace artifacts during manual extension testing

Do not edit generated bundles by hand. Change the TypeScript/Svelte source and let the watchers rebuild.
