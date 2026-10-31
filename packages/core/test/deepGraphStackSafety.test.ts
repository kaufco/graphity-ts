/**
 * Regression guard for the iterative DFS cores: on very deep graphs (DFS depth 10^6) no algorithm
 * may overflow the call stack. JavaScript engines allow far less recursion than a JVM thread, so a
 * single recursive step anywhere would fail here.
 */

import { describe, expect, it } from "vitest";
import {
  Ancestry,
  BackEdges,
  BiAdjacentGraph,
  Components,
  Dominators,
  EdgeTypes,
  GraphBuilder,
  Graphs,
  NodeMapping,
  PreorderAncestry,
  TopOrder,
} from "../src/index.js";
import { expectArgumentError } from "./testutils/assertions.js";
import { TestGraphs } from "./testutils/testGraphs.js";

const DEEP = 1_000_000;

/** Generous limit for the million-node cases on a slow machine. */
const TIMEOUT = 60_000;

describe("DeepGraphStackSafetyTest", () => {
  it(
    "deepPathDoesNotOverflowStack",
    () => {
      // 0 -> 1 -> ... -> DEEP-1: a single chain, DFS descends DEEP levels deep.
      const path = TestGraphs.path(DEEP);
      expect(() => {
        Components.sccsOf(path);
        TopOrder.of(path);
        BackEdges.of(path);
        EdgeTypes.of(path);
        Graphs.isDag(path);
        NodeMapping.reindex(path);
      }).not.toThrow();
    },
    TIMEOUT,
  );

  it(
    "deepAncestryDoesNotOverflowStack",
    () => {
      // A chain of DEEP nodes is one heavy path; construction and queries must stay iterative.
      const path = TestGraphs.path(DEEP);
      const ancestry = Ancestry.of(path);
      expect(ancestry.depthOf(DEEP - 1)).toBe(DEEP - 1);
      expect(ancestry.lowestCommonAncestorOf(DEEP - 1, DEEP / 2)).toBe(DEEP / 2);
      expect(ancestry.isAncestorOf(0, DEEP - 1)).toBe(true);

      const preorder = PreorderAncestry.of(ancestry);
      expect(preorder.subtreeSizeOf(0)).toBe(DEEP);
      expect(preorder.preorderIndexOf(DEEP - 1)).toBe(DEEP - 1);
      expect(preorder.isAncestorOf(DEEP / 2, DEEP - 1)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "deepDominatorsDoNotOverflowStack",
    () => {
      // A chain makes both the search and the dominator tree DEEP levels deep, and path
      // compression walks the full depth.
      const path = BiAdjacentGraph.of(TestGraphs.path(DEEP));
      const dominators = Dominators.of(path, 0);
      expect(dominators.immediateDominatorOf(DEEP - 1)).toBe(DEEP - 2);
      expect(Graphs.dominatorTree(dominators).edgeCount).toBe(DEEP - 1);
      expect(Ancestry.of(dominators).isAncestorOf(0, DEEP - 1)).toBe(true);

      // Back edges from the end of the chain to every 1000th node force long compressions.
      const builder = new GraphBuilder();
      builder.addNodes(DEEP);
      for (let i = 0; i + 1 < DEEP; i++) builder.addEdge(i, i + 1);
      for (let i = 0; i < DEEP; i += 1000) builder.addEdge(DEEP - 1, i);
      const looped = Dominators.of(BiAdjacentGraph.of(builder.build()), 0);
      expect(looped.immediateDominatorOf(DEEP - 1)).toBe(DEEP - 2);
    },
    TIMEOUT,
  );

  it(
    "deepBiconnectivityDoesNotOverflowStack",
    () => {
      // Every edge of a path is a bridge and its own block, so the traversal descends DEEP levels
      // before the first block closes.
      const path = TestGraphs.path(DEEP);
      const biconnectivity = Components.biconnectivityOf(BiAdjacentGraph.of(path));
      expect(biconnectivity.bridges.count).toBe(DEEP - 1);
      expect(biconnectivity.articulationPoints.size).toBe(DEEP - 2);
      expect(biconnectivity.blocks.groupCount).toBe(DEEP - 1);
    },
    TIMEOUT,
  );

  it(
    "deepStrongConnectivityDoesNotOverflowStack",
    () => {
      // One cycle of DEEP nodes: both dominator searches descend DEEP levels, and every edge and
      // node is critical.
      const cycle = TestGraphs.cycle(DEEP);
      const strong = Components.strongConnectivityOf(BiAdjacentGraph.of(cycle));
      expect(strong.strongBridges.count).toBe(DEEP);
      expect(strong.strongArticulationPoints.size).toBe(DEEP);
    },
    TIMEOUT,
  );

  it(
    "deepCycleDoesNotOverflowStack",
    () => {
      // One giant SCC: DFS descends DEEP levels, then a single back edge closes the cycle.
      const cycle = TestGraphs.cycle(DEEP);
      const sccs = Components.sccsOf(cycle);
      expect(sccs.groupCount).toBe(1);
      expect(sccs.isStronglyConnected).toBe(true);

      expect(() => {
        BackEdges.of(cycle);
        EdgeTypes.of(cycle);
        NodeMapping.reindex(cycle);
      }).not.toThrow();

      expect(Graphs.isDag(cycle)).toBe(false);

      // A cycle has no topological order: the documented argument error, never a stack overflow.
      expectArgumentError(() => TopOrder.of(cycle), "graph contains a cycle");
    },
    TIMEOUT,
  );
});
