/**
 * Counterpart of Java's `GraphsFuzzTest`: the shape predicates of `Graphs` against independent
 * references. Where Java asks JGraphT, the naive oracles of `testutils/naive.ts` answer: cycle
 * detection by reachability, connectivity and two-coloring over the undirected reading with
 * reciprocal pairs collapsed and self-loops dropped. As in Java, graphs with a self-loop are left
 * out of the bipartite comparison, because that oracle reading drops them.
 */

import { describe, expect, it } from "vitest";
import { Components, type Graph, Graphs } from "../src/index.js";
import { JavaRandom } from "./testutils/javaRandom.js";
import { naiveHasCycle, naiveIsBipartite, naiveWccs, undirectedAdjacency } from "./testutils/naive.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";

const ITERATIONS = 100;
const BASE_SEED = 0x15da6edn;

const seeds = Array.from({ length: ITERATIONS }, (_, i) => BASE_SEED + BigInt(i));

function inDegrees(graph: Graph): number[] {
  const inDeg = new Array<number>(graph.nodeCount).fill(0);
  for (let u = 0; u < graph.nodeCount; u++) {
    for (let e = graph.outEdgeStart(u); e < graph.outEdgeEnd(u); e++) inDeg[graph.edgeTarget(e)]++;
  }
  return inDeg;
}

/** A forest: a DAG where every node has in-degree <= 1. */
function isForestReference(graph: Graph): boolean {
  return !naiveHasCycle(graph) && inDegrees(graph).every((d) => d <= 1);
}

/** A tree: a forest with exactly one root, or the empty graph. */
function isTreeReference(graph: Graph): boolean {
  if (!isForestReference(graph)) return false;
  if (graph.nodeCount === 0) return true;
  return inDegrees(graph).filter((d) => d === 0).length === 1;
}

/** A path: a tree where every node has out-degree <= 1. */
function isPathReference(graph: Graph): boolean {
  if (!isTreeReference(graph)) return false;
  for (let v = 0; v < graph.nodeCount; v++) if (graph.outEdgeEnd(v) - graph.outEdgeStart(v) > 1) return false;
  return true;
}

/** Number of undirected edges: reciprocal pairs once, self-loops not at all. */
function undirectedEdgeCount(graph: Graph): number {
  return undirectedAdjacency(graph).reduce((sum, list) => sum + list.length, 0) / 2;
}

/** Undirected forest: as many undirected edges as nodes minus components. */
function isUndirectedForestReference(graph: Graph): boolean {
  return undirectedEdgeCount(graph) === graph.nodeCount - naiveWccs(graph).length;
}

/** Undirected tree: a connected undirected forest; the empty graph included. */
function isUndirectedTreeReference(graph: Graph): boolean {
  return naiveWccs(graph).length <= 1 && isUndirectedForestReference(graph);
}

function containsSelfLoop(graph: Graph): boolean {
  for (let v = 0; v < graph.nodeCount; v++) if (graph.containsSelfLoop(v)) return true;
  return false;
}

