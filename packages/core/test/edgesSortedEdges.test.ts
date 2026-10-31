import { describe, expect, it } from "vitest";
import { Edges, type Graph, GraphBuilder } from "../src/index.js";
import { ints } from "./testutils/assertions.js";
import { JavaRandom } from "./testutils/javaRandom.js";
import { TestGraphs } from "./testutils/testGraphs.js";

/** Fills the slots past `count`, as a growing list leaves them; never a valid node. */
const JUNK = 1_000_000;

function withJunkTail(values: number[]): Int32Array {
  const array = new Int32Array(values.length + 3).fill(JUNK);
  array.set(values);
  return array;
}

/** An edge as one comparable number; node counts here stay below 32. */
const key = (source: number, target: number) => source * 32 + target;

function assertSorted(pairs: number[][], nodeCount: number, dropDuplicates: boolean, iteration: number): void {
  const count = pairs.length;
  const builder = new GraphBuilder();
  builder.addNodes(nodeCount);
  builder.addEdgePairs(pairs.flat());
  const graph: Graph = builder.build();
  let expected = pairs.map(([s, t]) => key(s, t)).sort((a, b) => a - b);
  if (dropDuplicates) expected = expected.filter((k, i) => i === 0 || k !== expected[i - 1]);
  // Half the iterations pass the edge indices, half leave them to be looked up.
  const sources = Int32Array.from(pairs, (p) => p[0]);
  const targets = Int32Array.from(pairs, (p) => p[1]);
  const edgeIndices = Int32Array.from(pairs, ([s, t]) => (iteration % 2 === 0 ? graph.edgeIndexOf(s, t) : -1));
  const edges = Edges.sortedEdges(graph, sources, targets, edgeIndices, count, dropDuplicates);
  const actual: number[] = [];
  for (let p = 0; p < edges.count; p++) {
    const source = edges.sourceNodes[p];
    const target = edges.targetNodes[p];
    actual.push(key(source, target));
    expect(edges.edgeIndices[p]).toBe(graph.edgeIndexOf(source, target));
  }
  expect(actual, `iteration ${iteration}, dropDuplicates ${dropDuplicates}`).toEqual(expected);
}

describe("EdgesSortedEdgesTest", () => {
  it("orders random, ascending and descending input alike", () => {
    const random = new JavaRandom(5);
    for (let iteration = 0; iteration < 500; iteration++) {
      const nodeCount = 1 + random.nextInt(20);
      const count = random.nextInt(40);
      let pairs: number[][] = [];
      for (let i = 0; i < count; i++) {
        const source = random.nextInt(nodeCount);
        pairs.push([source, random.nextInt(nodeCount)]);
      }
      const ascending = () => [...pairs].sort((a, b) => key(a[0], a[1]) - key(b[0], b[1]));
      if (iteration % 3 === 1) pairs = ascending();
      else if (iteration % 3 === 2) pairs = ascending().reverse();
      for (const dropDuplicates of [false, true]) assertSorted(pairs, nodeCount, dropDuplicates, iteration);
    }
  });

  it("reads only the first count entries and leaves the arrays untouched", () => {
    // 0 -> 1 (edge 0), 0 -> 2 (1), 1 -> 2 (2), 2 -> 0 (3), 3 -> 1 (4).
    const graph = TestGraphs.of(4, 0, 1, 0, 2, 1, 2, 2, 0, 3, 1);
    const mixed = [
      [2, 0, 3, 0, 1],
      [0, 2, 1, 1, 2],
      [3, -1, 4, 0, -1],
    ];
    const ascending = [
      [0, 0, 1, 2, 3],
      [1, 2, 2, 0, 1],
      [-1, 1, 2, -1, 4],
    ];
    const descending = [
      [3, 2, 1, 0, 0],
      [1, 0, 2, 2, 1],
      [4, 3, -1, 1, 0],
    ];
    for (const input of [mixed, ascending, descending]) {
      const sources = withJunkTail(input[0]);
      const targets = withJunkTail(input[1]);
      const edgeIndices = withJunkTail(input[2]);
      const sourcesBefore = sources.slice();
      const targetsBefore = targets.slice();
      const edgeIndicesBefore = edgeIndices.slice();

      const edges = Edges.sortedEdges(graph, sources, targets, edgeIndices, 5, false);

      expect(ints(edges.sourceNodes)).toEqual([0, 0, 1, 2, 3]);
      expect(ints(edges.targetNodes)).toEqual([1, 2, 2, 0, 1]);
      expect(ints(edges.edgeIndices)).toEqual([0, 1, 2, 3, 4]);
      expect(sources).toEqual(sourcesBefore);
      expect(targets).toEqual(targetsBefore);
      expect(edgeIndices).toEqual(edgeIndicesBefore);
    }
  });

  it("drops duplicates from parallel arrays", () => {
    // 0 -> 1 (edge 0), 1 -> 0 (1), 1 -> 2 (2).
    const graph = TestGraphs.of(3, 0, 1, 1, 0, 1, 2);
    const edges = Edges.sortedEdges(
      graph,
      withJunkTail([1, 0, 1, 1, 0]),
      withJunkTail([2, 1, 0, 2, 1]),
      withJunkTail([-1, 0, 1, 2, -1]),
      5,
      true,
    );
    expect(ints(edges.sourceNodes)).toEqual([0, 1, 1]);
    expect(ints(edges.targetNodes)).toEqual([1, 0, 2]);
    expect(ints(edges.edgeIndices)).toEqual([0, 1, 2]);
  });

  it("returns the shared empty list for no edges", () => {
    const graph = TestGraphs.of(2, 0, 1);
    const none = new Int32Array(4).fill(JUNK);
    expect(Edges.sortedEdges(graph, none, none, none, 0, true)).toBe(Edges.empty());
  });
});
