import { describe, expect, it } from "vitest";
import { Graphs } from "@kobayami/graphity";
import { AnalyzingControlFlowFurther } from "../../src/guide/analyzingControlFlowFurther.js";
import { textOf } from "../testutils/text.js";

/** The examples of the chapter "Control-flow analysis" added after the pilot. */
describe("ControlFlowChapterTest", () => {
  it("theLoopOfParseArgsHasTwoEntries", () => {
    const irreducible = AnalyzingControlFlowFurther.irreducible();
    expect(irreducible.reducible).toBe(false);
    expect(irreducible.loopCount).toBe(1);
    expect(irreducible.entries.toString()).toBe("[1, 2]");
    expect(irreducible.header).toBe(1);
  });

  it("dominanceFrontiersOfLoad", () => {
    expect(Graphs.adjacencyListOf(AnalyzingControlFlowFurther.dominanceFrontiers())).toBe(
      textOf("0 -> []", "1 -> [1]", "2 -> [1]", "3 -> [4]", "4 -> [1]", "5 -> []"),
    );
  });

  it("phiBlocksOfCount", () => {
    const phis = AnalyzingControlFlowFurther.phiBlocks();
    expect(phis.forI.toString()).toBe("[1]");
    expect(phis.forLast.toString()).toBe("[1, 4]");
  });

  it("controlDependenceOfLoad", () => {
    expect(Graphs.adjacencyListOf(AnalyzingControlFlowFurther.controlDependence())).toBe(
      textOf("0 -> []", "1 -> [1, 2, 4]", "2 -> [3]", "3 -> []", "4 -> []", "5 -> []"),
    );
  });
});
