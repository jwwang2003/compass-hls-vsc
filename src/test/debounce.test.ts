import assert from "node:assert/strict";
import test from "node:test";

import { DebouncedAction } from "../utilities/debounce";

test("debounced action coalesces repeated schedules", async () => {
    let calls = 0;
    const action = new DebouncedAction(() => {
        calls += 1;
    }, 15);

    action.schedule();
    action.schedule();
    action.schedule();

    assert.equal(calls, 0);
    await wait(35);
    assert.equal(calls, 1);
});

test("debounced action can flush pending work immediately", () => {
    let calls = 0;
    const action = new DebouncedAction(() => {
        calls += 1;
    }, 1000);

    action.schedule();
    action.flush();
    action.flush();

    assert.equal(calls, 1);
});

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
