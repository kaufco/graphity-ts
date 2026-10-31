/**
 * Cross-validates ControlFlow.dominanceFrontiers against NaiveDominators, which decides dominance
 * by removing a node and checking reachability. Inputs are control-flow shapes with a single entry
 * and arbitrary random graphs with up to three random entries, duplicates and the empty list
 * included - the graphs and entries of the Java test for the same seeds. The last case pins the
 * results to Java's.
 */

import { BiAdjacentGraph, Dominators, type Graph } from "@kobayami/graphity-core";
import { describe, expect, it } from "vitest";
import { ControlFlow } from "../src/index.js";
import { ControlFlowGraphs, JavaRandom, NaiveDominators, RandomGraphs } from "./testutils/core.js";
import { frontiersDump, JavaStringHash } from "./testutils/javaDumps.js";
import { naiveFrontiers } from "./testutils/naiveFrontiers.js";

const ITERATIONS = 120;

const TIMEOUT = 60_000;

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

describe("ControlFlowFuzzTest", () => {
  it(
    "dominanceFrontiersMatchTheDefinition",
    () => {
      for (let seed = 0; seed < ITERATIONS; seed++) {
        const c = caseFor(seed);
        const n = c.graph.nodeCount;
        const expected = naiveFrontiers(new NaiveDominators(c.graph, c.entries), c.graph);
        const df = ControlFlow.dominanceFrontiers(Dominators.of(BiAdjacentGraph.of(c.graph), c.entries));
        for (let x = 0; x < n; x++) {
          for (let m = 0; m < n; m++) {
            if (df.hasOutNode(x, m) !== expected[x][m]) {
              expect(df.hasOutNode(x, m), `${m} in DF(${x}), ${c.describe}`).toBe(expected[x][m]);
            }
          }
        }
      }
    },
    TIMEOUT,
  );

  it(
    "frontiersAreJavas",
    () => {
      // The graphs above and two larger ones, against the hash of Java's output (see javaDumps.ts).
      const dump = new JavaStringHash();
      frontiersDump(dump);
      expect(dump.length).toBe(562_284);
      expect(dump.hash).toBe(1_975_213_120);
    },
    TIMEOUT,
  );
});
