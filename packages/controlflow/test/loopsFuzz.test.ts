/**
 * Cross-validates Loops against NaiveLoops, which builds the forest literally from its definition
 * by recursive decomposition into strongly connected components - and so also checks that
 * Havlak's algorithm yields that definition. The graphs and entries are those of the Java test for
 * the same seeds; the last case pins the complete results to Java's.
 */

import { BiAdjacentGraph, type Graph, GraphBuilder, Graphs } from "@kobayami/graphity-core";
import { describe, expect, it } from "vitest";
import { Loops } from "../src/index.js";
import { ControlFlowGraphs, JavaRandom, NaiveDominators, RandomGraphs } from "./testutils/core.js";
import { JavaStringHash, loopsDump } from "./testutils/javaDumps.js";
import { NaiveLoops } from "./testutils/naiveLoops.js";

const ITERATIONS = 150;

const TIMEOUT = 60_000;

describe("LoopsFuzzTest", () => {
  it(
    "forestMatchesTheComponentDefinition",
    () => {
      let loopsSeen = 0;
      let irreducibleSeen = 0;
      let nestedSeen = 0;
      for (let seed = 0; seed < ITERATIONS; seed++) {
        let graph: Graph;
        let entries: number[];
        let describe: string;
        if (seed % 3 !== 2) {
          const cfg = ControlFlowGraphs.anyControlFlowGraph(seed);
          graph = cfg.graph;
          entries = [0];
          describe = cfg.describe();
        } else {
          const labeled = RandomGraphs.anyGraph(seed);
          graph = labeled.graph;
          const rnd = new JavaRandom(seed);
          entries = [];
          for (let i = 0, c = 1 + rnd.nextInt(3); i < c; i++) entries.push(rnd.nextInt(graph.nodeCount));
          describe = `${labeled.describe()}, entries=[${entries.join(", ")}]`;
        }
        const n = graph.nodeCount;
        const oracle = new NaiveLoops(graph, entries);
        const loops = Loops.of(BiAdjacentGraph.of(graph), entries);

        let expectedCount = 0;
        let expectedReducible = true;
        const depth = new Array<number>(n).fill(0);
        for (let h = 0; h < n; h++) {
          const loop = oracle.loopOfHeader[h];
          if (loop === null) continue;
          expectedCount++;
          const id = loops.innermostLoopOf(h);
          expect(id, `loop of header ${h}, ${describe}`).toBeGreaterThanOrEqual(0);
          expect(loops.headerOf(id), `header of loop ${id}, ${describe}`).toBe(h);

          const body: number[] = [];
          for (let x = 0; x < n; x++) {
            if (loop.body[x]) {
              body.push(x);
              depth[x]++;
            }
            if (loops.isInLoop(x, id) !== loop.body[x]) {
              expect(loops.isInLoop(x, id), `${x} in loop of ${h}, ${describe}`).toBe(loop.body[x]);
            }
          }
          const nodes = loops.bodyOf(id).slice();
          expect(nodes[0], `body of ${h} starts with its header, ${describe}`).toBe(h);
          nodes.sort();
          expect(Array.from(nodes), `body of ${h}, ${describe}`).toEqual(body);

          const entryList = oracle.entriesOf(loop);
          expect(Array.from(loops.entriesOf(id)), `entries of ${h}, ${describe}`).toEqual(entryList);
          if (entryList.length !== 1) expectedReducible = false;

          const parentHeader = loop.parentHeader;
          const expectedParent = parentHeader < 0 ? -1 : loops.innermostLoopOf(parentHeader);
          expect(loops.parentOf(id), `parent of ${h}, ${describe}`).toBe(expectedParent);
          expect(loops.parentOf(id)).toBeLessThan(id);
          if (parentHeader >= 0) nestedSeen++;
        }
        expect(loops.loopCount, `loop count, ${describe}`).toBe(expectedCount);
        expect(loops.isReducible, `reducible, ${describe}`).toBe(expectedReducible);
        for (let x = 0; x < n; x++) {
          if (loops.loopDepthOf(x) !== depth[x]) {
            expect(loops.loopDepthOf(x), `depth of ${x}, ${describe}`).toBe(depth[x]);
          }
        }
        loopsSeen += expectedCount;
        if (!expectedReducible) irreducibleSeen++;
      }
      expect(loopsSeen, "loops compared").toBeGreaterThan(1000);
      expect(irreducibleSeen, "irreducible graphs compared").toBeGreaterThan(20);
      expect(nestedSeen, "nested loops compared").toBeGreaterThan(300);
    },
    TIMEOUT,
  );

  /**
   * Checks the promises of the documentation against the classic definitions, with dominance taken
   * from NaiveDominators: a graph is reducible if it becomes acyclic once its dominance back edges
   * (`u -> v` with `v` dominating `u`) are removed, and then every loop is the natural loop of its
   * header - the header plus every node that reaches the source of one of its back edges without
   * passing through the header.
   */
  it(
    "reducibilityAndNaturalLoopsMatchTheClassicDefinitions",
    () => {
      let naturalLoopsCompared = 0;
      let irreducibleSeen = 0;
      for (let seed = 0; seed < ITERATIONS; seed++) {
        let graph: Graph;
        let entries: number[];
        if (seed % 3 !== 2) {
          graph = ControlFlowGraphs.anyControlFlowGraph(seed).graph;
          entries = [0];
        } else {
          graph = RandomGraphs.anyGraph(seed).graph;
          const rnd = new JavaRandom(seed);
          entries = [rnd.nextInt(graph.nodeCount), rnd.nextInt(graph.nodeCount)];
        }
        const n = graph.nodeCount;
        const dominance = new NaiveDominators(graph, entries);
        const loops = Loops.of(BiAdjacentGraph.of(graph), entries);

        const forwardOnly = new GraphBuilder();
        forwardOnly.addNodes(n);
        for (let u = 0; u < n; u++) {
          if (!dominance.reachable[u]) continue;
          for (const v of graph.outNodes(u)) {
            if (!dominance.dominates[v][u]) forwardOnly.addEdge(u, v);
          }
        }
        const reducible = Graphs.isDag(forwardOnly.build());
        expect(loops.isReducible, `reducible, seed ${seed}`).toBe(reducible);
        if (!reducible) {
          irreducibleSeen++;
          continue;
        }

        // Every target of a dominance back edge heads a loop, and every loop header is one.
        const backEdgeTargets = new Set<number>();
        for (let u = 0; u < n; u++) {
          if (!dominance.reachable[u]) continue;
          for (const v of graph.outNodes(u)) {
            if (dominance.dominates[v][u]) backEdgeTargets.add(v);
          }
        }
        const headers = new Set<number>();
        for (let id = 0; id < loops.loopCount; id++) headers.add(loops.headerOf(id));
        const sorted = (s: Set<number>) => Array.from(s).sort((a, b) => a - b);
        expect(sorted(headers), `loop headers, seed ${seed}`).toEqual(sorted(backEdgeTargets));

        for (let id = 0; id < loops.loopCount; id++) {
          naturalLoopsCompared++;
          const header = loops.headerOf(id);
          const natural = new Array<boolean>(n).fill(false);
          natural[header] = true;
          const queue: number[] = [];
          for (let u = 0; u < n; u++) {
            if (
              dominance.reachable[u] &&
              graph.hasOutNode(u, header) &&
              dominance.dominates[header][u] &&
              !natural[u]
            ) {
              natural[u] = true;
              queue.push(u);
            }
          }
          while (queue.length > 0) {
            const x = queue.pop() as number;
            for (let p = 0; p < n; p++) {
              if (dominance.reachable[p] && !natural[p] && graph.hasOutNode(p, x)) {
                natural[p] = true;
                queue.push(p);
              }
            }
          }
          const expected: number[] = [];
          for (let x = 0; x < n; x++) if (natural[x]) expected.push(x);
          const body = loops.bodyOf(id).slice().sort();
          expect(Array.from(body), `natural loop of ${header}, seed ${seed}`).toEqual(expected);
        }
      }
      expect(naturalLoopsCompared, "natural loops compared").toBeGreaterThan(500);
      expect(irreducibleSeen, "irreducible graphs compared").toBeGreaterThan(20);
    },
    TIMEOUT,
  );

  it(
    "forestIsJavas",
    () => {
      // Every loop ID, header, parent, body in order, entry list, innermost loop and depth on the
      // graphs above and nine larger ones, against the hash of Java's output (see javaDumps.ts).
      const dump = new JavaStringHash();
      loopsDump(dump);
      expect(dump.length).toBe(30_184_059);
      expect(dump.hash).toBe(-759_055_806);
    },
    TIMEOUT,
  );
});
