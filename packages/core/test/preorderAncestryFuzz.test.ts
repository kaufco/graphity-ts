/**
 * Cross-validates PreorderAncestry against Ancestry, whose ancestor test goes through a lowest
 * common ancestor query instead of preorder ranges, and against a preorder walk of the forest.
 */

import { describe, expect, it } from "vitest";
import { Ancestry, type Graph, PreorderAncestry } from "../src/index.js";
import { ints } from "./testutils/assertions.js";
import { JavaRandom } from "./testutils/javaRandom.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";

const ITERATIONS = 60;
const QUERIES_PER_GRAPH = 300;

/** Preorder walk over the forest's own adjacency, children in their stored ascending order. */
function walk(forest: Graph, root: number, out: number[]): void {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    out.push(node);
    const children = forest.outNodes(node);
    for (let i = children.size - 1; i >= 0; i--) stack.push(children.get(i));
  }
}

/** A random node below `node`, found by walking up from random nodes; `node` itself as fallback. */
function someDescendant(ancestry: Ancestry, n: number, node: number, rnd: JavaRandom): number {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = rnd.nextInt(n);
    for (let x = candidate; x >= 0; x = ancestry.parentOf(x)) if (x === node) return candidate;
  }
  return node;
}

describe("PreorderAncestryFuzzTest", () => {
  it("isAncestorOf matches the lowest common ancestor test", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const labeled = RandomGraphs.anyForest(seed);
      const n = labeled.graph.nodeCount;
      const ancestry = Ancestry.of(labeled.graph);
      const preorder = PreorderAncestry.of(ancestry);
      const rnd = new JavaRandom(BigInt(seed) * 31n + 4n);
      for (let q = 0; q < QUERIES_PER_GRAPH; q++) {
        const node = rnd.nextInt(n);
        const descendant = rnd.nextBoolean() ? rnd.nextInt(n) : someDescendant(ancestry, n, node, rnd);
        expect(
          preorder.isAncestorOf(node, descendant),
          `isAncestorOf(${node}, ${descendant}), ${labeled.describe()}`,
        ).toBe(ancestry.lowestCommonAncestorOf(node, descendant) === node);
      }
    }
  });

  it("the preorder and the subtrees match a walk of the forest", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const labeled = RandomGraphs.anyForest(seed);
      const forest = labeled.graph;
      const n = forest.nodeCount;
      const ancestry = Ancestry.of(forest);
      const preorder = PreorderAncestry.of(ancestry);

      const expected: number[] = [];
      for (let node = 0; node < n; node++) if (ancestry.parentOf(node) < 0) walk(forest, node, expected);
      expect(ints(preorder.preorder), `preorder for ${labeled.describe()}`).toEqual(expected);

      for (let node = 0; node < n; node++) {
        const subtree: number[] = [];
        walk(forest, node, subtree);
        expect(ints(preorder.subtreeOf(node)), `subtree of ${node}, ${labeled.describe()}`).toEqual(subtree);
        expect(preorder.subtreeSizeOf(node)).toBe(subtree.length);
        expect(preorder.preorder[preorder.preorderIndexOf(node)]).toBe(node);
      }
    }
  });
});
