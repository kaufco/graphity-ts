/** Counterpart of Java's `NodeMappingTest`. */

import { describe, expect, it } from "vitest";
import { BitSet, GraphBuilder, NodeMapping, SortedIntView } from "../src/index.js";
import { expectArgumentError, expectIndexError, ints } from "./testutils/assertions.js";

/** The targets of every source, through the checked public API. */
const targetsOf = (m: NodeMapping) => Array.from({ length: m.indexCount }, (_, i) => m.get(i));

const bitSetOf = (...bits: number[]) => {
  const set = new BitSet();
  for (const bit of bits) set.set(bit);
  return set;
};

describe("NodeMappingTest", () => {
  it("ofFullMappingHasNoUnmappedEntries", () => {
    const nm = NodeMapping.of([2, 0, 1]);
    expect(nm.mappedCount).toBe(3);
    expect(nm.isPartial).toBe(false);
    expect(nm.get(0)).toBe(2);
    expect(nm.get(1)).toBe(0);
    expect(nm.get(2)).toBe(1);
  });

  it("ofPartialMappingMarksIsPartial", () => {
    const nm = NodeMapping.of(Int32Array.of(2, -1, 0, -1));
    expect(nm.mappedCount).toBe(2);
    expect(nm.isPartial).toBe(true);
    expect(nm.isMapped(0)).toBe(true);
    expect(nm.isMapped(1)).toBe(false);
    expect(nm.isMapped(2)).toBe(true);
    expect(nm.isMapped(3)).toBe(false);
  });

  it("ofEmptyArrayCreatesEmptyMapping", () => {
    const nm = NodeMapping.of([]);
    expect(nm.mappedCount).toBe(0);
    expect(nm.isPartial).toBe(false);
  });

  it("ofRejectsValuesBelowMinusOne", () => {
    expectIndexError(() => NodeMapping.of([0, -2, 1]), "-2");
  });

  it("ofRejectsNonIntegerValues", () => {
    // TypeScript-specific: Java's int[] cannot hold a fraction.
    expectIndexError(() => NodeMapping.of([0, 1.5]), "1.5");
  });

  it("ofAcceptsRepeatsAsTheCallersContract", () => {
    const nm = NodeMapping.of([0, 0]);
    expect(nm.mappedCount).toBe(2);
    expectArgumentError(() => nm.inverted(1));
  });

  it("ofCopiesInputArray", () => {
    const input = [1, 2, 3];
    const nm = NodeMapping.of(input);
    input[0] = 999;
    expect(nm.get(0)).toBe(1);
  });

  it.each([-1, -100, 3, 1000, 0.5])("getOutOfRangeThrows(%s)", (id) => {
    const nm = NodeMapping.of([10, 20, 30]);
    expectIndexError(() => nm.get(id));
    expectIndexError(() => nm.isMapped(id));
  });

  it("indexCountIsTheSourceSpaceSizeIncludingUnmappedIds", () => {
    const nm = NodeMapping.of([2, -1, 0, -1]);
    expect(nm.indexCount).toBe(4);
    expect(nm.mappedCount).toBe(2);
    expect(NodeMapping.of([]).indexCount).toBe(0);
  });

  it("forSubgraphFromBitSetMapsDenseToOriginal", () => {
    const nm = NodeMapping.forSubgraph(bitSetOf(2, 5, 7));
    expect(nm.mappedCount).toBe(3);
    expect(nm.isPartial).toBe(false);
    expect(targetsOf(nm)).toEqual([2, 5, 7]);
  });

  it("forSubgraphFromBitSetBeyondItsInitialCapacity", () => {
    // The set grows when a bit beyond its capacity is set; every set bit is selected.
    const nm = NodeMapping.forSubgraph(bitSetOf(0, 63, 64, 1000));
    expect(targetsOf(nm)).toEqual([0, 63, 64, 1000]);
  });

  it("forSubgraphFromEmptyBitSetCreatesEmptyMapping", () => {
    const nm = NodeMapping.forSubgraph(new BitSet());
    expect(nm.mappedCount).toBe(0);
    expect(nm.isPartial).toBe(false);
  });

  it("forSubgraphFromUnsortedIntListSortsIds", () => {
    const nm = NodeMapping.forSubgraph([5, 2, 7]);
    expect(nm.mappedCount).toBe(3);
    expect(targetsOf(nm)).toEqual([2, 5, 7]);
  });

  it("forSubgraphFromSortedIntViewSkipsSort", () => {
    const nm = NodeMapping.forSubgraph(SortedIntView.create(Int32Array.of(2, 5, 7)));
    expect(targetsOf(nm)).toEqual([2, 5, 7]);
  });

  it("forSubgraphFromATypedArraySortsIds", () => {
    const nm = NodeMapping.forSubgraph(Int32Array.of(7, 2, 5));
    expect(targetsOf(nm)).toEqual([2, 5, 7]);
  });

  it("forSubgraphRejectsDuplicatesInList", () => {
    expectArgumentError(() => NodeMapping.forSubgraph([3, 1, 3]), "3");
  });

  it("forSubgraphRejectsANegativeIdInSortedIntView", () => {
    const withNegative = SortedIntView.create(Int32Array.of(-1, 2));
    expectIndexError(() => NodeMapping.forSubgraph(withNegative));
  });

  it("forSubgraphRejectsWhatIsNotAList", () => {
    // A view of a second installed copy of the core, which would otherwise select no node.
    const foreign = { array: Int32Array.of(2, 5), fromIndex: 0, toIndex: 2 };
    expect(() => NodeMapping.forSubgraph(foreign as never)).toThrow(TypeError);
    expect(() => NodeMapping.forSubgraph(foreign as never)).toThrow("not a list");
    expect(() => NodeMapping.forSubgraph(null as never)).toThrow(new TypeError("not a list: null"));
  });

  it("forSubgraphRejectsIdsThatAreNotIntegersAfterDuplicates", () => {
    expectIndexError(() => NodeMapping.forSubgraph(1, 0.5), "selected node ID must be an integer: 0.5");
    expectArgumentError(() => NodeMapping.forSubgraph(1, 1, 0.5), "selected contains node 1 more than once");
    expectArgumentError(() => NodeMapping.forSubgraph([1, 0.5, 1]), "selected contains node 1 more than once");
    // A negative ID is reported after duplicates as well, as in Java.
    expectArgumentError(() => NodeMapping.forSubgraph(1, 1, -1), "selected contains node 1 more than once");
    expectIndexError(() => NodeMapping.forSubgraph([2, NaN, NaN]), "selected node ID must be an integer: NaN");
    expectIndexError(
      () => NodeMapping.forSubgraph(new Array<number>(2)),
      "selected node ID must be an integer: undefined",
    );
  });

  it("forSubgraphRejectsNegativeIds", () => {
    expectIndexError(() => NodeMapping.forSubgraph([2, -1]));
    expectIndexError(() => NodeMapping.forSubgraph(2, -1));
  });

  it("forSubgraphFromLooseArgumentsSortsIds", () => {
    const nm = NodeMapping.forSubgraph(5, 2, 7);
    expect(nm.mappedCount).toBe(3);
    expect(nm.isPartial).toBe(false);
    expect(targetsOf(nm)).toEqual([2, 5, 7]);
  });

  it("forSubgraphFromASingleLooseArgument", () => {
    expect(targetsOf(NodeMapping.forSubgraph(4))).toEqual([4]);
  });

  it("forSubgraphFromNoArgumentsCreatesEmptyMapping", () => {
    const nm = NodeMapping.forSubgraph();
    expect(nm.mappedCount).toBe(0);
    expect(nm.isPartial).toBe(false);
  });

  it("forSubgraphCopiesInputArray", () => {
    const input = [5, 2, 7];
    const nm = NodeMapping.forSubgraph(input);
    expect(input).toEqual([5, 2, 7]);
    input[0] = 999;
    expect(nm.get(1)).toBe(5);
    const typed = Int32Array.of(5, 2, 7);
    NodeMapping.forSubgraph(typed);
    expect(ints(typed)).toEqual([5, 2, 7]);
  });

  it("forSubgraphArrayAndBitSetAgree", () => {
    const fromBitSet = NodeMapping.forSubgraph(bitSetOf(2, 5, 7));
    const fromArray = NodeMapping.forSubgraph(7, 2, 5);
    expect(fromArray.mappedCount).toBe(fromBitSet.mappedCount);
    expect(targetsOf(fromArray)).toEqual(targetsOf(fromBitSet));
  });

  it("forSubgraphRejectsDuplicatesInArray", () => {
    expectArgumentError(() => NodeMapping.forSubgraph(3, 1, 3));
  });

  it("forPermutationWrapsOrder", () => {
    const nm = NodeMapping.forPermutation([2, 0, 1]);
    expect(nm.mappedCount).toBe(3);
    expect(nm.isPartial).toBe(false);
    expect(targetsOf(nm)).toEqual([2, 0, 1]);
  });

  it("forPermutationAcceptsTheResultOfTopOrderAndAView", () => {
    expect(targetsOf(NodeMapping.forPermutation(Int32Array.of(1, 0)))).toEqual([1, 0]);
    expect(targetsOf(NodeMapping.forPermutation(SortedIntView.create(Int32Array.of(0, 1, 2))))).toEqual([0, 1, 2]);
  });

  it("forPermutationRejectsDuplicates", () => {
    expectArgumentError(() => NodeMapping.forPermutation([0, 1, 1]), "1");
  });

  it("forPermutationRejectsOutOfRangeValue", () => {
    expectIndexError(() => NodeMapping.forPermutation([0, 3, 1]), "3");
  });

  it("forPermutationRejectsNegativeValue", () => {
    expectIndexError(() => NodeMapping.forPermutation([0, -1, 1]));
  });

  it("inverseOfFullPermutationIsInjective", () => {
    const inv = NodeMapping.of([2, 0, 1]).inverted(3);
    expect(targetsOf(inv)).toEqual([1, 2, 0]);
    expect(inv.isPartial).toBe(false);
    expect(inv.mappedCount).toBe(3);
  });

  it("inverseOfPartialMappingIsPartial", () => {
    const inv = NodeMapping.of([5, -1, 3]).inverted(7);
    expect(inv.mappedCount).toBe(2);
    expect(inv.indexCount).toBe(7);
    expect(inv.isPartial).toBe(true);
    expect(inv.get(3)).toBe(2);
    expect(inv.get(5)).toBe(0);
    expect(inv.get(0)).toBe(-1);
    expect(inv.get(4)).toBe(-1);
    expect(inv.get(6)).toBe(-1);
  });

  it("inverseOfSubgraphCoversTheWholeOldGraph", () => {
    // Path with 5 nodes, subgraph {0, 1}: the inverse maps all 5 old nodes, 2..4 to -1.
    const oldToNew = NodeMapping.forSubgraph(0, 1).inverted(5);
    expect(oldToNew.isPartial).toBe(true);
    expect(oldToNew.indexCount).toBe(5);
    expect(oldToNew.get(4)).toBe(-1);
    expect(ints(oldToNew.gather(Int32Array.of(7, 8)))).toEqual([7, 8, 0, 0, 0]);
    const oldNames = new Array<string | null>(5).fill(null);
    oldToNew.gather(["a", "b"], oldNames);
    expect(oldNames).toEqual(["a", "b", null, null, null]);
  });

  it("inverseRejectsATargetOutsideTheTargetSpace", () => {
    const nm = NodeMapping.forSubgraph(0, 4);
    expectIndexError(() => nm.inverted(4), /^index 1 maps to 4, but targetCount is 4$/);
    expect(nm.inverted(5).indexCount).toBe(5);
  });

  it("inverseRejectsANegativeTargetCount", () => {
    expectArgumentError(() => NodeMapping.of([]).inverted(-1));
  });

  it("inverseRejectsATargetCountBeyondTheLargestArray", () => {
    // Rejected before the inverse is allocated, as no graph has that many nodes.
    const nm = NodeMapping.of([]);
    expectArgumentError(() => nm.inverted(0x7fffffff), "targetCount");
    expectArgumentError(() => nm.inverted(0x7fffffff - 7));
  });

  it("inverseOfNonInjectiveThrows", () => {
    expectArgumentError(
      () => NodeMapping.of([1, 1, 2]).inverted(3),
      /^cannot invert mapping: indices 0 and 1 both map to 1$/,
    );
  });

  it("inverseOfEmptyIsEmpty", () => {
    const inv = NodeMapping.of([]).inverted(0);
    expect(inv.mappedCount).toBe(0);
    expect(inv.indexCount).toBe(0);
  });

  it("inverseOfAllMinusOneMapsNothing", () => {
    const inv = NodeMapping.of([-1, -1, -1]).inverted(2);
    expect(inv.mappedCount).toBe(0);
    expect(inv.indexCount).toBe(2);
    expect(inv.isPartial).toBe(true);
  });

  it("inverseRoundTripRestoresOriginal", () => {
    const roundtrip = NodeMapping.of([2, 0, 1]).inverted(3).inverted(3);
    expect(targetsOf(roundtrip)).toEqual([2, 0, 1]);
  });

  it("doubleInversionKeepsTheSourceSpace", () => {
    const roundtrip = NodeMapping.of([-1, 0, -1]).inverted(1).inverted(3);
    expect(roundtrip.indexCount).toBe(3);
    expect(ints(roundtrip.gather(Int32Array.of(5)))).toEqual([0, 5, 0]);
  });

  it("composeChainsTwoMappings", () => {
    const composed = NodeMapping.of([10, 20, 30]).compose(NodeMapping.of([1, 0, 2]));
    expect(targetsOf(composed)).toEqual([20, 10, 30]);
    expect(composed.isPartial).toBe(false);
  });

  it("composePropagatesUnmappedFromInner", () => {
    const composed = NodeMapping.of([10, 20, 30]).compose(NodeMapping.of([1, -1, 2]));
    expect(targetsOf(composed)).toEqual([20, -1, 30]);
    expect(composed.isPartial).toBe(true);
  });

  it("composePropagatesUnmappedFromOuter", () => {
    const composed = NodeMapping.of([10, -1, 30]).compose(NodeMapping.of([1, 0, 2]));
    expect(targetsOf(composed)).toEqual([-1, 10, 30]);
    expect(composed.isPartial).toBe(true);
  });

  it("composeRejectsInnerValueOutOfOuterRange", () => {
    const outer = NodeMapping.of([10, 20]);
    const inner = NodeMapping.of([0, 5, 1]);
    expectIndexError(() => outer.compose(inner), /^inner maps 1 to 5, outside the indices 0\.\.1 of this mapping$/);
  });

  it("composeReturnsNodeMapping", () => {
    const composed = NodeMapping.of([10, 20]).compose(NodeMapping.of([0, 1]));
    expect(composed).toBeInstanceOf(NodeMapping);
  });

  it("reindexEmptyGraphReturnsEmptyMapping", () => {
    expect(NodeMapping.reindex(new GraphBuilder().build()).mappedCount).toBe(0);
  });

  it("reindexSingleNodeGraphReturnsIdentity", () => {
    const builder = new GraphBuilder();
    builder.addNode();
    const nm = NodeMapping.reindex(builder.build());
    expect(nm.mappedCount).toBe(1);
    expect(nm.get(0)).toBe(0);
  });

  it("reindexIsPermutationOfAllNodes", () => {
    // Graph: 0 -> 1 -> 2, 0 -> 3
    const builder = new GraphBuilder();
    builder.addNodes(4);
    builder.addEdge(0, 1);
    builder.addEdge(1, 2);
    builder.addEdge(0, 3);
    const nm = NodeMapping.reindex(builder.build());
    expect(nm.mappedCount).toBe(4);
    expect(nm.isPartial).toBe(false);
    expect(targetsOf(nm).sort()).toEqual([0, 1, 2, 3]);
  });

  it("reindexPlacesDfsChildrenAdjacent", () => {
    // Path 0 -> 1 -> 2 -> 3: DFS from 0 visits 0, 1, 2, 3 in order
    const builder = new GraphBuilder();
    builder.addNodes(4);
    builder.addPath(0, 1, 2, 3);
    expect(targetsOf(NodeMapping.reindex(builder.build()))).toEqual([0, 1, 2, 3]);
  });

  it("reindexStartsNewTreesAtTheSmallestUnvisitedNode", () => {
    // 0 -> 3 -> 1, 2 -> 4: roots 0 and 2; the scan for the next root crosses a word boundary
    // of the visited bits only with more nodes, so a second graph checks that too.
    const b = new GraphBuilder();
    b.addNodes(5);
    b.addEdgePairs(0, 3, 3, 1, 2, 4);
    expect(targetsOf(NodeMapping.reindex(b.build()))).toEqual([0, 3, 1, 2, 4]);
    const wide = new GraphBuilder();
    wide.addNodes(70);
    wide.addEdge(0, 69);
    const order = targetsOf(NodeMapping.reindex(wide.build()));
    expect(order.slice(0, 3)).toEqual([0, 69, 1]);
    expect(order.slice(-1)).toEqual([68]);
  });

  // --- gather ---

  it("gatherMovesValuesToTheNewNumbering", () => {
    // new -> old: 0 -> 2, 1 -> -1 (unmapped), 2 -> 0
    const m = NodeMapping.of([2, -1, 0]);
    const intResult = m.gather(Int32Array.of(10, 11, 12));
    expect(intResult).toBeInstanceOf(Int32Array);
    expect(ints(intResult)).toEqual([12, 0, 10]);
    const longResult = m.gather(BigInt64Array.of(10n, 11n, 12n));
    expect(longResult).toBeInstanceOf(BigInt64Array);
    expect(Array.from(longResult)).toEqual([12n, 0n, 10n]);
    const doubleResult = m.gather(Float64Array.of(1.5, 2.5, 3.5));
    expect(doubleResult).toBeInstanceOf(Float64Array);
    expect(Array.from(doubleResult)).toEqual([3.5, 0, 1.5]);
    const newValues = ["x", "keep", "y"];
    m.gather(["a", "b", "c"], newValues);
    expect(newValues).toEqual(["c", "keep", "a"]);
  });

  it("gatherKeepsTheTypeOfAnyTypedArray", () => {
    // TypeScript-specific: every typed array, not only Java's int, long and double.
    const m = NodeMapping.of([1, -1]);
    const bytes = m.gather(Uint8Array.of(7, 9));
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes)).toEqual([9, 0]);
    const floats = m.gather(Float32Array.of(0.5, 0.25));
    expect(floats).toBeInstanceOf(Float32Array);
    expect(Array.from(floats)).toEqual([0.25, 0]);
  });

  it("gatherWithNewValuesWritesThemAlsoForTypedValues", () => {
    // TypeScript-specific: a typed array is an ArrayLike, so it may stand where Java has T[].
    const m = NodeMapping.of([1, -1]);
    const newValues = [7, 7];
    m.gather(Float64Array.of(0.5, 0.25), newValues);
    expect(newValues).toEqual([0.25, 7]);
  });

  it("gatherAlongASubgraph", () => {
    const newToOld = NodeMapping.forSubgraph(1, 3);
    expect(ints(newToOld.gather(Int32Array.of(0, 10, 20, 30)))).toEqual([10, 30]);
  });

  it("gatherRejectsWrongArrays", () => {
    const m = NodeMapping.of([2, 0]);
    expectIndexError(() => m.gather(Int32Array.of(1, 2)));
    expectIndexError(() => m.gather(["a", "b"], new Array<string>(2)));
    expectArgumentError(() => m.gather(["a", "b", "c"], new Array<string>(3)));
  });

  it("gatherRejectsTheSameArrayForValuesAndNewValues", () => {
    const swap = NodeMapping.forPermutation([1, 0]);
    const values = ["a", "b"];
    expectArgumentError(() => swap.gather(values, values));
    expect(values).toEqual(["a", "b"]);
  });
});
