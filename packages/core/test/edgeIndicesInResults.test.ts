/**
 * Every result that lists edges names each by its edge index, and that index is the edge at the
 * same position: same source, same target.
 */

import { describe, expect, it } from "vitest";
import { BackEdges, BiAdjacentGraph, Components, Edges, EdgeType, EdgeTypes, type Graph } from "../src/index.js";
import { ints } from "./testutils/assertions.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";
import { TestGraphs } from "./testutils/testGraphs.js";

const ITERATIONS = 200;

function assertConsistent(graph: Graph, edges: Edges, describe: string): void {
  expect(edges.edgeIndices.length, describe).toBe(edges.count);
  expect(edges.sourceNodes.length, describe).toBe(edges.count);
  expect(edges.targetNodes.length, describe).toBe(edges.count);
  for (let p = 0; p < edges.count; p++) {
    const edgeIndex = edges.edgeIndices[p];
    expect(edgeIndex, `${describe}, position ${p}`).toBe(graph.edgeIndexOf(edges.sourceNodes[p], edges.targetNodes[p]));
    expect(edgeIndex).toBeGreaterThanOrEqual(0);
  }
}

function assertAscending(edges: Edges, describe: string): void {
  for (let p = 1; p < edges.count; p++) {
    expect(edges.edgeIndices[p], describe).toBeGreaterThan(edges.edgeIndices[p - 1]);
  }
}

describe("EdgeIndicesInResultsTest", () => {
  it("every producer reports the edge at each position", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const labeled = RandomGraphs.anyGraph(seed);
      const graph = labeled.graph;
      const bi = BiAdjacentGraph.of(graph);
      const describe = labeled.describe();

      assertConsistent(graph, BackEdges.of(graph), `back edges, ${describe}`);

      const types = EdgeTypes.of(graph);
      for (const [name, type] of Object.entries(EdgeType)) {
        const edges = Edges.of(types, type);
        assertConsistent(graph, edges, `${name}, ${describe}`);
        assertAscending(edges, `${name}, ${describe}`);
      }

      const bridges = Components.biconnectivityOf(bi).bridges;
      assertConsistent(graph, bridges, `bridges, ${describe}`);
      assertAscending(bridges, `bridges, ${describe}`);

      const strongBridges = Components.strongConnectivityOf(bi).strongBridges;
      assertConsistent(graph, strongBridges, `strong bridges, ${describe}`);
      assertAscending(strongBridges, `strong bridges, ${describe}`);
    }
  }, 60_000);

  it("back edge indices reach edge data", () => {
    // 0 -> 1 -> 2 -> 0, 2 -> 1: two back edges.
    const graph = TestGraphs.of(3, 0, 1, 1, 2, 2, 0, 2, 1);
    const weights = [1.0, 2.0, 3.0, 4.0]; // by edge index: 0->1, 1->2, 2->0, 2->1
    const back = BackEdges.of(graph);
    let total = 0;
    for (let p = 0; p < back.count; p++) total += weights[back.edgeIndices[p]];
    expect(total).toBe(3.0 + 4.0);
  });

  it("a bridge stored in both directions is reported from the lower node", () => {
    // 0 <-> 1 is a bridge stored twice; 1 -> 2 -> 3 -> 1 is a cycle.
    const graph = BiAdjacentGraph.of(TestGraphs.of(4, 0, 1, 1, 0, 1, 2, 2, 3, 3, 1));
    const bridges = Components.biconnectivityOf(graph).bridges;
    expect(bridges.count).toBe(1);
    expect(bridges.sourceNodes[0]).toBe(0);
    expect(bridges.targetNodes[0]).toBe(1);
    expect(bridges.edgeIndices[0]).toBe(graph.edgeIndexOf(0, 1));
  });

  it("a bridge stored only from the higher node keeps its direction", () => {
    // 2 -> 0 and 2 -> 1: both bridges, both stored from the higher node.
    const graph = BiAdjacentGraph.of(TestGraphs.of(3, 2, 0, 2, 1));
    const bridges = Components.biconnectivityOf(graph).bridges;
    expect(ints(bridges.sourceNodes)).toEqual([2, 2]);
    expect(ints(bridges.targetNodes)).toEqual([0, 1]);
    expect(ints(bridges.edgeIndices)).toEqual([0, 1]);
  });
});
