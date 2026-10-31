/** Counterpart of Java's `GraphsTest`: the transformations and shape checks of `Graphs`. */

import { describe, expect, it } from "vitest";
import {
  BiAdjacentGraph,
  BitSet,
  Components,
  Dominators,
  type Graph,
  GraphBuilder,
  Graphs,
  NodeMapping,
  NodePartition,
} from "../src/index.js";
import { expectArgumentError, expectIndexError, ints } from "./testutils/assertions.js";
import { JavaRandom } from "./testutils/javaRandom.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";
import { TestGraphs } from "./testutils/testGraphs.js";

const of = TestGraphs.of;

/** Whether `v` is reachable from `u` by a non-empty path, for every pair. */
function reachability(graph: Graph): boolean[][] {
  const n = graph.nodeCount;
  const reach: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  for (let u = 0; u < n; u++) {
    const queue: number[] = [];
    for (const t of graph.outNodes(u)) {
      if (!reach[u][t]) {
        reach[u][t] = true;
        queue.push(t);
      }
    }
    for (let i = 0; i < queue.length; i++) {
      for (const t of graph.outNodes(queue[i])) {
        if (!reach[u][t]) {
          reach[u][t] = true;
          queue.push(t);
        }
      }
    }
  }
  return reach;
}

/** A permutation of `0..n-1` by Fisher-Yates over `java.util.Random(seed)`, as the Java test. */
function shuffled(n: number, seed: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  const random = new JavaRandom(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = random.nextInt(i + 1);
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  return order;
}

function expectIsCycle(graph: Graph, cycle: Int32Array): void {
  expect(cycle.length).toBeGreaterThan(0);
  for (let k = 0; k < cycle.length; k++) {
    const from = cycle[k];
    const to = cycle[(k + 1) % cycle.length];
    expect(graph.hasOutNode(from, to), `edge ${from} -> ${to} of ${ints(cycle)}`).toBe(true);
  }
  expect(new Set(cycle).size).toBe(cycle.length);
}

describe("GraphsTest", () => {
  describe("shape checks", () => {
    it("isDag is true for the empty graph, isolated nodes, a path and a diamond", () => {
      expect(Graphs.isDag(TestGraphs.empty())).toBe(true);
      expect(Graphs.isDag(TestGraphs.isolated(5))).toBe(true);
      expect(Graphs.isDag(TestGraphs.path(10))).toBe(true);
      expect(Graphs.isDag(of(4, 0, 1, 0, 2, 1, 3, 2, 3))).toBe(true);
    });

    it("isDag is false for a cycle", () => {
      expect(Graphs.isDag(TestGraphs.cycle(3))).toBe(false);
    });

    it("isDag is false for a self-loop", () => {
      expect(Graphs.isDag(of(1, 0, 0))).toBe(false);
    });

    it("isDag is false for a cycle between otherwise DAG components", () => {
      expect(Graphs.isDag(of(4, 0, 1, 2, 3, 3, 2))).toBe(false);
    });

    it("isForest is true for the empty graph, isolated nodes, an out-star, a path and disjoint trees", () => {
      expect(Graphs.isForest(TestGraphs.empty())).toBe(true);
      expect(Graphs.isForest(TestGraphs.isolated(3))).toBe(true);
      expect(Graphs.isForest(TestGraphs.outStar(5))).toBe(true);
      expect(Graphs.isForest(TestGraphs.path(5))).toBe(true);
      expect(Graphs.isForest(of(5, 0, 1, 0, 2, 3, 4))).toBe(true);
    });

    it("isForest is false for a diamond and an in-star", () => {
      expect(Graphs.isForest(of(4, 0, 1, 0, 2, 1, 3, 2, 3))).toBe(false);
      expect(Graphs.isForest(TestGraphs.inStar(4))).toBe(false);
    });

    it("isTree is true for the empty graph, a single node, a path and an out-star", () => {
      expect(Graphs.isTree(TestGraphs.empty())).toBe(true);
      expect(Graphs.isTree(TestGraphs.isolated(1))).toBe(true);
      expect(Graphs.isTree(TestGraphs.path(5))).toBe(true);
      expect(Graphs.isTree(TestGraphs.outStar(5))).toBe(true);
    });

    it("isTree is false for disjoint trees, several isolated nodes and an in-star", () => {
      expect(Graphs.isTree(of(4, 0, 1, 2, 3))).toBe(false);
      expect(Graphs.isTree(TestGraphs.isolated(3))).toBe(false);
      expect(Graphs.isTree(TestGraphs.inStar(4))).toBe(false);
    });

    it("isPath is true for the empty graph, a single node and a chain", () => {
      expect(Graphs.isPath(TestGraphs.empty())).toBe(true);
      expect(Graphs.isPath(TestGraphs.isolated(1))).toBe(true);
      expect(Graphs.isPath(TestGraphs.path(5))).toBe(true);
    });

    it("isPath is false for an out-star", () => {
      expect(Graphs.isPath(TestGraphs.outStar(5))).toBe(false);
    });

    it("keeps the shape hierarchy for a cycle", () => {
      const g = TestGraphs.cycle(3);
      expect(Graphs.isDag(g)).toBe(false);
      expect(Graphs.isForest(g)).toBe(false);
      expect(Graphs.isTree(g)).toBe(false);
      expect(Graphs.isPath(g)).toBe(false);
    });

    it("keeps the shape hierarchy for a path", () => {
      const g = TestGraphs.path(4);
      expect(Graphs.isDag(g)).toBe(true);
      expect(Graphs.isForest(g)).toBe(true);
      expect(Graphs.isTree(g)).toBe(true);
      expect(Graphs.isPath(g)).toBe(true);
    });
  });

  describe("undirected shape checks", () => {
    it("isBipartite is true for the empty graph, isolated nodes, a path and stars", () => {
      expect(Graphs.isBipartite(TestGraphs.empty())).toBe(true);
      expect(Graphs.isBipartite(TestGraphs.isolated(3))).toBe(true);
      expect(Graphs.isBipartite(TestGraphs.path(5))).toBe(true);
      expect(Graphs.isBipartite(TestGraphs.outStar(5))).toBe(true);
      expect(Graphs.isBipartite(TestGraphs.inStar(5))).toBe(true);
    });

    it("isBipartite tells even from odd cycles", () => {
      expect(Graphs.isBipartite(TestGraphs.cycle(4))).toBe(true);
      expect(Graphs.isBipartite(TestGraphs.cycle(3))).toBe(false);
    });

    it("isBipartite reads a reciprocal pair as one edge", () => {
      expect(Graphs.isBipartite(of(2, 0, 1, 1, 0))).toBe(true);
    });

    it("isBipartite is false for a symmetrically stored odd cycle", () => {
      expect(Graphs.isBipartite(of(3, 0, 1, 1, 0, 1, 2, 2, 1, 0, 2, 2, 0))).toBe(false);
    });

    it("isBipartite is false for a self-loop", () => {
      expect(Graphs.isBipartite(of(1, 0, 0))).toBe(false);
      expect(Graphs.isBipartite(of(3, 0, 1, 1, 2, 2, 2))).toBe(false);
    });

    it("isUndirectedTree is true for the empty graph, a single node and a path", () => {
      expect(Graphs.isUndirectedTree(TestGraphs.empty())).toBe(true);
      expect(Graphs.isUndirectedTree(TestGraphs.isolated(1))).toBe(true);
      expect(Graphs.isUndirectedTree(TestGraphs.path(5))).toBe(true);
    });

    it("isUndirectedTree is true for an in-star, which is no directed tree", () => {
      const g = TestGraphs.inStar(4);
      expect(Graphs.isTree(g)).toBe(false);
      expect(Graphs.isUndirectedTree(g)).toBe(true);
    });

    it("isUndirectedTree is true for mixed directions", () => {
      const g = of(3, 0, 1, 2, 1);
      expect(Graphs.isDag(g)).toBe(true);
      expect(Graphs.isForest(g)).toBe(false);
      expect(Graphs.isUndirectedTree(g)).toBe(true);
    });

    it("isUndirectedTree is true for a symmetrically stored path", () => {
      const g = of(3, 0, 1, 1, 0, 1, 2, 2, 1);
      expect(Graphs.isDag(g)).toBe(false);
      expect(Graphs.isUndirectedTree(g)).toBe(true);
    });

    it("isUndirectedTree is true for a reciprocal pair", () => {
      expect(Graphs.isUndirectedTree(of(2, 0, 1, 1, 0))).toBe(true);
    });

    it("isUndirectedTree ignores self-loops", () => {
      expect(Graphs.isUndirectedTree(of(3, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2))).toBe(true);
    });

    it("isUndirectedTree is false for a disconnected graph", () => {
      expect(Graphs.isUndirectedTree(TestGraphs.isolated(3))).toBe(false);
      expect(Graphs.isUndirectedTree(of(4, 0, 1, 2, 3))).toBe(false);
    });

    it("isUndirectedTree is false for a cycle", () => {
      expect(Graphs.isUndirectedTree(TestGraphs.cycle(3))).toBe(false);
    });

    it("isUndirectedTree and isUndirectedForest are false for a symmetrically stored cycle", () => {
      const g = of(3, 0, 1, 1, 0, 1, 2, 2, 1, 0, 2, 2, 0);
      expect(Graphs.isUndirectedTree(g)).toBe(false);
      expect(Graphs.isUndirectedForest(g)).toBe(false);
    });

    it("isUndirectedTree is true at the edge bound", () => {
      const g = of(4, 0, 0, 0, 1, 1, 0, 1, 1, 1, 2, 2, 1, 2, 2, 2, 3, 3, 2, 3, 3);
      expect(g.edgeCount).toBe(3 * g.nodeCount - 2);
      expect(Graphs.isUndirectedTree(g)).toBe(true);
    });

    it("isUndirectedTree is false for a diamond", () => {
      expect(Graphs.isUndirectedTree(of(4, 0, 1, 0, 2, 1, 3, 2, 3))).toBe(false);
    });

    it("isUndirectedForest is true for the empty graph, isolated nodes and disjoint trees", () => {
      expect(Graphs.isUndirectedForest(TestGraphs.empty())).toBe(true);
      expect(Graphs.isUndirectedForest(TestGraphs.isolated(3))).toBe(true);
      expect(Graphs.isUndirectedForest(of(5, 0, 1, 0, 2, 3, 4))).toBe(true);
    });

    it("isUndirectedForest is true for an in-star, which is no directed forest", () => {
      const g = TestGraphs.inStar(4);
      expect(Graphs.isForest(g)).toBe(false);
      expect(Graphs.isUndirectedForest(g)).toBe(true);
    });

    it("isUndirectedForest is true for self-loops only", () => {
      expect(Graphs.isUndirectedForest(of(2, 0, 0, 1, 1))).toBe(true);
    });

    it("isUndirectedForest is false for a cycle and a diamond", () => {
      expect(Graphs.isUndirectedForest(TestGraphs.cycle(3))).toBe(false);
      expect(Graphs.isUndirectedForest(of(4, 0, 1, 0, 2, 1, 3, 2, 3))).toBe(false);
    });

    it("rejects a clique by the edge bound", () => {
      expect(Graphs.isUndirectedForest(TestGraphs.clique(5))).toBe(false);
      expect(Graphs.isUndirectedTree(TestGraphs.clique(5))).toBe(false);
    });

    it("isStronglyConnected is true for the empty graph and a single node", () => {
      expect(Graphs.isStronglyConnected(TestGraphs.empty())).toBe(true);
      expect(Graphs.isStronglyConnected(TestGraphs.isolated(1))).toBe(true);
    });

    it("isStronglyConnected on cycles and paths", () => {
      expect(Graphs.isStronglyConnected(TestGraphs.cycle(5))).toBe(true);
      expect(Graphs.isStronglyConnected(TestGraphs.clique(4))).toBe(true);
      expect(Graphs.isStronglyConnected(TestGraphs.path(5))).toBe(false);
      expect(Graphs.isStronglyConnected(TestGraphs.isolated(2))).toBe(false);
    });

    it("isStronglyConnected is false when node 0 reaches all but not back", () => {
      expect(Graphs.isStronglyConnected(of(3, 0, 1, 1, 0, 1, 2))).toBe(false);
      expect(Graphs.isStronglyConnected(of(2, 1, 0))).toBe(false);
    });

    it("isStronglyConnected on a deep cycle", () => {
      expect(Graphs.isStronglyConnected(TestGraphs.cycle(1_000_000))).toBe(true);
      expect(Graphs.isStronglyConnected(TestGraphs.path(1_000_000))).toBe(false);
    });

    it("isWeaklyConnected is true for the empty graph and a single node", () => {
      expect(Graphs.isWeaklyConnected(TestGraphs.empty())).toBe(true);
      expect(Graphs.isWeaklyConnected(TestGraphs.isolated(1))).toBe(true);
    });

    it("isWeaklyConnected is true for a path, stars and a cycle", () => {
      expect(Graphs.isWeaklyConnected(TestGraphs.path(5))).toBe(true);
      expect(Graphs.isWeaklyConnected(TestGraphs.outStar(5))).toBe(true);
      expect(Graphs.isWeaklyConnected(TestGraphs.inStar(5))).toBe(true);
      expect(Graphs.isWeaklyConnected(TestGraphs.cycle(3))).toBe(true);
    });

    it("isWeaklyConnected is false for isolated nodes and two components", () => {
      expect(Graphs.isWeaklyConnected(TestGraphs.isolated(3))).toBe(false);
      expect(Graphs.isWeaklyConnected(of(4, 0, 1, 2, 3))).toBe(false);
    });

    it("isWeaklyConnected ignores self-loops", () => {
      expect(Graphs.isWeaklyConnected(of(2, 0, 0, 1, 1))).toBe(false);
    });
  });

  describe("rootNodes", () => {
    it("returns all sources", () => {
      expect(ints(Graphs.rootNodes(BiAdjacentGraph.of(of(4, 0, 1, 0, 2, 1, 3, 2, 3))))).toEqual([0]);
    });

    it("returns all nodes of an isolated graph", () => {
      expect(ints(Graphs.rootNodes(BiAdjacentGraph.of(TestGraphs.isolated(3))))).toEqual([0, 1, 2]);
    });

    it("is empty on a cycle and on the empty graph", () => {
      expect(Graphs.rootNodes(BiAdjacentGraph.of(TestGraphs.cycle(4))).isEmpty).toBe(true);
      expect(Graphs.rootNodes(BiAdjacentGraph.of(TestGraphs.empty())).isEmpty).toBe(true);
    });

    it("of the transpose are the sinks", () => {
      const g = BiAdjacentGraph.of(of(5, 0, 1, 0, 2, 1, 3, 2, 3, 4, 3));
      expect(ints(Graphs.rootNodes(g))).toEqual([0, 4]);
      expect(ints(Graphs.rootNodes(g.transposed()))).toEqual([3]);
    });
  });

  describe("reachableFrom", () => {
    it("returns the reachable nodes ascending, the source included", () => {
      const g = of(6, 3, 1, 1, 4, 4, 3, 0, 5, 2, 2);
      expect(ints(Graphs.reachableFrom(g, 3))).toEqual([1, 3, 4]);
      expect(ints(Graphs.reachableFrom(g, 2))).toEqual([2]);
      expect(ints(Graphs.reachableFrom(g, [0, 3, 0]))).toEqual([0, 1, 3, 4, 5]);
      expect(ints(Graphs.reachableFrom(g, []))).toEqual([]);
      expect(ints(Graphs.reachableFrom(g, Graphs.reachableFrom(g, 0)))).toEqual([0, 5]);
    });

    it("rejects a source out of range", () => {
      expectIndexError(() => Graphs.reachableFrom(TestGraphs.path(3), 3));
      expectIndexError(() => Graphs.reachableFrom(TestGraphs.path(3), [0, -1]));
      expectIndexError(() => Graphs.reachableFrom(TestGraphs.path(3), 1.5));
      expectIndexError(() => Graphs.reachableFrom(TestGraphs.path(3), undefined as never), "Index undefined");
    });
  });

  describe("remapped", () => {
    it("rejects a mapping to a node outside the graph", () => {
      const g = TestGraphs.path(2);
      expectIndexError(() => Graphs.remapped(g, NodeMapping.of([0, 5])), /5/);
      expectIndexError(() => Graphs.remapped(TestGraphs.path(3), NodeMapping.forSubgraph(0, 9)));
    });

    it("rejects a huge target without allocating for it", () => {
      const g = TestGraphs.path(2);
      expectIndexError(() => Graphs.remapped(g, NodeMapping.of([0, 0x7fffffff])));
      expectIndexError(() => Graphs.remapped(g, NodeMapping.forSubgraph(0, 0x7fffffff)));
    });

    it("rejects an unmapped new node", () => {
      expectArgumentError(() => Graphs.remapped(TestGraphs.path(3), NodeMapping.of([0, -1, 1])), /unmapped/);
    });

    it("rejects two new nodes for one original node", () => {
      expectArgumentError(() => Graphs.remapped(TestGraphs.path(3), NodeMapping.of([0, 2, 0])));
    });

    it("with the identity yields an equal graph", () => {
      const g = of(4, 0, 1, 0, 2, 1, 3, 2, 3);
      expect(Graphs.remapped(g, NodeMapping.forPermutation([0, 1, 2, 3])).equals(g)).toBe(true);
    });

    it("with a permutation preserves node and edge count", () => {
      const g = TestGraphs.path(5);
      const remapped = Graphs.remapped(g, NodeMapping.forPermutation([4, 3, 2, 1, 0]));
      expect(remapped.nodeCount).toBe(g.nodeCount);
      expect(remapped.edgeCount).toBe(g.edgeCount);
    });

    it("with the reverse permutation reverses a path", () => {
      const remapped = Graphs.remapped(TestGraphs.path(3), NodeMapping.forPermutation([2, 1, 0]));
      expect(ints(remapped.outNodes(1))).toEqual([0]);
      expect(ints(remapped.outNodes(2))).toEqual([1]);
      expect(ints(remapped.outNodes(0))).toEqual([]);
    });

    it("with a subgraph drops edges to excluded nodes", () => {
      const selected = new BitSet();
      selected.set(0);
      selected.set(1);
      selected.set(3);
      const sub = Graphs.remapped(TestGraphs.path(4), NodeMapping.forSubgraph(selected));
      expect(sub.nodeCount).toBe(3);
      expect(sub.edgeCount).toBe(1);
      expect(ints(sub.outNodes(0))).toEqual([1]);
    });

    it("with a subgraph drops edges to targets beyond the selection", () => {
      const selected = new BitSet();
      selected.set(0);
      selected.set(1);
      const sub = Graphs.remapped(TestGraphs.path(4), NodeMapping.forSubgraph(selected));
      expect(sub.nodeCount).toBe(2);
      expect(sub.edgeCount).toBe(1);
      expect(ints(sub.outNodes(0))).toEqual([1]);
      expect(ints(sub.outNodes(1))).toEqual([]);
    });

    it("with an empty mapping returns the empty graph", () => {
      const sub = Graphs.remapped(TestGraphs.path(3), NodeMapping.forSubgraph(new BitSet()));
      expect(sub.nodeCount).toBe(0);
      expect(sub.edgeCount).toBe(0);
    });

    it("keeps the adjacency lists sorted", () => {
      const remapped = Graphs.remapped(TestGraphs.outStar(4), NodeMapping.forPermutation([3, 1, 2, 0]));
      expect(ints(remapped.outNodes(3))).toEqual([0, 1, 2]);
    });
  });

  describe("edgeMapping", () => {
    it("maps every edge of a reversed path", () => {
      const g = TestGraphs.path(3);
      const nm = NodeMapping.forPermutation([2, 1, 0]);
      const newGraph = Graphs.remapped(g, nm);
      const em = Graphs.edgeMapping(newGraph, g, nm);
      expect(em.mappedCount).toBe(newGraph.edgeCount);
      for (let i = 0; i < em.mappedCount; i++) {
        expect(em.get(i)).toBeGreaterThanOrEqual(0);
        expect(em.get(i)).toBeLessThan(g.edgeCount);
      }
    });

    it("records holes for edges not in the old graph", () => {
      const em = Graphs.edgeMapping(of(2, 0, 0), TestGraphs.path(2), NodeMapping.forPermutation([0, 1]));
      expect(em.get(0)).toBe(-1);
      expect(em.mappedCount).toBe(0);
      expect(em.isPartial).toBe(true);
    });

    it("of the empty graph has no mapped edge", () => {
      const g = TestGraphs.empty();
      expect(Graphs.edgeMapping(g, g, NodeMapping.of([])).mappedCount).toBe(0);
    });

    it("maps the edges of a new node without old counterpart to -1", () => {
      const newGraph = of(3, 0, 1, 0, 2, 2, 0);
      const em = Graphs.edgeMapping(newGraph, TestGraphs.path(2), NodeMapping.of([0, 1, -1]));
      expect(Array.from({ length: newGraph.edgeCount }, (_, e) => em.get(e))).toEqual([0, -1, -1]);
      expect(em.mappedCount).toBe(1);
      expect(em.isPartial).toBe(true);
    });

    it("from a graph onto its subgraph maps the edges of removed nodes to -1", () => {
      const graph = of(4, 0, 1, 1, 2, 1, 3, 2, 3, 3, 0);
      const keep = NodeMapping.forSubgraph(0, 1, 3);
      const sub = Graphs.remapped(graph, keep);
      const em = Graphs.edgeMapping(graph, sub, keep.inverted(graph.nodeCount));
      expect(Array.from({ length: graph.edgeCount }, (_, e) => em.get(e))).toEqual([0, -1, 1, -1, 2]);
      for (let e = 0; e < graph.edgeCount; e++) {
        const s = em.get(e);
        if (s >= 0) {
          expect(keep.get(sub.edgeSource(s))).toBe(graph.edgeSource(e));
          expect(keep.get(sub.edgeTarget(s))).toBe(graph.edgeTarget(e));
        }
      }
    });

    it("rejects a mapping to a node outside the old graph", () => {
      const oldGraph = TestGraphs.path(2);
      expectIndexError(
        () => Graphs.edgeMapping(of(3, 2, 0), oldGraph, NodeMapping.of([0, 1, 5])),
        /new node 2 maps to 5/,
      );
      expectIndexError(
        () => Graphs.edgeMapping(of(3, 0, 2), oldGraph, NodeMapping.of([0, 1, 2])),
        /new node 2 maps to 2/,
      );
    });

    it("rejects a mapping shorter than the new graph", () => {
      const g = TestGraphs.path(3);
      expectArgumentError(() => Graphs.edgeMapping(g, g, NodeMapping.of([0, 1])), /3 nodes/);
    });

    it("rejects a mapping longer than the new graph", () => {
      // Graph and subgraph swapped: the inverse of keep is over the 4 nodes of graph, not over the
      // 3 of sub, and would otherwise give a plausible but wrong mapping.
      const graph = of(4, 0, 1, 1, 2, 2, 3, 3, 0);
      const keep = NodeMapping.forSubgraph(1, 2, 3);
      const sub = Graphs.remapped(graph, keep);
      expectArgumentError(
        () => Graphs.edgeMapping(sub, graph, keep.inverted(graph.nodeCount)),
        /^newToOld has an index count of 4, but newGraph has 3 nodes$/,
      );
    });
  });

  describe("transposedEdgeMapping", () => {
    it("relabels edges", () => {
      const em = Graphs.transposedEdgeMapping(of(3, 1, 0, 0, 2));
      expect(em.get(0)).toBe(1);
      expect(em.get(1)).toBe(0);
    });

    it("is total", () => {
      const g = of(4, 0, 1, 0, 2, 1, 3, 2, 3, 3, 3);
      const em = Graphs.transposedEdgeMapping(g);
      expect(em.mappedCount).toBe(g.edgeCount);
      expect(em.isPartial).toBe(false);
    });

    it("identifies the swapped edge", () => {
      const g = of(4, 0, 1, 0, 2, 1, 3, 2, 3);
      const transposed = BiAdjacentGraph.of(g).transposed();
      const em = Graphs.transposedEdgeMapping(g);
      for (let q = 0; q < transposed.edgeCount; q++) {
        const p = em.get(q);
        expect(g.edgeSource(p)).toBe(transposed.edgeTarget(q));
        expect(g.edgeTarget(p)).toBe(transposed.edgeSource(q));
      }
    });

    it("inverted equals transposedEdgeIndex", () => {
      const g = of(4, 0, 1, 0, 2, 1, 3, 2, 3, 0, 0);
      const inverse = Graphs.transposedEdgeMapping(g).inverted(g.edgeCount);
      const biAdjacent = BiAdjacentGraph.of(g);
      for (let p = 0; p < g.edgeCount; p++) expect(inverse.get(p)).toBe(biAdjacent.transposedEdgeIndex(p));
    });

    it("agrees on uni- and bi-adjacent input", () => {
      const g = of(4, 0, 1, 0, 2, 1, 3, 2, 3);
      const fromUniAdjacent = Graphs.transposedEdgeMapping(g);
      const fromBiAdjacent = Graphs.transposedEdgeMapping(BiAdjacentGraph.of(g));
      for (let q = 0; q < g.edgeCount; q++) expect(fromBiAdjacent.get(q)).toBe(fromUniAdjacent.get(q));
    });

    it("of the empty graph and of isolated nodes has no mapped edge", () => {
      const em = Graphs.transposedEdgeMapping(TestGraphs.empty());
      expect(em.mappedCount).toBe(0);
      expect(em.isPartial).toBe(false);
      expect(Graphs.transposedEdgeMapping(TestGraphs.isolated(5)).mappedCount).toBe(0);
    });
  });

  describe("edgePartition", () => {
    it("omits intra-group edges", () => {
      const g = of(3, 0, 1, 0, 2, 1, 2);
      const partition = NodePartition.create(g, Int32Array.of(0, 0, 1), Int32Array.of(0, 1, 2), Int32Array.of(0, 2, 3));
      const ep = Graphs.edgePartition(partition.condense(), partition);
      expect(ep.edgeCount).toBe(g.edgeCount);
      expect(ep.get(0)).toBe(-1);
      expect(ep.get(1)).toBe(0);
      expect(ep.get(2)).toBe(0);
    });

    it("groups the members sorted ascending", () => {
      const g = of(4, 0, 2, 0, 3, 1, 2);
      const partition = NodePartition.create(
        g,
        Int32Array.of(0, 0, 1, 2),
        Int32Array.of(0, 1, 2, 3),
        Int32Array.of(0, 2, 3, 4),
      );
      const ep = Graphs.edgePartition(partition.condense(), partition);
      expect(ints(ep.edgesOf(0))).toEqual([0, 2]);
      expect(ints(ep.edgesOf(1))).toEqual([1]);
    });

    it("rejects a condensed graph with another node count than groups", () => {
      const sccs = Components.sccsOf(TestGraphs.path(4));
      expectArgumentError(() => Graphs.edgePartition(TestGraphs.isolated(1), sccs), /4 groups/);
      expectArgumentError(() => Graphs.edgePartition(TestGraphs.isolated(5), sccs));
    });
  });

  describe("adjacencyListOf", () => {
    it("lists every node", () => {
      expect(Graphs.adjacencyListOf(of(3, 0, 1, 0, 2, 2, 0))).toBe("0 -> [1, 2]\n1 -> []\n2 -> [0]\n");
      expect(Graphs.adjacencyListOf(TestGraphs.empty())).toBe("");
      const lines = Graphs.adjacencyListOf(TestGraphs.isolated(40)).split("\n");
      expect(lines.length - 1).toBe(40);
      expect(lines[lines.length - 1]).toBe("");
    });

    it("of a bi-adjacent graph lists its out-adjacency", () => {
      const bi = BiAdjacentGraph.of(of(3, 0, 1, 0, 2, 2, 0));
      expect(Graphs.adjacencyListOf(bi.transposed())).toBe("0 -> [2]\n1 -> [0]\n2 -> [0]\n");
    });
  });

  describe("dominatorTree", () => {
    it("has an edge from the immediate dominator to every dominated node", () => {
      // 0 -> 1 -> 2, 0 -> 2, and 3 unreachable: 2 is dominated by 0 only.
      const dominators = Dominators.of(BiAdjacentGraph.of(of(4, 0, 1, 1, 2, 0, 2)), 0);
      const tree = Graphs.dominatorTree(dominators);
      expect(tree.equals(of(4, 0, 1, 0, 2))).toBe(true);
      expect(Graphs.isForest(tree)).toBe(true);
    });
  });

  describe("findCycle", () => {
    it("is empty on a DAG", () => {
      expect(ints(Graphs.findCycle(TestGraphs.path(5)))).toEqual([]);
      expect(ints(Graphs.findCycle(TestGraphs.empty()))).toEqual([]);
    });

    it("returns the cycle closed by the first back edge", () => {
      expect(ints(Graphs.findCycle(of(4, 0, 1, 1, 2, 2, 3, 3, 1, 3, 0)))).toEqual([0, 1, 2, 3]);
    });

    it("starts at the target of the closing edge under a later root", () => {
      const graph = of(6, 0, 1, 2, 3, 3, 4, 4, 5, 5, 3);
      expect(ints(Graphs.findCycle(graph))).toEqual([3, 4, 5]);
      expect(ints(Graphs.findCycle(BiAdjacentGraph.of(graph)))).toEqual([3, 4, 5]);
    });

    it("finds a self-loop", () => {
      expect(ints(Graphs.findCycle(of(3, 0, 1, 1, 1)))).toEqual([1]);
    });

    it("returns a fresh fixed-length array (Java: an unmodifiable list)", () => {
      const graph = TestGraphs.cycle(3);
      const cycle = Graphs.findCycle(graph);
      expect(cycle).toBeInstanceOf(Int32Array);
      cycle[0] = 99;
      expect(ints(Graphs.findCycle(graph))).toEqual([0, 1, 2]);
      expect(Graphs.findCycle(TestGraphs.path(2))).toBeInstanceOf(Int32Array);
    });

    it("agrees with isDag on random graphs", () => {
      for (let seed = 0; seed < 300; seed++) {
        const labeled = RandomGraphs.anyGraph(seed);
        const graph = labeled.graph;
        const cycle = Graphs.findCycle(graph);
        expect(cycle.length === 0, labeled.describe()).toBe(Graphs.isDag(graph));
        if (cycle.length > 0) expectIsCycle(graph, cycle);
      }
    });

    it("on a deep cycle does not overflow the stack", () => {
      const n = 1_000_000;
      const cycle = Graphs.findCycle(TestGraphs.cycle(n));
      expect(cycle.length).toBe(n);
      expect(cycle[0]).toBe(0);
      expect(cycle[n - 1]).toBe(n - 1);
    });
  });

  describe("transitive closure and reduction", () => {
    it("transitiveClosure matches reachability", () => {
      for (let seed = 0; seed < 120; seed++) {
        const graph = RandomGraphs.gnp(2 + (seed % 40), 0.06, seed);
        const expected = reachability(graph);
        const closure = Graphs.transitiveClosure(graph);
        expect(closure.nodeCount).toBe(graph.nodeCount);
        for (let u = 0; u < graph.nodeCount; u++) {
          for (let v = 0; v < graph.nodeCount; v++) {
            expect(closure.hasOutNode(u, v), `${u} -> ${v}, seed ${seed}`).toBe(expected[u][v]);
          }
        }
      }
    });

    it("transitiveClosure has a self-loop exactly on cycles", () => {
      const closure = Graphs.transitiveClosure(of(5, 0, 1, 1, 2, 2, 1, 3, 3));
      expect(closure.hasOutNode(0, 0)).toBe(false);
      expect(closure.hasOutNode(1, 1)).toBe(true);
      expect(closure.hasOutNode(2, 2)).toBe(true);
      expect(closure.hasOutNode(3, 3)).toBe(true);
      expect(closure.outDegree(4)).toBe(0);
      expect(ints(closure.outNodes(0))).toEqual([1, 2]);
    });

    it("transitiveClosure of the empty graph", () => {
      expect(Graphs.transitiveClosure(TestGraphs.empty()).nodeCount).toBe(0);
    });

    it("transitiveReduction keeps reachability without redundant edges", () => {
      for (let seed = 0; seed < 120; seed++) {
        const sorted = RandomGraphs.randomDag(2 + (seed % 40), 0.15, seed);
        const dag = Graphs.remapped(sorted, NodeMapping.forPermutation(shuffled(sorted.nodeCount, seed)));
        const reduced = Graphs.transitiveReduction(dag);
        const expected = reachability(dag);
        const actual = reachability(reduced);
        for (let u = 0; u < dag.nodeCount; u++) {
          expect(actual[u], `reachability from ${u}, seed ${seed}`).toEqual(expected[u]);
        }
        reduced.forEachEdge((source, target, edgeIndex) => {
          expect(dag.hasOutNode(source, target)).toBe(true);
          const without = new GraphBuilder();
          without.addNodes(reduced.nodeCount);
          reduced.forEachEdge((s, t, e) => {
            if (e !== edgeIndex) without.addEdge(s, t);
          });
          expect(reachability(without.build())[source][target], `${source} -> ${target} implied, seed ${seed}`).toBe(
            false,
          );
        });
      }
    });

    it("transitiveClosure and transitiveReduction across several bit words", () => {
      for (let seed = 0; seed < 6; seed++) {
        const graph = RandomGraphs.gnp(150, 0.012, seed);
        const expected = reachability(graph);
        const closure = Graphs.transitiveClosure(graph);
        for (let u = 0; u < 150; u++) {
          for (let v = 0; v < 150; v++) {
            expect(closure.hasOutNode(u, v), `${u} -> ${v}, seed ${seed}`).toBe(expected[u][v]);
          }
        }
        const sorted = RandomGraphs.randomDag(150, 0.03, seed);
        const dag = Graphs.remapped(sorted, NodeMapping.forPermutation(shuffled(150, seed)));
        const reduced = Graphs.transitiveReduction(dag);
        const dagReach = reachability(dag);
        const reducedReach = reachability(reduced);
        for (let u = 0; u < 150; u++) expect(reducedReach[u], `from ${u}, seed ${seed}`).toEqual(dagReach[u]);
        expect(Graphs.transitiveReduction(Graphs.transitiveClosure(reduced)).equals(reduced)).toBe(true);
      }
    });

    it("transitiveClosure rejects more edges than an array holds", () => {
      expectArgumentError(
        () => Graphs.transitiveClosure(TestGraphs.cycle(46_341)),
        `the transitive closure has more than ${0x7fffffff - 8} edges, the largest array length`,
      );
    });

    it("transitiveReduction of a transitive triangle", () => {
      expect(Graphs.transitiveReduction(of(3, 0, 1, 1, 2, 0, 2)).equals(of(3, 0, 1, 1, 2))).toBe(true);
    });

    it("transitiveReduction of the closure of a path is the path", () => {
      const path = TestGraphs.path(30);
      expect(Graphs.transitiveReduction(Graphs.transitiveClosure(path)).equals(path)).toBe(true);
    });

    it("transitiveReduction rejects cycles", () => {
      expectArgumentError(() => Graphs.transitiveReduction(TestGraphs.cycle(3)));
      expectArgumentError(() => Graphs.transitiveReduction(of(2, 0, 1, 1, 1)));
    });
  });
});
