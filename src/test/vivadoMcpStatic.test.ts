import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("HGBO-DSE Vitis runner branches to Vivado MCP when selected", () => {
    const runnerSource = readFileSync(path.join(process.cwd(), "3rdParty", "HGBO-DSE", "bome", "vitis_hls.py"), "utf8");
    const mcpSource = readFileSync(path.join(process.cwd(), "3rdParty", "HGBO-DSE", "bome", "vivado_mcp.py"), "utf8");

    assert.match(runnerSource, /is_vivado_mcp_enabled\(\)/);
    assert.match(runnerSource, /run_vitis_hls_tcl/);
    assert.match(runnerSource, /check_vivado_mcp_connection/);
    assert.match(mcpSource, /HGBO_VIVADO_EXECUTION_MODE/);
    assert.match(mcpSource, /HGBO_VIVADO_MCP_HOST/);
    assert.match(mcpSource, /HGBO_VIVADO_MCP_PORT/);
    assert.match(mcpSource, /vivado_submit_job/);
    assert.match(mcpSource, /vivado_job_status/);
    assert.match(mcpSource, /vivado_job_logs/);
});
