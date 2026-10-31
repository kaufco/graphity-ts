/**
 * The two methods of Java's `NaiveDominators` that only the control-flow tests use, `frontiers()`
 * and `iteratedFrontier(...)`, as functions over the `NaiveDominators` of the core's test
 * utilities, which this package reuses without changing them.
 */

import type { Graph } from "@kobayami/graphity-core";
import type { NaiveDominators } from "./core.js";

/**
 * All dominance frontiers: `frontier[x][m]` if `x` dominates a predecessor of `m` and does not
 * strictly dominate `m`.
 */
export function naiveFrontiers(dominance: NaiveDominators, graph: Graph): boolean[][] {
  const n = graph.nodeCount;
  const frontier = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  for (let x = 0; x < n; x++) {
    if (!dominance.reachable[x]) continue;
    for (let p = 0; p < n; p++) {
      if (!dominance.dominates[x][p]) continue;
      const outs = graph.outNodes(p);
      for (let i = 0; i < outs.size; i++) {
        const m = outs.get(i);
        if (!(dominance.dominates[x][m] && x !== m)) frontier[x][m] = true;
      }
    }
  }
  return frontier;
}

/**
 * The iterated dominance frontier of `nodes`: the frontier of the set, then of the set joined with
 * the result, until it no longer grows.
 */
export function naiveIteratedFrontier(frontiers: boolean[][], nodes: ArrayLike<number>): boolean[] {
  const n = frontiers.length;
  const source = new Array<boolean>(n).fill(false);
  for (let i = 0; i < nodes.length; i++) source[nodes[i]] = true;
  const result = new Array<boolean>(n).fill(false);
  let grew = true;
  while (grew) {
    grew = false;
    for (let x = 0; x < n; x++) {
      if (!source[x] && !result[x]) continue;
      for (let m = 0; m < n; m++) {
        if (frontiers[x][m] && !result[m]) {
          result[m] = true;
          grew = true;
        }
      }
    }
  }
  return result;
}