describe("GraphsFuzzTest", () => {
  it("isDag agrees with cycle detection by reachability", () => {
    for (const seed of seeds) {
      const labeled = RandomGraphs.anyGraph(seed);
      expect(Graphs.isDag(labeled.graph), `isDag mismatch for ${labeled.describe()}`).toBe(
        !naiveHasCycle(labeled.graph),
      );
    }
  });

  it("isForest agrees with the definition", () => {
    for (const seed of seeds) {
      const labeled = RandomGraphs.anyGraph(seed);
      expect(Graphs.isForest(labeled.graph), `isForest mismatch for ${labeled.describe()}`).toBe(
        isForestReference(labeled.graph),
      );
    }
  });

  it("isTree agrees with the definition", () => {
    for (const seed of seeds) {
      const labeled = RandomGraphs.anyGraph(seed);
      expect(Graphs.isTree(labeled.graph), `isTree mismatch for ${labeled.describe()}`).toBe(
        isTreeReference(labeled.graph),
      );
    }
  });

  it("isPath agrees with the definition", () => {
    for (const seed of seeds) {
      const labeled = RandomGraphs.anyGraph(seed);
      expect(Graphs.isPath(labeled.graph), `isPath mismatch for ${labeled.describe()}`).toBe(
        isPathReference(labeled.graph),
      );
    }
  });

  it("keeps the shape hierarchy", () => {
    for (const seed of seeds) {
      const labeled = RandomGraphs.anyGraph(seed);
      const g = labeled.graph;
      if (Graphs.isPath(g)) expect(Graphs.isTree(g), `isPath => isTree for ${labeled.describe()}`).toBe(true);
      if (Graphs.isTree(g)) expect(Graphs.isForest(g), `isTree => isForest for ${labeled.describe()}`).toBe(true);
      if (Graphs.isForest(g)) expect(Graphs.isDag(g), `isForest => isDag for ${labeled.describe()}`).toBe(true);
    }
  });

  it("isBipartite agrees with two-coloring", () => {
    let bipartite = 0;
    let notBipartite = 0;
    for (const seed of seeds) {
      const labeled = RandomGraphs.anyUndirectedShape(seed);
      const g = labeled.graph;
      if (containsSelfLoop(g)) continue; // the oracle reading drops self-loops, see the file comment
      const ours = Graphs.isBipartite(g);
      expect(ours, `isBipartite mismatch for ${labeled.describe()}`).toBe(naiveIsBipartite(g));
      if (ours) bipartite++;
      else notBipartite++;
    }
    // Without both outcomes the comparison would pass on agreement about nothing.
    expect(bipartite, "no bipartite graph was generated").toBeGreaterThan(0);
    expect(notBipartite, "no non-bipartite graph was generated").toBeGreaterThan(0);
  });

  it("isUndirectedTree agrees with the definition", () => {
    let trees = 0;
    let nonTrees = 0;
    for (const seed of seeds) {
      const labeled = RandomGraphs.anyUndirectedShape(seed);
      const ours = Graphs.isUndirectedTree(labeled.graph);
      expect(ours, `isUndirectedTree mismatch for ${labeled.describe()}`).toBe(
        isUndirectedTreeReference(labeled.graph),
      );
      if (ours) trees++;
      else nonTrees++;
    }
    expect(trees, "no undirected tree was generated").toBeGreaterThan(0);
    expect(nonTrees, "no non-tree was generated").toBeGreaterThan(0);
  });

  it("isUndirectedForest agrees with the definition", () => {
    let forests = 0;
    let nonForests = 0;
    for (const seed of seeds) {
      const labeled = RandomGraphs.anyUndirectedShape(seed);
      const ours = Graphs.isUndirectedForest(labeled.graph);
      expect(ours, `isUndirectedForest mismatch for ${labeled.describe()}`).toBe(
        isUndirectedForestReference(labeled.graph),
      );
      if (ours) forests++;
      else nonForests++;
    }
    expect(forests, "no undirected forest was generated").toBeGreaterThan(0);
    expect(nonForests, "no graph with an undirected cycle was generated").toBeGreaterThan(0);
  });

  it("isStronglyConnected agrees with the SCCs", () => {
    let connected = 0;
    let notConnected = 0;
    for (const seed of seeds) {
      const labeled = RandomGraphs.anyGraph(seed);
      const g = labeled.graph;
      const ours = Graphs.isStronglyConnected(g);
      expect(ours, `isStronglyConnected mismatch vs sccsOf for ${labeled.describe()}`).toBe(
        Components.sccsOf(g).isStronglyConnected,
      );
      const symmetric = RandomGraphs.symmetrized(g);
      expect(
        Graphs.isStronglyConnected(symmetric),
        `symmetrized ${labeled.describe()}: strongly connected exactly if weakly`,
      ).toBe(Graphs.isWeaklyConnected(g));
      if (ours) connected++;
      else notConnected++;
    }
    expect(notConnected, "no graph with several components was generated").toBeGreaterThan(0);
    const random = new JavaRandom(BASE_SEED);
    for (let i = 0; i < ITERATIONS; i++) {
      const n = 2 + random.nextInt(10);
      const p = 0.3 + random.nextDouble() * 0.5;
      const g = RandomGraphs.gnp(n, p, random.nextLong());
      const ours = Graphs.isStronglyConnected(g);
      expect(ours, `dense gnp ${i}`).toBe(Components.sccsOf(g).isStronglyConnected);
      if (ours) connected++;
    }
    expect(connected, "no strongly connected graph was generated").toBeGreaterThan(0);
  });

  it("isWeaklyConnected agrees with undirected connectivity", () => {
    for (const seed of seeds) {
      const labeled = RandomGraphs.anyUndirectedShape(seed);
      expect(Graphs.isWeaklyConnected(labeled.graph), `isWeaklyConnected mismatch for ${labeled.describe()}`).toBe(
        naiveWccs(labeled.graph).length <= 1,
      );
    }
  });

  it("isWeaklyConnected agrees with the weakly connected components", () => {
    for (const seed of seeds) {
      const labeled = RandomGraphs.anyGraph(seed);
      expect(
        Graphs.isWeaklyConnected(labeled.graph),
        `isWeaklyConnected disagrees with wccsOf for ${labeled.describe()}`,
      ).toBe(Components.wccsOf(labeled.graph).groupCount <= 1);
    }
  });

  it("keeps the undirected shape hierarchy", () => {
    for (const seed of seeds) {
      const labeled = RandomGraphs.anyUndirectedShape(seed);
      const g = labeled.graph;
      const d = labeled.describe();
      if (Graphs.isTree(g)) expect(Graphs.isUndirectedTree(g), `isTree => isUndirectedTree for ${d}`).toBe(true);
      if (Graphs.isForest(g))
        expect(Graphs.isUndirectedForest(g), `isForest => isUndirectedForest for ${d}`).toBe(true);
      if (Graphs.isUndirectedTree(g)) {
        expect(Graphs.isUndirectedForest(g), `isUndirectedTree => isUndirectedForest for ${d}`).toBe(true);
        expect(Graphs.isWeaklyConnected(g), `isUndirectedTree => isWeaklyConnected for ${d}`).toBe(true);
        // Only without self-loops: the tree ignores them, isBipartite does not.
        if (!containsSelfLoop(g)) expect(Graphs.isBipartite(g), `isUndirectedTree => isBipartite for ${d}`).toBe(true);
      }
    }
  });
});
