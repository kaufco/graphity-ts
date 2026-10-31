import { describe, expect, it } from "vitest";
import { Graphs } from "@kobayami/graphity";
import { FindingReachable } from "../../src/guide/findingReachable.js";
import { ShortestPaths } from "../../src/guide/shortestPaths.js";
import { TransitiveClosure } from "../../src/guide/transitiveClosure.js";
import { TransitiveReduction } from "../../src/guide/transitiveReduction.js";
import { SmallProgram } from "../../src/smallProgram.js";
import { textOf } from "../testutils/text.js";

/** The examples of the chapter "Reachability and distances". */
describe("ReachabilityChapterTest", () => {
  it("reachableFromLoadAndFromLoadOrSave", () => {
    const forward = FindingReachable.forward();
    expect(forward.fromLoad.toString()).toBe("[3, 6, 8]");
    expect(forward.fromLoadOrSave.toString()).toBe("[3, 4, 6, 7, 8, 9]");
  });

  it("methodsThatMayEndUpCallingFormat", () => {
    expect(FindingReachable.callersOfFormat().toString()).toBe("[0, 2, 4, 5, 7]");
  });

  it("shortestChainFromMainToWrite", () => {
    const fromMain = ShortestPaths.fromMain();
    expect(fromMain.distanceToWrite).toBe(3);
    expect(Array.from(fromMain.pathToWrite)).toEqual([0, 2, 4, 9]);
    expect(fromMain.reachesParseArgs).toBe(true);
  });

  it("everyMethodIsAtMostThreeCallsAwayFromMain", () => {
    expect(ShortestPaths.farthestCall()).toBe(3);
  });

  it("nearestOfLoadAndSave", () => {
    const fromTwo = ShortestPaths.fromTwo();
    expect(fromTwo.distanceToFormat).toBe(1);
    expect(Array.from(fromTwo.pathToFormat)).toEqual([4, 7]);
    expect(fromTwo.reachesMain).toBe(false);
    // The picture after: the reached methods and the edges of the shortest paths to them.
    const fromEither = fromTwo.fromEither;
    const names = SmallProgram.methodNames();
    expect(Array.from(fromEither.pathTo(SmallProgram.nodeOf(names, "parse")))).toEqual([3, 6]);
    expect(Array.from(fromEither.pathTo(SmallProgram.nodeOf(names, "read")))).toEqual([3, 8]);
    expect(Array.from(fromEither.pathTo(SmallProgram.nodeOf(names, "write")))).toEqual([4, 9]);
    expect(names.map((_, method) => method).filter((method) => fromEither.isReachable(method))).toEqual([
      3, 4, 6, 7, 8, 9,
    ]);
  });

  it("closureOfTheCalls", () => {
    const read = TransitiveClosure.closure();
    expect(read.edgeCount).toBe(23);
    expect(read.mainReachesWrite).toBe(true);
    expect(read.fromRun.toString()).toBe("[3, 4, 5, 6, 7, 8, 9]");
    expect(read.parseOnCycle).toBe(true);
    expect(read.loadOnCycle).toBe(false);
    // The picture after: the calls and the edges the closure adds.
    expect(Graphs.adjacencyListOf(read.closure)).toBe(
      textOf(
        "0 -> [1, 2, 3, 4, 5, 6, 7, 8, 9]",
        "1 -> []",
        "2 -> [3, 4, 5, 6, 7, 8, 9]",
        "3 -> [6, 8]",
        "4 -> [7, 9]",
        "5 -> [7]",
        "6 -> [6]",
        "7 -> [7]",
        "8 -> []",
        "9 -> []",
      ),
    );
  });

  it("reductionOfTheStepsLeavesOutCompileToPackage", () => {
    const reduced = TransitiveReduction.reduction();
    expect(reduced.edgeCount).toBe(9);
    expect(Array.from(reduced.leftOut.sourceNodes)).toEqual([1]);
    expect(Array.from(reduced.leftOut.targetNodes)).toEqual([6]);
    expect(Array.from(reduced.leftOut.edgeIndices)).toEqual([3]);
    const names = SmallProgram.stepNames();
    const compile = SmallProgram.nodeOf(names, "compile");
    const pkg = SmallProgram.nodeOf(names, "package");
    expect(reduced.reduction.hasOutNode(compile, pkg)).toBe(false);
    expect(SmallProgram.buildSteps().hasOutNode(compile, pkg)).toBe(true);
    // The picture after: the steps without compile -> package.
    const steps = Graphs.adjacencyListOf(SmallProgram.buildSteps());
    expect(Graphs.adjacencyListOf(reduced.reduction)).toBe(steps.replace("1 -> [3, 4, 6]", "1 -> [3, 4]"));
  });
});
