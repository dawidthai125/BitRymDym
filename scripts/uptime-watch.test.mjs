import assert from "node:assert/strict";
import test from "node:test";

import { nextUptimeState } from "./uptime-watch.mjs";

test("one failure is ignored, two in a row mail once, recovery mails once", () => {
  let s = {};
  const step = (ok) => {
    const next = nextUptimeState(s, ok);
    s = next.state;
    return next.mail;
  };
  assert.deepEqual([true, false, true, false, false, false, true, true].map(step), [null, null, null, null, "down", null, "up", null]);
});
