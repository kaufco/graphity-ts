import { describe, expect, it } from "vitest";
import { BiAdjacentGraph, Csr, type Edges, Graph, GraphBuilder, Graphs } from "../src/index.js";
import { expectArgumentError, ints } from "./testutils/assertions.js";
import { JavaRandom } from "./testutils/javaRandom.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";
import { TestGraphs } from "./testutils/testGraphs.js";

/** An edge as one comparable number; the random graphs stay below 2^16 nodes. */
const key = (source: number, target: number) => source * 65536 + target;

function edgeSet(graph: Graph): Set<number> {
  const set = new Set<number>();
  graph.forEachEdge((source, target) => set.add(key(source, target)));
  return set;
}

function keys(edges: Edges): number[] {
  const list: number[] = [];
  for (let p = 0; p < edges.count; p++) list.push(key(edges.sourceNodes[p], edges.targetNodes[p]));
  return list;
}

/** `graph` with some edges dropped and some added, over the same nodes, as the Java test draws them. */
function edited(graph: Graph, seed: number): Graph {
  const random = new JavaRandom(seed);
  const b = new GraphBuilder();
  b.addNodes(graph.nodeCount);
  graph.forEachEdge((source, target) => {
    if (random.nextInt(5) !== 0) b.addEdge(source, target);
  });
  const n = graph.nodeCount;
  // The bound is drawn anew on every check, as in the Java loop condition.
  for (let i = 0; i < 1 + random.nextInt(10); i++) {
    const u = random.nextInt(n);
    b.addEdge(u, random.nextInt(n));
  }
  return b.build();
}

function assertIndices(graph: Graph, edges: Edges): void {
  for (let p = 0; p < edges.count; p++) {
    expect(edges.edgeIndices[p]).toBe(graph.edgeIndexOf(edges.sourceNodes[p], edges.targetNodes[p]));
  }
}

const difference = (a: Set<number>, b: Set<number>) =>
  Array.from(a)
    .filter((k) => !b.has(k))
    .sort((x, y) => x - y);

