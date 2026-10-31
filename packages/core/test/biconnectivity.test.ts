import { describe, expect, it } from "vitest";
import { BiAdjacentGraph, type Biconnectivity, Components, type Graph } from "../src/index.js";
import { ints } from "./testutils/assertions.js";
import { TestGraphs } from "./testutils/testGraphs.js";

const biconnectivityOf = (graph: Graph): Biconnectivity => Components.biconnectivityOf(BiAdjacentGraph.of(graph));

/** Two triangles sharing node 0, plus a pendant chain 5 - 6 hanging off node 3. */
const bowtieWithTail = () => TestGraphs.of(7, 0, 1, 1, 2, 2, 0, 0, 3, 3, 4, 4, 0, 3, 5, 5, 6);

/** Edge index of `source -> target`, or of the reverse edge if only that one exists. */
function edgeIndexOf(graph: Graph, source: number, target: number): number {
  for (let e = graph.outEdgeStart(source); e < graph.outEdgeEnd(source); e++)
    if (graph.edgeTarget(e) === target) return e;
  for (let e = graph.outEdgeStart(target); e < graph.outEdgeEnd(target); e++)
    if (graph.edgeTarget(e) === source) return e;
  throw new Error(`no edge between ${source} and ${target}`);
}

describe("BiconnectivityTest", () => {
  it("every edge of a path is a bridge", () => {
    const b = biconnectivityOf(TestGraphs.path(4));
    expect(b.bridges.count).toBe(3);
    expect(ints(b.bridges.sourceNodes)).toEqual([0, 1, 2]);
    expect(ints(b.bridges.targetNodes)).toEqual([1, 2, 3]);
    expect(ints(b.bridges.edgeIndices)).toEqual([0, 1, 2]);
  });

  it("inner nodes of a path are articulation points", () => {
    expect(ints(biconnectivityOf(TestGraphs.path(4)).articulationPoints)).toEqual([1, 2]);
  });

  it("every edge of a path is its own block", () => {
    const b = biconnectivityOf(TestGraphs.path(4));
    expect(b.blocks.groupCount).toBe(3);
    for (let block = 0; block < 3; block++) expect(b.blocks.sizeOf(block)).toBe(1);
  });

  it("a cycle has no bridge and no articulation point", () => {
    const b = biconnectivityOf(TestGraphs.cycle(5));
    expect(b.bridges.isEmpty).toBe(true);
    expect(b.articulationPoints.isEmpty).toBe(true);
  });

  it("a cycle is one block", () => {
    const b = biconnectivityOf(TestGraphs.cycle(5));
    expect(b.blocks.groupCount).toBe(1);
    expect(ints(b.blocks.edgesOf(0))).toEqual([0, 1, 2, 3, 4]);
  });

  it("a reciprocal pair is one undirected edge and thus a bridge", () => {
    const b = biconnectivityOf(TestGraphs.of(2, 0, 1, 1, 0));
    expect(b.bridges.count).toBe(1);
    expect(b.bridges.sourceNodes[0]).toBe(0);
    expect(b.bridges.targetNodes[0]).toBe(1);
  });

  it("both edge indices of a reciprocal pair share a block", () => {
    const b = biconnectivityOf(TestGraphs.of(2, 0, 1, 1, 0));
    expect(b.blocks.groupCount).toBe(1);
    expect(ints(b.blocks.edgesOf(0))).toEqual([0, 1]);
  });

  it("symmetric storage yields the same result as a single direction", () => {
    const single = biconnectivityOf(TestGraphs.path(4));
    const both = biconnectivityOf(TestGraphs.of(4, 0, 1, 1, 0, 1, 2, 2, 1, 2, 3, 3, 2));
    expect(ints(both.bridges.sourceNodes)).toEqual(ints(single.bridges.sourceNodes));
    expect(ints(both.bridges.targetNodes)).toEqual(ints(single.bridges.targetNodes));
    expect(ints(both.articulationPoints)).toEqual(ints(single.articulationPoints));
    expect(both.blocks.groupCount).toBe(single.blocks.groupCount);
  });

  it("a bridge stored both ways is reported from the lower node ID", () => {
    // The bridge {0, 1} is stored as 0 -> 1 and 1 -> 0; it is reported as 0 -> 1, edge index 0.
    const g = TestGraphs.of(3, 1, 0, 0, 1, 1, 2);
    const b = biconnectivityOf(g);
    expect(ints(b.bridges.sourceNodes)).toEqual([0, 1]);
    expect(ints(b.bridges.targetNodes)).toEqual([1, 2]);
    for (let p = 0; p < b.bridges.count; p++) {
      expect(g.edgeTarget(b.bridges.edgeIndices[p])).toBe(b.bridges.targetNodes[p]);
      expect(g.edgeSource(b.bridges.edgeIndices[p])).toBe(b.bridges.sourceNodes[p]);
    }
  });

  it("an articulation point joins two triangles", () => {
    const b = biconnectivityOf(TestGraphs.of(5, 0, 1, 1, 2, 2, 0, 0, 3, 3, 4, 4, 0));
    expect(ints(b.articulationPoints)).toEqual([0]);
    expect(b.bridges.isEmpty).toBe(true);
    expect(b.blocks.groupCount).toBe(2);
    expect(b.blocks.sizeOf(0)).toBe(3);
    expect(b.blocks.sizeOf(1)).toBe(3);
  });

  it("bridges and blocks coexist", () => {
    const b = biconnectivityOf(bowtieWithTail());
    expect(ints(b.bridges.sourceNodes)).toEqual([3, 5]);
    expect(ints(b.bridges.targetNodes)).toEqual([5, 6]);
    expect(ints(b.articulationPoints)).toEqual([0, 3, 5]);
    expect(b.blocks.groupCount).toBe(4);
  });

  it("every bridge lies in a block of its own", () => {
    const graph = bowtieWithTail();
    const b = biconnectivityOf(graph);
    for (let i = 0; i < b.bridges.count; i++) {
      const edgeIndex = edgeIndexOf(graph, b.bridges.sourceNodes[i], b.bridges.targetNodes[i]);
      expect(b.blocks.sizeOf(b.blocks.get(edgeIndex))).toBe(1);
    }
  });

  it("self-loops are unmapped", () => {
    const b = biconnectivityOf(TestGraphs.of(3, 0, 1, 1, 1, 1, 2, 2, 0));
    expect(b.blocks.isPartial).toBe(true);
    expect(b.blocks.get(1)).toBe(-1);
    expect(b.blocks.mappedCount).toBe(3);
    expect(b.bridges.isEmpty).toBe(true);
    expect(b.articulationPoints.isEmpty).toBe(true);
  });

  it("blocks are total without self-loops", () => {
    const b = biconnectivityOf(TestGraphs.cycle(5));
    expect(b.blocks.isPartial).toBe(false);
    expect(b.blocks.mappedCount).toBe(5);
  });

  it("a graph of only self-loops has nothing", () => {
    const b = biconnectivityOf(TestGraphs.of(3, 0, 0, 1, 1, 2, 2));
    expect(b.bridges.isEmpty).toBe(true);
    expect(b.articulationPoints.isEmpty).toBe(true);
    expect(b.blocks.groupCount).toBe(0);
    expect(b.blocks.mappedCount).toBe(0);
  });

  it("isolated nodes are neither articulation points nor blocks", () => {
    const b = biconnectivityOf(TestGraphs.isolated(4));
    expect(b.bridges.isEmpty).toBe(true);
    expect(b.articulationPoints.isEmpty).toBe(true);
    expect(b.blocks.groupCount).toBe(0);
  });

  it("the empty graph has nothing", () => {
    const b = biconnectivityOf(TestGraphs.empty());
    expect(b.bridges.isEmpty).toBe(true);
    expect(b.articulationPoints.isEmpty).toBe(true);
    expect(b.blocks.groupCount).toBe(0);
    expect(b.blocks.edgeCount).toBe(0);
  });

  it("a clique has no articulation point", () => {
    const b = biconnectivityOf(TestGraphs.clique(5));
    expect(b.articulationPoints.isEmpty).toBe(true);
    expect(b.bridges.isEmpty).toBe(true);
    expect(b.blocks.groupCount).toBe(1);
  });

  it("separate components are handled independently", () => {
    const b = biconnectivityOf(TestGraphs.of(5, 0, 1, 2, 3, 3, 4, 4, 2));
    expect(ints(b.bridges.sourceNodes)).toEqual([0]);
    expect(ints(b.bridges.targetNodes)).toEqual([1]);
    expect(b.articulationPoints.isEmpty).toBe(true);
    expect(b.blocks.groupCount).toBe(2);
  });

  it("is reached through Components.biconnectivityOf on a deep path without overflowing the stack", () => {
    const n = 200_000;
    const b = biconnectivityOf(TestGraphs.path(n));
    expect(b.bridges.count).toBe(n - 1);
    expect(b.articulationPoints.size).toBe(n - 2);
    expect(b.blocks.groupCount).toBe(n - 1);
  });
});
