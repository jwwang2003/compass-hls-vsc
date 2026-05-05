import assert from "node:assert/strict";
import test from "node:test";

import { LazyTextWriter } from "../utilities/lazyTextWriter";

test("LazyTextWriter queues writes without running them synchronously", async () => {
    const writes: string[] = [];
    const writer = new LazyTextWriter<string>(1000);

    writer.queue("config", "one", async text => {
        writes.push(text);
    });

    assert.deepEqual(writes, []);

    await writer.flush("config");
    assert.deepEqual(writes, ["one"]);
});

test("LazyTextWriter coalesces repeated writes to the same key", async () => {
    const writes: string[] = [];
    const writer = new LazyTextWriter<string>(1000);

    writer.queue("config", "one", async text => {
        writes.push(text);
    });
    writer.queue("config", "two", async text => {
        writes.push(text);
    });

    await writer.flush("config");
    assert.deepEqual(writes, ["two"]);
});
