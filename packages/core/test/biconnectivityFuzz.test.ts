/**
 * Cross-validates Components.biconnectivityOf against oracles that follow the definitions
 * (testutils/connectivityHelpers.ts, in place of JGraphT's BiconnectivityInspector), and against
 * invariants that hold independently of any implementation. Every graph is checked twice: as
 * generated, and symmetrized, with both directions of every edge stored.
 */

import { describe, expect, it } from "vitest";
import { BiAdjacentGraph, type Biconnectivity, Components, type Graph } from "../src/index.js";
import { type UndirectedOracle, pairKey, undirectedOracle } from "./testutils/connectivityHelpers.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";

const ITERATIONS = 100;

const biconnectivityOf = (graph: Graph): Biconnectivity => Components.biconnectivityOf(BiAdjacentGraph.of(graph));

interface Case {
  readonly description: string;
  readonly graph: Graph;
  /** Shared by a graph and its symmetrized form, whose undirected reading is the same. */
  readonly oracle: () => UndirectedOracle;
}

const cases: Case[] = [];
for (let seed = 0; seed < ITERATIONS; seed++) {
  const labeled = RandomGraphs.anyGraph(seed);
  let cached: UndirectedOracle | undefined;
  const oracle = () => (cached ??= undirectedOracle(labeled.graph));
  cases.push({ description: labeled.describe(), graph: labeled.graph, oracle });
  cases.push({
    description: `${labeled.describe()}, symmetrized`,
    graph: RandomGraphs.symmetrized(labeled.graph),
    oracle,
  });
}

describe("BiconnectivityFuzzTest", () => {
  it("bridges match the oracle", () => {
    for (const c of cases) {
      const bridges = biconnectivityOf(c.graph).bridges;
      const actual = new Set<number>();
      for (let p = 0; p < bridges.count; p++) actual.add(pairKey(bridges.sourceNodes[p], bridges.targetNodes[p]));
      expect(actual, `bridges for ${c.description}`).toEqual(c.oracle().bridges);
    }
  });

  it("articulation points match the oracle", () => {
    for (const c of cases) {
      const actual = Array.from(biconnectivityOf(c.graph).articulationPoints);
      expect(actual, `articulation points for ${c.description}`).toEqual(c.oracle().articulationPoints);
    }
  });

  it("blocks match the oracle", () => {
    for (const c of cases) {
      const graph = c.graph;
      const blocks = biconnectivityOf(graph).blocks;
      const actual = new Set<string>();
      for (let block = 0; block < blocks.groupCount; block++) {
        const keys = new Set<number>();
        for (const edgeIndex of blocks.edgesOf(block))
          keys.add(pairKey(graph.edgeSource(edgeIndex), graph.edgeTarget(edgeIndex)));
        actual.add(
          Array.from(keys)
            .sort((a, b) => a - b)
            .join(","),
        );
      }
      expect(actual, `blocks for ${c.description}`).toEqual(c.oracle().blocks);
    }
  });

  it("blocks cover every edge but self-loops exactly once", () => {
    for (const c of cases) {
      const graph = c.graph;
      const blocks = biconnectivityOf(graph).blocks;
      let selfLoops = 0;
      for (let edgeIndex = 0; edgeIndex < graph.edgeCount; edgeIndex++) {
        if (graph.edgeSource(edgeIndex) === graph.edgeTarget(edgeIndex)) {
          selfLoops++;
          expect(blocks.get(edgeIndex), `self-loop ${edgeIndex} for ${c.description}`).toBe(-1);
        } else {
          const block = blocks.get(edgeIndex);
          expect(block >= 0 && block < blocks.groupCount, `edge ${edgeIndex} in a block for ${c.description}`).toBe(
            true,
          );
        }
      }
      expect(blocks.mappedCount).toBe(graph.edgeCount - selfLoops);
      expect(blocks.isPartial).toBe(selfLoops > 0);
      let members = 0;
      for (let block = 0; block < blocks.groupCount; block++) members += blocks.sizeOf(block);
      expect(members).toBe(blocks.mappedCount);
    }
  }, 60_000);

  it("reciprocal pairs share a block and bridges stand alone", () => {
    for (const c of cases) {
      const graph = c.graph;
      const biconnectivity = biconnectivityOf(graph);
      const blocks = biconnectivity.blocks;
      for (let edgeIndex = 0; edgeIndex < graph.edgeCount; edgeIndex++) {
        const source = graph.edgeSource(edgeIndex);
        const target = graph.edgeTarget(edgeIndex);
        if (source === target || !graph.hasOutNode(target, source)) continue;
        const reverse = graph.edgeIndexOf(target, source);
        expect(blocks.get(reverse), `reciprocal pair ${edgeIndex}/${reverse} for ${c.description}`).toBe(
          blocks.get(edgeIndex),
        );
      }
      const bridges = biconnectivity.bridges;
      for (let p = 0; p < bridges.count; p++) {
        const source = bridges.sourceNodes[p];
        const target = bridges.targetNodes[p];
        const edgeIndex = bridges.edgeIndices[p];
        expect(graph.edgeIndexOf(source, target), `bridge edge index for ${c.description}`).toBe(edgeIndex);
        if (source > target) expect(graph.hasOutNode(target, source), `lower node first, ${c.description}`).toBe(false);
        for (const other of blocks.edgesOf(blocks.get(edgeIndex))) {
          expect(pairKey(graph.edgeSource(other), graph.edgeTarget(other))).toBe(pairKey(source, target));
        }
        if (p > 0) expect(bridges.edgeIndices[p - 1] < edgeIndex, `edge index order, ${c.description}`).toBe(true);
      }
    }
  });

  it("the corpus exercises all three results", () => {
    const totals = [0, 0, 0];
    for (const c of cases) {
      const biconnectivity = biconnectivityOf(c.graph);
      totals[0] += biconnectivity.bridges.count;
      totals[1] += biconnectivity.articulationPoints.size;
      const blocks = biconnectivity.blocks;
      for (let block = 0; block < blocks.groupCount; block++) if (blocks.sizeOf(block) > 2) totals[2]++;
    }
    expect(totals[0]).toBeGreaterThan(100);
    expect(totals[1]).toBeGreaterThan(100);
    expect(totals[2]).toBeGreaterThan(100);
  });
});
