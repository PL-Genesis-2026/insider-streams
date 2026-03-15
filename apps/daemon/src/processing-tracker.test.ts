import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ProcessingTracker } from "./processing-tracker.js";

describe("ProcessingTracker", () => {
  it("allows first acquire", () => {
    const tracker = new ProcessingTracker();
    assert.equal(tracker.acquire("1"), true);
  });

  it("blocks concurrent acquire for same key", () => {
    const tracker = new ProcessingTracker();
    tracker.acquire("1");
    assert.equal(tracker.acquire("1"), false);
  });

  it("keeps key after markDone — blocks re-acquire", () => {
    const tracker = new ProcessingTracker();
    tracker.acquire("1");
    tracker.markDone("1");
    assert.equal(tracker.acquire("1"), false);
  });

  it("removes key after markFailed — allows re-acquire", () => {
    const tracker = new ProcessingTracker();
    tracker.acquire("1");
    tracker.markFailed("1");
    assert.equal(tracker.acquire("1"), true);
  });

  it("tracks independent keys separately", () => {
    const tracker = new ProcessingTracker();
    tracker.acquire("1");
    assert.equal(tracker.acquire("2"), true);
    tracker.markDone("1");
    tracker.markFailed("2");
    assert.equal(tracker.acquire("1"), false);
    assert.equal(tracker.acquire("2"), true);
  });

  it("reports size correctly", () => {
    const tracker = new ProcessingTracker();
    assert.equal(tracker.size, 0);
    tracker.acquire("1");
    assert.equal(tracker.size, 1);
    tracker.acquire("2");
    assert.equal(tracker.size, 2);
    tracker.markFailed("1");
    assert.equal(tracker.size, 1);
  });

  it("has() returns correct state", () => {
    const tracker = new ProcessingTracker();
    assert.equal(tracker.has("1"), false);
    tracker.acquire("1");
    assert.equal(tracker.has("1"), true);
    tracker.markFailed("1");
    assert.equal(tracker.has("1"), false);
  });
});
