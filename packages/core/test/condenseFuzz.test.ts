/**
 * Cross-validates NodePartition.condense against a naive reference built from per-group sets.
 * Random graphs reach several hundred groups, so the multi-word path of the dedup bit set is in
 * play, where a stale mark or a reset that clears too much would hide from the unit tests.
 */

import { describe, expect, it } from "vitest";
import { Components, type Graph, Graphs, NodePartition } from "../src/index.js";
import { ints } from "./testutils/assertions.js";
import { JavaRandom } from "./testutils/javaRandom.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";

const ITERATIONS = 100;
const BASE_SEED = 0xc0deda7an;

/** The sorted out-groups of every group, from the definition. */
function naiveCondensation(graph: Graph, partition: NodePartition): number[][] {
  const targets: Set<number>[] = Array.from({ length: partition.groupCount }, () => new Set<number>());
  for (let u = 0; u < graph.nodeCount; u++) {
    for (const v of graph.outNodes(u)) {
      const sourceGroup = partition.get(u);
      const targetGroup = partition.get(v);
      if (sourceGroup >= 0 && targetGroup >= 0 && sourceGroup !== targetGroup) targets[sourceGroup].add(targetGroup);
    }
  }
  return targets.map((s) => Array.from(s).sort((a, b) => a - b));
}

describe("CondenseFuzzTest", () => {
  it("condense agrees with the naive reference", () => {
    let maxGroups = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const labeled = RandomGraphs.anyGraph(BASE_SEED + BigInt(i));
      const g = labeled.graph;
      const sccs = Components.sccsOf(g);
      const condensed = sccs.condense();
      maxGroups = Math.max(maxGroups, sccs.groupCount);
      expect(condensed.nodeCount, `node count for ${labeled.describe()}`).toBe(sccs.groupCount);
      const expected = naiveCondensation(g, sccs);
      for (let group = 0; group < sccs.groupCount; group++) {
        expect(ints(condensed.outNodes(group)), `group ${group} for ${labeled.describe()}`).toEqual(expected[group]);
      }
    }
    expect(maxGroups, "test would not exercise the multi-word dedup path").toBeGreaterThan(64);
  });

  it("caller partitions agree with the naive reference", () => {
    let partialSeen = 0;
    let crossEdgesSeen = 0;
    let maxGroups = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const labeled = RandomGraphs.anyGraph(BASE_SEED + 7919n * BigInt(i));
      const g = labeled.graph;
      const n = g.nodeCount;
      const rnd = new JavaRandom(BASE_SEED + BigInt(i));
      const groupCount = rnd.nextInt(Math.max(1, Math.trunc(n / 2)) + 2);
      maxGroups = Math.max(maxGroups, groupCount);
      const groupOf = new Int32Array(n);
      for (let v = 0; v < n; v++) {
        groupOf[v] = groupCount === 0 || rnd.nextInt(5) === 0 ? -1 : rnd.nextInt(groupCount);
      }
      const partition = NodePartition.of(g, groupOf, groupCount);
      const describe = `${labeled.describe()}, groups=${groupCount}`;
      if (partition.isPartial) partialSeen++;

      for (let group = 0; group < groupCount; group++) {
        const expectedMembers: number[] = [];
        for (let v = 0; v < n; v++) if (groupOf[v] === group) expectedMembers.push(v);
        expect(ints(partition.nodesOf(group)), `members of group ${group} for ${describe}`).toEqual(expectedMembers);
      }

      const condensed = partition.condense();
      expect(condensed.nodeCount, `node count for ${describe}`).toBe(groupCount);
      const expected = naiveCondensation(g, partition);
      for (let group = 0; group < groupCount; group++) {
        expect(ints(condensed.outNodes(group)), `group ${group} for ${describe}`).toEqual(expected[group]);
      }

      const provenance = Graphs.edgePartition(condensed, partition);
      for (let u = 0; u < n; u++) {
        for (let e = g.outEdgeStart(u); e < g.outEdgeEnd(u); e++) {
          const su = groupOf[u];
          const sv = groupOf[g.edgeTarget(e)];
          const mapped = provenance.get(e);
          if (su < 0 || sv < 0 || su === sv) {
            expect(mapped, `edge ${e} unmapped for ${describe}`).toBe(-1);
          } else {
            crossEdgesSeen++;
            expect(condensed.edgeSource(mapped)).toBe(su);
            expect(condensed.edgeTarget(mapped)).toBe(sv);
          }
        }
      }
    }
    expect(partialSeen, "partitions with nodes in no group").toBeGreaterThan(50);
    expect(crossEdgesSeen, "edges between groups").toBeGreaterThan(1000);
    expect(maxGroups, "test would not exercise the multi-word dedup path").toBeGreaterThan(64);
  }, 60_000);
});
