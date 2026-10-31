import { describe, expect, it } from "vitest";
import { BfsDistances, Graphs, NodeMapping, SortedIntView } from "../src/index.js";
import { expectIndexError, ints } from "./testutils/assertions.js";
import { TestGraphs } from "./testutils/testGraphs.js";

describe("BfsDistancesTest", () => {
  it("gives distances and paths from one source", () => {
    // 0 -> 1 -> 2 -> 3, 0 -> 2; node 4 unreachable.
    const g = TestGraphs.of(5, 0, 1, 1, 2, 2, 3, 0, 2);
    const d = BfsDistances.of(g, 0);
    expect(d.distanceOf(0)).toBe(0);
    expect(d.distanceOf(1)).toBe(1);
    expect(d.distanceOf(2)).toBe(1);
    expect(d.distanceOf(3)).toBe(2);
    expect(d.distanceOf(4)).toBe(-1);
    expect(d.isReachable(3)).toBe(true);
    expect(d.isReachable(4)).toBe(false);
    expect(ints(d.pathTo(3))).toEqual([0, 2, 3]);
    expect(ints(d.pathTo(0))).toEqual([0]);
    expect(ints(d.pathTo(4))).toEqual([]);
    expect(d.maxDistance).toBe(2);
  });

  it("several sources give the distance to the nearest", () => {
    const d = BfsDistances.of(TestGraphs.path(5), [0, 3, 3]);
    expect(d.distanceOf(2)).toBe(2);
    expect(d.distanceOf(4)).toBe(1);
    expect(ints(d.pathTo(4))).toEqual([3, 4]);
    expect(d.maxDistance).toBe(2);
  });

  it("takes the sources as a typed array or a SortedIntView", () => {
    const g = TestGraphs.path(5);
    expect(BfsDistances.of(g, Int32Array.of(0, 3)).distanceOf(4)).toBe(1);
    expect(BfsDistances.of(g, SortedIntView.viewOf(Int32Array.of(0, 3), 0, 2)).distanceOf(4)).toBe(1);
  });

  it("cycles and self-loops are harmless", () => {
    const d = BfsDistances.of(TestGraphs.of(3, 0, 0, 0, 1, 1, 2, 2, 0), 1);
    expect(d.distanceOf(0)).toBe(2);
    expect(ints(d.pathTo(0))).toEqual([1, 2, 0]);
  });

  it("handles empty sources and the empty graph", () => {
    const d = BfsDistances.of(TestGraphs.of(2, 0, 1), []);
    expect(d.isReachable(0)).toBe(false);
    expect(d.maxDistance).toBe(-1);
    expect(BfsDistances.of(TestGraphs.empty(), []).maxDistance).toBe(-1);
  });

  it("every path is a new array", () => {
    // Java returns an unmodifiable list; the port returns a fresh Int32Array per call, so writing
    // to one cannot change the result.
    const d = BfsDistances.of(TestGraphs.path(3), 0);
    const path = d.pathTo(2);
    path[0] = 1;
    expect(ints(d.pathTo(2))).toEqual([0, 1, 2]);
  });

  it("handles a path of a million nodes", () => {
    const n = 1_000_000;
    const d = BfsDistances.of(TestGraphs.path(n), 0);
    expect(d.maxDistance).toBe(n - 1);
    expect(d.pathTo(n - 1).length).toBe(n);
  });

  it("rejects out-of-range arguments", () => {
    const g = TestGraphs.path(3);
    expectIndexError(() => BfsDistances.of(g, 3));
    expectIndexError(() => BfsDistances.of(g, [0, -1]));
    expectIndexError(() => BfsDistances.of(g, 1.5));
    expectIndexError(() => BfsDistances.of(g, undefined as never), "Index undefined");
    const d = BfsDistances.of(g, 0);
    expectIndexError(() => d.distanceOf(3));
    expectIndexError(() => d.isReachable(-1));
    expectIndexError(() => d.pathTo(3));
  });

  // --- Graphs.reachableFrom ---

  it("reachableFrom returns the sorted reachable set", () => {
    const g = TestGraphs.of(6, 3, 1, 1, 5, 5, 3, 0, 2);
    expect(ints(Graphs.reachableFrom(g, 3))).toEqual([1, 3, 5]);
    expect(ints(Graphs.reachableFrom(g, [4, 0, 4]))).toEqual([0, 2, 4]);
    expect(ints(Graphs.reachableFrom(g, []))).toEqual([]);
    expect(ints(Graphs.reachableFrom(TestGraphs.empty(), []))).toEqual([]);
  });

  it("reachableFrom extracts a subgraph", () => {
    // Two functions in one graph: 0 -> 1 -> 2 and 3 -> 4.
    const g = TestGraphs.of(5, 0, 1, 1, 2, 3, 4);
    const fn = Graphs.remapped(g, NodeMapping.forSubgraph(Graphs.reachableFrom(g, 3)));
    expect(fn.nodeCount).toBe(2);
    expect(fn.hasOutNode(0, 1)).toBe(true);
  });

  it("reachableFrom rejects out-of-range sources", () => {
    const g = TestGraphs.path(3);
    expectIndexError(() => Graphs.reachableFrom(g, 3));
    expectIndexError(() => Graphs.reachableFrom(g, [-1]));
  });
});
