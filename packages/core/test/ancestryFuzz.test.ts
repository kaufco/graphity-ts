/**
 * Cross-validates Ancestry against two independent oracles: the lowest common ancestor by
 * intersecting ancestor sets read from the graph's edges (in place of JGraphT's NaiveLCAFinder),
 * and a parent walk for the ancestor relation.
 */

import { describe, expect, it } from "vitest";
import { Ancestry } from "../src/index.js";
import { naiveLowestCommonAncestor, parentsOf } from "./testutils/connectivityHelpers.js";
import { JavaRandom } from "./testutils/javaRandom.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";

const ITERATIONS = 60;
const QUERIES_PER_GRAPH = 200;

/** Walks from `node` to the root of its tree, one parent at a time. */
function rootOf(ancestry: Ancestry, node: number): number {
  let root = node;
  for (let up = ancestry.parentOf(root); up >= 0; up = ancestry.parentOf(root)) root = up;
  return root;
}

/** Walks from `descendant` to its root, one parent at a time. */
function reachesByWalkingUp(ancestry: Ancestry, node: number, descendant: number): boolean {
  for (let x = descendant; x >= 0; x = ancestry.parentOf(x)) if (x === node) return true;
  return false;
}

describe("AncestryFuzzTest", () => {
  it("the lowest common ancestor matches intersected ancestor sets", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const labeled = RandomGraphs.anyForest(seed);
      const forest = labeled.graph;
      const n = forest.nodeCount;
      const ancestry = Ancestry.of(forest);
      const parent = parentsOf(forest);
      const rnd = new JavaRandom(BigInt(seed) * 31n + 1n);
      for (let q = 0; q < QUERIES_PER_GRAPH; q++) {
        const a = rnd.nextInt(n);
        const b = rnd.nextInt(n);
        expect(ancestry.lowestCommonAncestorOf(a, b), `lca(${a}, ${b}) for ${labeled.describe()}`).toBe(
          naiveLowestCommonAncestor(parent, a, b),
        );
      }
    }
  });

  it("the lowest common ancestor is symmetric and reflexive", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const labeled = RandomGraphs.anyForest(seed);
      const n = labeled.graph.nodeCount;
      const ancestry = Ancestry.of(labeled.graph);
      const rnd = new JavaRandom(BigInt(seed) * 31n + 2n);
      for (let q = 0; q < QUERIES_PER_GRAPH; q++) {
        const a = rnd.nextInt(n);
        const b = rnd.nextInt(n);
        expect(ancestry.lowestCommonAncestorOf(a, b), `symmetry for ${labeled.describe()}`).toBe(
          ancestry.lowestCommonAncestorOf(b, a),
        );
        expect(ancestry.lowestCommonAncestorOf(a, a)).toBe(a);
        const root = rootOf(ancestry, a);
        expect(ancestry.lowestCommonAncestorOf(root, a), `lca with root ${root}, ${labeled.describe()}`).toBe(root);
      }
    }
  });

  it("isAncestorOf matches a parent walk", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const labeled = RandomGraphs.anyForest(seed);
      const n = labeled.graph.nodeCount;
      const ancestry = Ancestry.of(labeled.graph);
      const rnd = new JavaRandom(BigInt(seed) * 31n + 3n);
      for (let q = 0; q < QUERIES_PER_GRAPH; q++) {
        const node = rnd.nextInt(n);
        const descendant = rnd.nextInt(n);
        expect(
          ancestry.isAncestorOf(node, descendant),
          `isAncestorOf(${node}, ${descendant}), ${labeled.describe()}`,
        ).toBe(reachesByWalkingUp(ancestry, node, descendant));
      }
    }
  });

  it("depth and parent agree with the graph", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const labeled = RandomGraphs.anyForest(seed);
      const forest = labeled.graph;
      const ancestry = Ancestry.of(forest);
      for (let node = 0; node < forest.nodeCount; node++) {
        for (const child of forest.outNodes(node)) {
          expect(ancestry.parentOf(child), `parent of ${child}, ${labeled.describe()}`).toBe(node);
          expect(ancestry.depthOf(child), `depth of ${child}, ${labeled.describe()}`).toBe(ancestry.depthOf(node) + 1);
        }
      }
    }
  });
});
