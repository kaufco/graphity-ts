/**
 * The Sccs-specific members (containsCycle, isStronglyConnected, sccOf, sccCount). The inherited
 * partition behavior is covered in nodePartition.test.ts and components.test.ts.
 */

import { describe, expect, it } from "vitest";
import { Components } from "../src/index.js";
import { expectIndexError } from "./testutils/assertions.js";
import { TestGraphs } from "./testutils/testGraphs.js";

describe("SccsTest", () => {
  it("containsCycle is true for a multi-node SCC", () => {
    const sccs = Components.sccsOf(TestGraphs.cycle(3));
    expect(sccs.groupCount).toBe(1);
    expect(sccs.containsCycle(0)).toBe(true);
  });

  it("containsCycle is true for a singleton with a self-loop", () => {
    expect(Components.sccsOf(TestGraphs.of(1, 0, 0)).containsCycle(0)).toBe(true);
  });

  it("containsCycle is false for a singleton without self-loop", () => {
    const sccs = Components.sccsOf(TestGraphs.of(2, 0, 1));
    expect(sccs.containsCycle(sccs.get(0))).toBe(false);
    expect(sccs.containsCycle(sccs.get(1))).toBe(false);
  });

  it("containsCycle on mixed components", () => {
    // 0 -> 0 (self-loop), 1 -> 2 (DAG), 3 -> 4 -> 3 (cycle).
    const sccs = Components.sccsOf(TestGraphs.of(5, 0, 0, 1, 2, 3, 4, 4, 3));
    expect([0, 1, 2, 3, 4].map((v) => sccs.containsCycle(sccs.get(v)))).toEqual([true, false, false, true, true]);
  });

  it.each([-1, 5, 1000])("containsCycle(%i) out of range throws", (sccId) => {
    const sccs = Components.sccsOf(TestGraphs.path(3));
    expectIndexError(() => sccs.containsCycle(sccId));
  });

  it("isStronglyConnected is true for the empty graph", () => {
    expect(Components.sccsOf(TestGraphs.empty()).isStronglyConnected).toBe(true);
  });

  it("isStronglyConnected is true for a single node", () => {
    expect(Components.sccsOf(TestGraphs.isolated(1)).isStronglyConnected).toBe(true);
  });

  it("isStronglyConnected is true for a pure cycle", () => {
    expect(Components.sccsOf(TestGraphs.cycle(4)).isStronglyConnected).toBe(true);
  });

  it("isStronglyConnected is false for disconnected nodes", () => {
    expect(Components.sccsOf(TestGraphs.isolated(3)).isStronglyConnected).toBe(false);
  });

  it("isStronglyConnected is false for a one-way chain", () => {
    expect(Components.sccsOf(TestGraphs.path(3)).isStronglyConnected).toBe(false);
  });

  it("sccOf and sccCount delegate to the partition members", () => {
    // Cycle {0, 1} feeding sink 2.
    const sccs = Components.sccsOf(TestGraphs.of(3, 0, 1, 1, 0, 1, 2));
    expect(sccs.sccCount).toBe(sccs.groupCount);
    expect(sccs.sccCount).toBe(2);
    for (let node = 0; node < 3; node++) expect(sccs.sccOf(node), `node ${node}`).toBe(sccs.get(node));
    expect(sccs.sccOf(0)).toBe(sccs.sccOf(1));
    expect(sccs.sccOf(0)).not.toBe(sccs.sccOf(2));
  });

  it.each([-1, 3, 1000])("sccOf(%i) out of range throws", (node) => {
    const sccs = Components.sccsOf(TestGraphs.path(3));
    expectIndexError(() => sccs.sccOf(node));
  });
});
