import { describe, expect, it } from "vitest";
import { Edges, EdgeType, EdgeTypes } from "../src/index.js";
import { expectArgumentError, ints } from "./testutils/assertions.js";
import { TestGraphs } from "./testutils/testGraphs.js";

/** Java's package-private `Edges.wrap` is the internal constructor here. */
const wrap = (sources: number[], targets: number[], edgeIndices: number[]) =>
  Edges.create(Int32Array.from(sources), Int32Array.from(targets), Int32Array.from(edgeIndices));

describe("EdgesTest", () => {
  it("the constructor stores all three lists", () => {
    const src = Int32Array.of(0, 1, 2);
    const tgt = Int32Array.of(3, 4, 5);
    const idx = Int32Array.of(6, 7, 8);
    const edges = Edges.create(src, tgt, idx);
    expect(edges.sourceNodes).toBe(src);
    expect(edges.targetNodes).toBe(tgt);
    expect(edges.edgeIndices).toBe(idx);
  });

  it("count returns the number of edges", () => {
    expect(wrap([0, 1, 2], [3, 4, 5], [0, 1, 2]).count).toBe(3);
  });

  it("isEmpty on empty lists is true", () => {
    const edges = wrap([], [], []);
    expect(edges.isEmpty).toBe(true);
    expect(edges.count).toBe(0);
  });

  it("isEmpty on non-empty lists is false", () => {
    const edges = wrap([0], [1], [0]);
    expect(edges.isEmpty).toBe(false);
    expect(edges.count).toBe(1);
  });

  it("the empty factory returns an empty instance", () => {
    expect(Edges.empty().isEmpty).toBe(true);
    expect(Edges.empty().count).toBe(0);
    expect(ints(Edges.empty().sourceNodes)).toEqual([]);
    expect(ints(Edges.empty().targetNodes)).toEqual([]);
    expect(ints(Edges.empty().edgeIndices)).toEqual([]);
  });

  it("the empty factory returns a cached instance", () => {
    expect(Edges.empty()).toBe(Edges.empty());
  });

  it("Edges.of collects the edges of one type in edge index order", () => {
    // 0 -> 1 -> 2 -> 0 and 0 -> 2: tree 0->1, 1->2; back 2->0; forward 0->2.
    const graph = TestGraphs.of(3, 0, 1, 0, 2, 1, 2, 2, 0);
    const types = EdgeTypes.of(graph);
    const tree = Edges.of(types, EdgeType.TREE);
    expect(ints(tree.sourceNodes)).toEqual([0, 1]);
    expect(ints(tree.targetNodes)).toEqual([1, 2]);
    expect(ints(tree.edgeIndices)).toEqual([0, 2]);
    const back = Edges.of(types, EdgeType.BACK);
    expect(ints(back.edgeIndices)).toEqual([3]);
    expect(Edges.of(types, EdgeType.CROSS)).toBe(Edges.empty());
  });

  it.each([undefined, null, 4, -1, 1.5, NaN, "1"])("Edges.of rejects %s, which is not an edge type", (type) => {
    const types = EdgeTypes.of(TestGraphs.of(2, 0, 1));
    expectArgumentError(() => Edges.of(types, type as EdgeType), `not an edge type: ${String(type)}`);
  });
});
