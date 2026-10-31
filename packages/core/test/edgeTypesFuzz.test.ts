/** Cross-validates EdgeTypes.of against the independent recursive classifier on random graphs. */

import { describe, expect, it } from "vitest";
import { BackEdges, EdgeType, EdgeTypes, Edges, type Graph } from "../src/index.js";
import { naiveEdgeTypes } from "./testutils/naive.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";
import { pairSet } from "./testutils/traversalHelpers.js";

const ITERATIONS = 100;
const BASE_SEED = 0xfeedfacen;
const ALL_TYPES: EdgeType[] = [EdgeType.TREE, EdgeType.BACK, EdgeType.FORWARD, EdgeType.CROSS];

function typesOf(graph: Graph, et: EdgeTypes): EdgeType[] {
  return Array.from({ length: graph.edgeCount }, (_, e) => et.typeOf(e));
}

describe("EdgeTypesFuzzTest", () => {
  it("edgeTypesMatchNaiveClassifier", () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const labeled = RandomGraphs.anyGraph(BASE_SEED + BigInt(i));
      const g = labeled.graph;
      expect(typesOf(g, EdgeTypes.of(g)), `classification mismatch for ${labeled.describe()}`).toEqual(
        naiveEdgeTypes(g),
      );
    }
  });

  it("typeCountsSumToEdgeCount", () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const labeled = RandomGraphs.anyGraph(BASE_SEED + BigInt(i));
      const g = labeled.graph;
      const et = EdgeTypes.of(g);
      let total = 0;
      for (const t of ALL_TYPES) total += Edges.of(et, t).count;
      expect(total, `sum of type counts for ${labeled.describe()}`).toBe(g.edgeCount);
    }
  });

  it("edgesOfAgreeWithTypeOf", () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const labeled = RandomGraphs.anyGraph(BASE_SEED + BigInt(i));
      const g = labeled.graph;
      const et = EdgeTypes.of(g);
      const byType = new Map<EdgeType, number[]>(ALL_TYPES.map((t) => [t, []]));
      for (let e = 0; e < g.edgeCount; e++) byType.get(et.typeOf(e))!.push(e);
      for (const t of ALL_TYPES) {
        const edges = Edges.of(et, t);
        const expected = byType.get(t)!;
        expect(Array.from(edges.edgeIndices), `Edges.of(${t}) for ${labeled.describe()}`).toEqual(expected);
        expect(Array.from(edges.targetNodes)).toEqual(expected.map((e) => g.edgeTarget(e)));
        expect(Array.from(edges.sourceNodes)).toEqual(expected.map((e) => g.edgeSource(e)));
      }
    }
  });

  it("backEdgesSubsetMatchesBackEdgesClass", () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const labeled = RandomGraphs.anyGraph(BASE_SEED + BigInt(i));
      const g = labeled.graph;
      expect(pairSet(Edges.of(EdgeTypes.of(g), EdgeType.BACK)), labeled.describe()).toEqual(pairSet(BackEdges.of(g)));
    }
  });
});
