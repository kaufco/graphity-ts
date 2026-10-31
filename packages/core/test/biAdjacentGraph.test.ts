import { describe, expect, it } from "vitest";
import { BiAdjacentGraph } from "../src/index.js";
import { expectIndexError, ints } from "./testutils/assertions.js";
import { TestGraphs } from "./testutils/testGraphs.js";

describe("BiAdjacentGraphTest", () => {
  /** Diamond 0->1, 0->2, 1->3, 2->3. */
  const diamond = () => BiAdjacentGraph.of(TestGraphs.of(4, 0, 1, 0, 2, 1, 3, 2, 3));

  it("inDegree reports incoming edges", () => {
    const g = diamond();
    expect(g.inDegree(0)).toBe(0);
    expect(g.inDegree(1)).toBe(1);
    expect(g.inDegree(2)).toBe(1);
    expect(g.inDegree(3)).toBe(2);
  });

  it.each([-1, 4, 1000])("inDegree(%i) out of range throws", (node) => {
    const g = diamond();
    expectIndexError(() => g.inDegree(node));
  });

  it("degree is the sum of in- and out-degree", () => {
    const g = diamond();
    for (let i = 0; i < g.nodeCount; i++) expect(g.degree(i)).toBe(g.inDegree(i) + g.outDegree(i));
  });

  it("degree counts a self-loop twice", () => {
    const g = BiAdjacentGraph.of(TestGraphs.of(1, 0, 0));
    expect(g.inDegree(0)).toBe(1);
    expect(g.outDegree(0)).toBe(1);
    expect(g.degree(0)).toBe(2);
  });

  it("degree counts a reciprocal pair twice", () => {
    const g = BiAdjacentGraph.of(TestGraphs.of(2, 0, 1, 1, 0));
    expect(g.degree(0)).toBe(2);
    expect(ints(g.neighbors(0))).toEqual([1]);
  });

  it.each([-1, 4, 1000])("degree(%i) out of range throws", (node) => {
    const g = diamond();
    expectIndexError(() => g.degree(node));
  });

  it("inNodes returns a sorted view", () => {
    const g = diamond();
    expect(ints(g.inNodes(3))).toEqual([1, 2]);
    expect(ints(g.inNodes(0))).toEqual([]);
  });

  it.each([-1, 4, 1000])("inNodes(%i) out of range throws", (node) => {
    const g = diamond();
    expectIndexError(() => g.inNodes(node));
  });

  it("hasInNode detects incoming edges", () => {
    const g = diamond();
    expect(g.hasInNode(3, 1)).toBe(true);
    expect(g.hasInNode(3, 2)).toBe(true);
    expect(g.hasInNode(3, 0)).toBe(false);
    expect(g.hasInNode(0, 1)).toBe(false);
  });

  it("hasInNode and hasNeighbor find no node that is not an int", () => {
    const g = diamond();
    for (const other of [NaN, undefined as unknown as number, 1.5]) {
      expect(g.hasInNode(3, other)).toBe(false);
      expect(g.hasNeighbor(0, other)).toBe(false);
    }
  });

  it.each([-1, 4, 1000])("hasInNode with node %i out of range throws", (node) => {
    const g = diamond();
    expectIndexError(() => g.hasInNode(node, 0));
  });

  it("of returns a BiAdjacentGraph unchanged", () => {
    const g = diamond();
    expect(BiAdjacentGraph.of(g)).toBe(g);
  });

  it("uniAdjacentGraph returns an equal uni-adjacent graph", () => {
    const bi = diamond();
    const uni = bi.uniAdjacentGraph();
    expect(uni.equals(bi)).toBe(true);
    expect(uni).not.toBeInstanceOf(BiAdjacentGraph);
  });

  it("transposed swaps in- and out-edges", () => {
    const g = diamond();
    const t = g.transposed();
    for (let i = 0; i < g.nodeCount; i++) {
      expect(ints(t.outNodes(i))).toEqual(ints(g.inNodes(i)));
      expect(ints(t.inNodes(i))).toEqual(ints(g.outNodes(i)));
    }
  });

  it("transposed is bi-adjacent", () => {
    expect(diamond().transposed()).toBeInstanceOf(BiAdjacentGraph);
  });

  it("transposed twice equals the original", () => {
    const g = diamond();
    expect(g.transposed().transposed().equals(g)).toBe(true);
  });

  it("transposedEdgeIndex swaps the endpoints", () => {
    const g = diamond();
    const t = g.transposed();
    for (let edgeIndex = 0; edgeIndex < g.edgeCount; edgeIndex++) {
      const transposedIndex = g.transposedEdgeIndex(edgeIndex);
      expect(t.edgeSource(transposedIndex)).toBe(g.edgeTarget(edgeIndex));
      expect(t.edgeTarget(transposedIndex)).toBe(g.edgeSource(edgeIndex));
    }
  });

  it("transposedEdgeIndex is its own inverse across the transpose", () => {
    const g = diamond();
    const t = g.transposed();
    for (let edgeIndex = 0; edgeIndex < g.edgeCount; edgeIndex++) {
      expect(t.transposedEdgeIndex(g.transposedEdgeIndex(edgeIndex))).toBe(edgeIndex);
    }
  });

  it("transposedEdgeIndex relabels edges", () => {
    // 0->2 is edge 0, 1->0 is edge 1. In the transpose 0->1 comes first, so the two swap.
    const g = BiAdjacentGraph.of(TestGraphs.of(3, 1, 0, 0, 2));
    expect(g.transposedEdgeIndex(0)).toBe(1);
    expect(g.transposedEdgeIndex(1)).toBe(0);
  });

  it("transposedEdgeIndex handles a self-loop", () => {
    // Node 1 has a self-loop (edge 1) next to 1->2 (edge 2); 0->1 is edge 0.
    const g = BiAdjacentGraph.of(TestGraphs.of(3, 0, 1, 1, 1, 1, 2));
    const loop = g.transposedEdgeIndex(1);
    const t = g.transposed();
    expect(t.edgeSource(loop)).toBe(1);
    expect(t.edgeTarget(loop)).toBe(1);
  });

  it.each([-1, 4, 1000])("transposedEdgeIndex(%i) out of range throws", (edgeIndex) => {
    const g = diamond();
    expectIndexError(() => g.transposedEdgeIndex(edgeIndex));
  });

  it("neighbors merges in- and out-nodes sorted", () => {
    const g = diamond();
    expect(ints(g.neighbors(0))).toEqual([1, 2]);
    expect(ints(g.neighbors(2))).toEqual([0, 3]);
    expect(ints(g.neighbors(3))).toEqual([1, 2]);
  });

  it("neighbors deduplicates the overlap between in and out", () => {
    const g = BiAdjacentGraph.of(TestGraphs.of(2, 0, 1, 1, 0));
    expect(ints(g.neighbors(0))).toEqual([1]);
    expect(ints(g.neighbors(1))).toEqual([0]);
  });

  it("neighbors includes the node itself on a self-loop", () => {
    const g = BiAdjacentGraph.of(TestGraphs.of(2, 0, 0, 0, 1));
    expect(ints(g.neighbors(0))).toEqual([0, 1]);
  });

  it.each([-1, 4, 1000])("neighbors(%i) out of range throws", (node) => {
    const g = diamond();
    expectIndexError(() => g.neighbors(node));
  });

  it("hasNeighbor detects either direction", () => {
    const g = diamond();
    expect(g.hasNeighbor(0, 1)).toBe(true);
    expect(g.hasNeighbor(1, 0)).toBe(true);
    expect(g.hasNeighbor(3, 1)).toBe(true);
    expect(g.hasNeighbor(1, 3)).toBe(true);
    expect(g.hasNeighbor(1, 2)).toBe(false);
  });

  it("isRootNode is true for sources", () => {
    const g = diamond();
    expect(g.isRootNode(0)).toBe(true);
    expect(g.isRootNode(1)).toBe(false);
    expect(g.isRootNode(2)).toBe(false);
    expect(g.isRootNode(3)).toBe(false);
  });

  it("isRootNode is false on a self-loop", () => {
    expect(BiAdjacentGraph.of(TestGraphs.of(1, 0, 0)).isRootNode(0)).toBe(false);
  });
});
