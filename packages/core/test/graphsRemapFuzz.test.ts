/**
 * Counterpart of Java's `GraphsRemapFuzzTest`: `Graphs.remapped` against a set-based oracle - the
 * relabeled edge set must equal the original edge set translated through the mapping. Covers the
 * total-mapping path (permutations) and the filtering path (subgraphs) separately, since they are
 * distinct code paths.
 */

import { describe, expect, it } from "vitest";
import { BitSet, type Graph, Graphs, NodeMapping } from "../src/index.js";
import { JavaRandom } from "./testutils/javaRandom.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";

const ITERATIONS = 300;

/** An edge as one exact number: node IDs stay far below 2^21. */
const key = (source: number, target: number) => source * 2 ** 21 + target;

const sorted = (set: Set<number>) => Array.from(set).sort((a, b) => a - b);

function randomPermutation(n: number, seed: number): number[] {
  const perm = Array.from({ length: n }, (_, i) => i);
  const rnd = new JavaRandom(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = rnd.nextInt(i + 1);
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm;
}

function edges(g: Graph): Set<number> {
  const set = new Set<number>();
  for (let source = 0; source < g.nodeCount; source++)
    for (const target of g.outNodes(source)) set.add(key(source, target));
  return set;
}

function inducedEdges(g: Graph, selected: BitSet): Set<number> {
  const set = new Set<number>();
  for (let source = selected.nextSetBit(0); source >= 0; source = selected.nextSetBit(source + 1)) {
    for (const target of g.outNodes(source)) if (selected.get(target)) set.add(key(source, target));
  }
  return set;
}

/** Edge set of `g`, with both endpoints translated back into the original ID space. */
function translatedEdges(g: Graph, newToOld: ArrayLike<number>): Set<number> {
  const set = new Set<number>();
  for (let source = 0; source < g.nodeCount; source++) {
    for (const target of g.outNodes(source)) set.add(key(newToOld[source], newToOld[target]));
  }
  return set;
}

function expectSortedAdjacency(g: Graph, description: string): void {
  for (let source = 0; source < g.nodeCount; source++) {
    const targets = g.outNodes(source);
    for (let i = 1; i < targets.size; i++) {
      if (targets.get(i) <= targets.get(i - 1)) {
        expect.fail(`adjacency of node ${source} must stay sorted for ${description}`);
      }
    }
  }
}

describe("GraphsRemapFuzzTest", () => {
  it("permutationPreservesTranslatedEdgeSet", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const labeled = RandomGraphs.anyGraph(seed);
      const g = labeled.graph;
      const n = g.nodeCount;
      const newToOld = randomPermutation(n, seed);
      const remapped = Graphs.remapped(g, NodeMapping.forPermutation(newToOld));
      expect(remapped.nodeCount, `node count for ${labeled.describe()}`).toBe(n);
      expect(remapped.edgeCount, `permutations drop no edge for ${labeled.describe()}`).toBe(g.edgeCount);
      expect(sorted(translatedEdges(remapped, newToOld)), `translated edge set for ${labeled.describe()}`).toEqual(
        sorted(edges(g)),
      );
      expectSortedAdjacency(remapped, labeled.describe());
    }
  }, 60_000);

  it("subgraphKeepsExactlyTheInducedEdges", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const labeled = RandomGraphs.anyGraph(seed);
      const g = labeled.graph;
      const n = g.nodeCount;
      const rnd = new JavaRandom(seed * 31 + 7);
      const selected = new BitSet();
      for (let node = 0; node < n; node++) if (rnd.nextBoolean()) selected.set(node);

      const nm = NodeMapping.forSubgraph(selected);
      const sub = Graphs.remapped(g, nm);
      const newToOld = Array.from({ length: nm.mappedCount }, (_, newId) => nm.get(newId));

      expect(sorted(translatedEdges(sub, newToOld)), `induced edge set for ${labeled.describe()}`).toEqual(
        sorted(inducedEdges(g, selected)),
      );
      expectSortedAdjacency(sub, labeled.describe());
    }
  }, 60_000);
});
