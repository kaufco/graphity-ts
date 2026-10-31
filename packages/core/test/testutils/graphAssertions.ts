/** Helpers shared by the builder, mapping and remap tests. */

import { expect } from "vitest";
import { type Graph, Graphs } from "../../src/index.js";

/**
 * Expects two graphs to be equal by {@link Graph.equals}; on failure the complete adjacency lists
 * are compared, so the difference shows in the diff.
 */
export function expectSameGraph(actual: Graph, expected: Graph, message?: string): void {
  expect(Graphs.adjacencyListOf(actual), message).toBe(Graphs.adjacencyListOf(expected));
  expect(actual.equals(expected), message).toBe(true);
}

/** Memoizes a generator per seed, so that several tests of one file share their random graphs. */
export function memoized<T>(generate: (seed: number) => T): (seed: number) => T {
  const cache = new Map<number, T>();
  return (seed) => {
    let value = cache.get(seed);
    if (value === undefined) {
      value = generate(seed);
      cache.set(seed, value);
    }
    return value;
  };
}
