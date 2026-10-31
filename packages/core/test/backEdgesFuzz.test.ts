/**
 * Cross-validates BackEdges.of against the independent recursive classifier and against the
 * invariant "removing all back edges yields a DAG".
 */

import { describe, expect, it } from "vitest";
import { BackEdges, EdgeType, type Edges, type Graph, GraphBuilder, Graphs } from "../src/index.js";
import { naiveEdgeTypes, naiveHasCycle } from "./testutils/naive.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";
import { pairSet } from "./testutils/traversalHelpers.js";

const ITERATIONS = 100;
const BASE_SEED = 0xbeef0beefn;

function naiveBackEdgePairs(graph: Graph): Set<string> {
  const types = naiveEdgeTypes(graph);
  const pairs = new Set<string>();
  graph.forEachEdge((source, target, edgeIndex) => {
    if (types[edgeIndex] === EdgeType.BACK) pairs.add(`${source}->${target}`);
  });
  return pairs;
}

function removeBackEdges(graph: Graph, backEdges: Edges): Graph {
  const backSet = pairSet(backEdges);
  const builder = new GraphBuilder();
  builder.addNodes(graph.nodeCount);
  graph.forEachEdge((u, v) => {
    if (!backSet.has(`${u}->${v}`)) builder.addEdge(u, v);
  });
  return builder.build();
}

describe("BackEdgesFuzzTest", () => {
  it("backEdgesMatchNaiveClassifierOnRandomGraphs", () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const labeled = RandomGraphs.anyGraph(BASE_SEED + BigInt(i));
      const g = labeled.graph;
      const backEdges = BackEdges.of(g);
      expect(pairSet(backEdges), `back edges vs naive oracle for ${labeled.describe()}`).toEqual(naiveBackEdgePairs(g));
      // Every position names its edge by index.
      for (let p = 0; p < backEdges.count; p++) {
        expect(g.edgeIndexOf(backEdges.sourceNodes[p], backEdges.targetNodes[p])).toBe(backEdges.edgeIndices[p]);
      }
    }
  });

  it("removingBackEdgesYieldsDagOnRandomGraphs", () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const labeled = RandomGraphs.anyGraph(BASE_SEED + BigInt(i));
      const reduced = removeBackEdges(labeled.graph, BackEdges.of(labeled.graph));
      expect(Graphs.isDag(reduced), `removing back edges yields a DAG for ${labeled.describe()}`).toBe(true);
      expect(naiveHasCycle(reduced), labeled.describe()).toBe(false);
    }
  });

  it("backEdgeCountZeroIffDag", () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const labeled = RandomGraphs.anyGraph(BASE_SEED + BigInt(i));
      const g = labeled.graph;
      expect(BackEdges.of(g).count === 0, labeled.describe()).toBe(Graphs.isDag(g));
    }
  });
});
