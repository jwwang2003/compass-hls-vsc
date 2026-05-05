<script lang="ts">
  import {
    PARAM_YAML_METRIC_KEYS,
    type ParamYamlMetricKey,
    type ParamYamlMetricValues,
  } from "@/modules/paramYamlMetrics";

  export let values: ParamYamlMetricValues;

  const fractionalMetrics = new Set<ParamYamlMetricKey>(["POW", "CLK"]);

  function inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  function updateMetric(key: ParamYamlMetricKey, value: string) {
    values = {
      ...values,
      [key]: value,
    };
  }
</script>

<section class="param-metrics">
  <h2>params.yaml Metrics</h2>
  <div class="metric-grid">
    {#each PARAM_YAML_METRIC_KEYS as key}
      <div class="metric-field">
        <span>{key}</span>
        <vscode-text-field
          aria-label={key}
          type="number"
          step={fractionalMetrics.has(key) ? "any" : "1"}
          value={values[key]}
          on:input={(event) => updateMetric(key, inputValue(event))}
        ></vscode-text-field>
      </div>
    {/each}
  </div>
</section>

<style>
  .param-metrics {
    box-sizing: border-box;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    border-block: 1px solid var(--vscode-panel-border);
    padding-block: 0.625rem;
    padding-inline-end: 0.75rem;
  }

  h2 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .metric-grid {
    box-sizing: border-box;
    inline-size: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(4.75rem, 100%), 1fr));
    gap: 0.5rem;
    padding-inline-end: 1rem;
  }

  .metric-field {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .metric-field span {
    color: var(--vscode-descriptionForeground);
    font-size: 0.72rem;
  }

  vscode-text-field {
    inline-size: 100%;
    max-inline-size: 100%;
    min-inline-size: 0;
  }

  vscode-text-field::part(root) {
    inline-size: 100%;
    min-inline-size: 0;
  }

  vscode-text-field::part(control) {
    min-inline-size: 0;
  }
</style>
