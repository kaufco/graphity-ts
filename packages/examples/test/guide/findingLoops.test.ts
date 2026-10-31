import { describe, expect, it } from "vitest";
import { FindingLoops } from "../../src/guide/findingLoops.js";

describe("FindingLoopsTest", () => {
  it("theLoopOverTheLinesLiesInTheLoopOverTheNotes", () => {
    const nesting = FindingLoops.loopsOfShow();
    expect(nesting.loopCount).toBe(2);
    expect(nesting.notesLoop).toBe(0);
    expect(nesting.linesLoop).toBe(1);
    expect(nesting.header).toBe(3);
    expect(Array.from(nesting.body)).toEqual([1, 2, 3, 4]);
    expect(nesting.parent).toBe(0);
    expect(nesting.depth).toBe(2);
  });
});
