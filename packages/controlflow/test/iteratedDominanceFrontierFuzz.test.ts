/**
 * Cross-validates IteratedDominanceFrontier against the fixpoint over the dominance frontiers
 * that NaiveDominators derives from the definition of dominance. The graphs, entries and queries
 * are those of the Java test for the same seeds; the last case pins the results to Java's.
 */

import { BiAdjacentGraph, Dominators, type Graph } from "@kobayami/graphity-core";
import { describe, expect, it } from "vitest";
import { IteratedDominanceFrontier } from "../src/index.js";
import { ControlFlowGraphs, JavaRandom, NaiveDominators, RandomGraphs } from "./testutils/core.js";
import { idfDump, JavaStringHash } from "./testutils/javaDumps.js";
import { naiveFrontiers, naiveIteratedFrontier } from "./testutils/naiveFrontiers.js";

const ITERATIONS = 100;
const QUERIES_PER_GRAPH = 20;

const TIMEOUT = 60_000;

describe("IteratedDominanceFrontierFuzzTest", () => {
  it(
    "frontierOfMatchesTheFixpoint",
    () => {
      let nonEmpty = 0;
      for (let seed = 0; seed < ITERATIONS; seed++) {
        let graph: Graph;
        let entries: number[];
        let describe: string;
        if (seed % 2 === 0) {
          const cfg = ControlFlowGraphs.anyControlFlowGraph(seed);
          graph = cfg.graph;
          entries = [0];
          describe = cfg.describe();
        } else {
          const labeled = RandomGraphs.anyGraph(seed);
          graph = labeled.graph;
          const r = new JavaRandom(seed);
          entries = [r.nextInt(graph.nodeCount), r.nextInt(graph.nodeCount)];
          describe = `${labeled.describe()}, entries=[${entries.join(", ")}]`;
        }
        const n = graph.nodeCount;
        const oracle = new NaiveDominators(graph, entries);
        const frontiers = naiveFrontiers(oracle, graph);
        const idf = IteratedDominanceFrontier.of(Dominators.of(BiAdjacentGraph.of(graph), entries));

        const rnd = new JavaRandom(BigInt(seed) * 13n + 7n);
        for (let q = 0; q < QUERIES_PER_GRAPH; q++) {
          const nodes: number[] = [];
          const count = 1 + rnd.nextInt(Math.min(8, n));
          for (let i = 0; i < count; i++) nodes.push(rnd.nextInt(n));

          const expected = naiveIteratedFrontier(frontiers, nodes);
          const expectedList: number[] = [];
          for (let m = 0; m < n; m++) if (expected[m]) expectedList.push(m);
          if (expectedList.length > 0) nonEmpty++;
          expect(Array.from(idf.frontierOf(nodes)), `IDF([${nodes.join(", ")}]), ${describe}`).toEqual(expectedList);
        }
      }
      expect(nonEmpty, "queries with a non-empty frontier").toBeGreaterThan(300);
    },
    TIMEOUT,
  );

  it(
    "frontiersAreJavas",
    () => {
      // The queries above and 100 more on two larger graphs, against the hash of Java's output
      // (see javaDumps.ts).
      const dump = new JavaStringHash();
      idfDump(dump);
      expect(dump.length).toBe(757_560);
      expect(dump.hash).toBe(1_812_140_277);
    },
    TIMEOUT,
  );
});
