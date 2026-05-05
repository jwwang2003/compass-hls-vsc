export const DSE_MODE_OPTIONS = [
  { label: "hgp", value: "hgp" },
  { label: "impl", value: "impl" },
];

export const DSE_ALGORITHM_OPTIONS = [
  { label: "motpe_fl", value: "motpe_fl" },
  { label: "motpe_f", value: "motpe_f" },
  { label: "motpe_d", value: "motpe_d" },
  { label: "nsga", value: "nsga" },
  { label: "sa", value: "sa" },
  { label: "random", value: "random" },
];

export const DSE_ENCODING_OPTIONS = [
  { label: "float", value: "float" },
  { label: "discrete", value: "discrete" },
];

export const DSE_SPACE_OPTIONS = [
  { label: "tree", value: "tree" },
  { label: "homo", value: "homo" },
];

export const DSE_INFERENCE_OPTIONS = [
  { label: "host", value: "host" },
  { label: "remote", value: "remote" },
];

export type DseOptions = {
  mode: "hgp" | "impl";
  bench: string;
  caseName: string;
  ver: string;
  num: number;
  alg: "sa" | "motpe_d" | "motpe_f" | "motpe_fl" | "nsga" | "random";
  device: "xc7vx485tffg1761-2";
  clk: string;
  encode: "float" | "discrete";
  space: "homo" | "tree";
  parallel: boolean;
  process: number;
  inferenceMode: "host" | "remote";
};

export type DseStatus = {
  running: boolean;
  stage: string;
  progress: number;
  message: string;
  current?: number;
  total?: number;
  error?: string;
  logPath?: string;
};

export type DseLog = {
  stream: "stdout" | "stderr" | "system";
  text: string;
};

export function createDefaultDseOptions(): DseOptions {
  return {
    mode: "hgp",
    bench: "MachSuite",
    caseName: "bfs",
    ver: "bulk",
    num: 100,
    alg: "motpe_fl",
    device: "xc7vx485tffg1761-2",
    clk: "10",
    encode: "float",
    space: "tree",
    parallel: false,
    process: 1,
    inferenceMode: "host",
  };
}

export function createIdleDseStatus(): DseStatus {
  return {
    running: false,
    stage: "Idle",
    progress: 0,
    message: "No HGBO-DSE process running.",
  };
}
