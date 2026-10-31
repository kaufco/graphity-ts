/**
 * Cross-validates Components.sccsOf and Components.wccsOf against naive oracles (Java: JGraphT's
 * Kosaraju and connectivity inspector): for every random graph, both produce the same partition.
 */

import { describe, expect, it } from "vitest";
import { Components, type Graph, type NodePartition, type Sccs } from "../src/index.js";
import { canonical, naiveSccs, naiveWccs } from "./testutils/naive.js";
import { type LabeledGraph, RandomGraphs } from "./testutils/randomGraphs.js";

const ITERATIONS = 100;
const BASE_SEED = 0xc0ffeen;

/** The groups of a partition in canonical form, checking that they cover every node once. */
function collectPartition(partition: NodePartition, nodeCount: number): number[][] {
  const groups: number[][] = [];
  for (let g = 0; g < partition.groupCount; g++) groups.push(Array.from(partition.nodesOf(g)));
  expect(groups.reduce((total, group) => total + group.length, 0)).toBe(nodeCount);
  return canonical(groups);
}

function assertReverseTopoInvariant(labeled: LabeledGraph, graph: Graph, sccs: Sccs): void {
  for (let u = 0; u < graph.nodeCount; u++) {
    for (const v of graph.outNodes(u)) {
      const su = sccs.get(u);
      const sv = sccs.get(v);
      if (su !== sv)
        expect(su, `reverse-topo invariant for ${labeled.describe()}: edge ${u} -> ${v}`).toBeGreaterThan(sv);
    }
  }
}

describe("ComponentsFuzzTest", () => {
  it("SCCs agree with the naive oracle", () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const labeled = RandomGraphs.anyGraph(BASE_SEED + BigInt(i));
      const g = labeled.graph;
      const ours = Components.sccsOf(g);
      expect(collectPartition(ours, g.nodeCount), `SCC partition mismatch for ${labeled.describe()}`).toEqual(
        naiveSccs(g),
      );
      assertReverseTopoInvariant(labeled, g, ours);
    }
  });

  it("WCCs agree with the naive oracle", () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const labeled = RandomGraphs.anyGraph(BASE_SEED + BigInt(i));
      const g = labeled.graph;
      const ours = Components.wccsOf(g);
      expect(collectPartition(ours, g.nodeCount), `WCC partition mismatch for ${labeled.describe()}`).toEqual(
        naiveWccs(g),
      );
      // Group IDs follow the smallest member of each component.
      for (let group = 1; group < ours.groupCount; group++) {
        expect(ours.nodesOf(group).first()).toBeGreaterThan(ours.nodesOf(group - 1).first());
      }
    }
  });
});
