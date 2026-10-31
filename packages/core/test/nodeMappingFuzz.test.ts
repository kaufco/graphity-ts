/**
 * Counterpart of Java's `NodeMappingFuzzTest`: `NodeMapping.reindex` against a plain recursive
 * depth-first search as an independent oracle for the DFS preorder. The iterative reindex must
 * agree node for node, not merely produce some permutation.
 */

import { describe, expect, it } from "vitest";
import { NodeMapping } from "../src/index.js";
import { recursiveDfsOrder } from "./testutils/naive.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";

const ITERATIONS = 300;

describe("NodeMappingFuzzTest", () => {
  it("reindexOrderMatchesRecursivePreorder", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const labeled = RandomGraphs.anyGraph(seed);
      const g = labeled.graph;
      const nm = NodeMapping.reindex(g);
      const actual = Array.from({ length: nm.mappedCount }, (_, newId) => nm.get(newId));
      expect(actual, `reindex must equal recursive DFS preorder for ${labeled.describe()}`).toEqual(
        recursiveDfsOrder(g).preOrder,
      );
    }
  }, 60_000);
});
