import { describe, expect, it } from "vitest";
import { BackEdges, EdgeType, EdgeTypes, Edges } from "../src/index.js";
import { expectIndexError, ints } from "./testutils/assertions.js";
import { TestGraphs } from "./testutils/testGraphs.js";
import { pairSet } from "./testutils/traversalHelpers.js";

const ALL_TYPES: EdgeType[] = [EdgeType.TREE, EdgeType.BACK, EdgeType.FORWARD, EdgeType.CROSS];

describe("EdgeTypesTest", () => {
  it("ofEmptyGraphHasNoEdgeTypes", () => {
    const et = EdgeTypes.of(TestGraphs.empty());
    for (const t of ALL_TYPES) expect(Edges.of(et, t).count).toBe(0);
  });

  it("ofPathClassifiesAllEdgesAsTree", () => {
    const g = TestGraphs.path(5);
    const et = EdgeTypes.of(g);
    for (let i = 0; i < g.edgeCount; i++) expect(et.typeOf(i)).toBe(EdgeType.TREE);
    expect(Edges.of(et, EdgeType.TREE).count).toBe(4);
  });

  it("ofDagWithForwardEdge", () => {
    // 0 -> 1, 0 -> 2, 1 -> 2. DFS from 0: tree 0->1, tree 1->2, then 0->2 is forward.
    const et = EdgeTypes.of(TestGraphs.of(3, 0, 1, 0, 2, 1, 2));
    const forward = Edges.of(et, EdgeType.FORWARD);
    expect(ints(forward.sourceNodes)).toEqual([0]);
    expect(ints(forward.targetNodes)).toEqual([2]);
    expect(ints(forward.edgeIndices)).toEqual([1]);
  });

  it("ofDagWithCrossEdge", () => {
    // 0 -> 1, 0 -> 2, 2 -> 1: 1 is finished when 2 reaches it, disc[2] > disc[1] -> cross.
    const et = EdgeTypes.of(TestGraphs.of(3, 0, 1, 0, 2, 2, 1));
    const cross = Edges.of(et, EdgeType.CROSS);
    expect(ints(cross.sourceNodes)).toEqual([2]);
    expect(ints(cross.targetNodes)).toEqual([1]);
  });

  it("ofCycleHasOneBackEdge", () => {
    const et = EdgeTypes.of(TestGraphs.cycle(4));
    const back = Edges.of(et, EdgeType.BACK);
    expect(back.count).toBe(1);
    expect(back.sourceNodes[0]).toBe(3);
    expect(back.targetNodes[0]).toBe(0);
    expect(Edges.of(et, EdgeType.TREE).count).toBe(3);
  });

  it("ofSelfLoopIsBackEdge", () => {
    const et = EdgeTypes.of(TestGraphs.of(1, 0, 0));
    expect(et.typeOf(0)).toBe(EdgeType.BACK);
  });

  it("edgeTypesPartitionAllEdges", () => {
    // 0 -> 1, 0 -> 2, 0 -> 3, 1 -> 3, 2 -> 3, 3 -> 0: all four types.
    const g = TestGraphs.of(4, 0, 1, 0, 2, 0, 3, 1, 3, 2, 3, 3, 0);
    const et = EdgeTypes.of(g);
    let total = 0;
    for (const t of ALL_TYPES) total += Edges.of(et, t).count;
    expect(total).toBe(g.edgeCount);
    for (let i = 0; i < g.edgeCount; i++) expect(ALL_TYPES).toContain(et.typeOf(i));
    expect(Edges.of(et, EdgeType.TREE).count).toBe(3);
    expect(Edges.of(et, EdgeType.BACK).count).toBe(1);
    expect(Edges.of(et, EdgeType.FORWARD).count).toBe(1);
    expect(Edges.of(et, EdgeType.CROSS).count).toBe(1);
  });

  it("typeOfAgreesWithEdgesOfType", () => {
    const g = TestGraphs.of(4, 0, 1, 0, 2, 1, 2, 1, 3, 2, 3, 3, 0);
    const et = EdgeTypes.of(g);
    // For each type, gather (source, target) via Edges.of, then look the edge up and verify typeOf.
    for (const type of ALL_TYPES) {
      const edges = Edges.of(et, type);
      for (let i = 0; i < edges.count; i++) {
        const src = edges.sourceNodes[i];
        const tgt = edges.targetNodes[i];
        let foundIndex = -1;
        for (let j = g.outEdgeStart(src); j < g.outEdgeEnd(src); j++) {
          if (g.edgeTarget(j) === tgt) {
            foundIndex = j;
            break;
          }
        }
        expect(foundIndex).not.toBe(-1);
        expect(edges.edgeIndices[i]).toBe(foundIndex);
        expect(et.typeOf(foundIndex)).toBe(type);
      }
    }
  });

  it("edgesOfTypeComeInEdgeIndexOrder", () => {
    const g = TestGraphs.of(4, 0, 1, 0, 2, 1, 2, 1, 3, 2, 3, 3, 0, 3, 1);
    const et = EdgeTypes.of(g);
    for (const type of ALL_TYPES) {
      const indices = ints(Edges.of(et, type).edgeIndices);
      expect(indices).toEqual([...indices].sort((a, b) => a - b));
    }
  });

  it("backEdgesAgreeWithBackEdgesClass", () => {
    const g = TestGraphs.of(5, 0, 1, 1, 2, 2, 0, 2, 3, 3, 4, 4, 3);
    const viaEt = Edges.of(EdgeTypes.of(g), EdgeType.BACK);
    const viaBe = BackEdges.of(g);
    expect(viaEt.count).toBe(viaBe.count);
    expect(pairSet(viaEt)).toEqual(pairSet(viaBe));
  });

  it.each([-1, 3, 1000])("typeOfOutOfRangeThrows(%s)", (edgeIndex) => {
    const et = EdgeTypes.of(TestGraphs.path(4));
    expectIndexError(() => et.typeOf(edgeIndex), `Index ${edgeIndex} out of bounds for length 3`);
  });

  it("theTypesKeepTheOrdinalsOfJava", () => {
    // The ordinals are the bytes of the shared fixtures.
    expect(ALL_TYPES).toEqual([0, 1, 2, 3]);
  });
});
