import { describe, expect, it } from "vitest";
import { Csr, Graph } from "../src/index.js";
import { expectArgumentError, expectIndexError, ints } from "./testutils/assertions.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";

describe("GraphOfTest", () => {
  it("builds the graph the arrays describe", () => {
    const graph = Graph.of([0, 2, 2, 3], [1, 2, 0]);
    expect(graph.nodeCount).toBe(3);
    expect(graph.edgeCount).toBe(3);
    expect(ints(graph.outNodes(0))).toEqual([1, 2]);
    expect(ints(graph.outNodes(1))).toEqual([]);
    expect(ints(graph.outNodes(2))).toEqual([0]);
    expect(graph.edgeTarget(2)).toBe(0);
  });

  it("accepts typed arrays as well as plain ones", () => {
    const graph = Graph.of(Int32Array.of(0, 2, 2, 3), Int32Array.of(1, 2, 0));
    expect(graph.equals(Graph.of([0, 2, 2, 3], [1, 2, 0]))).toBe(true);
  });

  it("empty graph", () => {
    const graph = Graph.of([0], []);
    expect(graph.nodeCount).toBe(0);
    expect(graph.edgeCount).toBe(0);
  });

  it("self-loops are allowed", () => {
    const graph = Graph.of([0, 2, 3], [0, 1, 1]);
    expect(ints(graph.outNodes(0))).toEqual([0, 1]);
    expect(ints(graph.outNodes(1))).toEqual([1]);
  });

  it("copies both arrays", () => {
    const start = Int32Array.of(0, 1, 1);
    const targets = Int32Array.of(1);
    const graph = Graph.of(start, targets);
    start[1] = 0;
    targets[0] = 0;
    expect(Csr.outAdjacencyStart(graph)).not.toBe(start);
    expect(ints(Csr.outAdjacencyStart(graph))).toEqual([0, 1, 1]);
    expect(Csr.outAdjacency(graph)).not.toBe(targets);
    expect(ints(Csr.outAdjacency(graph))).toEqual([1]);
  });

  it("round-trips the arrays of any graph", () => {
    for (let seed = 0; seed < 20; seed++) {
      const original = RandomGraphs.gnp(50, 0.08, seed);
      const copy = Graph.of(Csr.outAdjacencyStart(original), Csr.outAdjacency(original));
      expect(Csr.outAdjacencyStart(copy)).toEqual(Csr.outAdjacencyStart(original));
      expect(Csr.outAdjacency(copy)).toEqual(Csr.outAdjacency(original));
    }
  });

  it("rejects empty offsets", () => {
    expectArgumentError(() => Graph.of([], []), "empty");
  });

  it("rejects offsets not starting at zero", () => {
    expectArgumentError(() => Graph.of([1, 1], [0]), "outAdjacencyStart[0]");
  });

  it("rejects offsets not ending at the target count", () => {
    expectArgumentError(() => Graph.of([0, 1], [0, 0]), "outAdjacency.length");
    expectArgumentError(() => Graph.of([0, 2], [0]));
  });

  it("rejects decreasing offsets before reading past the targets", () => {
    expectArgumentError(() => Graph.of([0, 5, 3], [0, 1, 2]), "decreases");
  });

  it("rejects targets out of range", () => {
    expectIndexError(() => Graph.of([0, 1, 1], [2]), "out-node 2 of node 0");
    expectIndexError(() => Graph.of([0, 1, 1], [-1]));
  });

  it("rejects targets that are not ints, which the copy would truncate", () => {
    for (const target of [1.5, 0.9, -0.5, NaN, Infinity, 2 ** 32]) {
      expectIndexError(
        () => Graph.of([0, 1, 1], [target]),
        `out-node ${target} of node 0 at position 0 is not in 0..1`,
      );
    }
    expectIndexError(() => Graph.of([0, 1, 1], new Array<number>(1)), "out-node undefined of node 0");
    expectIndexError(() => Graph.of([0, 1, 1], Float64Array.of(0.5)));
    expectIndexError(() => Graph.of([0, 1], [0.5]), "out-node 0.5 of node 0 at position 0 is not in 0..0");
  });

  it("rejects a target that is not an int only after Java's earlier checks, as one out of range", () => {
    // Java checks the offsets and the limits before the out-nodes.
    expectArgumentError(() => Graph.of([], [0.5]), "outAdjacencyStart must hold nodeCount + 1 offsets, but is empty");
    expectArgumentError(() => Graph.of([0, 5], [0.5]), "outAdjacencyStart[1] must be outAdjacency.length 1, but was 5");
    expectArgumentError(() => Graph.of([0, 5], [7]), "outAdjacencyStart[1] must be outAdjacency.length 1, but was 5");
    // The first out-node out of range is reported, whether it is an int or not.
    expectIndexError(() => Graph.of([0, 2, 2], [-1, 0.5]), "out-node -1 of node 0 at position 0");
    expectIndexError(() => Graph.of([0, 2, 2], [0.5, -1]), "out-node 0.5 of node 0 at position 0");
    expectArgumentError(() => Graph.of([0, 2, 2, 3], [1, 0, 0.5]), "strictly ascending");
  });

  it("rejects offsets that are not ints, which the copy would truncate", () => {
    for (const offset of [0.5, NaN, 2 ** 32]) {
      expectArgumentError(
        () => Graph.of([0, offset, 1], [0]),
        `outAdjacencyStart[1] must be an int, but was ${offset}`,
      );
    }
  });

  it("accepts typed arrays of any int type", () => {
    const graph = Graph.of(Uint8Array.of(0, 2, 2, 3), Float64Array.of(1, 2, 0));
    expect(graph.equals(Graph.of([0, 2, 2, 3], [1, 2, 0]))).toBe(true);
  });

  it("rejects unsorted adjacency", () => {
    expectArgumentError(() => Graph.of([0, 2, 2], [1, 0]), "strictly ascending");
  });

  it("rejects duplicate targets", () => {
    expectArgumentError(() => Graph.of([0, 2, 2], [1, 1]), "strictly ascending");
  });

  it("rejects arrays beyond the node and edge limits before reading them", () => {
    // Arrays that long take gigabytes; the check reads only their lengths, so stand-ins suffice.
    // The limits are those Graph.readFrom applies: 2^31 - 10 nodes, 2^31 - 9 edges.
    const nodeLimit = 0x7fffffff - 9;
    const edgeLimit = 0x7fffffff - 8;
    const ofLength = (length: number) => ({ length }) as unknown as Int32Array;
    expectArgumentError(
      () => Graph.ofOwned(ofLength(nodeLimit + 2), new Int32Array(0)),
      `a graph holds at most ${nodeLimit} nodes and ${edgeLimit} edges, but these arrays hold ${nodeLimit + 1} and 0`,
    );
    expectArgumentError(
      () => Graph.ofOwned(Int32Array.of(0), ofLength(edgeLimit + 1)),
      `but these arrays hold 0 and ${edgeLimit + 1}`,
    );
    // At the limits the check passes, and the next one reads the stand-in.
    expectArgumentError(() => Graph.ofOwned(ofLength(nodeLimit + 1), ofLength(edgeLimit)), "outAdjacencyStart[0]");
  });

  it("sortedness is checked per list, not across lists", () => {
    const graph = Graph.of([0, 1, 2], [1, 0]);
    expect(ints(graph.outNodes(1))).toEqual([0]);
  });
});
