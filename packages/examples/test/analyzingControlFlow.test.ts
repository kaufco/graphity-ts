import { describe, expect, it } from "vitest";
import { AnalyzingControlFlow } from "../src/analyzingControlFlow.js";
import { SmallProgram } from "../src/smallProgram.js";
import { namesOf } from "./testutils/names.js";

const NAMES = SmallProgram.blockNames();

describe("AnalyzingControlFlowTest", () => {
  it("loopsFindTheForLoopWithItsHeaderAndBody", () => {
    const found = AnalyzingControlFlow.loopOfThen();
    expect(found.loops.loopCount, "the only loop").toBe(1);
    expect(found.loop).toBe(0);
    expect(found.header).toBe(1);
    expect(NAMES[found.header]).toBe("header");
    expect(Array.from(found.blocks)).toEqual([1, 2, 3, 4]);
    expect(namesOf(found.blocks, NAMES)).toEqual(["header", "body", "then", "next"]);
  });

  it("theVariableIOfTheLoopNeedsAPhiNodeInTheHeader", () => {
    expect(AnalyzingControlFlow.phiBlocksOfI().toString()).toBe("[1]");
    expect(namesOf(AnalyzingControlFlow.phiBlocksOfI(), NAMES)).toEqual(["header"]);
  });

  it("theLoopConditionAndTheIfDecideWhichBlocksRun", () => {
    const controlDependence = AnalyzingControlFlow.controlDependenceOfLoad();
    expect(controlDependence.nodeCount).toBe(NAMES.length);
    for (let block = 0; block < NAMES.length; block++) {
      const decides = namesOf(controlDependence.outNodes(block), NAMES);
      switch (NAMES[block]) {
        case "header":
          expect(decides).toEqual(["header", "body", "next"]);
          break;
        case "body":
          expect(decides).toEqual(["then"]);
          break;
        default:
          expect(decides, NAMES[block]).toEqual([]);
      }
    }
  });
});