describe("GraphDiffTest", () => {
  it("diff matches the set difference and names each edge in its graph", () => {
    for (let seed = 0; seed < 200; seed++) {
      const before = RandomGraphs.anyGraph(seed).graph;
      const after = edited(before, seed);
      const diff = Graphs.diff(before, after);
      expect(keys(diff.addedEdges), `added, seed ${seed}`).toEqual(difference(edgeSet(after), edgeSet(before)));
      expect(keys(diff.removedEdges), `removed, seed ${seed}`).toEqual(difference(edgeSet(before), edgeSet(after)));
      assertIndices(after, diff.addedEdges);
      assertIndices(before, diff.removedEdges);
      expect(diff.isEmpty).toBe(before.equals(after));
    }
  });

  it("equal graphs have an empty diff", () => {
    const graph = RandomGraphs.gnp(40, 0.1, 3);
    const diff = Graphs.diff(graph, BiAdjacentGraph.of(graph));
    expect(diff.isEmpty).toBe(true);
    expect(diff.addedEdges.count).toBe(0);
    expect(diff.removedEdges.count).toBe(0);
    expect(diff.toString()).toBe("GraphDiff[added=0, removed=0]");
  });

  it("diff of a small change", () => {
    const diff = Graphs.diff(TestGraphs.of(3, 0, 1, 1, 2), TestGraphs.of(3, 0, 1, 0, 2));
    expect(ints(diff.addedEdges.sourceNodes)).toEqual([0]);
    expect(ints(diff.addedEdges.targetNodes)).toEqual([2]);
    expect(ints(diff.addedEdges.edgeIndices)).toEqual([1]);
    expect(ints(diff.removedEdges.sourceNodes)).toEqual([1]);
    expect(ints(diff.removedEdges.targetNodes)).toEqual([2]);
    expect(ints(diff.removedEdges.edgeIndices)).toEqual([1]);
    expect(diff.toString()).toBe("GraphDiff[added=1, removed=1]");
  });

  it("diff lists sources, targets and indices in step over several nodes", () => {
    const before = TestGraphs.of(4, 0, 1, 0, 3, 1, 2, 2, 0);
    const after = TestGraphs.of(4, 0, 2, 0, 3, 1, 0, 1, 2, 2, 1);
    const diff = Graphs.diff(before, after);
    expect(ints(diff.addedEdges.sourceNodes)).toEqual([0, 1, 2]);
    expect(ints(diff.addedEdges.targetNodes)).toEqual([2, 0, 1]);
    expect(ints(diff.addedEdges.edgeIndices)).toEqual([0, 2, 4]);
    expect(ints(diff.removedEdges.sourceNodes)).toEqual([0, 2]);
    expect(ints(diff.removedEdges.targetNodes)).toEqual([1, 0]);
    expect(ints(diff.removedEdges.edgeIndices)).toEqual([0, 3]);
  });

  it("diff against a graph without edges lists every edge", () => {
    const graph = RandomGraphs.gnp(30, 0.1, 9);
    const empty = TestGraphs.isolated(30);
    const all = Array.from({ length: graph.edgeCount }, (_, e) => e);
    expect(ints(Graphs.diff(empty, graph).addedEdges.edgeIndices)).toEqual(all);
    expect(Graphs.diff(empty, graph).removedEdges.isEmpty).toBe(true);
    expect(ints(Graphs.diff(graph, empty).removedEdges.edgeIndices)).toEqual(all);
    expect(Graphs.diff(TestGraphs.empty(), TestGraphs.empty()).isEmpty).toBe(true);
  });

  it("a transposed view equals the built transpose", () => {
    const graph = RandomGraphs.gnp(25, 0.15, 4);
    const view = BiAdjacentGraph.of(graph).transposed();
    const b = new GraphBuilder();
    b.addNodes(graph.nodeCount);
    graph.forEachEdge((source, target) => b.addEdge(target, source));
    const built = b.build();
    expect(Graphs.diff(view, built).isEmpty).toBe(true);
    expect(Graphs.topologyHash(view)).toBe(Graphs.topologyHash(built));
  });

  it("diff rejects different node counts", () => {
    expectArgumentError(() => Graphs.diff(TestGraphs.path(3), TestGraphs.path(4)), "same nodes");
  });

  it("topologyHash is consistent with equals", () => {
    for (let seed = 0; seed < 50; seed++) {
      const graph = RandomGraphs.anyGraph(seed).graph;
      const copy = Graph.of(Csr.outAdjacencyStart(graph), Csr.outAdjacency(graph));
      expect(Graphs.topologyHash(copy)).toBe(Graphs.topologyHash(graph));
      expect(Graphs.topologyHash(BiAdjacentGraph.of(graph))).toBe(Graphs.topologyHash(graph));
    }
  });

  it("topologyHash separates distinct graphs", () => {
    const hashes = new Set<bigint>();
    const graphs = new Set<string>();
    for (let seed = 0; seed < 2000; seed++) {
      const graph = RandomGraphs.gnp(1 + (seed % 12), 0.3, seed);
      const structure = Graphs.adjacencyListOf(graph);
      if (!graphs.has(structure)) {
        graphs.add(structure);
        const hash = Graphs.topologyHash(graph);
        expect(hashes.has(hash), `collision at seed ${seed}`).toBe(false);
        hashes.add(hash);
      }
    }
    expect(graphs.size).toBeGreaterThan(1000);
  });

  it("topologyHash tells apart graphs that differ only in where an edge starts", () => {
    // Both have targets [0, 1] and two nodes and edges; degrees 2/0 against 1/1.
    expect(Graphs.topologyHash(TestGraphs.of(2, 0, 0, 0, 1))).not.toBe(
      Graphs.topologyHash(TestGraphs.of(2, 0, 0, 1, 1)),
    );
    expect(Graphs.topologyHash(TestGraphs.isolated(3))).not.toBe(Graphs.topologyHash(TestGraphs.isolated(4)));
  });

  it("topologyHash keeps its values across releases and implementations", () => {
    // Fixed values, those of Java's GraphDiffTest: only a release that announces a new hash in its
    // changelog may change them, in every port.
    const hashes = [
      Graphs.topologyHash(TestGraphs.empty()),
      Graphs.topologyHash(TestGraphs.isolated(1)),
      Graphs.topologyHash(TestGraphs.of(3, 0, 1, 0, 2, 2, 0)),
      Graphs.topologyHash(TestGraphs.of(4, 0, 1, 1, 2, 2, 3, 3, 0, 3, 3)),
    ];
    expect(hashes).toEqual([-5442815153047339753n, 481960320753566714n, -2177113494002845099n, -7127685637304178848n]);
  });
});
