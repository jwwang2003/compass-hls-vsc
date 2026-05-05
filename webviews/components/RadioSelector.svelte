<script lang="ts" context="module">
    /**
     * Option type for the radio group
     */
    export interface RadioOption {
        label: string;
        value: string;
    }
</script>

<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import {
        provideVSCodeDesignSystem,
        vsCodeRadioGroup,
        vsCodeRadio,
    } from "@vscode/webview-ui-toolkit";

    // Register the toolkit radios
    onMount(() => {
        provideVSCodeDesignSystem().register(
            vsCodeRadioGroup(),
            vsCodeRadio()
        );
    });
    /**
     * Available options to render
     */
    export let options: RadioOption[] = [];

    /**
     * Currently selected value. Bindable via `bind:value`.
     */
    export let value: string;

    /**
     * Layout direction: 'horizontal' or 'vertical'
     */
    export let orientation: "horizontal" | "vertical" = "horizontal";

    const dispatch = createEventDispatcher<{ value: string }>();

    function handleChange(e: Event) {
        const newValue = (e.target as any).value as string;
        dispatch("value", newValue);
        value = newValue;
    }
</script>

<!--
  Usage:
    <RadioGroup
      bind:value={mode}
      {options}
      orientation="vertical"
    />
-->
<vscode-radio-group {orientation} {value} on:change={handleChange}>
    {#each options as opt}
        <vscode-radio value={opt.value}>{opt.label}</vscode-radio>
    {/each}
</vscode-radio-group>

<style>
    vscode-radio-group {
        display: flex;
        flex-direction: var(--direction);
        gap: 0.5rem;
    }
    /* Dynamically set direction based on orientation prop */
    :global(vscode-radio-group[orientation="horizontal"]) {
        --direction: row;
    }
    :global(vscode-radio-group[orientation="vertical"]) {
        --direction: column;
    }
</style>
