# Compass VS Code Extension

Compass is a VS Code extension for C-source analysis, YAML generation, and Vitis HLS design-space exploration. It wraps the [HGBO-DSE](https://github.com/hzkuang/HGBO-DSE/tree/main) framework, which combines HGP, BOME, and TDM for fast multi-objective optimization of HLS designs.

The extension is intended to streamline a machine-learning-assisted Vitis HLS workflow. It can inspect `.c` files, help generate `config.yaml` and `params.yaml`, package a workspace into `.compass`, run HGBO-DSE, and show generated run artifacts and plots inside VS Code.

## About Compass

![](readme_assets/imgs/compass_workflow.png)

## Features

- **C language assistance**: tree-sitter based analysis for functions, loops, parameters, variables, hover hints, CodeLens actions, and config selection state.
- **Smart TDM CodeLens**: human-readable `Params`, `Directives`, and `Loop Ops` controls update `config.yaml` without exposing raw schema names in the main UI.
- **YAML generation**: generates HGBO-DSE-compatible `config.yaml` and `params.yaml` from the active `.c` file or the first `.c` file in the workspace.
- **Compass workspace flow**: initializes `.compass`, packages source and YAML inputs, and stores run artifacts under `.compass/runs`.
- **Project reset**: removes generated Compass YAML files, project metadata, logs, packages, and run artifacts while leaving the original source tree intact.
- **Inference + DSE execution**: launches the bundled `3rdParty/HGBO-DSE` Python flow with configurable DSE options.
- **Results UI**: opens previous runs, logs, generated files, DSE plots, Pareto study data, and implementation verification output.
- **Local and remote modes**: local mode is Linux-first and expects Vitis/Vivado 2022.1; remote HGP model inference is supported by a Dockerized MCP service.
- **Vivado execution target**: choose local terminal execution or a Vivado MCP target with host and port settings in the DSE UI.

## Technology Stack

- **Extension**: TypeScript, VS Code Extension API, Webpack
- **Webviews**: Svelte, Tailwind CSS, Rollup
- **C analysis**: `web-tree-sitter`, `tree-sitter`, `tree-sitter-c`
- **DSE backend**: Python, HGBO-DSE, PyTorch, Optuna
- **Remote inference**: MCP over HTTP, Docker Compose

## Prerequisites

- VS Code `1.99.0` or newer.
- Node.js with Corepack available. The checked-in package manager is `pnpm@10.33.2`.
- Git submodule support for `3rdParty/HGBO-DSE`.
- Linux plus Vitis/Vivado `2022.1` for local HGBO-DSE execution.
- Python `>=3.9,<3.10` for the HGBO-DSE environment.
- `uv` for the Python backend environment.
- Docker and Docker Compose if you want the MCP remote inference service.

## Set Up

Clone the repo with its HGBO-DSE submodule:

```bash
git clone --recursive <repo-url>
cd compass
```

If you cloned without `--recursive`, initialize the submodule afterwards:

```bash
git submodule update --init --recursive
```

Install the extension and webview dependencies:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Build the extension once:

```bash
pnpm run compile
```

The compile step writes the extension bundle to `dist/` and the webview bundles to `out/compiled/`.

## Backend Set Up

Compass can generate YAML and package workspaces without a Python environment, but running local Inference + DSE needs the bundled HGBO-DSE dependencies.

```bash
cd 3rdParty/HGBO-DSE
uv venv --python 3.9
uv sync
```

The local runner prefers `3rdParty/HGBO-DSE/.venv/bin/python` when that file exists, then falls back to `python3.9`. Keep the bundled `3rdParty/HGBO-DSE/hgp/model/*_checkpoint_*.pt` files in place; they are the original HGBO-DSE model weights used by the HGP inference flow.

Verify the main Python dependencies:

```bash
uv run python -c "import optuna, torch, torch_geometric, torch_scatter, torch_sparse; print('HGBO deps OK')"
```

If you use a different Python 3.9 environment, point VS Code at it with the `compass.hgboPythonPath` setting. For example:

```json
{
  "compass.hgboPythonPath": "/absolute/path/to/compass/3rdParty/HGBO-DSE/.venv/bin/python"
}
```

For local Vitis/Vivado support, Compass auto-discovers Linux installations under common Xilinx paths. If multiple scripts are found, set:

```json
{
  "compass.vivadoSettings64Path": "/path/to/Xilinx/Vitis/2022.1/settings64.sh"
}
```

## Run The Extension

Use the VS Code launch configuration:

1. Open this repository in VS Code.
2. Run `pnpm run watch`, or let the launch task start it for you.
3. Press `F5` and choose **Run Extension (mock0)**. This is the default debug launch and opens the `mock0` sample workspace in the Extension Development Host.
4. Use **Run Extension (mock1)** when you want the `edge_detect` sample instead, or open any workspace that contains a `.c` file.
5. Open the Compass activity-bar view.

Typical Compass flow:

1. Click **Init Compass** to create `.compass`.
2. Open or select a `.c` source file.
3. Use the CodeLens controls in C files to review the selected function, interface parameters, loop directives, and loop operation variables.
4. Click **Generate** in the **Generate YAMLs** step to create `config.yaml` and `params.yaml`.
5. Review DSE settings such as mode, algorithm, case, version, iteration count, clock, and inference mode.
6. Click **Package** in the **Package .compass** step to package inputs.
7. Click **Run** in the **Run Inference + DSE** step.
8. Click **Show** in the **Results** step to inspect logs, plots, artifacts, and implementation verification data.
9. Use **Reset Project** when you want to clear generated YAML/project/log artifacts and start again from the original source.

The C editor UI uses human-readable labels:

- **Params** writes the selected function parameters to `interList`.
- **Directives** writes loop directives to `loopList`.
- **Loop Ops** writes arithmetic loop operation variables to `dictOp.int`.

See [TDM Analysis and Config Workflow](docs/TDM_ANALYSIS_AND_CONFIG.md) for the CodeLens, AST caching, top-function detection, and reset behavior.

## Development Commands

```bash
pnpm run compile          # build webviews and extension
pnpm run compile:webviews # build Svelte webviews into out/compiled
pnpm run compile:extension # bundle src/extension.ts into dist/extension.js
pnpm run watch            # watch webviews and extension during VS Code debugging
pnpm run package          # production extension bundle
pnpm run lint             # lint TypeScript sources
pnpm run compile-tests    # compile TypeScript tests to out/
pnpm test                 # run VS Code extension tests
```

In Extension Development mode, `pnpm run watch` enables webview HMR-style updates for rebuilt Rollup assets: CSS is swapped in place and rebuilt webview scripts remount the active Svelte app without replacing the whole webview document. See [Development Workflow](docs/DEVELOPMENT.md).

## Vivado Execution Target

The DSE UI has a separate **Vivado Target** selector:

- **Local Terminal** keeps the existing behavior and runs Vitis/Vivado through the host terminal environment.
- **MCP** records a Vivado MCP host and port for local or remote MCP-backed execution.

The referenced `jwwang2003/vivado-mcp` repository is an MCP server for queued Vivado and Vitis Tcl jobs. Its current implementation exposes tools such as `vivado_submit_job`, `vivado_job_status`, `vivado_job_logs`, `vivado_cancel_job`, `vivado_artifacts`, and `vivado_versions`; Vivado itself stays installed on the host and is bind-mounted into the MCP container.

Compass's host/port fields target a JSON-RPC MCP endpoint at `http://<host>:<port>/mcp`. If your Vivado MCP deployment uses stdio transport directly, run it behind an MCP HTTP bridge or equivalent remote transport before selecting **MCP** in Compass.

Compass now carries the selected target into the HGBO-DSE child-process environment as:

```text
HGBO_VIVADO_EXECUTION_MODE=mcp
HGBO_VIVADO_MCP_HOST=<host>
HGBO_VIVADO_MCP_PORT=<port>
```

When **Local Terminal** is selected, these variables are omitted so HGBO-DSE uses the direct local terminal flow.

## Remote Inference Services

Remote mode uses a Dockerized MCP server for HGP model inference. Vitis HLS still runs on the host; only the generated `prj_*/graph` files are sent to the container, so the container does not need a host `.compass` mount or a Vitis installation.

Start the Docker service from `3rdParty/HGBO-DSE`:

```bash
cd 3rdParty/HGBO-DSE
docker compose up --build mcp-inference
```

For normal use, run it detached:

```bash
cd 3rdParty/HGBO-DSE
docker compose up --build -d mcp-inference
docker compose ps
docker compose logs -f mcp-inference
```

The service listens on host port `8000` and exposes the MCP endpoint at:

```text
http://localhost:8000/mcp
```

A plain unauthenticated probe should return `401 Unauthorized`, which confirms the server is reachable and enforcing auth:

```bash
curl -i http://localhost:8000/mcp
```

Retrieve the persistent API key generated inside the named Docker volume:

```bash
cd 3rdParty/HGBO-DSE
docker compose exec mcp-inference uv run python -m backend.mcp_server --show-api-key
```

The key is stored under the `hgbo_mcp_data` Docker volume and survives container restarts. Removing the volume with `docker compose down -v` also removes the key.

To use remote inference from Compass:

1. Start `mcp-inference`.
2. Open the Compass sidebar in the Extension Development Host.
3. Set DSE inference mode to `remote`.
4. Use endpoint `http://localhost:8000/mcp`.
5. Save the API key from `--show-api-key`.
6. Click the remote connection test if available, then run **Inference + DSE**.

Compass stores the key in VS Code SecretStorage and passes it to HGBO-DSE only through the child-process environment. For direct CLI testing, set the same environment variables yourself:

```bash
cd 3rdParty/HGBO-DSE
HGBO_MCP_URL=http://localhost:8000/mcp \
HGBO_MCP_API_KEY=<key-from-show-api-key> \
uv run python -m backend.mcp_client --list-tools
```

Run host DSE with remote inference from the CLI like this:

```bash
cd 3rdParty/HGBO-DSE
HGBO_MCP_URL=http://localhost:8000/mcp \
HGBO_MCP_API_KEY=<key-from-show-api-key> \
HGBO_REMOTE_TIMEOUT_SEC=600 \
uv run python -m bome.hls_dse --mode hgp --inference-mode remote --case bfs --ver bulk --num 10 --isolated context1
```

Stop the service when finished:

```bash
cd 3rdParty/HGBO-DSE
docker compose down
```

## Project Layout

- `src/extension.ts`: VS Code activation, command registration, tree-sitter warmup, Vivado discovery, and sidebar wiring.
- `src/parser/`: C analysis, TDM discovery, config state, hover, CodeLens, and decorations.
- `src/services/`: YAML generation, HGBO-DSE packaging, runner, DSE option parsing, and result processing.
- `src/providers/`: Compass sidebar and results webview providers.
- `src/utilities/webviewHotReload.ts`: development-mode webview HMR wiring for Rollup output.
- `webviews/`: Svelte webview pages, components, styles, and browser-side modules.
- `resources/`: tree-sitter WASM grammar assets.
- `mock0/`: BFS sample workspace used by the default extension debug launch.
- `mock1/`: edge-detect sample workspace used by the alternate extension debug launch.
- `3rdParty/HGBO-DSE/`: Python DSE backend and model code.
- `.compass/`: generated per-workspace metadata, packages, runs, logs, and artifacts.

## Documentation

- [TDM Analysis and Config Workflow](docs/TDM_ANALYSIS_AND_CONFIG.md)
- [Development Workflow](docs/DEVELOPMENT.md)
- [Project Review and Merge Notes](docs/PROJECT_REVIEW.md)

## Extension Settings

- `compass.vivadoSettings64Path`: optional path to the Vitis/Vivado `settings64.sh` script. Use this when auto-discovery cannot safely choose one.
- `compass.hgboPythonPath`: Python executable used to launch `3rdParty/HGBO-DSE`. Defaults to the bundled Python 3.9 virtualenv when present, otherwise `python3.9`.
- `compass.remoteInferenceMcpEndpoint`: MCP endpoint for Dockerized remote HGBO-DSE inference. Defaults to `http://localhost:8000/mcp`.

## Known Issues

- Local mode currently targets Linux and Vitis/Vivado `2022.1`.
- HGBO-DSE requires Python `3.9`; newer Python versions are outside the bundled backend's declared range.
- Remote inference needs the Docker MCP service and the generated API key saved in Compass.

## Release Notes

### 0.0.1

Initial Compass extension release, still under active development.

## References

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples)
- [HGBO-DSE paper](https://ieeexplore.ieee.org/document/10416120)

## Author(s)

- Jimmy Wang (王俊崴) [@jwwang2003](https://github.com/jwwang2003)
