import { BiAdjacentGraph, Dominators, GraphBuilder } from "@kobayami/graphity-core";
import { describe, expect, it } from "vitest";
import { ControlFlow } from "../src/index.js";
import { ControlFlowGraphs, ints, TestGraphs } from "./testutils/core.js";

function bi(n: number, ...edges: number[]): BiAdjacentGraph {
  return BiAdjacentGraph.of(TestGraphs.of(n, ...edges));
}

const TIMEOUT = 60_000;

describe("ControlFlowTest", () => {
  it("emptyGraph", () => {
    const d = Dominators.of(BiAdjacentGraph.of(TestGraphs.empty()), []);
    expect(ControlFlow.dominanceFrontiers(d).nodeCount).toBe(0);
  });

  it("dominanceFrontiersOfALoop", () => {
    // 0 -> 1 -> 2 -> 1, 2 -> 3: the loop header is in its own frontier and in its body's.
    const d = Dominators.of(bi(4, 0, 1, 1, 2, 2, 1, 2, 3), 0);
    const df = ControlFlow.dominanceFrontiers(d);
    expect(ints(df.outNodes(0))).toEqual([]);
    expect(ints(df.outNodes(1))).toEqual([1]);
    expect(ints(df.outNodes(2))).toEqual([1]);
    expect(ints(df.outNodes(3))).toEqual([]);
  });

  it("dominanceFrontiersOfADiamond", () => {
    const d = Dominators.of(bi(4, 0, 1, 0, 2, 1, 3, 2, 3), 0);
    const df = ControlFlow.dominanceFrontiers(d);
    expect(ints(df.outNodes(1))).toEqual([3]);
    expect(ints(df.outNodes(2))).toEqual([3]);
    expect(df.edgeCount).toBe(2);
  });

  it("unreachableNodesHaveEmptyFrontiersAndAppearInNone", () => {
    // 3 is unreachable and has an edge into the join point 2.
    const d = Dominators.of(bi(4, 0, 1, 1, 2, 0, 2, 3, 2), 0);
    const df = ControlFlow.dominanceFrontiers(d);
    expect(ints(df.outNodes(3))).toEqual([]);
    expect(ints(df.outNodes(1))).toEqual([2]);
    expect(df.edgeCount).toBe(1);
  });

  it("ladderFrontierGrowsQuadratically", () => {
    const rungs = 50;
    const df = ControlFlow.dominanceFrontiers(Dominators.of(BiAdjacentGraph.of(ControlFlowGraphs.ladder(rungs)), 0));
    // b_i (= rungs + i) is in the frontier of every a_j with 1 <= j <= i, plus the exit.
    expect(df.edgeCount).toBeGreaterThan((rungs * (rungs - 1)) / 2);
  });

  it("controlDependenceIsTheTransposedFrontierOfThePostDominators", () => {
    // if (0) { 1 } ; 2   -  0 -> 1, 0 -> 2, 1 -> 2, exit 2.
    const cfg = bi(3, 0, 1, 0, 2, 1, 2);
    const postDominators = Dominators.of(cfg.transposed(), 2);
    const controlDependence = BiAdjacentGraph.of(ControlFlow.dominanceFrontiers(postDominators)).transposed();
    expect(controlDependence.edgeCount).toBe(1);
    expect(controlDependence.hasOutNode(0, 1)).toBe(true);
  });

  it("the result is a plain graph with sorted frontiers and a fresh copy per call", () => {
    // Several entries and a self-loop: 0 -> 2, 1 -> 2, 2 -> 2, 2 -> 3.
    const d = Dominators.of(bi(4, 0, 2, 1, 2, 2, 2, 2, 3), [0, 1]);
    const df = ControlFlow.dominanceFrontiers(d);
    expect(df).not.toBeInstanceOf(BiAdjacentGraph);
    expect(ints(df.outNodes(0))).toEqual([2]);
    expect(ints(df.outNodes(1))).toEqual([2]);
    expect(ints(df.outNodes(2))).toEqual([2]);
    expect(df.containsSelfLoop(2)).toBe(true);
    const again = ControlFlow.dominanceFrontiers(d);
    expect(again.equals(df)).toBe(true);
    expect(again).not.toBe(df);
  });

  it(
    "deepChainDoesNotOverflowStack",
    () => {
      const deep = 1_000_000;
      const dominators = Dominators.of(BiAdjacentGraph.of(TestGraphs.path(deep)), 0);
      expect(ControlFlow.dominanceFrontiers(dominators).edgeCount).toBe(0);

      // One back edge from the end of the chain to its middle h: h is in the frontier of every
      // node from h to the end.
      const builder = new GraphBuilder();
      builder.addNodes(deep);
      for (let i = 0; i + 1 < deep; i++) builder.addEdge(i, i + 1);
      builder.addEdge(deep - 1, deep / 2);
      const looped = Dominators.of(BiAdjacentGraph.of(builder.build()), 0);
      const df = ControlFlow.dominanceFrontiers(looped);
      expect(ints(df.outNodes(deep - 1))).toEqual([deep / 2]);
      expect(df.edgeCount).toBe(deep - deep / 2);
    },
    TIMEOUT,
  );
});
