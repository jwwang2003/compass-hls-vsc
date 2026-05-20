# Project Review and Merge Notes

## Source Projects

- `compass-add-fileDir`: adds a folder picker before generating `config.yaml` and `param.yaml`.
- `compass-add-yaml-0323-main`: writes YAML files to the workspace root and includes the original `mock0/Archive.zip` sample config and inference artifacts.

The projects are otherwise identical at source level. Their generated `dist` bundles differ only because `src/providers/CompassSidebar.ts` differs.

## Merged Root Project

The root project combines both useful changes:

- YAML generation now asks for an output folder, defaulting to the workspace root.
- YAML generation runs in-process through the bundled TypeScript modules instead of shelling out to `npx ts-node src/analysis/launch.ts`.
- Generated `config.yaml` and `param.yaml` are posted back to the Compass sidebar for preview.
- `mock0/Archive.zip` has been extracted into generated sample artifacts, so the download-artifacts workflow has real sample files to copy.
- The contributed `TDM Config` view is now registered and points at the existing `ProjectSettings` webview.
- Build scripts now compile both Svelte webviews and the extension bundle.
- Packaging ignores the local `mock0` and `mock1` sample workspaces while keeping the runtime `dist`, `out/compiled`, media, resources, and HGBO-DSE model artifacts.

## Original Folders

The two original project imports remain in place for reference and were not modified.
