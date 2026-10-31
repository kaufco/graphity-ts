/**
 * Counterpart of Java's `EdgeMappingTest`. `get`, `isMapped`, `mappedCount`, `isPartial`,
 * `indexCount` and the inverse and compose helpers are shared with `NodeMapping` through
 * `IndexMapping` and exercised in the NodeMapping tests; this file covers what is EdgeMapping-specific: the result types of
 * `inverted` and `compose`, and `gather` on edge data. Integration with `Graphs.edgeMapping` is
 * covered in the Graphs tests.
 */

import { describe, expect, it } from "vitest";
import { EdgeMapping, Graphs, NodeMapping } from "../src/index.js";
import { expectArgumentError, expectIndexError, ints } from "./testutils/assertions.js";
import { TestGraphs } from "./testutils/testGraphs.js";

/** An edge mapping made by hand, as Java's package-private constructor. */
const edgeMapping = (mapping: number[], validCount: number) => EdgeMapping.create(Int32Array.from(mapping), validCount);

const targetsOf = (m: EdgeMapping) => Array.from({ length: m.indexCount }, (_, i) => m.get(i));

describe("EdgeMappingTest", () => {
  it("inverseReturnsEdgeMapping", () => {
    const inv = edgeMapping([2, 0, 1], 3).inverted(3);
    expect(inv).toBeInstanceOf(EdgeMapping);
    expect(targetsOf(inv)).toEqual([1, 2, 0]);
  });

  it("composeReturnsEdgeMapping", () => {
    const composed = edgeMapping([10, 20, 30], 3).compose(edgeMapping([1, 0, 2], 3));
    expect(composed).toBeInstanceOf(EdgeMapping);
    expect(targetsOf(composed)).toEqual([20, 10, 30]);
  });

  it("inverseOfMappingWithHolesIsPartial", () => {
    // Source 1 has no target (-1), so one of the three targets has no source in the inverse.
    const inv = edgeMapping([2, -1, 0], 2).inverted(3);
    expect(inv.isPartial).toBe(true);
    expect(inv.get(1)).toBe(-1);
  });

  it("inverseCoversTheWholeTargetSpace", () => {
    // Path 0 -> 1 -> 2 -> 3 restricted to nodes {0, 1, 2}: the old edge 2 has no new edge.
    const graph = TestGraphs.path(4);
    const keep = NodeMapping.forSubgraph(0, 1, 2);
    const newToOld = Graphs.edgeMapping(Graphs.remapped(graph, keep), graph, keep);
    const oldToNew = newToOld.inverted(graph.edgeCount);
    expect(oldToNew.isPartial).toBe(true);
    expect(oldToNew.indexCount).toBe(3);
    expect(Array.from(oldToNew.gather(Float64Array.of(0.5, 1.5)))).toEqual([0.5, 1.5, 0]);
    expectIndexError(() => newToOld.inverted(1));
  });

  it("composeWithHolesPropagatesPartiality", () => {
    const composed = edgeMapping([10, 20, 30], 3).compose(edgeMapping([1, -1, 2], 2));
    expect(composed.isPartial).toBe(true);
    expect(composed.get(1)).toBe(-1);
  });

  it("composeRejectsInnerValueOutOfOuterRange", () => {
    expectIndexError(() => edgeMapping([10, 20], 2).compose(edgeMapping([0, 2], 2)), "2");
  });

  it("inverseRejectsANegativeTargetCountAndRepeatedTargets", () => {
    expectArgumentError(() => edgeMapping([0], 1).inverted(-1));
    expectArgumentError(() => edgeMapping([0, 0], 2).inverted(1));
  });

  it("inverseRejectsATargetCountBeyondTheLargestArray", () => {
    const em = edgeMapping([], 0);
    expectArgumentError(() => em.inverted(0x7fffffff - 7), "targetCount");
  });

  it("gatherMovesEdgeValuesToTheNewNumbering", () => {
    const em = edgeMapping([2, -1, 1], 2);
    expect(ints(em.gather(Int32Array.of(5, 6, 7)))).toEqual([7, 0, 6]);
    expect(Array.from(em.gather(BigInt64Array.of(5n, 6n, 7n)))).toEqual([7n, 0n, 6n]);
    expect(Array.from(em.gather(Float64Array.of(0.5, 1.5, 2.5)))).toEqual([2.5, 0, 1.5]);
    expectIndexError(() => em.gather(Int32Array.of(5, 6)));
    expectArgumentError(() =>
      em.gather(new Array<number | null>(3).fill(null), new Array<number | null>(2).fill(null)),
    );
    const same = new Array<number | null>(3).fill(null);
    expectArgumentError(() => em.gather(same, same));
    const newValues = new Array<number | null>(3).fill(null);
    em.gather([5, 6, 7], newValues);
    expect(newValues).toEqual([7, null, 6]);
    const fromTyped = new Array<number | null>(3).fill(null);
    em.gather(Int32Array.of(5, 6, 7), fromTyped);
    expect(fromTyped).toEqual([7, null, 6]);
  });
});
