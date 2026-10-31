import { BiAdjacentGraph, Dominators, type Graph, SortedIntView } from "@kobayami/graphity-core";
import { describe, expect, it } from "vitest";
import { IteratedDominanceFrontier } from "../src/index.js";
import { ControlFlowGraphs, expectIndexError, ints, TestGraphs } from "./testutils/core.js";

function of(graph: Graph): IteratedDominanceFrontier {
  return IteratedDominanceFrontier.of(Dominators.of(BiAdjacentGraph.of(graph), 0));
}

describe("IteratedDominanceFrontierTest", () => {
  it("definitionInOneBranchOfADiamondNeedsAPhiAtTheJoin", () => {
    const idf = of(TestGraphs.of(4, 0, 1, 0, 2, 1, 3, 2, 3));
    expect(ints(idf.frontierOf([1]))).toEqual([3]);
    expect(ints(idf.frontierOf([1, 2]))).toEqual([3]);
    expect(ints(idf.frontierOf([0]))).toEqual([]);
  });

  it("definitionInALoopBodyNeedsAPhiAtTheHeader", () => {
    // 0 -> 1 -> 2 -> 1, 2 -> 3
    const idf = of(TestGraphs.of(4, 0, 1, 1, 2, 2, 1, 2, 3));
    expect(ints(idf.frontierOf([2]))).toEqual([1]);
    expect(ints(idf.frontierOf([1]))).toEqual([1]);
  });

  it("iterationFollowsFrontiersOfFrontiers", () => {
    // Nested diamonds: 0 -> {1, 2}, 1 -> {3, 4}, {3, 4} -> 5, {5, 2} -> 6.
    // DF(3) = {5}, DF(5) = {6}: one definition in 3 needs phis at 5 and 6.
    const idf = of(TestGraphs.of(7, 0, 1, 0, 2, 1, 3, 1, 4, 3, 5, 4, 5, 5, 6, 2, 6));
    expect(ints(idf.frontierOf([3]))).toEqual([5, 6]);
  });

  it("ladderDefinitionReachesEveryJoinBelowIt", () => {
    const rungs = 10;
    const idf = of(ControlFlowGraphs.ladder(rungs));
    // A definition in a_1 needs phis at b_1 .. b_9 and at the exit.
    const phis = idf.frontierOf([1]);
    expect(phis.size).toBe(rungs);
    expect(phis.get(0)).toBe(rungs + 1);
    expect(phis.get(rungs - 1)).toBe(2 * rungs);
  });

  it("unreachableAndDuplicateNodesAreHarmless", () => {
    const idf = of(TestGraphs.of(5, 0, 1, 0, 2, 1, 3, 2, 3));
    expect(ints(idf.frontierOf([4]))).toEqual([]);
    expect(ints(idf.frontierOf([1, 1, 4]))).toEqual([3]);
  });

  it("emptyInputGivesAnEmptyFrontier", () => {
    const idf = of(TestGraphs.of(2, 0, 1));
    expect(ints(idf.frontierOf([]))).toEqual([]);
    expect(idf.frontierOf([]).isEmpty).toBe(true);
  });

  it("outOfRangeNodesAreRejected", () => {
    const idf = of(TestGraphs.of(2, 0, 1));
    expectIndexError(() => idf.frontierOf([2]), "Index 2 out of bounds for length 2");
    expectIndexError(() => idf.frontierOf([-1]));
    expectIndexError(() => idf.frontierOf([0, 1.5]));
  });

  it("severalEntries", () => {
    // Entries 0 and 3 both lead to 1; a definition in 0 needs a phi at 1.
    const idf = IteratedDominanceFrontier.of(
      Dominators.of(BiAdjacentGraph.of(TestGraphs.of(4, 0, 1, 3, 1, 1, 2)), [0, 3]),
    );
    expect(ints(idf.frontierOf([0]))).toEqual([1]);
  });

  it("every form of an int list serves as input, and a result can be passed back", () => {
    // Nested diamonds as above: IDF({3}) = {5, 6}, IDF({5, 6}) = {6}.
    const idf = of(TestGraphs.of(7, 0, 1, 0, 2, 1, 3, 1, 4, 3, 5, 4, 5, 5, 6, 2, 6));
    expect(ints(idf.frontierOf(Int32Array.of(3)))).toEqual([5, 6]);
    expect(ints(idf.frontierOf(SortedIntView.viewOf(Int32Array.of(0, 3, 4), 1, 2)))).toEqual([5, 6]);
    const phis = idf.frontierOf([3]);
    expect(ints(idf.frontierOf(phis))).toEqual([6]);
  });

  it("each result is a fresh array", () => {
    const idf = of(TestGraphs.of(4, 0, 1, 0, 2, 1, 3, 2, 3));
    const first = idf.frontierOf([1]);
    const second = idf.frontierOf([1]);
    expect(first.equals(second)).toBe(true);
    expect(first.asInt32Array().buffer).not.toBe(second.asInt32Array().buffer);
  });

  it("queries on a large graph grow their scratch space", () => {
    // More given nodes than the initial guess of 1024, and a frontier of thousands of nodes: the
    // heap and the hash sets grow on demand. A definition in every a_i needs the same phis as one
    // in a_1 alone.
    const rungs = 3000;
    const idf = of(ControlFlowGraphs.ladder(rungs));
    const all = Array.from({ length: rungs }, (_, i) => i);
    const phis = idf.frontierOf(all);
    // Every b_i with i >= 1 and the exit: rungs - 1 + 1 nodes.
    expect(phis.size).toBe(rungs);
    expect(phis.first()).toBe(rungs + 1);
    expect(phis.last()).toBe(2 * rungs);
    expect(ints(idf.frontierOf([1]))).toEqual(ints(phis));
  });
});
