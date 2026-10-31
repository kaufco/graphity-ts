/**
 * Fuzz-tests TopOrder.of on random DAGs. Java compares against JGraphT's topological iterator; here
 * an independent Kahn order over the public adjacency takes its place. Both are valid orders, not
 * necessarily the same one, so the test checks the invariant on each.
 */

import { describe, expect, it } from "vitest";
import { type Graph, TopOrder } from "../src/index.js";
import { adjacency } from "./testutils/naive.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";
import { expectTopologicalOrder } from "./testutils/traversalHelpers.js";

const ITERATIONS = 100;
const BASE_SEED = 0xbeefface;

/** Kahn's algorithm on plain arrays, smallest ready node first. */
function referenceOrder(graph: Graph): number[] {
  const adj = adjacency(graph);
  const inDegree = new Array<number>(adj.length).fill(0);
  for (const targets of adj) for (const v of targets) inDegree[v]++;
  const ready = adj.map((_, v) => v).filter((v) => inDegree[v] === 0);
  const order: number[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => b - a);
    const u = ready.pop()!;
    order.push(u);
    for (const v of adj[u]) if (--inDegree[v] === 0) ready.push(v);
  }
  return order;
}

describe("TopOrderFuzzTest", () => {
  it("topOrderIsValidOnRandomDags", () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const labeled = RandomGraphs.anyDag(BASE_SEED + i);
      const g = labeled.graph;
      expectTopologicalOrder(g, TopOrder.of(g), labeled.describe());
      // Sanity check of the oracle, as Java checks JGraphT's order.
      expectTopologicalOrder(g, referenceOrder(g), `(reference) ${labeled.describe()}`);
    }
  });
});
