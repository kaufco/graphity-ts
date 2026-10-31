import { describe, expect, it } from "vitest";
import { EdgePartition } from "../src/index.js";
import { expectArgumentError, expectIndexError, ints } from "./testutils/assertions.js";

/**
 * Six original edges in three condensed groups: 0 and 1 to group 0, 3 to 1, 5 to 2; edges 2 and
 * 4 unmapped (intra-group). Built through the internal constructor, as the Java test does.
 */
function sampleEdgePartition(): EdgePartition {
  return EdgePartition.create(Int32Array.of(0, 0, -1, 1, -1, 2), Int32Array.of(0, 1, 3, 5), Int32Array.of(0, 2, 3, 4));
}

describe("EdgePartitionTest", () => {
  it("groupCount reports the number of condensed edges", () => {
    expect(sampleEdgePartition().groupCount).toBe(3);
  });

  it("indexCount reports the total original edges", () => {
    const p = sampleEdgePartition();
    expect(p.indexCount).toBe(6);
    expect(p.edgeCount).toBe(6);
  });

  it("get returns the condensed edge or -1", () => {
    const p = sampleEdgePartition();
    expect([0, 1, 2, 3, 4, 5].map((e) => p.get(e))).toEqual([0, 0, -1, 1, -1, 2]);
  });

  it.each([-1, 6, 100])("get(%i) out of range throws", (edge) => {
    const p = sampleEdgePartition();
    expectIndexError(() => p.get(edge));
    expectIndexError(() => p.isMapped(edge));
  });

  it("isPartial is true when intra-group edges are present", () => {
    const p = sampleEdgePartition();
    expect(p.isPartial).toBe(true);
    expect(p.mappedCount).toBe(4);
  });

  it("indicesOf returns the sorted original edges per condensed edge", () => {
    const p = sampleEdgePartition();
    expect(ints(p.indicesOf(0))).toEqual([0, 1]);
    expect(ints(p.indicesOf(1))).toEqual([3]);
    expect(ints(p.indicesOf(2))).toEqual([5]);
  });

  it("edgesOf delegates to indicesOf", () => {
    const p = sampleEdgePartition();
    expect(ints(p.edgesOf(0))).toEqual([0, 1]);
    expect(ints(p.edgesOf(1))).toEqual([3]);
    expect(ints(p.edgesOf(2))).toEqual([5]);
  });

  it("sizeOf reports the edges per group", () => {
    const p = sampleEdgePartition();
    expect([0, 1, 2].map((g) => p.sizeOf(g))).toEqual([2, 1, 1]);
  });

  it.each([-1, 3, 100])("indicesOf(%i) out of range throws", (groupId) => {
    expectIndexError(() => sampleEdgePartition().indicesOf(groupId));
  });

  it.each([-1, 3, 100])("sizeOf(%i) out of range throws", (groupId) => {
    expectIndexError(() => sampleEdgePartition().sizeOf(groupId));
  });

  describe("reduce", () => {
    it("folds the members of each group", () => {
      const p = sampleEdgePartition();
      // groups: {0, 1}, {3}, {5}; edges 2 and 4 are in no group
      expect(ints(p.reduce(Int32Array.of(1, 2, 100, 4, 100, 8), 0, (a, b) => a + b))).toEqual([3, 4, 8]);
      expect(Array.from(p.reduce(BigInt64Array.of(1n, 2n, 100n, 4n, 100n, 8n), 1n, (a, b) => a * b))).toEqual([
        2n,
        4n,
        8n,
      ]);
      expect(ints(p.reduce(Float64Array.of(1, 2, 100, 4, 100, 8), 0.0, Math.max))).toEqual([2.0, 4.0, 8.0]);
      const groupValues = new Array<string>(3);
      p.reduce(["a", "b", "x", "c", "y", "d"], groupValues, (a, b) => a + b);
      expect(groupValues).toEqual(["ab", "c", "d"]);
      const fromTyped = new Array<number>(3);
      p.reduce(Int32Array.of(1, 2, 100, 4, 100, 8), fromTyped, (a, b) => a + b);
      expect(fromTyped).toEqual([3, 4, 8]);
    });

    it("rejects arrays of the wrong length", () => {
      const p = sampleEdgePartition();
      expectArgumentError(() => p.reduce(new Int32Array(5), 0, (a, b) => a + b));
      expectArgumentError(() => p.reduce(new Array<string>(6).fill(""), new Array<string>(2), (a, b) => a + b));
    });

    it("rejects the same array for values and groupValues", () => {
      // Three edges in three singleton groups, so both arrays have the same length.
      const p = EdgePartition.create(Int32Array.of(1, 0, 2), Int32Array.of(1, 0, 2), Int32Array.of(0, 1, 2, 3));
      const values = ["a", "b", "c"];
      expectArgumentError(() => p.reduce(values, values, (a, b) => a + b));
      expect(values).toEqual(["a", "b", "c"]);
    });
  });
});
