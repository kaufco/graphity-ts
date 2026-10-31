import { describe, expect, it } from "vitest";
import { BiAdjacentGraph, TopOrderAndLevels } from "../src/index.js";
import { expectArgumentError, ints } from "./testutils/assertions.js";
import { TestGraphs } from "./testutils/testGraphs.js";
import { expectTopologicalOrder } from "./testutils/traversalHelpers.js";

describe("TopOrderAndLevelsTest", () => {
  it("ofEmptyGraphHasZeroLevels", () => {
    const tol = TopOrderAndLevels.of(TestGraphs.empty());
    expect(tol.order.length).toBe(0);
    expect(tol.levels.length).toBe(0);
    expect(tol.levelCount).toBe(0);
  });

  it("ofIsolatedNodesPutsAllAtLevelZero", () => {
    const tol = TopOrderAndLevels.of(TestGraphs.isolated(3));
    expect(tol.order.length).toBe(3);
    expect(tol.levelCount).toBe(1);
    for (let i = 0; i < 3; i++) expect(tol.levelOf(i)).toBe(0);
  });

  it("ofPathAssignsIncrementingLevels", () => {
    const tol = TopOrderAndLevels.of(TestGraphs.path(5));
    for (let i = 0; i < 5; i++) expect(tol.levelOf(i)).toBe(i);
    expect(tol.levelCount).toBe(5);
  });

  it("ofDiamondAssignsSharedLevels", () => {
    // 0 -> 1, 0 -> 2, 1 -> 3, 2 -> 3.
    const tol = TopOrderAndLevels.of(TestGraphs.of(4, 0, 1, 0, 2, 1, 3, 2, 3));
    expect(tol.levelOf(0)).toBe(0);
    expect(tol.levelOf(1)).toBe(1);
    expect(tol.levelOf(2)).toBe(1);
    expect(tol.levelOf(3)).toBe(2);
    expect(tol.levelCount).toBe(3);
    // Kahn's order, one wave per level.
    expect(ints(tol.order)).toEqual([0, 1, 2, 3]);
  });

  it("ofLevelIsMaxPredecessorPlusOne", () => {
    // 0 -> 1, 0 -> 3, 1 -> 2, 2 -> 3: node 3 takes the level after its deepest predecessor 2.
    const tol = TopOrderAndLevels.of(TestGraphs.of(4, 0, 1, 0, 3, 1, 2, 2, 3));
    expect(tol.levelOf(0)).toBe(0);
    expect(tol.levelOf(1)).toBe(1);
    expect(tol.levelOf(2)).toBe(2);
    expect(tol.levelOf(3)).toBe(3);
  });

  it("ofDisconnectedDagsAssignsIndependentLevels", () => {
    // {0 -> 1} and {2 -> 3 -> 4}.
    const tol = TopOrderAndLevels.of(TestGraphs.of(5, 0, 1, 2, 3, 3, 4));
    expect(ints(tol.levels)).toEqual([0, 1, 0, 1, 2]);
    expect(tol.levelCount).toBe(3);
  });

  it("ofOrderSatisfiesTopologicalInvariant", () => {
    const g = TestGraphs.of(6, 0, 1, 0, 2, 1, 3, 2, 3, 3, 4, 3, 5);
    expectTopologicalOrder(g, TopOrderAndLevels.of(g).order);
  });

  it("ofLevelsAndLevelOfAgreeForAllNodes", () => {
    const g = TestGraphs.of(4, 0, 1, 0, 2, 1, 3, 2, 3);
    const tol = TopOrderAndLevels.of(g);
    for (let i = 0; i < g.nodeCount; i++) expect(tol.levels[i]).toBe(tol.levelOf(i));
  });

  it("ofGraphWithCycleThrows", () => {
    expectArgumentError(() => TopOrderAndLevels.of(TestGraphs.cycle(3)), /^graph contains a cycle$/);
  });

  it("ofGraphWithSelfLoopThrows", () => {
    expectArgumentError(() => TopOrderAndLevels.of(TestGraphs.of(2, 0, 0, 0, 1)));
  });

  it("ofUsesBiAdjacentFastPathConsistently", () => {
    // Same graph computed via Graph and via BiAdjacentGraph - must produce identical results.
    const g = TestGraphs.of(5, 0, 1, 0, 2, 1, 3, 2, 3, 3, 4);
    const tolUni = TopOrderAndLevels.of(g);
    const tolBi = TopOrderAndLevels.of(BiAdjacentGraph.of(g));
    expect(ints(tolUni.order)).toEqual(ints(tolBi.order));
    expect(ints(tolUni.levels)).toEqual(ints(tolBi.levels));
    expect(tolUni.levelCount).toBe(tolBi.levelCount);
  });

  it.each([-1, 4, 1000])("levelOfOutOfRangeThrows(%s)", (node) => {
    const tol = TopOrderAndLevels.of(TestGraphs.path(4));
    let error: unknown;
    try {
      tol.levelOf(node);
    } catch (e) {
      error = e;
    }
    expect((error as Error).constructor).toBe(RangeError);
    expect((error as Error).message).toBe(`Index ${node} out of bounds for length 4`);
  });

  it("theAccessorsReturnTheSameArrays", () => {
    // Java returns unmodifiable lists in O(1); the port returns its Int32Arrays, read-only by
    // contract, without a copy per call.
    const tol = TopOrderAndLevels.of(TestGraphs.path(3));
    expect(tol.order).toBe(tol.order);
    expect(tol.levels).toBe(tol.levels);
  });
});
