/** Counterpart of Java's `GraphBuilderTest`. */

import { describe, expect, it } from "vitest";
import { BackEdges, BiAdjacentGraph, Components, Edges, GraphBuilder, SortedIntView } from "../src/index.js";
import { expectArgumentError, expectIndexError, ints } from "./testutils/assertions.js";
import { expectSameGraph } from "./testutils/graphAssertions.js";
import { TestGraphs } from "./testutils/testGraphs.js";

/** The node limit stated in the class documentation, 2^31 - 10. */
const NODE_LIMIT = 0x7fffffff - 9;

/** The edge limit stated in the class documentation, 2^31 - 9. */
const EDGE_LIMIT = 0x7fffffff - 8;

const MAX_INT = 0x7fffffff;

/**
 * Lets `builder` count `edgeCount` added edges without holding them: the count is all that the
 * edge limit reads. Java reaches the limit with lists of that length backed by no array; reading
 * one takes about ten seconds in JavaScript, so the batches here are short and the count is long.
 * Returns a function that restores the real count.
 */
function pretendEdgeCount(builder: GraphBuilder, edgeCount: number): () => void {
  const internals = builder as unknown as { edgeSources: { length: number }; edgeTargets: { length: number } };
  const real = internals.edgeSources.length;
  internals.edgeSources.length = edgeCount;
  internals.edgeTargets.length = edgeCount;
  return () => {
    internals.edgeSources.length = real;
    internals.edgeTargets.length = real;
  };
}

/** An `Edges` list made by hand, as Java's package-private `Edges.wrap`. */
const edgesOf = (sources: number[], targets: number[]) =>
  Edges.create(Int32Array.from(sources), Int32Array.from(targets), new Int32Array(sources.length));

