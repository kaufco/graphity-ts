/**
 * The Components factory: sccsOf, wccsOf, ccsOf build the right partition, and SCC IDs follow the
 * documented reverse topological order. Inherited partition behavior is covered in
 * nodePartition.test.ts, the Sccs members in sccs.test.ts, biconnectivityOf and
 * strongConnectivityOf in their own test files.
 */

import { describe, expect, it } from "vitest";
import { Components, type Graph, Graphs, type Sccs } from "../src/index.js";
import { ints } from "./testutils/assertions.js";
import { TestGraphs } from "./testutils/testGraphs.js";

/** For every edge u -> v between different SCCs, `sccs.get(u) > sccs.get(v)`. */
function assertReverseTopoInvariant(graph: Graph, sccs: Sccs): void {
  for (let u = 0; u < graph.nodeCount; u++) {
    for (const v of graph.outNodes(u)) {
      const su = sccs.get(u);
      const sv = sccs.get(v);
      if (su !== sv) expect(su, `cross-SCC edge ${u} -> ${v}`).toBeGreaterThan(sv);
    }
  }
}

describe("ComponentsTest", () => {
  it("sccsOf the empty graph has no groups", () => {
    expect(Components.sccsOf(TestGraphs.empty()).groupCount).toBe(0);
  });

  it("sccsOf isolated nodes gives each its own SCC", () => {
    expect(Components.sccsOf(TestGraphs.isolated(4)).groupCount).toBe(4);
  });

  it("sccsOf a pure cycle is a single SCC", () => {
    const sccs = Components.sccsOf(TestGraphs.cycle(4));
    expect(sccs.groupCount).toBe(1);
    expect(ints(sccs.nodesOf(0))).toEqual([0, 1, 2, 3]);
  });

  it("sccsOf a DAG has one SCC per node", () => {
    const sccs = Components.sccsOf(TestGraphs.of(4, 0, 1, 0, 2, 1, 3, 2, 3));
    expect(sccs.groupCount).toBe(4);
    for (let i = 0; i < 4; i++) expect(sccs.sizeOf(sccs.get(i))).toBe(1);
  });

  it("sccsOf a self-looped node forms a singleton SCC", () => {
    const sccs = Components.sccsOf(TestGraphs.of(1, 0, 0));
    expect(sccs.groupCount).toBe(1);
    expect(ints(sccs.nodesOf(0))).toEqual([0]);
  });

  it("sccsOf two disjoint SCCs finds both", () => {
    const sccs = Components.sccsOf(TestGraphs.of(6, 0, 1, 1, 2, 2, 0, 3, 4, 4, 5, 5, 3));
    expect(sccs.groupCount).toBe(2);
    expect(sccs.sizeOf(0)).toBe(3);
    expect(sccs.sizeOf(1)).toBe(3);
    expect(sccs.get(1)).toBe(sccs.get(0));
    expect(sccs.get(2)).toBe(sccs.get(0));
    expect(sccs.get(4)).toBe(sccs.get(3));
    expect(sccs.get(5)).toBe(sccs.get(3));
    expect(sccs.get(0)).not.toBe(sccs.get(3));
  });

  it("sccsOf a chain of singletons assigns reverse topological IDs", () => {
    const sccs = Components.sccsOf(TestGraphs.path(4));
    expect([3, 2, 1, 0].map((v) => sccs.get(v))).toEqual([0, 1, 2, 3]);
  });

  it("sccsOf the textbook graph assigns IDs in reverse topological order", () => {
    const g = TestGraphs.of(7, 0, 1, 1, 2, 1, 4, 2, 3, 3, 2, 4, 5, 5, 6, 6, 4);
    const sccs = Components.sccsOf(g);
    expect(sccs.groupCount).toBe(4);
    assertReverseTopoInvariant(g, sccs);
  });

  it("sccsOf a mixed graph keeps the reverse topological invariant", () => {
    const g = TestGraphs.of(8, 0, 1, 1, 0, 2, 0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 5);
    const sccs = Components.sccsOf(g);
    expect(sccs.groupCount).toBe(5);
    assertReverseTopoInvariant(g, sccs);
  });

  it("the condensation of sccsOf is a DAG", () => {
    const sccs = Components.sccsOf(TestGraphs.of(4, 0, 1, 1, 0, 1, 2, 2, 3, 3, 2));
    const condensed = sccs.condense();
    expect(condensed.nodeCount).toBe(sccs.groupCount);
    expect(Graphs.isDag(condensed)).toBe(true);
  });

  it("sccsOf sorts the members of every SCC", () => {
    // The SCC {0, 1, 2, 3} is popped from Tarjan's stack in reverse discovery order.
    const sccs = Components.sccsOf(TestGraphs.of(4, 0, 3, 3, 2, 2, 1, 1, 0));
    expect(ints(sccs.nodesOf(0))).toEqual([0, 1, 2, 3]);
  });

  it("sccsOf handles a path far deeper than the call stack", () => {
    const sccs = Components.sccsOf(TestGraphs.path(200_000));
    expect(sccs.sccCount).toBe(200_000);
    expect(sccs.get(0)).toBe(199_999);
  });

  it("wccsOf the empty graph has no groups", () => {
    expect(Components.wccsOf(TestGraphs.empty()).groupCount).toBe(0);
  });

  it("wccsOf isolated nodes gives each its own WCC", () => {
    expect(Components.wccsOf(TestGraphs.isolated(4)).groupCount).toBe(4);
  });

  it("wccsOf a connected chain is a single WCC", () => {
    const wccs = Components.wccsOf(TestGraphs.path(5));
    expect(wccs.groupCount).toBe(1);
    expect(ints(wccs.nodesOf(0))).toEqual([0, 1, 2, 3, 4]);
  });

  it("wccsOf ignores edge direction", () => {
    const wccs = Components.wccsOf(TestGraphs.of(3, 0, 1, 2, 1));
    expect(wccs.groupCount).toBe(1);
    expect(ints(wccs.nodesOf(0))).toEqual([0, 1, 2]);
  });

  it("wccsOf two disjoint components", () => {
    const wccs = Components.wccsOf(TestGraphs.of(5, 0, 1, 1, 2, 3, 4));
    expect(wccs.groupCount).toBe(2);
    const g1 = wccs.get(0);
    const g2 = wccs.get(3);
    expect(g1).not.toBe(g2);
    expect(ints(wccs.nodesOf(g1))).toEqual([0, 1, 2]);
    expect(ints(wccs.nodesOf(g2))).toEqual([3, 4]);
  });

  it("wccsOf numbers the components by their smallest node", () => {
    const wccs = Components.wccsOf(TestGraphs.of(6, 5, 0, 4, 1, 3, 2));
    expect([0, 1, 2, 3, 4, 5].map((v) => wccs.get(v))).toEqual([0, 1, 2, 2, 1, 0]);
  });

  it("wccsOf: a self-loop stands alone", () => {
    expect(Components.wccsOf(TestGraphs.of(3, 0, 0, 1, 2)).groupCount).toBe(2);
  });

  it("ccsOf matches wccsOf", () => {
    const g = TestGraphs.of(5, 0, 1, 1, 2, 3, 4);
    const ccs = Components.ccsOf(g);
    const wccs = Components.wccsOf(g);
    expect(ccs.groupCount).toBe(wccs.groupCount);
    for (let i = 0; i < g.nodeCount; i++) expect(ccs.get(i)).toBe(wccs.get(i));
  });
});
