import { describe, expect, it } from "vitest";
import { BackEdges, GraphBuilder, Graphs } from "../src/index.js";
import { ints } from "./testutils/assertions.js";
import { TestGraphs } from "./testutils/testGraphs.js";
import { pairSet } from "./testutils/traversalHelpers.js";

describe("BackEdgesTest", () => {
  it("ofEmptyGraphIsEmpty", () => {
    const be = BackEdges.of(TestGraphs.empty());
    expect(be.count).toBe(0);
    expect(be.isEmpty).toBe(true);
  });

  it("ofDagHasNoBackEdges", () => {
    // 0 -> 1, 0 -> 2, 1 -> 3, 2 -> 3.
    expect(BackEdges.of(TestGraphs.of(4, 0, 1, 0, 2, 1, 3, 2, 3)).count).toBe(0);
  });

  it("ofPathHasNoBackEdges", () => {
    expect(BackEdges.of(TestGraphs.path(5)).count).toBe(0);
  });

  it("ofCycleHasOneBackEdge", () => {
    // 0 -> 1 -> 2 -> 3 -> 0: DFS from 0 descends to 3, edge 3 -> 0 is a back edge.
    const g = TestGraphs.cycle(4);
    const be = BackEdges.of(g);
    expect(be.count).toBe(1);
    expect(ints(be.sourceNodes)).toEqual([3]);
    expect(ints(be.targetNodes)).toEqual([0]);
    expect(ints(be.edgeIndices)).toEqual([g.edgeIndexOf(3, 0)]);
  });

  it("ofSelfLoopIsBackEdge", () => {
    const be = BackEdges.of(TestGraphs.of(1, 0, 0));
    expect(be.count).toBe(1);
    expect(ints(be.sourceNodes)).toEqual([0]);
    expect(ints(be.targetNodes)).toEqual([0]);
    expect(ints(be.edgeIndices)).toEqual([0]);
  });

  it("removingBackEdgesYieldsDag", () => {
    // Cycle {0,1,2} + bridge 2 -> 3 + cycle {3, 4, 5}.
    const g = TestGraphs.of(6, 0, 1, 1, 2, 2, 0, 2, 3, 3, 4, 4, 5, 5, 3);
    const be = BackEdges.of(g);
    expect(be.count).toBeGreaterThan(0);
    const backEdgeSet = pairSet(be);
    const builder = new GraphBuilder();
    builder.addNodes(g.nodeCount);
    for (let u = 0; u < g.nodeCount; u++) {
      for (const v of g.outNodes(u)) if (!backEdgeSet.has(`${u}->${v}`)) builder.addEdge(u, v);
    }
    expect(Graphs.isDag(builder.build())).toBe(true);
  });

  it("ofMultipleDisjointCyclesFindsBackEdgePerCycle", () => {
    const g = TestGraphs.of(6, 0, 1, 1, 2, 2, 0, 3, 4, 4, 5, 5, 3);
    expect(BackEdges.of(g).count).toBe(2);
  });

  it("ofGraphWithForwardEdgeHasNoBackEdge", () => {
    // 0 -> 1, 0 -> 2, 1 -> 2: 0 -> 2 is a forward edge, not back.
    expect(BackEdges.of(TestGraphs.of(3, 0, 1, 0, 2, 1, 2)).count).toBe(0);
  });

  it("ofGraphWithCrossEdgeHasNoBackEdge", () => {
    // 0 -> 1, 0 -> 2, 2 -> 1: 1 is finished when 2 reaches it.
    expect(BackEdges.of(TestGraphs.of(3, 0, 1, 0, 2, 2, 1)).count).toBe(0);
  });

  it("edgesComeInTheOrderTheSearchFindsThem", () => {
    // 0 -> 3 -> 1 -> 2 -> 3, and 1 -> 3: the search finds 2 -> 3 (edge 3) deep below node 1 before
    // it returns to 1 and scans 1 -> 3 (edge 2), so the result is not in edge index order.
    const g = TestGraphs.of(4, 0, 3, 3, 1, 1, 2, 2, 3, 1, 3);
    const be = BackEdges.of(g);
    expect(ints(be.sourceNodes)).toEqual([2, 1]);
    expect(ints(be.targetNodes)).toEqual([3, 3]);
    expect(ints(be.edgeIndices)).toEqual([3, 2]);
    expect(ints(be.edgeIndices)).toEqual([g.edgeIndexOf(2, 3), g.edgeIndexOf(1, 3)]);
  });
});
