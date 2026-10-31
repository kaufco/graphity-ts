import { describe, expect, it } from "vitest";
import { BiAdjacentGraph, Csr, Graph } from "../src/index.js";
import { ints } from "./testutils/assertions.js";
import { TestGraphs } from "./testutils/testGraphs.js";

describe("CsrTest", () => {
  const GRAPH = TestGraphs.of(4, 0, 1, 0, 2, 1, 2, 2, 0, 3, 3);

  it("out arrays match the edge index methods", () => {
    const start = Csr.outAdjacencyStart(GRAPH);
    const targets = Csr.outAdjacency(GRAPH);
    expect(start.length).toBe(GRAPH.nodeCount + 1);
    expect(targets.length).toBe(GRAPH.edgeCount);
    for (let v = 0; v < GRAPH.nodeCount; v++) {
      expect(start[v]).toBe(GRAPH.outEdgeStart(v));
      expect(start[v + 1]).toBe(GRAPH.outEdgeEnd(v));
    }
    for (let e = 0; e < GRAPH.edgeCount; e++) expect(targets[e]).toBe(GRAPH.edgeTarget(e));
  });

  it("in arrays match the in-nodes", () => {
    const graph = BiAdjacentGraph.of(GRAPH);
    const start = Csr.inAdjacencyStart(graph);
    const sources = Csr.inAdjacency(graph);
    expect(start.length).toBe(graph.nodeCount + 1);
    expect(sources.length).toBe(graph.edgeCount);
    for (let v = 0; v < graph.nodeCount; v++) {
      expect(ints(sources.subarray(start[v], start[v + 1]))).toEqual(ints(graph.inNodes(v)));
    }
  });

  it("returns the graph's own arrays without copying", () => {
    const outStart = Int32Array.of(0, 1, 1, 2);
    const out = Int32Array.of(2, 0);
    const graph = BiAdjacentGraph.of(Graph.create(outStart, out));
    expect(Csr.outAdjacencyStart(graph)).toBe(outStart);
    expect(Csr.outAdjacency(graph)).toBe(out);
    // The transpose holds the same four arrays, swapped.
    const transposed = graph.transposed();
    expect(Csr.outAdjacencyStart(transposed)).toBe(Csr.inAdjacencyStart(graph));
    expect(Csr.outAdjacency(transposed)).toBe(Csr.inAdjacency(graph));
    expect(Csr.inAdjacencyStart(transposed)).toBe(outStart);
    expect(Csr.inAdjacency(transposed)).toBe(out);
  });

  it("a node without edges in the middle has an empty range", () => {
    const graph = BiAdjacentGraph.of(TestGraphs.of(3, 0, 2, 2, 0));
    expect(ints(Csr.outAdjacencyStart(graph))).toEqual([0, 1, 1, 2]);
    expect(ints(Csr.outAdjacency(graph))).toEqual([2, 0]);
    expect(ints(Csr.inAdjacencyStart(graph))).toEqual([0, 1, 1, 2]);
    expect(ints(Csr.inAdjacency(graph))).toEqual([2, 0]);
  });

  it("the transposed view swaps the arrays", () => {
    const graph = BiAdjacentGraph.of(GRAPH);
    const transposed = graph.transposed();
    expect(Csr.outAdjacencyStart(transposed)).toBe(Csr.inAdjacencyStart(graph));
    expect(Csr.outAdjacency(transposed)).toBe(Csr.inAdjacency(graph));
    expect(Csr.inAdjacencyStart(transposed)).toBe(Csr.outAdjacencyStart(graph));
    expect(Csr.inAdjacency(transposed)).toBe(Csr.outAdjacency(graph));
  });

  it("the empty graph has one offset", () => {
    expect(ints(Csr.outAdjacencyStart(TestGraphs.empty()))).toEqual([0]);
    expect(ints(Csr.outAdjacency(TestGraphs.empty()))).toEqual([]);
  });

  it("outNodes views the out-adjacency array without copying", () => {
    const view = GRAPH.outNodes(0);
    expect(view.asInt32Array().buffer).toBe(Csr.outAdjacency(GRAPH).buffer);
  });
});
