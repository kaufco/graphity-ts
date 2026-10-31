import { describe, expect, it } from "vitest";
import { SmallProgram } from "../src/smallProgram.js";
import { WritingMermaid } from "../src/writingMermaid.js";

const NAMES = SmallProgram.packageNames();

describe("WritingMermaidTest", () => {
  it("theCycleIsModelAndStorageWithTheirNodeIds", () => {
    expect(NAMES[4]).toBe("model");
    expect(NAMES[5]).toBe("storage");
    expect(WritingMermaid.cycle()).toBe('flowchart TD\n  n4["model"]\n  n5["storage"]\n  n4 --> n5\n  n5 --> n4\n');
  });

  it("onlyModelAndStorageAreInTheRedClass", () => {
    const mermaid = WritingMermaid.cycleInRed();
    expect(mermaid).toContain("  classDef cycle stroke:red\n");
    expect(mermaid).toContain("  class n4 cycle\n");
    expect(mermaid).toContain("  class n5 cycle\n");
    expect(mermaid.split("\n").filter((line) => line.startsWith("  class "))).toHaveLength(2);
  });
});
