import { describe, expect, it } from "vitest";
import { type Graph, GraphBuilder, Graphs, NodePartition } from "../src/index.js";
import { expectArgumentError, expectIndexError, ints } from "./testutils/assertions.js";
import { TestGraphs } from "./testutils/testGraphs.js";

/** Nodes 0..4 in three groups {0,3} / {1,4} / {2}, through the internal constructor. */
function threeGroupPartition(graph: Graph): NodePartition {
  return NodePartition.create(
    graph,
    Int32Array.of(0, 1, 2, 0, 1),
    Int32Array.of(0, 3, 1, 4, 2),
    Int32Array.of(0, 2, 4, 5),
  );
}

const emptyGraph = (): Graph => new GraphBuilder().build();

function partitionOf(graph: Graph, nodeToGroup: number[], members: number[], memberStart: number[]): NodePartition {
  return NodePartition.create(
    graph,
    Int32Array.from(nodeToGroup),
    Int32Array.from(members),
    Int32Array.from(memberStart),
  );
}

function graphOf(nodes: number, ...pairs: number[]): Graph {
  const builder = new GraphBuilder();
  builder.addNodes(nodes);
  for (let i = 0; i < pairs.length; i += 2) builder.addEdge(pairs[i], pairs[i + 1]);
  return builder.build();
}

