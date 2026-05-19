# TDM Analysis and Config Workflow

Compass analyzes open C files with tree-sitter and uses the analysis to drive CodeLens controls, hover hints, `config.yaml`, and `params.yaml` generation.

## Analysis Lifecycle

- Compass keeps a shared analysis snapshot per document version.
- CodeLens, hover hints, decorations, and auto-discovery reuse that snapshot instead of walking the AST independently.
- Text edits update the cached tree incrementally, then schedule CodeLens and decoration refreshes.
- The **Compass: Refresh AST** command invalidates the cached tree and analysis snapshot for the active C document, then recomputes discovery from a fresh parse.

This keeps editor actions responsive because a CodeLens click updates selection state and config data instead of recomputing the whole AST path every time.

## Top Function Selection

`config.yaml` uses `top` to define the active top-level function. When `top` is empty, Compass ranks candidate functions from the current C source and chooses the best top-function candidate for auto-discovery.

The ranking favors functions that look like HLS kernels:

- More interface parameters.
- More discovered loops.
- Earlier source order as a stable tie breaker.

Once `top` is set, Compass only shows and writes generated selections that belong to that top function. This prevents helper functions or test wrappers from polluting `interList`, `loopList`, or `dictOp`.

## CodeLens Names

The editor UI uses human-readable names. The underlying YAML schema remains unchanged for HGBO-DSE compatibility.

| UI label | YAML target | Purpose |
| --- | --- | --- |
| **Function in config.yaml** | `top` / `funcList` | Marks the selected function in the generated config. |
| **Params** | `interList` | Selects interface parameters for the active function. |
| **Directives** | `loopList` | Selects loop directives such as `level`, `unroll`, `pipeline`, and `flatten`. |
| **Loop Ops** | `dictOp.int` | Selects integer arithmetic loop operation variables. |

The CodeLens label is intentionally short. Pickers and hover text use fuller names such as "interface parameters" and "loop operations".

## Grouped Pickers

Compass groups repeated controls so the C editor stays readable:

- **Params** opens one multi-select picker for all parameters on a function.
- **Directives** opens one multi-select picker for directives on a loop.
- **Loop Ops** groups all detected arithmetic operation variables for the same loop into one multi-select picker.

Grouped pickers replace only the candidates they display. Existing unrelated entries in `config.yaml` are preserved.

## Loop Operation Hints

Loop operation hints are detected from arithmetic updates inside loops. Hovering a detected identifier shows a **Compass loop operation hint** and an **Add to Loop Ops** action.

When multiple operation variables are detected in the same loop, the CodeLens shows a selected count:

```text
Loop Ops  [kernel/loop_i] (1/3)
```

Selecting the CodeLens opens a picker for the loop's available operation variables.

## Project Reset

The sidebar **Reset Project** action removes generated Compass artifacts while keeping the original source code and bundled base code intact.

It clears generated items such as:

- `config.yaml`
- `params.yaml`
- generated project files
- generated logs
- `.compass` packages, run metadata, and run artifacts

Use reset when a project has stale generated files or when you want to regenerate YAML and DSE artifacts from a clean generated state.

## Result Loading

Result views load run metadata first and defer larger artifacts until the selected run or file needs them. This keeps opening the results panel responsive even when `.compass/runs` contains many generated files.
