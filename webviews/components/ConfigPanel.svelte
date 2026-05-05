<script lang="ts">
  import RadioSelector from '@/components/RadioSelector.svelte';
  import type { RadioOption } from '@/components/RadioSelector.svelte';

  /** Static config values */
  const bench = 'remote' as const;
  const device = 'xc7vx485tffg1761-2' as const;

  /** Algorithm options */
  let algOptions: RadioOption[] = [
    { label: 'sa',       value: 'sa'       },
    { label: 'motpe_d',  value: 'motpe_d'  },
    { label: 'motpe_fl', value: 'motpe_fl' },
    { label: 'nsga',     value: 'nsga'     },
    { label: 'random',   value: 'random'   },
    { label: 'other',    value: 'other'    },
  ];

  /** Encode & Space option types */
  type EncodeOption = 'float' | 'discrete';
  type SpaceOption  = 'tree'  | 'homo';

  /** Project configuration state interface */
  interface ProjectConfigState {
    mode: string;
    caseName: string;
    ver: string;
    num: number;
    alg: typeof algOptions[number]['value'];
    clk: string;
    encode: EncodeOption;
    space: SpaceOption;
    parallel: boolean;
    processNum: number;
  }

  // Form state variables with defaults
  let mode: ProjectConfigState['mode']       = '';
  let caseName: ProjectConfigState['caseName'] = '';
  let ver: ProjectConfigState['ver']         = "don't care";
  let num: ProjectConfigState['num']         = 1;
  let alg: ProjectConfigState['alg']         = algOptions[0].value;
  let clk: ProjectConfigState['clk']         = '';
  let encode: EncodeOption                    = 'float';
  let space: SpaceOption                     = 'tree';
  let parallel: boolean                       = false;
  let processNum: ProjectConfigState['processNum'] = 1;

  // File inputs
  let cFiles!: FileList;
  let configFile!: FileList;
  let paramFile!: FileList;

  async function handleSubmit() {
    const form = new FormData();
    if (cFiles)         Array.from(cFiles).forEach(f => form.append('files', f));
    if (configFile?.[0]) form.append('config.yaml', configFile[0]);
    if (paramFile?.[0])  form.append('params.yaml', paramFile[0]);

    form.append('mode',     mode);
    form.append('bench',    bench);
    form.append('case',     caseName);
    form.append('ver',      ver);
    form.append('num',      String(num));
    form.append('alg',      alg);
    form.append('device',   device);
    form.append('clk',      clk);
    form.append('encode',   encode);
    form.append('space',    space);
    form.append('parallel', String(parallel));
    form.append('process',  String(processNum));

    const res  = await fetch('/api/submit', { method: 'POST', body: form });
    const data = await res.json();
    console.log('Submit result:', data);
  }
</script>

<div class="panel-content">
  <h2>Project Configuration</h2>
  <form on:submit|preventDefault={handleSubmit} class="flex flex-col gap-4">
    <fieldset class="flex flex-col gap-2">
      <legend>Files</legend>
      <label>
        C Files:
        <input type="file" accept=".c" multiple bind:files={cFiles} />
      </label>
      <label>
        config.yaml:
        <input type="file" accept=".yaml" bind:files={configFile} />
      </label>
      <label>
        params.yaml:
        <input type="file" accept=".yaml" bind:files={paramFile} />
      </label>
    </fieldset>

    <label>
      Mode:
      <input type="text" bind:value={mode} placeholder="e.g. synth" class="w-full" />
    </label>

    <label>
      Bench:
      <input type="text" value={bench} disabled class="w-full bg-gray-100" />
    </label>

    <label>
      Case Name:
      <input type="text" bind:value={caseName} placeholder="Project case" class="w-full" />
    </label>

    <label>
      Version:
      <input type="text" bind:value={ver} placeholder="Project version or 'don't care'" class="w-full" />
    </label>

    <label>
      Number of Iterations:
      <input type="number" min="1" bind:value={num} class="w-24" />
    </label>

    <fieldset>
      <legend>Algorithm</legend>
      <RadioSelector bind:value={alg} bind:options={algOptions} orientation="horizontal" />
    </fieldset>

    <fieldset>
      <legend>Device</legend>
      <input type="text" value={device} disabled class="w-full bg-gray-100" />
    </fieldset>

    <label>
      Clock Constraint (clk):
      <input type="text" bind:value={clk} placeholder="e.g. 200MHz" class="w-full" />
    </label>

    <fieldset>
      <legend>Encode</legend>
      <label><input type="radio" bind:group={encode} value="float" /> float</label>
      <label><input type="radio" bind:group={encode} value="discrete" /> discrete</label>
    </fieldset>

    <fieldset>
      <legend>Space</legend>
      <label><input type="radio" bind:group={space} value="tree" /> tree</label>
      <label><input type="radio" bind:group={space} value="homo" /> homo</label>
    </fieldset>

    <fieldset>
      <legend>Optional Parameters</legend>
      <label><input type="checkbox" bind:checked={parallel} /> Parallel</label>
      <label>
        Process Number:
        <input type="number" min="1" bind:value={processNum} class="w-24" />
      </label>
    </fieldset>

    <vscode-button type="submit">Submit</vscode-button>
  </form>
</div>

<style>
  .panel-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0;
    margin: 0;
  }
</style>