describe("NodePartitionTest", () => {
  it("groupCount reports the number of groups", () => {
    expect(threeGroupPartition(emptyGraph()).groupCount).toBe(3);
  });

  it("indexCount reports the total nodes", () => {
    const p = threeGroupPartition(emptyGraph());
    expect(p.indexCount).toBe(5);
    expect(p.nodeCount).toBe(5);
  });

  it("get returns the group of each node", () => {
    const p = threeGroupPartition(emptyGraph());
    expect([0, 1, 2, 3, 4].map((v) => p.get(v))).toEqual([0, 1, 2, 0, 1]);
  });

  it.each([-1, 5, 100])("get(%i) out of range throws", (node) => {
    const p = threeGroupPartition(emptyGraph());
    expectIndexError(() => p.get(node));
    expectIndexError(() => p.isMapped(node));
  });

  it("isPartial is false for a partition of every node", () => {
    expect(threeGroupPartition(emptyGraph()).isPartial).toBe(false);
  });

  it("indicesOf returns the sorted members", () => {
    const p = threeGroupPartition(emptyGraph());
    expect(ints(p.indicesOf(0))).toEqual([0, 3]);
    expect(ints(p.indicesOf(1))).toEqual([1, 4]);
    expect(ints(p.indicesOf(2))).toEqual([2]);
  });

  it("nodesOf delegates to indicesOf", () => {
    const p = threeGroupPartition(emptyGraph());
    expect(ints(p.nodesOf(0))).toEqual([0, 3]);
    expect(ints(p.nodesOf(1))).toEqual([1, 4]);
    expect(ints(p.nodesOf(2))).toEqual([2]);
  });

  it("sizeOf reports the group size", () => {
    const p = threeGroupPartition(emptyGraph());
    expect([0, 1, 2].map((g) => p.sizeOf(g))).toEqual([2, 2, 1]);
  });

  it.each([-1, 3, 100])("indicesOf(%i) out of range throws", (groupId) => {
    expectIndexError(() => threeGroupPartition(emptyGraph()).indicesOf(groupId));
  });

  it.each([-1, 3, 100])("sizeOf(%i) out of range throws", (groupId) => {
    expectIndexError(() => threeGroupPartition(emptyGraph()).sizeOf(groupId));
  });

  it("condense of an empty partition returns the empty graph", () => {
    const condensed = partitionOf(emptyGraph(), [], [], [0]).condense();
    expect(condensed.nodeCount).toBe(0);
    expect(condensed.edgeCount).toBe(0);
  });

  it("condense of a single group has no edges", () => {
    const graph = graphOf(2, 0, 1, 1, 0);
    const condensed = partitionOf(graph, [0, 0], [0, 1], [0, 2]).condense();
    expect(condensed.nodeCount).toBe(1);
    expect(condensed.edgeCount).toBe(0);
  });

  it("condense omits intra-group edges", () => {
    // 0 -> 1 (intra), 0 -> 2 (inter), 1 -> 2 (inter); partition {0,1} / {2}.
    const graph = graphOf(3, 0, 1, 0, 2, 1, 2);
    const condensed = partitionOf(graph, [0, 0, 1], [0, 1, 2], [0, 2, 3]).condense();
    expect(condensed.nodeCount).toBe(2);
    expect(condensed.edgeCount).toBe(1);
    expect(ints(condensed.outNodes(0))).toEqual([1]);
    expect(ints(condensed.outNodes(1))).toEqual([]);
  });

  it("condense deduplicates parallel inter-group edges", () => {
    const graph = graphOf(3, 0, 2, 1, 2);
    const condensed = partitionOf(graph, [0, 0, 1], [0, 1, 2], [0, 2, 3]).condense();
    expect(condensed.edgeCount).toBe(1);
    expect(ints(condensed.outNodes(0))).toEqual([1]);
  });

  it("condense produces sorted adjacency lists", () => {
    const graph = graphOf(4, 0, 3, 0, 2, 1, 2);
    const condensed = partitionOf(graph, [0, 0, 1, 2], [0, 1, 2, 3], [0, 2, 3, 4]).condense();
    expect(ints(condensed.outNodes(0))).toEqual([1, 2]);
  });

  describe("of(graph, groupOf, groupCount)", () => {
    it("groups the nodes as given", () => {
      const graph = TestGraphs.of(4, 0, 1, 1, 2, 2, 3, 3, 0);
      const p = NodePartition.of(graph, [0, 0, 1, 1], 2);
      expect(p.groupCount).toBe(2);
      expect(p.nodeCount).toBe(4);
      expect(p.isPartial).toBe(false);
      expect(ints(p.nodesOf(0))).toEqual([0, 1]);
      expect(ints(p.nodesOf(1))).toEqual([2, 3]);
      const condensed = p.condense();
      expect(ints(condensed.outNodes(0))).toEqual([1]);
      expect(ints(condensed.outNodes(1))).toEqual([0]);
    });

    it("leaves ungrouped nodes out of the condensation", () => {
      const graph = TestGraphs.of(3, 0, 1, 1, 2, 0, 2);
      const p = NodePartition.of(graph, Int32Array.of(0, -1, 1), 2);
      expect(p.isPartial).toBe(true);
      expect(p.mappedCount).toBe(2);
      expect(p.get(1)).toBe(-1);
      expect(p.isMapped(1)).toBe(false);
      const condensed = p.condense();
      expect(condensed.edgeCount).toBe(1);
      expect(condensed.hasOutNode(0, 1)).toBe(true);
      // Edge indices: 0 -> 1 is 0, 0 -> 2 is 1, 1 -> 2 is 2.
      const provenance = Graphs.edgePartition(condensed, p);
      expect(ints(provenance.edgesOf(0))).toEqual([1]);
      expect(provenance.get(0)).toBe(-1);
      expect(provenance.get(2)).toBe(-1);
    });

    it("keeps empty groups as isolated nodes", () => {
      const graph = TestGraphs.of(2, 0, 1);
      const p = NodePartition.of(graph, [2, 0], 4);
      expect(p.sizeOf(1)).toBe(0);
      expect(p.sizeOf(3)).toBe(0);
      const condensed = p.condense();
      expect(condensed.nodeCount).toBe(4);
      expect(condensed.edgeCount).toBe(1);
      expect(condensed.hasOutNode(2, 0)).toBe(true);
    });

    it("copies the array", () => {
      const graph = TestGraphs.of(2, 0, 1);
      const groupOf = Int32Array.of(0, 1);
      const p = NodePartition.of(graph, groupOf, 2);
      groupOf[0] = 1;
      expect(p.get(0)).toBe(0);
    });

    it("works on an empty graph", () => {
      const p = NodePartition.of(emptyGraph(), [], 0);
      expect(p.groupCount).toBe(0);
      expect(p.condense().nodeCount).toBe(0);
      expect(NodePartition.of(emptyGraph(), [], 2).condense().nodeCount).toBe(2);
    });

    it("rejects invalid input", () => {
      const graph = TestGraphs.of(2, 0, 1);
      expectArgumentError(() => NodePartition.of(graph, [0], 1));
      expectIndexError(() => NodePartition.of(graph, [0, 1], 1));
      expectIndexError(() => NodePartition.of(graph, [0, -2], 1), /^group of node 1 is -2, outside -1\.\.0$/);
      expectIndexError(() => NodePartition.of(graph, [-0x80000000, 0], 1));
      expectArgumentError(() => NodePartition.of(graph, [-1, -1], -1));
      expectArgumentError(() => NodePartition.of(graph, [-1, -1], 0x7fffffff));
    });

    it("rejects more groups than a graph can have nodes", () => {
      const graph = TestGraphs.of(2, 0, 1);
      expectArgumentError(() => NodePartition.of(graph, [-1, -1], 0x7fffffff - 8), "groupCount");
    });

    it("rejects non-integer group IDs and group counts (TypeScript only)", () => {
      const graph = TestGraphs.of(2, 0, 1);
      expectIndexError(() => NodePartition.of(graph, [0, 0.5], 2));
      expectArgumentError(() => NodePartition.of(graph, [0, 0], 1.5));
    });
  });

  describe("reduce", () => {
    it("gives empty groups the identity and keeps their object entry", () => {
      const p = NodePartition.of(TestGraphs.of(4), [1, -1, 1, 0], 3);
      // group 0 = {3}, group 1 = {0, 2}, group 2 empty; node 1 in no group
      const sum = (a: number, b: number) => a + b;
      expect(ints(p.reduce(Int32Array.of(1, 100, 2, 7), 0, sum))).toEqual([7, 3, 0]);
      expect(ints(p.reduce(Int32Array.of(1, 100, 2, 7), -1, Math.max))).toEqual([7, 2, -1]);
      const longs = p.reduce(BigInt64Array.of(1n, 100n, 2n, 7n), 0n, (a, b) => a + b);
      expect(longs).toBeInstanceOf(BigInt64Array);
      expect(Array.from(longs)).toEqual([7n, 3n, 0n]);
      const doubles = p.reduce(Float64Array.of(1, 100, 2, 7), 0.5, sum);
      expect(doubles).toBeInstanceOf(Float64Array);
      expect(Array.from(doubles)).toEqual([7.5, 3.5, 0.5]);
      expectArgumentError(() => p.reduce(new Int32Array(3), 0, sum));
      expectArgumentError(() =>
        p.reduce(new Array<string>(4).fill(""), new Array<string>(2), (a: string, b: string) => a + b),
      );
      const groupValues: (string | null)[] = [null, null, "untouched"];
      p.reduce<string | null>(["a", "x", "b", "c"], groupValues, (a, b) => `${a}${b}`);
      expect(groupValues).toEqual(["c", "ab", "untouched"]);
    });

    it("writes into groupValues also for typed values (TypeScript only)", () => {
      const p = NodePartition.of(TestGraphs.of(4), [1, -1, 1, 0], 3);
      const groupValues = [99, 99, 99];
      p.reduce(Float64Array.of(1, 100, 2, 7), groupValues, (a, b) => a + b);
      expect(groupValues).toEqual([7, 3, 99]);
      expectArgumentError(() => p.reduce(Float64Array.of(1, 2, 3, 4), [0, 0], (a, b) => a + b));
    });

    it("rejects the same array for values and groupValues", () => {
      const p = NodePartition.of(TestGraphs.of(2), [1, 0], 2);
      const values = ["a", "b"];
      expectArgumentError(() => p.reduce(values, values, (a, b) => a + b));
      expect(values).toEqual(["a", "b"]);
    });

    it("folds in ascending member order", () => {
      const p = NodePartition.of(TestGraphs.of(3), [0, 0, 0], 1);
      expect(ints(p.reduce(Int32Array.of(1, 2, 3), 0, (acc, v) => acc * 10 + v))).toEqual([123]);
    });

    it("wraps each step in the element type, as Java's int and long arithmetic (TypeScript only)", () => {
      const p = NodePartition.of(TestGraphs.of(3), [0, 0, 0], 1);
      // Java: ((0 + MAX) + MAX) + 2 in int arithmetic.
      const max = 0x7fffffff;
      expect(ints(p.reduce(Int32Array.of(max, max, 2), 0, (a, b) => a + b))).toEqual([(max + max + 2) | 0]);
      const longMax = 0x7fffffffffffffffn;
      expect(Array.from(p.reduce(BigInt64Array.of(longMax, 1n, 0n), 0n, (a, b) => a + b))).toEqual([
        -0x8000000000000000n,
      ]);
      expect(p.reduce(Uint8Array.of(200, 100, 1), 0, (a, b) => a + b)).toEqual(Uint8Array.of(45));
    });
  });
});
