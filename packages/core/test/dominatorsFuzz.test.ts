/**
 * Cross-validates Dominators, Graphs.dominatorTree and Ancestry.of(dominators) against
 * NaiveDominators, which decides dominance by removing a node and checking reachability. Inputs
 * are control-flow shapes with a single entry and random graphs with up to three random entries,
 * duplicates and the empty list included - the same graphs and entries as in Java.
 */

import { describe, expect, it } from "vitest";
import { Ancestry, BiAdjacentGraph, Dominators, type Graph, Graphs, PreorderAncestry } from "../src/index.js";
import { ControlFlowGraphs } from "./testutils/controlFlowGraphs.js";
import { JavaRandom } from "./testutils/javaRandom.js";
import { NaiveDominators } from "./testutils/naive.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";

const ITERATIONS = 120;

interface Case {
  readonly describe: string;
  readonly graph: Graph;
  readonly entries: number[];
}

function caseFor(seed: number): Case {
  if (seed % 2 === 0) {
    const cfg = ControlFlowGraphs.anyControlFlowGraph(seed);
    return { describe: cfg.describe(), graph: cfg.graph, entries: [0] };
  }
  const labeled = RandomGraphs.anyGraph(seed);
  const n = labeled.graph.nodeCount;
  const rnd = new JavaRandom(BigInt(seed) * 17n + 5n);
  const entries: number[] = [];
  const count = rnd.nextInt(10) === 0 ? 0 : 1 + rnd.nextInt(3);
  for (let i = 0; i < count; i++) entries.push(rnd.nextInt(n));
  return { describe: `${labeled.describe()}, entries=[${entries.join(", ")}]`, graph: labeled.graph, entries };
}

const cases = Array.from({ length: ITERATIONS }, (_, seed) => caseFor(seed));
const oracles = new Map<Case, NaiveDominators>();
const oracleOf = (c: Case) => {
  let oracle = oracles.get(c);
  if (oracle === undefined) oracles.set(c, (oracle = new NaiveDominators(c.graph, c.entries)));
  return oracle;
};

describe("DominatorsFuzzTest", () => {
  it("immediate dominators match the oracle", () => {
    let nontrivial = 0;
    for (const c of cases) {
      const oracle = oracleOf(c);
      const dominators = Dominators.of(BiAdjacentGraph.of(c.graph), c.entries);
      for (let node = 0; node < c.graph.nodeCount; node++) {
        const expected = oracle.immediateDominatorOf(node);
        if (expected > 0) nontrivial++;
        expect(dominators.immediateDominatorOf(node), `idom(${node}), ${c.describe}`).toBe(expected);
        expect(dominators.isReachable(node), `reachable(${node}), ${c.describe}`).toBe(oracle.reachable[node]);
      }
    }
    // Guards against a vacuous run: sparse random graphs reach little from their entries.
    expect(nontrivial).toBeGreaterThan(3000);
  });

  it("the dominator tree and the ancestry answer dominance", () => {
    for (const [seed, c] of cases.entries()) {
      const n = c.graph.nodeCount;
      const oracle = oracleOf(c);
      const dominators = Dominators.of(BiAdjacentGraph.of(c.graph), c.entries);

      const tree = Graphs.dominatorTree(dominators);
      let treeEdges = 0;
      for (let node = 0; node < n; node++) {
        const idom = dominators.immediateDominatorOf(node);
        if (idom >= 0) {
          treeEdges++;
          expect(tree.hasOutNode(idom, node), `tree edge to ${node}, ${c.describe}`).toBe(true);
        }
      }
      expect(tree.edgeCount, `tree edges, ${c.describe}`).toBe(treeEdges);
      expect(Graphs.isForest(tree), `tree is a forest, ${c.describe}`).toBe(true);

      const index = Ancestry.of(dominators);
      const preorder = PreorderAncestry.of(index);
      const rnd = new JavaRandom(seed);
      for (let q = 0; q < 400; q++) {
        const a = rnd.nextInt(n);
        const b = rnd.nextInt(n);
        const expected = oracle.reachable[b] ? oracle.dominates[a][b] : a === b;
        expect(index.isAncestorOf(a, b), `${a} dominates ${b}, ${c.describe}`).toBe(expected);
        expect(preorder.isAncestorOf(a, b), `${a} dominates ${b} (preorder), ${c.describe}`).toBe(expected);
      }
    }
  });
});
