import { describe, expect, it } from "vitest";
import { EdgeType } from "@kobayami/graphity";
import { SmallProgram } from "../src/smallProgram.js";
import { Traversals } from "../src/traversals.js";
import { namesOf } from "./testutils/names.js";

describe("TraversalsTest", () => {
  it("leaveNodeGivesTheCalleesBeforeTheirCallers", () => {
    expect(Traversals.calleesFirst()).toEqual([1, 6, 8, 3, 7, 9, 4, 5, 2, 0]);
    expect(namesOf(Traversals.calleesFirst(), SmallProgram.methodNames())).toEqual([
      "parseArgs",
      "parse",
      "read",
      "load",
      "format",
      "write",
      "save",
      "show",
      "run",
      "main",
    ]);
  });

  it("visitEdgeStopsAtTheDependencyOfStorageOnModel", () => {
    const dependencies = SmallProgram.dependencies();
    const names = SmallProgram.packageNames();
    const edge = Traversals.firstCycleEdge();
    expect(edge).toBe(10);
    expect(names[dependencies.edgeSource(edge)]).toBe("storage");
    expect(names[dependencies.edgeTarget(edge)]).toBe("model");
  });

  it("currentLevelStopsTwoCallsAwayFromMain", () => {
    expect(Traversals.withinTwoCalls()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(namesOf(Traversals.withinTwoCalls(), SmallProgram.methodNames())).toEqual([
      "main",
      "parseArgs",
      "run",
      "load",
      "save",
      "show",
    ]);
  });

  it("edgeTypesFindTheBackEdgeOfTheLoopAndTheForwardEdgePastThen", () => {
    const names = SmallProgram.blockNames();
    const classified = Traversals.edgeTypesOfLoad();
    expect(classified.loopEdge).toBe(EdgeType.BACK);
    const forward = classified.forwardEdges;
    expect(forward.count).toBe(1);
    expect(names[forward.sourceNodes[0]]).toBe("body");
    expect(names[forward.targetNodes[0]]).toBe("next");
  });

  it("pathToGivesTheShortestCallChainFromMainToParse", () => {
    const chain = Traversals.callChainToParse();
    expect(chain.depth).toBe(3);
    expect(Array.from(chain.chain)).toEqual([0, 2, 3, 6]);
    expect(namesOf(chain.chain, SmallProgram.methodNames())).toEqual(["main", "run", "load", "parse"]);
  });
});
