import { describe, expect, it } from "vitest";
import { BiAdjacentGraph, type Graph, GraphBuilder } from "../src/index.js";
import { expectIndexError, ints } from "./testutils/assertions.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";
import { TestGraphs } from "./testutils/testGraphs.js";

describe("GraphTest", () => {
  const diamond = () => TestGraphs.of(4, 0, 1, 0, 2, 1, 3, 2, 3);

  it("empty graph reports zero", () => {
    const g = TestGraphs.empty();
    expect(g.nodeCount).toBe(0);
    expect(g.edgeCount).toBe(0);
    expect(g.isEmpty).toBe(true);
  });

  it("isolated graph has nodes, no edges", () => {
    const g = TestGraphs.isolated(5);
    expect(g.nodeCount).toBe(5);
    expect(g.edgeCount).toBe(0);
    expect(g.isEmpty).toBe(false);
  });

  it("node and edge counts match GraphBuilder", () => {
    const g = diamond();
    expect(g.nodeCount).toBe(4);
    expect(g.edgeCount).toBe(4);
  });

  it("outDegree reports out-edges", () => {
    const g = diamond();
    expect(g.outDegree(0)).toBe(2);
    expect(g.outDegree(1)).toBe(1);
    expect(g.outDegree(2)).toBe(1);
    expect(g.outDegree(3)).toBe(0);
  });

  it.each([-1, 4, 1000])("outDegree(%i) out of range throws", (node) => {
    const g = TestGraphs.isolated(4);
    expectIndexError(() => g.outDegree(node));
  });

  it("outNodes returns a sorted view", () => {
    const g = TestGraphs.of(4, 0, 3, 0, 1, 0, 2);
    expect(ints(g.outNodes(0).toInt32Array())).toEqual([1, 2, 3]);
  });

  it("outNodes of a node without out-edges is empty", () => {
    const g = TestGraphs.of(2, 0, 1);
    expect(g.outNodes(1).isEmpty).toBe(true);
  });

  it.each([-1, 4, 1000])("outNodes(%i) out of range throws", (node) => {
    const g = TestGraphs.isolated(4);
    expectIndexError(() => g.outNodes(node));
  });

  it.each([1.5, Number.NaN])("outNodes(%d) rejects a node ID that is not an integer", (node) => {
    expectIndexError(() => TestGraphs.isolated(4).outNodes(node));
  });

  it("outEdgeStart and outEdgeEnd frame the out-nodes", () => {
    const g = TestGraphs.of(3, 0, 1, 0, 2, 1, 2);
    const s = g.outEdgeStart(0);
    const e = g.outEdgeEnd(0);
    expect(e - s).toBe(g.outDegree(0));
    const targets: number[] = [];
    for (let i = s; i < e; i++) targets.push(g.edgeTarget(i));
    expect(targets).toEqual([1, 2]);
  });

  it.each([-1, 3, 100])("outEdgeStart/outEdgeEnd(%i) out of range throws", (node) => {
    const g = TestGraphs.isolated(3);
    expectIndexError(() => g.outEdgeStart(node));
    expectIndexError(() => g.outEdgeEnd(node));
  });

  it("edgeTarget returns the target by edge index", () => {
    const g = TestGraphs.of(3, 0, 1, 0, 2, 1, 2);
    expect(g.edgeTarget(0)).toBe(1);
    expect(g.edgeTarget(1)).toBe(2);
    expect(g.edgeTarget(2)).toBe(2);
  });

  it.each([-1, 3, 100])("edgeTarget(%i) out of range throws", (edgeIndex) => {
    const g = TestGraphs.of(2, 0, 1, 1, 0, 0, 0);
    expectIndexError(() => g.edgeTarget(edgeIndex));
  });

  it("edgeSource inverts the edgeTarget mapping", () => {
    const g = diamond();
    for (let e = 0; e < g.edgeCount; e++) {
      const source = g.edgeSource(e);
      const target = g.edgeTarget(e);
      expect(g.hasOutNode(source, target)).toBe(true);
      expect(e).toBeGreaterThanOrEqual(g.outEdgeStart(source));
      expect(e).toBeLessThanOrEqual(g.outEdgeEnd(source) - 1);
    }
  });

  it("edgeSource returns the correct source across all edges", () => {
    const g = TestGraphs.of(5, 0, 2, 0, 4, 2, 3, 3, 1, 3, 4);
    expect(g.edgeSource(0)).toBe(0);
    expect(g.edgeSource(1)).toBe(0);
    expect(g.edgeSource(2)).toBe(2);
    expect(g.edgeSource(3)).toBe(3);
    expect(g.edgeSource(4)).toBe(3);
  });

  it("edgeSource handles nodes without out-edges", () => {
    // Node 0 has no out-edges; edge 0 belongs to node 1.
    const g = TestGraphs.of(3, 1, 2);
    expect(g.edgeSource(0)).toBe(1);
  });

  it.each([-1, 4, 100])("edgeSource(%i) out of range throws", (edgeIndex) => {
    const g = TestGraphs.of(3, 0, 1, 0, 2, 1, 2, 2, 0);
    expectIndexError(() => g.edgeSource(edgeIndex));
  });

  it("hasOutNode detects existing edges", () => {
    const g = TestGraphs.of(3, 0, 1, 0, 2, 1, 2);
    expect(g.hasOutNode(0, 1)).toBe(true);
    expect(g.hasOutNode(0, 2)).toBe(true);
    expect(g.hasOutNode(1, 2)).toBe(true);
  });

  it("edgeIndexOf finds edges and reports missing ones", () => {
    // Edge indices: 0 -> 1 is 0, 0 -> 2 is 1, 1 -> 2 is 2, 2 -> 0 is 3.
    const g = TestGraphs.of(3, 0, 1, 0, 2, 1, 2, 2, 0);
    expect(g.edgeIndexOf(0, 1)).toBe(0);
    expect(g.edgeIndexOf(0, 2)).toBe(1);
    expect(g.edgeIndexOf(1, 2)).toBe(2);
    expect(g.edgeIndexOf(2, 0)).toBe(3);
    expect(g.edgeIndexOf(1, 0)).toBe(-1);
    expect(g.edgeIndexOf(0, 0)).toBe(-1);
    expect(g.edgeIndexOf(0, 999)).toBe(-1);
    expect(g.edgeIndexOf(0, -1)).toBe(-1);
    expect(BiAdjacentGraph.of(g).edgeIndexOf(2, 0)).toBe(3);
  });

  it("edgeIndexOf and hasOutNode find no target that is not an int", () => {
    // NaN and undefined (an array read past its end) are neither below nor above any target.
    const g = TestGraphs.of(3, 0, 1, 0, 2, 1, 2, 2, 0);
    for (const target of [NaN, undefined as unknown as number, 1.5, 2 ** 32 + 1]) {
      expect(g.edgeIndexOf(0, target)).toBe(-1);
      expect(g.hasOutNode(0, target)).toBe(false);
    }
  });

  it.each([-1, 3])("edgeIndexOf rejects source %i out of range", (source) => {
    const g = TestGraphs.of(3, 0, 1);
    expectIndexError(() => g.edgeIndexOf(source, 1));
  });

  it("hasOutNode rejects missing edges", () => {
    const g = TestGraphs.of(3, 0, 1, 0, 2, 1, 2);
    expect(g.hasOutNode(0, 0)).toBe(false);
    expect(g.hasOutNode(1, 0)).toBe(false);
    expect(g.hasOutNode(2, 0)).toBe(false);
    expect(g.hasOutNode(0, 999)).toBe(false);
  });

  it.each([-1, 3, 1000])("hasOutNode with source %i out of range throws", (node) => {
    const g = TestGraphs.isolated(3);
    expectIndexError(() => g.hasOutNode(node, 0));
  });

  it("containsSelfLoop detects self-loops", () => {
    const g = TestGraphs.of(3, 0, 0, 1, 2, 2, 2);
    expect(g.containsSelfLoop(0)).toBe(true);
    expect(g.containsSelfLoop(1)).toBe(false);
    expect(g.containsSelfLoop(2)).toBe(true);
  });

  it.each([-1, 3, 1000])("containsSelfLoop(%i) out of range throws", (node) => {
    const g = TestGraphs.isolated(3);
    expectIndexError(() => g.containsSelfLoop(node));
  });

  it("BiAdjacentGraph computes correct in-edges", () => {
    const bi = BiAdjacentGraph.of(diamond());
    expect(ints(bi.inNodes(0))).toEqual([]);
    expect(ints(bi.inNodes(1))).toEqual([0]);
    expect(ints(bi.inNodes(2))).toEqual([0]);
    expect(ints(bi.inNodes(3))).toEqual([1, 2]);
  });

  it("BiAdjacentGraph preserves the out-adjacency", () => {
    const g = diamond();
    const bi = BiAdjacentGraph.of(g);
    for (let i = 0; i < g.nodeCount; i++) expect(ints(bi.outNodes(i))).toEqual(ints(g.outNodes(i)));
  });

  it("BiAdjacentGraph of the empty graph is empty", () => {
    const bi = BiAdjacentGraph.of(TestGraphs.empty());
    expect(bi.nodeCount).toBe(0);
    expect(bi.edgeCount).toBe(0);
  });

  it("BiAdjacentGraph in-adjacency is sorted", () => {
    // Node 3 receives edges from 0, 1, 2 - in order [0, 1, 2].
    const g = TestGraphs.of(4, 0, 3, 1, 3, 2, 3);
    expect(ints(BiAdjacentGraph.of(g).inNodes(3))).toEqual([0, 1, 2]);
  });

  it("uniAdjacentGraph on a plain graph returns itself", () => {
    const g = TestGraphs.path(3);
    expect(g.uniAdjacentGraph()).toBe(g);
  });

  it("equals is based on structure, with the same hash code", () => {
    const a = TestGraphs.of(3, 0, 1, 1, 2);
    const b = TestGraphs.of(3, 0, 1, 1, 2);
    expect(a.equals(b)).toBe(true);
    expect(a.hashCode()).toBe(b.hashCode());
  });

  it("equals with a different structure is false", () => {
    expect(TestGraphs.of(3, 0, 1, 1, 2).equals(TestGraphs.of(3, 0, 2, 1, 2))).toBe(false);
  });

  it("equals with a different node count is false", () => {
    expect(TestGraphs.isolated(3).equals(TestGraphs.isolated(4))).toBe(false);
  });

  it("equals ignores bi- versus uni-adjacent type", () => {
    const uni = TestGraphs.of(3, 0, 1, 1, 2);
    const bi = BiAdjacentGraph.of(uni);
    expect(uni.equals(bi)).toBe(true);
    expect(bi.equals(uni)).toBe(true);
    expect(uni.hashCode()).toBe(bi.hashCode());
  });

  it("equals with null or another type is false", () => {
    const g = TestGraphs.path(3);
    expect(g.equals(null)).toBe(false);
    expect(g.equals(undefined)).toBe(false);
    expect(g.equals("not a graph")).toBe(false);
  });

  it("equals on the same instance is true", () => {
    const g = TestGraphs.path(3);
    expect(g.equals(g)).toBe(true);
  });

  it("hashCode is Java's: 31 x Arrays.hashCode(offsets) + Arrays.hashCode(targets)", () => {
    // Offsets [0, 1, 2, 2]: (((1 * 31 + 0) * 31 + 1) * 31 + 2) * 31 + 2 = 924546;
    // targets [1, 2]: (1 * 31 + 1) * 31 + 2 = 994.
    expect(TestGraphs.path(3).hashCode()).toBe(31 * 924546 + 994);
  });

  it("nodes iterates every node in order", () => {
    expect(Array.from(TestGraphs.path(4).nodes())).toEqual([0, 1, 2, 3]);
    expect(Array.from(TestGraphs.empty().nodes())).toEqual([]);
  });

  it("forEachEdge visits every edge in edge index order", () => {
    for (let seed = 0; seed < 20; seed++) {
      const graph = RandomGraphs.gnp(30, 0.1, seed);
      const indices: number[] = [];
      graph.forEachEdge((source, target, edgeIndex) => {
        expect(graph.edgeSource(edgeIndex)).toBe(source);
        expect(graph.edgeTarget(edgeIndex)).toBe(target);
        indices.push(edgeIndex);
      });
      expect(indices).toEqual(Array.from({ length: graph.edgeCount }, (_, i) => i));
    }
  });

  it("forEachEdge on a BiAdjacentGraph and its transpose visits their own edges", () => {
    const bi = BiAdjacentGraph.of(TestGraphs.of(3, 0, 1, 0, 2, 2, 1));
    for (const graph of [bi, bi.transposed()]) {
      const seen: number[] = [];
      graph.forEachEdge((source, target, edgeIndex) => {
        expect(graph.edgeIndexOf(source, target)).toBe(edgeIndex);
        seen.push(edgeIndex);
      });
      expect(seen).toEqual([0, 1, 2]);
    }
    const transposedSources: number[] = [];
    bi.transposed().forEachEdge((source) => transposedSources.push(source));
    // Transposed: 1 -> 0, 1 -> 2, 2 -> 0.
    expect(transposedSources).toEqual([1, 1, 2]);
  });

  it("forEachEdge on a graph without edges calls nothing", () => {
    let count = 0;
    TestGraphs.isolated(3).forEachEdge(() => count++);
    expect(count).toBe(0);
  });

  it("toString lists small graphs completely", () => {
    expect(TestGraphs.of(3, 0, 1, 0, 2, 2, 0).toString()).toBe(
      "Graph[nodes=3, edges=3] {0 -> [1, 2], 1 -> [], 2 -> [0]}",
    );
    expect(TestGraphs.empty().toString()).toBe("Graph[nodes=0, edges=0] {}");
  });

  it("toString names the bi-adjacent type", () => {
    expect(BiAdjacentGraph.of(TestGraphs.path(2)).toString()).toBe(
      "BiAdjacentGraph[nodes=2, edges=1] {0 -> [1], 1 -> []}",
    );
  });

  it("toString cuts after sixteen nodes", () => {
    const text = TestGraphs.isolated(17).toString();
    expect(text.startsWith("Graph[nodes=17, edges=0] {0 -> [], ")).toBe(true);
    expect(text.endsWith("15 -> [], ...}")).toBe(true);
    expect(text).not.toContain("16 ->");
  });

  it("toString lists exactly sixteen nodes without a marker", () => {
    const text = TestGraphs.isolated(16).toString();
    expect(text.endsWith("15 -> []}")).toBe(true);
    expect(text).not.toContain("...");
  });

  it("toString cut in the last list has no trailing marker", () => {
    // Nodes 0..8 with 7 out-nodes each use 63 of the budget; node 9 is the last node.
    const b = new GraphBuilder();
    b.addNodes(10);
    for (let v = 0; v < 9; v++) for (let t = 0; t < 7; t++) b.addEdge(v, t);
    b.addOutEdges(9, 0, 1);
    expect(b.build().toString().endsWith("9 -> [0, ...]}")).toBe(true);
  });

  it("toString is bounded on a hub", () => {
    const b = new GraphBuilder();
    b.addNodes(1_000_000);
    for (let v = 1; v < 1_000_000; v++) b.addEdge(0, v);
    const text = b.build().toString();
    expect(text.length).toBeLessThan(600);
    expect(text.startsWith("Graph[nodes=1000000, edges=999999] {0 -> [1, 2, ")).toBe(true);
    expect(text.endsWith(", 64, ...], ...}")).toBe(true);

    const high = new GraphBuilder();
    high.addNodes(1_000_000);
    for (let v = 1; v <= 100; v++) high.addEdge(0, 1_000_000 - v);
    const highText = high.build().toString();
    expect(highText.length).toBeLessThan(1024);
    expect(highText.endsWith(", ...], ...}")).toBe(true);
  });

  it("toString stops when the target budget runs out between lists", () => {
    // 64 out-nodes on node 0 exhaust the budget; node 1 still has edges.
    const b = new GraphBuilder();
    b.addNodes(66);
    for (let v = 1; v <= 64; v++) b.addEdge(0, v);
    b.addEdge(1, 65);
    expect(b.build().toString()).toContain("63, 64], 1 -> [...], ...}");
  });

  it("the view of outNodes reads the graph's own array", () => {
    const g: Graph = diamond();
    const view = g.outNodes(0);
    expect(view.size).toBe(2);
    expect(view.get(0)).toBe(1);
    expect(view.get(1)).toBe(2);
    expect([...view]).toEqual([1, 2]);
  });
});
