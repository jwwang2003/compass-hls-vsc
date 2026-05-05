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
export type ParamYamlMetricInput = number | string | null | undefined;
export type ParamYamlMetricInputs = Partial<Record<ParamYamlMetricKey, ParamYamlMetricInput>>;
export type ParamYamlValues = Record<ParamYamlMetricKey, number>;

export const DEFAULT_PARAM_YAML_VALUES: ParamYamlValues = {
    POW: 0.249,
    CLK: 3.804,
    LATENCY: 1000,
    LUT: 434,
    FF: 634,
    DSP: 0,
    BRAM: 0,
    URAM: 0,
    SRL: 0,
};

const PARAM_YAML_PREFIX = `inline:
  - '-on'
  - '-off'
balance:
  - '-on'
  - '-off'
style:
  - stp
  - flp
  - frp
factor:
  - 0
  - 2
state:
  - '-on'
  - '-off'
arrtype:
  - block
  - cyclic
opimpl:
  int:
    - dsp
    - fabric
  float:
    - fabric
    - fulldsp
    - primitivedsp
  double:
    - fabric
    - fulldsp
  half:
    - fabric
    - fulldsp
sttype:
  - ram_1p
  - ram_1wnr
  - ram_2p
  - ram_s2p
stimpl:
  - bram
stltc:
  - -1
opltc:
  - -1
`;

export function buildParamYaml(values: ParamYamlMetricInputs = {}): string {
    const normalized = normalizeParamYamlValues(values);
    const metricYaml = PARAM_YAML_METRIC_KEYS
        .map(key => `${key}:\n  - ${normalized[key]}`)
        .join("\n");

    return `${PARAM_YAML_PREFIX}${metricYaml}`;
}

export function normalizeParamYamlValues(values: ParamYamlMetricInputs = {}): ParamYamlValues {
    return PARAM_YAML_METRIC_KEYS.reduce<ParamYamlValues>((normalized, key) => {
        normalized[key] = normalizeMetricValue(values[key], DEFAULT_PARAM_YAML_VALUES[key]);
        return normalized;
    }, { ...DEFAULT_PARAM_YAML_VALUES });
}

function normalizeMetricValue(value: ParamYamlMetricInput, defaultValue: number): number {
    if (typeof value === "string" && value.trim() === "") {
        return defaultValue;
    }

    if (value === null || value === undefined) {
        return defaultValue;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : defaultValue;
}
