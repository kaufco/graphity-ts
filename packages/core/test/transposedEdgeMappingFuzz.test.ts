/**
 * Counterpart of Java's `TransposedEdgeMappingFuzzTest`: the two ways to translate an edge index
 * across a transpose - `Graphs.transposedEdgeMapping`, a single counting-sort pass, and
 * `BiAdjacentGraph.transposedEdgeIndex`, two binary searches - against a structural oracle that
 * follows neither: the translated edge has source and target swapped, and translating twice
 * returns the original index.
 */

import { describe, expect, it } from "vitest";
import { BiAdjacentGraph, Graphs } from "../src/index.js";
import { memoized } from "./testutils/graphAssertions.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";

const ITERATIONS = 300;

const anyGraph = memoized((seed) => RandomGraphs.anyGraph(seed));

describe("TransposedEdgeMappingFuzzTest", () => {
  it("translatedEdgeHasEndpointsSwapped", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const labeled = anyGraph(seed);
      const g = labeled.graph;
      const transposed = BiAdjacentGraph.of(g).transposed();
      const mapping = Graphs.transposedEdgeMapping(g);
      expect(mapping.isPartial, `mapping is total for ${labeled.describe()}`).toBe(false);
      expect(mapping.mappedCount, `mapping covers every edge for ${labeled.describe()}`).toBe(g.edgeCount);
      for (let q = 0; q < transposed.edgeCount; q++) {
        const p = mapping.get(q);
        if (g.edgeSource(p) !== transposed.edgeTarget(q) || g.edgeTarget(p) !== transposed.edgeSource(q)) {
          expect.fail(`edge ${q} -> ${p} does not swap its endpoints for ${labeled.describe()}`);
        }
      }
    }
  }, 60_000);

  it("countingSortAndBinarySearchAgree", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const labeled = anyGraph(seed);
      const g = labeled.graph;
      const biAdjacent = BiAdjacentGraph.of(g);
      const mapping = Graphs.transposedEdgeMapping(g);
      for (let p = 0; p < g.edgeCount; p++) {
        const q = biAdjacent.transposedEdgeIndex(p);
        if (mapping.get(q) !== p) expect(mapping.get(q), `edge ${p} for ${labeled.describe()}`).toBe(p);
      }
    }
  }, 60_000);

  it("translatingTwiceReturnsTheOriginalIndex", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const labeled = anyGraph(seed);
      const biAdjacent = BiAdjacentGraph.of(labeled.graph);
      const transposed = biAdjacent.transposed();
      for (let p = 0; p < biAdjacent.edgeCount; p++) {
        const back = transposed.transposedEdgeIndex(biAdjacent.transposedEdgeIndex(p));
        if (back !== p) expect(back, `edge ${p} for ${labeled.describe()}`).toBe(p);
      }
    }
  }, 60_000);

  it("uniAndBiAdjacentInputYieldTheSameMapping", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const labeled = anyGraph(seed);
      const g = labeled.graph;
      const fromUniAdjacent = Graphs.transposedEdgeMapping(g);
      const fromBiAdjacent = Graphs.transposedEdgeMapping(BiAdjacentGraph.of(g));
      for (let q = 0; q < g.edgeCount; q++) {
        if (fromBiAdjacent.get(q) !== fromUniAdjacent.get(q)) {
          expect(fromBiAdjacent.get(q), `edge ${q} for ${labeled.describe()}`).toBe(fromUniAdjacent.get(q));
        }
      }
    }
  }, 60_000);
});
