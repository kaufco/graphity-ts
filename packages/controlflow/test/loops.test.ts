import { BiAdjacentGraph, GraphBuilder, SortedIntView } from "@kobayami/graphity-core";
import { describe, expect, it } from "vitest";
import { DfsPreorder as CoreDfsPreorder } from "../../core/src/dfsPreorder.js";
import { DfsPreorder } from "../src/dfsPreorder.js";
import { Loops } from "../src/index.js";
import { expectArgumentError, expectIndexError, ints, TestGraphs } from "./testutils/core.js";

function bi(n: number, ...edges: number[]): BiAdjacentGraph {
  return BiAdjacentGraph.of(TestGraphs.of(n, ...edges));
}

/** Generous limit for the million-node case on a slow machine. */
const TIMEOUT = 60_000;

describe("LoopsTest", () => {
  it("naturalLoop", () => {
    // 0 -> 1 -> 2 -> 1, 2 -> 3
    const loops = Loops.of(bi(4, 0, 1, 1, 2, 2, 1, 2, 3), 0);
    expect(loops.loopCount).toBe(1);
    expect(loops.isReducible).toBe(true);
    expect(loops.headerOf(0)).toBe(1);
    expect(ints(loops.bodyOf(0))).toEqual([1, 2]);
    expect(ints(loops.entriesOf(0))).toEqual([1]);
    expect(loops.parentOf(0)).toBe(-1);
    expect(loops.innermostLoopOf(0)).toBe(-1);
    expect(loops.innermostLoopOf(2)).toBe(0);
    expect(loops.innermostLoopOf(3)).toBe(-1);
    expect(loops.loopDepthOf(2)).toBe(1);
    expect(loops.loopDepthOf(3)).toBe(0);
  });

  it("nestedLoops", () => {
    // Outer loop 1..4 (back edge 4 -> 1), inner loop 2..3 (back edge 3 -> 2), exit 5.
    const loops = Loops.of(bi(6, 0, 1, 1, 2, 2, 3, 3, 2, 3, 4, 4, 1, 4, 5), 0);
    expect(loops.loopCount).toBe(2);
    expect(loops.headerOf(0)).toBe(1);
    expect(loops.headerOf(1)).toBe(2);
    expect(loops.parentOf(1)).toBe(0);
    expect(ints(loops.bodyOf(0))).toEqual([1, 4, 2, 3]);
    expect(ints(loops.bodyOf(1))).toEqual([2, 3]);
    expect(loops.isInLoop(3, 0)).toBe(true);
    expect(loops.isInLoop(4, 1)).toBe(false);
    expect(loops.loopDepthOf(3)).toBe(2);
    expect(loops.loopDepthOf(4)).toBe(1);
    expect(loops.isReducible).toBe(true);
  });

  it("irreducibleCycleIsOneLoopWithTwoEntries", () => {
    // 0 -> 1, 0 -> 2, 1 <-> 2. The search reaches 1 first, so 1 is the header.
    const loops = Loops.of(bi(3, 0, 1, 0, 2, 1, 2, 2, 1), 0);
    expect(loops.loopCount).toBe(1);
    expect(loops.headerOf(0)).toBe(1);
    expect(ints(loops.entriesOf(0))).toEqual([1, 2]);
    expect(loops.isReducible).toBe(false);
    expect(loops.loopDepthOf(1)).toBe(1);
    expect(loops.loopDepthOf(2)).toBe(1);
  });

  it("irreducibleLoopNestedInAReducibleOne", () => {
    // Outer loop headed by 1 (back edge 4 -> 1) around the cycle 2 <-> 3, entered at 2 and 3.
    const loops = Loops.of(bi(6, 0, 1, 1, 2, 1, 3, 2, 3, 3, 2, 3, 4, 4, 1, 4, 5), 0);
    expect(loops.loopCount).toBe(2);
    expect(ints(loops.entriesOf(0))).toEqual([1]);
    expect(ints(loops.entriesOf(1))).toEqual([2, 3]);
    expect(loops.isReducible).toBe(false);
  });

  it("selfLoopIsALoopOfItsOwn", () => {
    const loops = Loops.of(bi(3, 0, 1, 1, 1, 1, 2), 0);
    expect(loops.loopCount).toBe(1);
    expect(loops.headerOf(0)).toBe(1);
    expect(ints(loops.bodyOf(0))).toEqual([1]);
    expect(ints(loops.entriesOf(0))).toEqual([1]);
  });

  it("aHeaderWithASelfLoopHeadsNoLoopOfItsOwn", () => {
    // 0 -> 1, 1 -> 1, 1 <-> 2: the self-loop leads into the header 1 from inside its loop.
    const loops = Loops.of(bi(3, 0, 1, 1, 1, 1, 2, 2, 1), 0);
    expect(loops.loopCount).toBe(1);
    expect(loops.headerOf(0)).toBe(1);
    expect(ints(loops.bodyOf(0))).toEqual([1, 2]);
    // On a node that heads no larger loop, the self-loop makes a nested loop.
    const nested = Loops.of(bi(3, 0, 1, 1, 2, 2, 2, 2, 1), 0);
    expect(nested.loopCount).toBe(2);
    expect(nested.headerOf(1)).toBe(2);
    expect(ints(nested.bodyOf(1))).toEqual([2]);
  });

  it("graphEntriesCountAsLoopEntries", () => {
    // Entries 1 and 2 on the cycle 1 <-> 2: two entries, irreducible.
    const loops = Loops.of(bi(3, 1, 2, 2, 1), [1, 2]);
    expect(loops.loopCount).toBe(1);
    expect(loops.headerOf(0)).toBe(1);
    expect(ints(loops.entriesOf(0))).toEqual([1, 2]);
    expect(loops.isReducible).toBe(false);
    // With 1 as the only entry, the same cycle is a natural loop.
    expect(Loops.of(bi(3, 1, 2, 2, 1), 1).isReducible).toBe(true);
  });

  it("entryOrderDecidesTheHeaderOfAnIrreducibleLoop", () => {
    const graph = bi(3, 1, 2, 2, 1);
    expect(Loops.of(graph, [2, 1]).headerOf(0)).toBe(2);
  });

  it("every form of an int list serves as entries, duplicates ignored", () => {
    const graph = bi(4, 0, 1, 1, 2, 2, 1, 3, 2);
    const expected = Loops.of(graph, [3, 0]);
    expect(ints(expected.entriesOf(0))).toEqual([1, 2]);
    for (const entries of [Int32Array.of(3, 0), [3, 3, 0, 3], SortedIntView.viewOf(Int32Array.of(9, 0, 3), 1, 3)]) {
      const loops = Loops.of(graph, entries);
      expect(loops.loopCount).toBe(1);
      expect(loops.headerOf(0)).toBe(entries instanceof SortedIntView ? 1 : 2);
      expect(ints(loops.entriesOf(0))).toEqual([1, 2]);
    }
  });

  it("unreachableCyclesAreNoLoops", () => {
    const loops = Loops.of(bi(4, 0, 1, 2, 3, 3, 2), 0);
    expect(loops.loopCount).toBe(0);
    expect(loops.isReducible).toBe(true);
    expect(loops.innermostLoopOf(2)).toBe(-1);
  });

  it("edgesFromUnreachableNodesEnterNoLoop", () => {
    // 3 -> 2 comes from a node no entry reaches and must not make 2 a second entry.
    const loops = Loops.of(bi(4, 0, 1, 1, 2, 2, 1, 3, 2), 0);
    expect(loops.loopCount).toBe(1);
    expect(ints(loops.entriesOf(0))).toEqual([1]);
    expect(loops.isReducible).toBe(true);
  });

  it("emptyEntryListAndEmptyGraph", () => {
    expect(Loops.of(bi(2, 0, 1, 1, 0), []).loopCount).toBe(0);
    const empty = Loops.of(BiAdjacentGraph.of(TestGraphs.empty()), []);
    expect(empty.loopCount).toBe(0);
    expect(empty.isReducible).toBe(true);
  });

  it("siblingLoopsShareAParent", () => {
    // Outer loop 1..5 (back edge 5 -> 1) around two sibling loops, 2 <-> 3 and 4 <-> 5:
    // 1 -> 2 -> 3 -> 2, 3 -> 4 -> 5 -> 4, 5 -> 1, 5 -> 6.
    const loops = Loops.of(bi(7, 0, 1, 1, 2, 2, 3, 3, 2, 3, 4, 4, 5, 5, 4, 5, 1, 5, 6), 0);
    expect(loops.loopCount).toBe(3);
    expect(loops.headerOf(0)).toBe(1);
    expect(loops.parentOf(1)).toBe(0);
    expect(loops.parentOf(2)).toBe(0);
    expect(ints(loops.bodyOf(0))).toEqual([1, 2, 3, 4, 5]);
  });

  it("viewsShareOneArray", () => {
    // Java: viewsAreReadOnly. A typed array cannot refuse writes, so the views are read-only by
    // contract; what the test pins down is that they are views, not copies.
    const loops = Loops.of(bi(6, 0, 1, 1, 2, 2, 3, 3, 2, 3, 4, 4, 1, 4, 5), 0);
    const outer = loops.bodyOf(0);
    const inner = loops.bodyOf(1);
    expect(inner.buffer).toBe(outer.buffer);
    expect(inner.byteOffset).toBe(outer.byteOffset + 2 * Int32Array.BYTES_PER_ELEMENT);
    expect(loops.bodyOf(0).buffer).toBe(outer.buffer);
    const entries = loops.entriesOf(0);
    expect(entries).toBeInstanceOf(SortedIntView);
    expect(entries.asInt32Array().buffer).toBe(loops.entriesOf(1).asInt32Array().buffer);
  });

  it("outOfRangeArgumentsAreRejected", () => {
    const loops = Loops.of(bi(3, 0, 1, 1, 2, 2, 1), 0);
    expectIndexError(() => Loops.of(bi(2, 0, 1), 2), "Index 2 out of bounds for length 2");
    expectIndexError(() => Loops.of(bi(2, 0, 1), [0, -1]));
    expectIndexError(() => loops.innermostLoopOf(3));
    expectIndexError(() => loops.loopDepthOf(-1));
    expectIndexError(() => loops.isInLoop(0, 1));
    expectIndexError(() => loops.isInLoop(3, 0));
    expectIndexError(() => loops.headerOf(-1));
    expectIndexError(() => loops.entriesOf(1));
    expectIndexError(() => loops.parentOf(1));
    expectIndexError(() => loops.bodyOf(1));
  });

  it("non-integer IDs are out of range", () => {
    const loops = Loops.of(bi(3, 0, 1, 1, 2, 2, 1), 0);
    expectIndexError(() => Loops.of(bi(2, 0, 1), 0.5));
    expectIndexError(() => Loops.of(bi(2, 0, 1), undefined as never), "Index undefined");
    expectIndexError(() => loops.innermostLoopOf(1.5));
    expectIndexError(() => loops.headerOf(Number.NaN));
    expectIndexError(() => loops.isInLoop(1, 0.25));
  });

  it("theNodeLimitIsTheOneOfTheCore", () => {
    // Loops.of documents nodeCount > 2^30 - 6 as rejected, the same limit as Dominators.of: two
    // ints per preorder number, the virtual root included, within 2^31 - 9.
    expect(DfsPreorder.MAX_NODE_COUNT).toBe(2 ** 30 - 6);
    expect(DfsPreorder.MAX_NODE_COUNT).toBe(CoreDfsPreorder.MAX_NODE_COUNT);
    expect(2 * (DfsPreorder.MAX_NODE_COUNT + 1)).toBeLessThanOrEqual(0x7fffffff - 8);
    DfsPreorder.checkNodeCount(DfsPreorder.MAX_NODE_COUNT, "Loops");
    const message =
      /^Loops takes the node limit of Dominators, which keeps two ints per node in one array, counting its virtual root: nodeCount must be <= 1073741818, but was 1073741819$/;
    expectArgumentError(() => DfsPreorder.checkNodeCount(DfsPreorder.MAX_NODE_COUNT + 1, "Loops"), message);
    // A graph at the limit takes gigabytes; the check reads only the node count.
    const huge = { nodeCount: DfsPreorder.MAX_NODE_COUNT + 1 } as unknown as BiAdjacentGraph;
    expectArgumentError(() => Loops.of(huge, []), message);
  });

  it(
    "deepNestingDoesNotOverflowStack",
    () => {
      // deep / 2 loops nested inside each other: i -> i + 1 down the chain, and a back edge from
      // deep - 1 - i to i, so loop i encloses loop i + 1.
      const deep = 1_000_000;
      const builder = new GraphBuilder();
      builder.addNodes(deep);
      for (let i = 0; i + 1 < deep; i++) builder.addEdge(i, i + 1);
      for (let i = 0; i < deep / 2; i++) builder.addEdge(deep - 1 - i, i);
      const loops = Loops.of(BiAdjacentGraph.of(builder.build()), 0);
      expect(loops.loopCount).toBe(deep / 2);
      expect(loops.loopDepthOf(deep / 2)).toBe(deep / 2);
      expect(loops.isReducible).toBe(true);
    },
    TIMEOUT,
  );
});