describe("GraphBuilderTest", () => {
  it("newBuilderBuildsEmptyGraph", () => {
    const graph = new GraphBuilder().build();
    expect(graph.nodeCount).toBe(0);
    expect(graph.edgeCount).toBe(0);
    expect(graph.isEmpty).toBe(true);
  });

  it("addNodeReturnsSequentialIds", () => {
    const b = new GraphBuilder();
    expect(b.addNode()).toBe(0);
    expect(b.addNode()).toBe(1);
    expect(b.addNode()).toBe(2);
    expect(b.build().nodeCount).toBe(3);
  });

  it("addNodesReturnsFirstAddedId", () => {
    const b = new GraphBuilder();
    b.addNode();
    expect(b.addNodes(3)).toBe(1);
    expect(b.build().nodeCount).toBe(4);
  });

  it("addNodesWithZeroCountIsNoOp", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    expect(b.addNodes(0)).toBe(2);
    expect(b.build().nodeCount).toBe(2);
  });

  it("addNodesWithNegativeCountThrows", () => {
    const b = new GraphBuilder();
    expectArgumentError(() => b.addNodes(-1));
  });

  it("addNodesRejectsANonIntegerCount", () => {
    // TypeScript-specific: Java's int cannot be fractional.
    const b = new GraphBuilder();
    expectArgumentError(() => b.addNodes(1.5), "count must be an integer: 1.5");
    expectArgumentError(() => b.addChildren(0, Number.NaN), "count must be an integer: NaN");
    expect(b.addNodes(0)).toBe(0);
  });

  it("addEdgeWithInvalidSourceThrows", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    expectIndexError(() => b.addEdge(2, 0));
    expectIndexError(() => b.addEdge(-1, 0));
  });

  it("addEdgeWithInvalidTargetThrows", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    expectIndexError(() => b.addEdge(0, 5));
    expectIndexError(() => b.addEdge(0, -1));
  });

  it("addEdgeRejectsNonIntegerIds", () => {
    // TypeScript-specific: a fractional ID would be truncated by the Int32Array storage.
    const b = new GraphBuilder();
    b.addNodes(2);
    expectIndexError(() => b.addEdge(0.5, 1));
    expectIndexError(() => b.addEdge(0, Number.NaN));
    expect(b.build().edgeCount).toBe(0);
  });

  it("addOutEdgesWithInvalidSourceThrows", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    expectIndexError(() => b.addOutEdges(5, [0]));
    expectIndexError(() => b.addOutEdges(-1, [0]));
  });

  it("addOutEdgesWithInvalidTargetThrows", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    expectIndexError(() => b.addOutEdges(0, [0, 99]));
    expectIndexError(() => b.addOutEdges(0, [0, -1]));
  });

  it("buildProducesSortedAdjacencyList", () => {
    const b = new GraphBuilder();
    b.addNodes(4);
    b.addEdge(0, 3);
    b.addEdge(0, 1);
    b.addEdge(0, 2);
    expect(ints(b.build().outNodes(0))).toEqual([1, 2, 3]);
  });

  it("buildDeduplicatesParallelEdges", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    b.addEdge(0, 1);
    b.addEdge(0, 1);
    b.addEdge(0, 1);
    const graph = b.build();
    expect(graph.edgeCount).toBe(1);
    expect(ints(graph.outNodes(0))).toEqual([1]);
  });

  it("buildAllowsSelfLoops", () => {
    const b = new GraphBuilder();
    b.addNodes(1);
    b.addEdge(0, 0);
    const graph = b.build();
    expect(graph.edgeCount).toBe(1);
    expect(ints(graph.outNodes(0))).toEqual([0]);
    expect(graph.containsSelfLoop(0)).toBe(true);
  });

  it("buildTrimsAdjacencyArrayAfterDedup", () => {
    const b = new GraphBuilder();
    b.addNodes(3);
    for (let i = 0; i < 100; i++) b.addEdge(0, 1);
    b.addEdge(0, 2);
    const graph = b.build();
    expect(graph.edgeCount).toBe(2);
    expect(ints(graph.outNodes(0))).toEqual([1, 2]);
  });

  it("buildSortsLongAdjacencyLists", () => {
    // Lists beyond the insertion-sort threshold take the typed-array sort.
    const b = new GraphBuilder();
    b.addNodes(100);
    for (let t = 99; t > 0; t--) b.addEdge(0, t);
    b.addEdge(0, 50);
    expect(ints(b.build().outNodes(0))).toEqual(Array.from({ length: 99 }, (_, i) => i + 1));
  });

  it("buildWithIsolatedNodesProducesNoEdges", () => {
    const b = new GraphBuilder();
    b.addNodes(5);
    const built = b.build();
    expect(built.nodeCount).toBe(5);
    expect(built.edgeCount).toBe(0);
    for (let i = 0; i < 5; i++) expect(built.outNodes(i).isEmpty).toBe(true);
  });

  it("builderIsNotConsumedByBuild", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    b.addEdge(0, 1);
    const first = b.build();
    b.addNode();
    b.addEdge(1, 2);
    const second = b.build();
    expect(first.nodeCount).toBe(2);
    expect(first.edgeCount).toBe(1);
    expect(second.nodeCount).toBe(3);
    expect(second.edgeCount).toBe(2);
  });

  it("multipleBuildsAreIndependent", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    b.addEdge(0, 1);
    const first = b.build();
    const second = b.build();
    expect(first).not.toBe(second);
    expectSameGraph(first, second);
  });

  it("addOutEdgesAppendsAllTargets", () => {
    const b = new GraphBuilder();
    b.addNodes(4);
    b.addOutEdges(0, [3, 1, 2]);
    expect(ints(b.build().outNodes(0))).toEqual([1, 2, 3]);
  });

  it("addOutEdgesAcceptsSortedIntView", () => {
    const source = TestGraphs.path(4);
    const b = new GraphBuilder();
    b.addNodes(4);
    for (let n = 0; n < source.nodeCount; n++) b.addOutEdges(n, source.outNodes(n));
    expectSameGraph(b.build(), source);
  });

  it("everyListFormReadsAViewOfTheMiddleOfAnArray", () => {
    // The view is array[1..4): 1, 2, 4. A range read off by its start or end shows in the result.
    const view = SortedIntView.create(Int32Array.of(0, 1, 2, 4, 6), 1, 4);
    const of = (add: (b: GraphBuilder) => void) => {
      const b = new GraphBuilder();
      add(b);
      return b.build();
    };
    const fanOut = of((b) => (b.addNodes(5), b.addOutEdges(3, view)));
    expectSameGraph(fanOut, TestGraphs.of(5, 3, 1, 3, 2, 3, 4));
    expectSameGraph(
      of((b) => b.addOutEdgesAndNodes(3, view)),
      fanOut,
    );
    const fanIn = of((b) => (b.addNodes(5), b.addInEdges(3, view)));
    expectSameGraph(fanIn, TestGraphs.of(5, 1, 3, 2, 3, 4, 3));
    expectSameGraph(
      of((b) => b.addInEdgesAndNodes(3, view)),
      fanIn,
    );
    const path = of((b) => (b.addNodes(5), b.addPath(view)));
    expectSameGraph(path, TestGraphs.of(5, 1, 2, 2, 4));
    expectSameGraph(
      of((b) => b.addPathAndNodes(view)),
      path,
    );
  });

  it("aViewIsCheckedOnlyInItsRange", () => {
    // 9 lies outside the view and outside the node range.
    const view = SortedIntView.create(Int32Array.of(9, 1, 2, 9), 1, 3);
    const b = new GraphBuilder();
    b.addNodes(3);
    b.addOutEdges(0, view);
    expectIndexError(
      () => b.addOutEdges(0, SortedIntView.create(Int32Array.of(1, 3), 0, 2)),
      "target node does not exist: 3",
    );
    expectSameGraph(b.build(), TestGraphs.of(3, 0, 1, 0, 2));
  });

  it("aListThatIsNotOneThrowsTypeError", () => {
    // A view of a second installed copy of the core: the same shape, but another class.
    const foreign = { array: Int32Array.of(1, 2), fromIndex: 0, toIndex: 2 };
    const b = new GraphBuilder();
    b.addNodes(3);
    expect(() => b.addOutEdges(0, foreign as never)).toThrow(TypeError);
    expect(() => b.addPathAndNodes(foreign as never)).toThrow("not a list");
    expect(b.build().edgeCount).toBe(0);
  });

  it("addGraphSingleImportPreservesFullTopology", () => {
    // Diamond with a self-loop: 0->0, 0->1, 0->2, 1->3, 2->3.
    const original = TestGraphs.of(4, 0, 0, 0, 1, 0, 2, 1, 3, 2, 3);
    const b = new GraphBuilder();
    expect(b.addGraph(original)).toBe(0);
    expectSameGraph(b.build(), original);
  });

  it("addGraphTwoImportsPreserveTopologyAtOffset", () => {
    const g1 = TestGraphs.of(4, 0, 1, 0, 2, 1, 3, 2, 3);
    const g2 = TestGraphs.of(3, 0, 1, 0, 2, 1, 2);
    const b = new GraphBuilder();
    expect(b.addGraph(g1)).toBe(0);
    expect(b.addGraph(g2)).toBe(4);
    expectSameGraph(b.build(), TestGraphs.of(7, 0, 1, 0, 2, 1, 3, 2, 3, 4, 5, 4, 6, 5, 6));
  });

  it("addGraphAllowsBridgingEdgesBetweenImports", () => {
    const g1 = TestGraphs.of(3, 0, 1, 1, 2);
    const g2 = TestGraphs.of(3, 0, 1, 1, 2);
    const b = new GraphBuilder();
    const off1 = b.addGraph(g1);
    const off2 = b.addGraph(g2);
    b.addEdge(off1 + 2, off2 + 0);
    b.addEdge(off1 + 0, off2 + 2);
    expectSameGraph(b.build(), TestGraphs.of(6, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 0, 5));
  });

  it("addGraphWorksAfterManualEdges", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    b.addEdge(0, 1);
    expect(b.addGraph(TestGraphs.of(3, 0, 1, 1, 2))).toBe(2);
    expectSameGraph(b.build(), TestGraphs.of(5, 0, 1, 2, 3, 3, 4));
  });

  it("addGraphWorksBeforeManualEdges", () => {
    const b = new GraphBuilder();
    expect(b.addGraph(TestGraphs.of(3, 0, 1, 1, 2))).toBe(0);
    b.addNode();
    b.addEdge(0, 3);
    b.addEdge(2, 3);
    expectSameGraph(b.build(), TestGraphs.of(4, 0, 1, 0, 3, 1, 2, 2, 3));
  });

  it("addGraphDeduplicatesAgainstExistingEdges", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    b.addEdge(0, 1);
    b.addGraph(TestGraphs.of(2, 0, 1));
    expectSameGraph(b.build(), TestGraphs.of(4, 0, 1, 2, 3));
  });

  it("addGraphOnEmptyGraphIsNoOp", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    b.addEdge(0, 1);
    expect(b.addGraph(TestGraphs.empty())).toBe(2);
    expectSameGraph(b.build(), TestGraphs.of(2, 0, 1));
  });

  it("addGraphOfABiAdjacentGraphImportsItsEdgesOnce", () => {
    const original = TestGraphs.of(3, 0, 1, 1, 2, 2, 0);
    const b = new GraphBuilder();
    b.addGraph(BiAdjacentGraph.of(original));
    expectSameGraph(b.build(), original);
  });

  // ---- validation ----

  it("rejectsUnknownNodes", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    expectIndexError(() => b.addEdge(2, 0));
    expectIndexError(() => b.addEdge(0, 2));
    expectIndexError(() => b.addEdge(-1, 0));
    expectIndexError(() => b.addOutEdges(0, Int32Array.of(5)));
    expectIndexError(() => b.addInEdges(0, Int32Array.of(5)));
    expectIndexError(() => b.addPath(0, 5));
    expectIndexError(() => b.addEdgePairs(0, 5));
    expectIndexError(() => b.addChild(5));
    expectIndexError(() => b.addChildren(5, 1));
    expectIndexError(() => b.addParent(5));
    expectIndexError(() => b.addParents(5, 1));
    expectIndexError(() => b.addOutEdges(0, [5]));
    expectIndexError(() => b.addOutEdges(5, Int32Array.of(0)));
    expectIndexError(() => b.addInEdges(5, Int32Array.of(0)));
    expectIndexError(() => b.addInEdges(5, [0]));
    // No rejected call created a node or an edge.
    expectSameGraph(b.build(), TestGraphs.isolated(2));
  });

  it("rejectsNegativeIdsInEveryBatchForm", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    expectIndexError(() => b.addOutEdges(0, Int32Array.of(-1)));
    expectIndexError(() => b.addOutEdges(0, [-1]));
    expectIndexError(() => b.addInEdges(0, Int32Array.of(-1)));
    expectIndexError(() => b.addPath(0, -1));
    expectIndexError(() => b.addEdgePairs(0, -1));
  });

  it("leavesTheBuilderUnchangedWhenABatchIsRejected", () => {
    const b = new GraphBuilder();
    b.addNodes(3);
    b.addEdge(0, 1);
    expectIndexError(() => b.addOutEdges(0, Int32Array.of(2, 99)));
    expectIndexError(() => b.addPath(0, 2, 99));
    expectIndexError(() => b.addEdgePairs(0, 2, 1, 99));
    expectSameGraph(b.build(), TestGraphs.of(3, 0, 1));
  });

  it("rejectionMessageNamesNodeAndCount", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    expectIndexError(() => b.addEdge(0, 7), /7.*nodeCount=2/);
  });

  it("acceptsValidReferences", () => {
    const b = new GraphBuilder();
    b.addNodes(3);
    b.addEdge(0, 1);
    b.addPath(1, 2);
    expectSameGraph(b.build(), TestGraphs.of(3, 0, 1, 1, 2));
  });

  it("rejectsUnknownNodeAfterImportingAGraph", () => {
    const b = new GraphBuilder();
    b.addGraph(TestGraphs.isolated(3));
    expectIndexError(() => b.addEdge(0, 3));
  });

  it("andNodesMethodsStillCreateNodes", () => {
    const b = new GraphBuilder();
    b.addEdgeAndNodes(2, 0);
    expectSameGraph(b.build(), TestGraphs.of(3, 2, 0));
  });

  // ---- ensureEdgeCapacity ----

  it("ensureEdgeCapacityDoesNotChangeTheResult", () => {
    const hinted = new GraphBuilder();
    hinted.ensureEdgeCapacity(3);
    hinted.addNodes(3);
    hinted.addPath(0, 1, 2);
    expectSameGraph(hinted.build(), TestGraphs.of(3, 0, 1, 1, 2));
  });

  it("ensureEdgeCapacityMidConstructionPreservesEdges", () => {
    const b = new GraphBuilder();
    b.addNodes(3);
    b.addEdge(0, 1);
    b.ensureEdgeCapacity(1000);
    b.addEdge(1, 2);
    expectSameGraph(b.build(), TestGraphs.of(3, 0, 1, 1, 2));
  });

  it("ensureEdgeCapacityBelowCurrentSizeIsHarmless", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    b.addEdge(0, 1);
    b.ensureEdgeCapacity(0);
    expectSameGraph(b.build(), TestGraphs.of(2, 0, 1));
  });

  it("ensureEdgeCapacityPreventsReallocation", () => {
    const b = new GraphBuilder();
    b.ensureEdgeCapacity(1000);
    b.addNodes(2);
    const reserved = b.edgeCapacity();
    expect(reserved).toBeGreaterThanOrEqual(1000);
    for (let i = 0; i < 1000; i++) b.addEdge(0, 1);
    expect(b.edgeCapacity()).toBe(reserved);
  });

  it("withoutAHintTheEdgeStorageGrows", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    b.addEdge(0, 1);
    const initial = b.edgeCapacity();
    for (let i = 0; i < 1000; i++) b.addEdge(0, 1);
    expect(b.edgeCapacity()).toBeGreaterThan(initial);
  });

  it("ensureEdgeCapacityRejectsNegative", () => {
    const b = new GraphBuilder();
    expectArgumentError(() => b.ensureEdgeCapacity(-1));
  });

  it("ensureEdgeCapacityRejectsANonIntegerTotal", () => {
    // TypeScript-specific: a fractional length is no array length.
    const b = new GraphBuilder();
    expectArgumentError(() => b.ensureEdgeCapacity(10.5), "totalEdges must be an integer: 10.5");
    expectArgumentError(() => b.ensureEdgeCapacity(Number.NaN), "totalEdges must be an integer: NaN");
    expect(b.edgeCapacity()).toBe(0);
  });

  it("ensureEdgeCapacityRejectsMoreThanTheEdgeLimit", () => {
    const b = new GraphBuilder();
    expectArgumentError(() => b.ensureEdgeCapacity(MAX_INT), "edge limit");
    expectArgumentError(() => b.ensureEdgeCapacity(EDGE_LIMIT + 1));
    expect(b.edgeCapacity()).toBe(0);
  });

  it("ensureEdgeCapacityReservesExactly", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    b.addOutEdges(0, new Int32Array(100));
    b.ensureEdgeCapacity(101);
    expect(b.edgeCapacity()).toBe(101);
  });

  // ---- growth of the edge storage under batch calls ----

  /** Counts how often 10 000 applications of `call` change the edge capacity. */
  const capacityChanges = (call: (b: GraphBuilder) => void): number => {
    const b = new GraphBuilder();
    b.addNodes(2);
    let capacity = b.edgeCapacity();
    let changes = 0;
    for (let i = 0; i < 10_000; i++) {
      call(b);
      if (b.edgeCapacity() !== capacity) {
        capacity = b.edgeCapacity();
        changes++;
      }
    }
    return changes;
  };

  it("batchCallsInALoopGrowTheEdgeStorageGeometrically", () => {
    // 10 000 calls of two edges each: growing by half takes about 20 capacity changes, growing to
    // the exact size one per call.
    const targets = [1, 1];
    const path = TestGraphs.path(3);
    expect(capacityChanges((b) => b.addOutEdges(0, 1, 1))).toBeLessThanOrEqual(30);
    expect(capacityChanges((b) => b.addOutEdges(0, targets))).toBeLessThanOrEqual(30);
    expect(capacityChanges((b) => b.addInEdges(1, targets))).toBeLessThanOrEqual(30);
    expect(capacityChanges((b) => b.addPath(0, 1, 0))).toBeLessThanOrEqual(30);
    expect(capacityChanges((b) => b.addEdgePairs(0, 1, 1, 0))).toBeLessThanOrEqual(30);
    expect(capacityChanges((b) => b.addChildren(0, 2))).toBeLessThanOrEqual(30);
    expect(capacityChanges((b) => b.addParents(0, 2))).toBeLessThanOrEqual(30);
    expect(capacityChanges((b) => b.addGraph(path))).toBeLessThanOrEqual(30);
  });

  it("aBatchBeyondTheGrowthStepAllocatesExactlyOnce", () => {
    const imported = new GraphBuilder();
    imported.addGraph(TestGraphs.path(1001));
    expect(imported.edgeCapacity()).toBe(1000);

    const b = new GraphBuilder();
    b.addNodes(2);
    b.addEdge(0, 1);
    b.addOutEdges(0, new Int32Array(1000));
    expect(b.edgeCapacity()).toBe(1001);
  });

  // ---- addChild / addChildren / addParent / addParents ----

  it("addChildReturnsNewIdAndLinksIt", () => {
    const b = new GraphBuilder();
    const root = b.addNode();
    const child = b.addChild(root);
    expect(child).toBe(1);
    expect(b.addChild(child)).toBe(2);
    expectSameGraph(b.build(), TestGraphs.of(3, 0, 1, 1, 2));
  });

  it("addChildrenReturnsFirstIdAndLinksAll", () => {
    const b = new GraphBuilder();
    const root = b.addNode();
    expect(b.addChildren(root, 3)).toBe(1);
    expectSameGraph(b.build(), TestGraphs.of(4, 0, 1, 0, 2, 0, 3));
  });

  it("addChildrenWithZeroCountAddsNothing", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    expect(b.addChildren(0, 0)).toBe(2);
    expectSameGraph(b.build(), TestGraphs.isolated(2));
  });

  it("addChildrenWithNegativeCountThrows", () => {
    const b = new GraphBuilder();
    b.addNode();
    expectArgumentError(() => b.addChildren(0, -1));
  });

  it("addParentReturnsNewIdAndLinksIt", () => {
    const b = new GraphBuilder();
    const leaf = b.addNode();
    expect(b.addParent(leaf)).toBe(1);
    expectSameGraph(b.build(), TestGraphs.of(2, 1, 0));
  });

  it("addParentsReturnsFirstIdAndLinksAll", () => {
    const b = new GraphBuilder();
    const join = b.addNode();
    expect(b.addParents(join, 2)).toBe(1);
    expectSameGraph(b.build(), TestGraphs.of(3, 1, 0, 2, 0));
  });

  it("addParentsWithZeroCountAddsNothing", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    expect(b.addParents(0, 0)).toBe(2);
    expectSameGraph(b.build(), TestGraphs.isolated(2));
  });

  it("addParentsWithNegativeCountThrows", () => {
    const b = new GraphBuilder();
    b.addNode();
    expectArgumentError(() => b.addParents(0, -1));
  });

  // ---- addPath ----

  it("addPathChainsExistingNodes", () => {
    const b = new GraphBuilder();
    b.addNodes(4);
    b.addPath(3, 1, 0);
    expectSameGraph(b.build(), TestGraphs.of(4, 3, 1, 1, 0));
  });

  it("addPathWithFewerThanTwoNodesAddsNoEdge", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    b.addPath();
    b.addPath(1);
    expectSameGraph(b.build(), TestGraphs.isolated(2));
  });

  it("addPathAllowsRepeatedNodes", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    b.addPath(0, 1, 0);
    expectSameGraph(b.build(), TestGraphs.of(2, 0, 1, 1, 0));
  });

  // ---- addOutEdges(int[]) and addInEdges ----

  it("addOutEdgesArrayMatchesIntListOverload", () => {
    const viaArray = new GraphBuilder();
    viaArray.addNodes(4);
    viaArray.addOutEdges(0, Int32Array.of(3, 1, 2));
    const viaList = new GraphBuilder();
    viaList.addNodes(4);
    viaList.addOutEdges(0, [3, 1, 2]);
    expectSameGraph(viaArray.build(), viaList.build());
  });

  it("addOutEdgesWithEmptyArrayAddsNothing", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    b.addOutEdges(0, new Int32Array(0));
    expectSameGraph(b.build(), TestGraphs.isolated(2));
  });

  it("addInEdgesFansIn", () => {
    const b = new GraphBuilder();
    b.addNodes(3);
    b.addInEdges(0, Int32Array.of(1, 2));
    expectSameGraph(b.build(), TestGraphs.inStar(3));
  });

  it("addInEdgesWithEmptyArrayAddsNothing", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    b.addInEdges(0, new Int32Array(0));
    expectSameGraph(b.build(), TestGraphs.isolated(2));
  });

  // ---- parameter forms: loose arguments, typed array, plain array ----

  type BatchCall = (builder: GraphBuilder, ids: number[]) => void;

  const buildWith = (call: BatchCall) => {
    const b = new GraphBuilder();
    b.addNodes(4);
    call(b, [3, 1, 2]);
    return b.build();
  };

  /**
   * Applies the same three node IDs through an `Int32Array` (Java: `int[]`), through loose
   * arguments and through a plain array (Java: `IntList`), and expects the same graph from all
   * three.
   */
  const expectFormsAgree = (method: string, viaArray: BatchCall, viaArguments: BatchCall, viaList: BatchCall) => {
    const reference = buildWith(viaArray);
    expectSameGraph(buildWith(viaArguments), reference, `${method} from loose arguments`);
    expectSameGraph(buildWith(viaList), reference, `${method} from a list`);
  };

  it("theThreeParameterFormsAgreeForEveryBatchMethod", () => {
    expectFormsAgree(
      "addOutEdges",
      (b, ids) => b.addOutEdges(0, Int32Array.from(ids)),
      (b, ids) => b.addOutEdges(0, ids[0], ids[1], ids[2]),
      (b, ids) => b.addOutEdges(0, [...ids]),
    );
    expectFormsAgree(
      "addInEdges",
      (b, ids) => b.addInEdges(0, Int32Array.from(ids)),
      (b, ids) => b.addInEdges(0, ids[0], ids[1], ids[2]),
      (b, ids) => b.addInEdges(0, [...ids]),
    );
    expectFormsAgree(
      "addOutEdgesAndNodes",
      (b, ids) => b.addOutEdgesAndNodes(0, Int32Array.from(ids)),
      (b, ids) => b.addOutEdgesAndNodes(0, ids[0], ids[1], ids[2]),
      (b, ids) => b.addOutEdgesAndNodes(0, [...ids]),
    );
    expectFormsAgree(
      "addInEdgesAndNodes",
      (b, ids) => b.addInEdgesAndNodes(0, Int32Array.from(ids)),
      (b, ids) => b.addInEdgesAndNodes(0, ids[0], ids[1], ids[2]),
      (b, ids) => b.addInEdgesAndNodes(0, [...ids]),
    );
    expectFormsAgree(
      "addPath",
      (b, ids) => b.addPath(Int32Array.from(ids)),
      (b, ids) => b.addPath(ids[0], ids[1], ids[2]),
      (b, ids) => b.addPath([...ids]),
    );
    expectFormsAgree(
      "addPathAndNodes",
      (b, ids) => b.addPathAndNodes(Int32Array.from(ids)),
      (b, ids) => b.addPathAndNodes(ids[0], ids[1], ids[2]),
      (b, ids) => b.addPathAndNodes([...ids]),
    );
    expectFormsAgree(
      "addEdgePairs",
      (b, ids) => b.addEdgePairs(Int32Array.from([ids[0], ids[1]])),
      (b, ids) => b.addEdgePairs(ids[0], ids[1]),
      (b, ids) => b.addEdgePairs([ids[0], ids[1]]),
    );
  });

  it("batchMethodsWithNoTargetsAddNothing", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    b.addOutEdges(0);
    b.addInEdges(0);
    b.addOutEdges(0, []);
    b.addInEdges(0, []);
    b.addPath([]);
    expectSameGraph(b.build(), TestGraphs.isolated(2));
  });

  it("andNodesBatchMethodsWithNoTargetsStillCreateTheAnchor", () => {
    const b = new GraphBuilder();
    b.addOutEdgesAndNodes(2);
    expectSameGraph(b.build(), TestGraphs.isolated(3));

    const fanIn = new GraphBuilder();
    fanIn.addInEdgesAndNodes(2, []);
    expectSameGraph(fanIn.build(), TestGraphs.isolated(3));

    const path = new GraphBuilder();
    path.addPathAndNodes([]);
    expect(path.build().nodeCount).toBe(0);
  });

  it("intListMethodsAcceptAdjacencyOfAnExistingGraph", () => {
    const source = TestGraphs.path(4);
    const biAdjacent = BiAdjacentGraph.of(source);
    const copy = new GraphBuilder();
    copy.addNodes(4);
    for (let n = 0; n < source.nodeCount; n++) copy.addInEdges(n, biAdjacent.inNodes(n));
    expectSameGraph(copy.build(), source);
  });

  it("intListArgumentsAreReadNotRetained", () => {
    const nodes = [1, 2];
    const b = new GraphBuilder();
    b.addNodes(4);
    b.addOutEdges(0, nodes);
    b.addInEdges(0, nodes);
    b.addPath(nodes);
    b.addOutEdgesAndNodes(3, nodes);
    b.addInEdgesAndNodes(3, nodes);
    b.addPathAndNodes(nodes);
    nodes.length = 0;
    nodes.push(3);
    expectSameGraph(b.build(), TestGraphs.of(4, 0, 1, 0, 2, 1, 0, 2, 0, 1, 2, 3, 1, 3, 2, 1, 3, 2, 3));
  });

  it("rejectsUnknownNodesInEveryIntListForm", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    const invalid = [0, 5];
    expectIndexError(() => b.addOutEdges(0, invalid));
    expectIndexError(() => b.addInEdges(0, invalid));
    expectIndexError(() => b.addPath(invalid));
    expectIndexError(() => b.addPath(Int32Array.from(invalid)));
    expectSameGraph(b.build(), TestGraphs.isolated(2));
  });

  it("andNodesIntListMethodsRejectNegativeIdsAndAddNothing", () => {
    const b = new GraphBuilder();
    b.addEdgeAndNodes(0, 1);
    const invalid = [2, -1];
    expectIndexError(() => b.addOutEdgesAndNodes(0, invalid));
    expectIndexError(() => b.addInEdgesAndNodes(0, invalid));
    expectIndexError(() => b.addPathAndNodes(invalid));
    expectSameGraph(b.build(), TestGraphs.of(2, 0, 1));
  });

  it("andNodesIntListMethodsRejectIdsFarBeyondTheNodeLimit", () => {
    const b = new GraphBuilder();
    const invalid = [MAX_INT];
    expectIndexError(() => b.addOutEdgesAndNodes(0, invalid));
    expectIndexError(() => b.addInEdgesAndNodes(0, invalid));
    expectIndexError(() => b.addPathAndNodes(invalid));
    expect(b.build().nodeCount).toBe(0);
  });

  // ---- addEdgePairs ----

  it("addEdgePairsAddsOneEdgePerPair", () => {
    const b = new GraphBuilder();
    b.addNodes(4);
    b.addEdgePairs(0, 1, 2, 3);
    expectSameGraph(b.build(), TestGraphs.of(4, 0, 1, 2, 3));
  });

  it("addEdgePairsWithNoArgumentsAddsNothing", () => {
    const b = new GraphBuilder();
    b.addNodes(2);
    b.addEdgePairs();
    expectSameGraph(b.build(), TestGraphs.isolated(2));
  });

  it("addEdgePairsWithOddArgumentCountThrows", () => {
    const b = new GraphBuilder();
    b.addNodes(3);
    expectArgumentError(() => b.addEdgePairs(0, 1, 2));
    expectArgumentError(() => b.addEdgePairs([0, 1, 2]));
  });

  it("addEdgePairsAndNodesWithOddArgumentCountAddsNothing", () => {
    const b = new GraphBuilder();
    expectArgumentError(() => b.addEdgePairsAndNodes(0, 1, 2));
    expect(b.build().nodeCount).toBe(0);
  });

  // ---- the AndNodes family ----

  it("addEdgeAndNodesCreatesEveryIdUpToTheHighest", () => {
    const b = new GraphBuilder();
    b.addEdgeAndNodes(7, 3);
    const graph = b.build();
    expect(graph.nodeCount).toBe(8);
    expect(graph.edgeCount).toBe(1);
    expect(ints(graph.outNodes(7))).toEqual([3]);
  });

  it("andNodesMethodsNeverReduceTheNodeCount", () => {
    const b = new GraphBuilder();
    b.addNodes(10);
    b.addEdgeAndNodes(0, 1);
    b.addOutEdgesAndNodes(0, Int32Array.of(2));
    b.addInEdgesAndNodes(0, Int32Array.of(3));
    b.addPathAndNodes(4, 5);
    b.addEdgePairsAndNodes(6, 7);
    b.addEdgesAndNodes(BackEdges.of(TestGraphs.cycle(3)));
    expect(b.build().nodeCount).toBe(10);
  });

  it("addOutEdgesAndNodesMatchesPreallocatedVariant", () => {
    const grown = new GraphBuilder();
    grown.addOutEdgesAndNodes(4, Int32Array.of(0, 9));
    const preallocated = new GraphBuilder();
    preallocated.addNodes(10);
    preallocated.addOutEdges(4, Int32Array.of(0, 9));
    expectSameGraph(grown.build(), preallocated.build());
  });

  it("addInEdgesAndNodesMatchesPreallocatedVariant", () => {
    const grown = new GraphBuilder();
    grown.addInEdgesAndNodes(4, Int32Array.of(0, 9));
    const preallocated = new GraphBuilder();
    preallocated.addNodes(10);
    preallocated.addInEdges(4, Int32Array.of(0, 9));
    expectSameGraph(grown.build(), preallocated.build());
  });

  it("addPathAndNodesMatchesPreallocatedVariant", () => {
    const grown = new GraphBuilder();
    grown.addPathAndNodes(2, 5, 0);
    const preallocated = new GraphBuilder();
    preallocated.addNodes(6);
    preallocated.addPath(2, 5, 0);
    expectSameGraph(grown.build(), preallocated.build());
  });

  it("addPathAndNodesWithOneNodeStillCreatesIt", () => {
    const b = new GraphBuilder();
    b.addPathAndNodes(4);
    expectSameGraph(b.build(), TestGraphs.isolated(5));
  });

  it("andNodesMethodsRejectNegativeIds", () => {
    const b = new GraphBuilder();
    expectIndexError(() => b.addEdgeAndNodes(-1, 0));
    expectIndexError(() => b.addEdgeAndNodes(0, -1));
    expectIndexError(() => b.addOutEdgesAndNodes(0, Int32Array.of(-1)));
    expectIndexError(() => b.addInEdgesAndNodes(0, Int32Array.of(-1)));
    expectIndexError(() => b.addPathAndNodes(0, -1));
    expectIndexError(() => b.addEdgePairsAndNodes(0, -1));
    // Not reachable through results of a graph; checked on a hand-made list.
    expectIndexError(() => b.addEdgesAndNodes(edgesOf([0], [-1])));
  });

  it("andNodesMethodsRejectNonIntegerIds", () => {
    // TypeScript-specific: a fractional ID would be truncated by the Int32Array storage.
    const b = new GraphBuilder();
    expectIndexError(() => b.addEdgeAndNodes(1.5, 0), "node ID must be an integer: 1.5");
    expectIndexError(() => b.addEdgeAndNodes(0, Number.NaN), "node ID must be an integer: NaN");
    expectIndexError(() => b.addPathAndNodes(0, -0.5), "node ID must be an integer: -0.5");
    expectIndexError(() => b.addEdgeAndNodes(0, 2 ** 32), "below the node limit");
    expect(b.build().nodeCount).toBe(0);
  });

  it("andNodesMethodsRejectIdsFarBeyondTheNodeLimit", () => {
    const b = new GraphBuilder();
    expectIndexError(() => b.addEdgeAndNodes(0, MAX_INT));
    expectIndexError(() => b.addPathAndNodes(MAX_INT));
    expect(b.build().nodeCount).toBe(0);
  });

  it("andNodesMethodsLeaveTheBuilderUnchangedWhenRejected", () => {
    const b = new GraphBuilder();
    b.addEdgeAndNodes(0, 1);
    expectIndexError(() => b.addOutEdgesAndNodes(0, Int32Array.of(2, -1)));
    expectIndexError(() => b.addPathAndNodes(0, 3, -1));
    expectIndexError(() => b.addEdgesAndNodes(edgesOf([0, 4], [5, MAX_INT])));
    expectSameGraph(b.build(), TestGraphs.of(2, 0, 1));
  });

  it("addChildrenReportsAnInvalidCountBeforeAnInvalidAnchor", () => {
    const b = new GraphBuilder();
    expectArgumentError(() => b.addChildren(99, -1));
    expectArgumentError(() => b.addParents(99, -1));
  });

  it("addEdgesTakesTheEdgesOfAResult", () => {
    // 0 -> 1 -> 2 -> 0, 2 -> 1: the back edges, as a graph of their own.
    const graph = TestGraphs.of(3, 0, 1, 1, 2, 2, 0, 2, 1);
    const back = BackEdges.of(graph);
    const b = new GraphBuilder();
    b.addNodes(graph.nodeCount);
    b.addEdges(back);
    const backGraph = b.build();
    expect(backGraph.edgeCount).toBe(back.count);
    for (let p = 0; p < back.count; p++) {
      expect(backGraph.hasOutNode(back.sourceNodes[p], back.targetNodes[p])).toBe(true);
    }
  });

  it("addEdgesRejectsAMissingSourceAndAddsNothing", () => {
    const back = BackEdges.of(TestGraphs.cycle(3)); // 2 -> 0
    const b = new GraphBuilder();
    b.addNodes(2);
    expectIndexError(() => b.addEdges(back));
    expect(b.build().edgeCount).toBe(0);
  });

  it("addEdgesRejectsAMissingTargetAtALaterPositionAndAddsNothing", () => {
    const bridges = Components.biconnectivityOf(BiAdjacentGraph.of(TestGraphs.path(3))).bridges;
    expect(ints(bridges.targetNodes)).toEqual([1, 2]);
    const b = new GraphBuilder();
    b.addNodes(2);
    expectIndexError(() => b.addEdges(bridges), "target");
    expectSameGraph(b.build(), TestGraphs.isolated(2));
  });

  it("addEdgesAndNodesCreatesTheNodesItReferences", () => {
    const bridges = Components.biconnectivityOf(BiAdjacentGraph.of(TestGraphs.path(5))).bridges;
    const b = new GraphBuilder();
    b.addEdgesAndNodes(bridges);
    expectSameGraph(b.build(), TestGraphs.path(5));
  });

  it("addEdgesOfAnEmptyResultAddsNothing", () => {
    const b = new GraphBuilder();
    b.addEdges(BackEdges.of(TestGraphs.path(3)));
    b.addEdgesAndNodes(BackEdges.of(TestGraphs.path(3)));
    expect(b.build().nodeCount).toBe(0);
  });

  // ---- node limit ----

  it("singleNodeMethodsFailAtTheNodeLimit", () => {
    const b = new GraphBuilder();
    b.addNodes(NODE_LIMIT);
    expectArgumentError(() => b.addNode(), "node limit");
    expectArgumentError(() => b.addChild(0));
    expectArgumentError(() => b.addParent(0));
    expect(b.addNodes(0)).toBe(NODE_LIMIT);
    expect(b.edgeCapacity()).toBe(0);
  });

  it("countMethodsRejectACountBeyondTheNodeLimit", () => {
    const b = new GraphBuilder();
    expectArgumentError(() => b.addNodes(MAX_INT));
    b.addNodes(NODE_LIMIT - 2);
    expectArgumentError(() => b.addNodes(3), "node limit");
    expectArgumentError(() => b.addChildren(0, 3));
    expectArgumentError(() => b.addParents(0, 3));
    expect(b.addNodes(0)).toBe(NODE_LIMIT - 2);
    expect(b.edgeCapacity()).toBe(0);
    expect(b.addChildren(0, 2)).toBe(NODE_LIMIT - 2);
    expect(b.addNodes(0)).toBe(NODE_LIMIT);
  });

  it("addGraphRejectsAGraphBeyondTheNodeLimit", () => {
    const b = new GraphBuilder();
    b.addNodes(NODE_LIMIT - 2);
    expectArgumentError(() => b.addGraph(TestGraphs.path(3)));
    expect(b.addNodes(0)).toBe(NODE_LIMIT - 2);
    expect(b.edgeCapacity()).toBe(0);
    expect(b.addGraph(TestGraphs.path(2))).toBe(NODE_LIMIT - 2);
    expect(b.addNodes(0)).toBe(NODE_LIMIT);
  });

  it("andNodesMethodsRejectIdsAtTheNodeLimit", () => {
    const b = new GraphBuilder();
    expectIndexError(() => b.addEdgeAndNodes(0, NODE_LIMIT));
    expectIndexError(() => b.addOutEdgesAndNodes(NODE_LIMIT, Int32Array.of(0)));
    expectIndexError(() => b.addInEdgesAndNodes(0, [NODE_LIMIT]));
    expectIndexError(() => b.addPathAndNodes(0, NODE_LIMIT));
    expectIndexError(() => b.addEdgePairsAndNodes(NODE_LIMIT, 0));
    expectIndexError(() => b.addEdgesAndNodes(edgesOf([0], [NODE_LIMIT])));
    expect(b.addNodes(0)).toBe(0);
    // The highest creatable ID fills the builder up to the limit.
    b.addEdgeAndNodes(0, NODE_LIMIT - 1);
    expect(b.addNodes(0)).toBe(NODE_LIMIT);
    expectArgumentError(() => b.addNode());
  });

  // ---- edge limit ----

  it("countMethodsRejectEdgesBeyondTheEdgeLimitAndChangeNothing", () => {
    // Three edges plus NODE_LIMIT - 1 new ones are one more than the edge limit; the node count
    // would still fit.
    const b = new GraphBuilder();
    b.addNode();
    b.addOutEdges(0, 0, 0, 0);
    expectArgumentError(() => b.addChildren(0, NODE_LIMIT - 1), "edge limit");
    expectArgumentError(() => b.addParents(0, NODE_LIMIT - 1), "edge limit");
    expect(b.addNodes(0)).toBe(1);
    expectSameGraph(b.build(), TestGraphs.of(1, 0, 0));
  });

  it("batchMethodsRejectEdgesBeyondTheEdgeLimitBeforeCreatingNodes", () => {
    // EDGE_LIMIT edges counted, without the memory (see pretendEdgeCount), plus one new one from
    // each batch. A path of k nodes has k - 1 edges.
    const b = new GraphBuilder();
    b.addEdgeAndNodes(0, 0);
    const restore = pretendEdgeCount(b, EDGE_LIMIT);
    const one = [0];
    const path = [0, 0];
    expectArgumentError(() => b.addOutEdges(0, one), "edge limit");
    expectArgumentError(() => b.addInEdges(0, one));
    expectArgumentError(() => b.addPath(path));
    expectArgumentError(() => b.addOutEdgesAndNodes(5, one));
    expectArgumentError(() => b.addInEdgesAndNodes(5, one));
    expectArgumentError(() => b.addPathAndNodes(path));
    expectArgumentError(() => b.addPathAndNodes(0, 5));
    expectArgumentError(() => b.addEdgePairsAndNodes(5, 0));
    expectArgumentError(() => b.addEdgesAndNodes(edgesOf([5], [0])));
    expectArgumentError(() => b.addGraph(TestGraphs.path(2)), "edge limit");
    expect(b.addNodes(0)).toBe(1);
    restore();
    expectSameGraph(b.build(), TestGraphs.of(1, 0, 0));
  });

  it("buildRejectsMoreEdgesThanTheEdgeLimit", () => {
    // Only the single-edge methods get past the limit, and only with 16 GiB of edges, so the
    // check that build() runs is tested on its own.
    GraphBuilder.checkEdgeLimit(EDGE_LIMIT);
    expectArgumentError(
      () => GraphBuilder.checkEdgeLimit(EDGE_LIMIT + 1),
      `${EDGE_LIMIT + 1} edges added exceed the edge limit of ${EDGE_LIMIT}`,
    );
    expectArgumentError(() => GraphBuilder.checkEdgeLimit(0x7fffffff));
    // And build() runs it first: one edge more than the limit, counted without the memory.
    const b = new GraphBuilder();
    b.addEdgeAndNodes(0, 0);
    const restore = pretendEdgeCount(b, EDGE_LIMIT + 1);
    expectArgumentError(() => b.build(), "exceed the edge limit");
    restore();
  });
});
