/**
 * Cross-validates BfsDistances and Graphs.reachableFrom against a textbook breadth-first search
 * on random graphs with up to three random sources, duplicates and the empty list included. A
 * returned path is checked edge by edge, not compared with one particular shortest path.
 */

import { describe, expect, it } from "vitest";
import { BfsDistances, Graphs } from "../src/index.js";
import { ints } from "./testutils/assertions.js";
import { JavaRandom } from "./testutils/javaRandom.js";
import { naiveDistances } from "./testutils/naive.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";

const ITERATIONS = 150;

describe("BfsDistancesFuzzTest", () => {
  it("distances, paths and reachability match the oracle", () => {
    let pathsChecked = 0;
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const labeled = RandomGraphs.anyGraph(seed);
      const g = labeled.graph;
      const n = g.nodeCount;
      const rnd = new JavaRandom(BigInt(seed) * 31n + 3n);
      const sources: number[] = [];
      const count = rnd.nextInt(8) === 0 ? 0 : 1 + rnd.nextInt(3);
      for (let i = 0; i < count; i++) sources.push(rnd.nextInt(n));
      const describe = `${labeled.describe()}, sources=[${sources.join(", ")}]`;

      const expected = naiveDistances(g, sources);
      const d = BfsDistances.of(g, sources);
      let max = -1;
      const reachable: number[] = [];
      for (let v = 0; v < n; v++) {
        expect(d.distanceOf(v), `distance of ${v}, ${describe}`).toBe(expected[v]);
        expect(d.isReachable(v)).toBe(expected[v] >= 0);
        max = Math.max(max, expected[v]);
        if (expected[v] >= 0) reachable.push(v);
        const path = d.pathTo(v);
        if (expected[v] < 0) {
          expect(path.length).toBe(0);
          continue;
        }
        expect(path.length).toBe(expected[v] + 1);
        expect(sources).toContain(path[0]);
        expect(path[path.length - 1]).toBe(v);
        for (let i = 0; i + 1 < path.length; i++) {
          expect(g.hasOutNode(path[i], path[i + 1]), `path edge ${i}, ${describe}`).toBe(true);
        }
        if (expected[v] > 1) pathsChecked++;
      }
      expect(d.maxDistance, `max distance, ${describe}`).toBe(max);
      expect(ints(Graphs.reachableFrom(g, sources)), `reachable set, ${describe}`).toEqual(reachable);
    }
    expect(pathsChecked).toBeGreaterThan(2000);
  }, 60_000);
});
