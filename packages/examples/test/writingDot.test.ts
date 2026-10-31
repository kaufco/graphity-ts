import { describe, expect, it } from "vitest";
import { SmallProgram } from "../src/smallProgram.js";
import { WritingDot } from "../src/writingDot.js";

const NAMES = SmallProgram.packageNames();

describe("WritingDotTest", () => {
  it("theCycleIsModelAndStorageWithTheirNodeIds", () => {
    expect(NAMES[4]).toBe("model");
    expect(NAMES[5]).toBe("storage");
    expect(WritingDot.cycle()).toBe('digraph {\n  4 [label="model"];\n  5 [label="storage"];\n  4 -> 5;\n  5 -> 4;\n}\n');
  });

  it("onlyModelAndStorageAreRed", () => {
    const dot = WritingDot.cycleInRed();
    expect(dot).toContain('  4 [label="model", color="red"];\n');
    expect(dot).toContain('  5 [label="storage", color="red"];\n');
    expect(dot.split("\n").filter((line) => line.includes("color"))).toHaveLength(2);
  });
});
