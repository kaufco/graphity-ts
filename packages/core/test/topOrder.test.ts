import { describe, expect, it } from "vitest";
import { TopOrder } from "../src/index.js";
import { expectArgumentError, ints } from "./testutils/assertions.js";
import { TestGraphs } from "./testutils/testGraphs.js";
import { expectTopologicalOrder } from "./testutils/traversalHelpers.js";

describe("TopOrderTest", () => {
  it("ofEmptyGraphIsEmpty", () => {
    expect(TopOrder.of(TestGraphs.empty()).length).toBe(0);
  });

  it("ofIsolatedNodesContainsAllNodes", () => {
    const order = TopOrder.of(TestGraphs.isolated(3));
    expect(order.length).toBe(3);
    expect(ints(order).sort()).toEqual([0, 1, 2]);
  });

  it("ofPathReturnsNodesInForwardOrder", () => {
    expect(ints(TopOrder.of(TestGraphs.path(5)))).toEqual([0, 1, 2, 3, 4]);
  });

  it("ofDiamondDagPlacesSourceBeforeAllSuccessors", () => {
    // 0 -> 1, 0 -> 2, 1 -> 3, 2 -> 3.
    const g = TestGraphs.of(4, 0, 1, 0, 2, 1, 3, 2, 3);
    const order = TopOrder.of(g);
    expectTopologicalOrder(g, order);
    // Source is first, sink is last; reverse postorder of the DFS gives 0, 2, 1, 3.
    expect(order[0]).toBe(0);
    expect(order[3]).toBe(3);
    expect(ints(order)).toEqual([0, 2, 1, 3]);
  });

  it("ofBinaryTreePlacesRootFirst", () => {
    const g = TestGraphs.of(7, 0, 1, 0, 2, 1, 3, 1, 4, 2, 5, 2, 6);
    const order = TopOrder.of(g);
    expect(order[0]).toBe(0);
    expectTopologicalOrder(g, order);
  });

  it("ofDisconnectedDagsIncludesAllNodes", () => {
    // Two disjoint DAGs: {0 -> 1} and {2 -> 3 -> 4}.
    const g = TestGraphs.of(5, 0, 1, 2, 3, 3, 4);
    const order = TopOrder.of(g);
    expect(order.length).toBe(5);
    expect(ints(order).sort()).toEqual([0, 1, 2, 3, 4]);
    expectTopologicalOrder(g, order);
  });

  it("ofGraphWithCycleThrows", () => {
    expectArgumentError(() => TopOrder.of(TestGraphs.cycle(3)), /^graph contains a cycle$/);
  });

  it("ofGraphWithSelfLoopThrows", () => {
    expectArgumentError(() => TopOrder.of(TestGraphs.of(2, 0, 0, 0, 1)));
  });

  it("ofGraphWithCycleInSubcomponentThrows", () => {
    // DAG component + cycle component.
    expectArgumentError(() => TopOrder.of(TestGraphs.of(5, 0, 1, 2, 3, 3, 4, 4, 2)));
  });

  it("ofReturnsAFreshArrayPerCall", () => {
    // Java returns an unmodifiable list; the port returns an Int32Array, read-only by contract.
    // Each call computes its own, so writing to one result cannot reach another.
    const g = TestGraphs.path(3);
    const first = TopOrder.of(g);
    first[0] = 99;
    expect(ints(TopOrder.of(g))).toEqual([0, 1, 2]);
  });
});
