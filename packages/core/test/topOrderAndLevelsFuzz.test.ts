/**
 * Fuzz-tests TopOrderAndLevels.of on random DAGs. Levels are computed independently (Kahn with the
 * maximum over the predecessors) and compared against the port's output.
 */

import { describe, expect, it } from "vitest";
import { BiAdjacentGraph, type Graph, TopOrderAndLevels } from "../src/index.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";
import { expectTopologicalOrder } from "./testutils/traversalHelpers.js";

const ITERATIONS = 100;
const BASE_SEED = 0xdecafbad;

/** level(v) = max(level(predecessors)) + 1, or 0 without predecessors, in Kahn's order. */
function referenceLevels(graph: Graph): number[] {
  const n = graph.nodeCount;
  const inDegree = new Array<number>(n).fill(0);
  const predMaxLevel = new Array<number>(n).fill(-1);
  const levels = new Array<number>(n).fill(0);
  const queue: number[] = [];
  for (let u = 0; u < n; u++) for (const v of graph.outNodes(u)) inDegree[v]++;
  for (let v = 0; v < n; v++) if (inDegree[v] === 0) queue.push(v);
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head];
    for (const v of graph.outNodes(u)) {
      if (levels[u] > predMaxLevel[v]) predMaxLevel[v] = levels[u];
      if (--inDegree[v] === 0) {
        levels[v] = predMaxLevel[v] + 1;
        queue.push(v);
      }
    }
  }
  return levels;
}

describe("TopOrderAndLevelsFuzzTest", () => {
  it("topOrderAndLevelsAgreeWithReferenceOnDags", () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const labeled = RandomGraphs.anyDag(BASE_SEED + i);
      const g = labeled.graph;
      for (const graph of [g, BiAdjacentGraph.of(g)]) {
        const tol = TopOrderAndLevels.of(graph);
        expectTopologicalOrder(g, tol.order, labeled.describe());

        // Level invariant: every edge climbs at least one level.
        let violations = 0;
        g.forEachEdge((u, v) => {
          if (!(tol.levelOf(v) > tol.levelOf(u))) violations++;
        });
        expect(violations, `level invariant for ${labeled.describe()}`).toBe(0);

        const reference = referenceLevels(g);
        expect(Array.from(tol.levels), `levels for ${labeled.describe()}`).toEqual(reference);
        expect(tol.levelCount, labeled.describe()).toBe(g.nodeCount === 0 ? 0 : Math.max(...reference) + 1);
      }
    }
  });
});
