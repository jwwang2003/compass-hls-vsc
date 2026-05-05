export const PARAM_YAML_METRIC_KEYS = [
  "POW",
  "CLK",
  "LATENCY",
  "LUT",
  "FF",
  "DSP",
  "BRAM",
  "URAM",
  "SRL",
] as const;

export type ParamYamlMetricKey = typeof PARAM_YAML_METRIC_KEYS[number];
export type ParamYamlMetricValues = Record<ParamYamlMetricKey, string>;

export const DEFAULT_PARAM_YAML_METRIC_VALUES: ParamYamlMetricValues = {
  POW: "0.249",
  CLK: "3.804",
  LATENCY: "1000",
  LUT: "434",
  FF: "634",
  DSP: "0",
  BRAM: "0",
  URAM: "0",
  SRL: "0",
};

export function createDefaultParamYamlMetricValues(): ParamYamlMetricValues {
  return { ...DEFAULT_PARAM_YAML_METRIC_VALUES };
}

export function buildParamYamlMetricPayload(values: ParamYamlMetricValues): ParamYamlMetricValues {
  return { ...values };
}
