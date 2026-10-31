/**
 * Helpers for the tests of the traversers and orders. The Java tests read the protected state of a
 * traverser from the same package; TypeScript has no package access, so these views expose it
 * (`protected` is a compile-time contract only).
 */

import { expect } from "vitest";
import type { BitSet, DfsEdgeTraverser, DfsTraverser, Edges, FrontierTraverser, Graph } from "../../src/index.js";

/** The protected state queries of a depth-first traverser. */
export interface DfsState {
  isVisited(node: number): boolean;
  isOnStack(node: number): boolean;
}

/** The protected state of a frontier traverser. */
export interface FrontierState {
  readonly visited: BitSet;
  isVisited(node: number): boolean;
}

/** The protected state queries of `traverser`, as the Java tests reach them from the package. */
export function dfsState(traverser: DfsTraverser | DfsEdgeTraverser): DfsState {
  return traverser as unknown as DfsState;
}

/** The protected state of `traverser`, as the Java tests reach it from the package. */
export function frontierState(traverser: FrontierTraverser): FrontierState {
  return traverser as unknown as FrontierState;
}

/** Expects `order` to hold every node of `graph` once, each before all its out-nodes. */
export function expectTopologicalOrder(graph: Graph, order: ArrayLike<number>, description = ""): void {
  const n = graph.nodeCount;
  expect(order.length, `order covers all nodes ${description}`).toBe(n);
  const position = new Array<number>(n).fill(-1);
  for (let i = 0; i < order.length; i++) position[order[i]] = i;
  expect(position.includes(-1), `every node in the order ${description}`).toBe(false);
  // One expect for all edges: an expect per edge would dominate the fuzz tests.
  let violation: string | undefined;
  graph.forEachEdge((u, v) => {
    if (violation === undefined && !(position[u] < position[v])) violation = `edge ${u} -> ${v}`;
  });
  expect(violation, `edge order violated ${description}`).toBeUndefined();
}

/** The (source, target) pairs of an edge list, as strings `"s->t"` in a set. */
export function pairSet(edges: Edges): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < edges.count; i++) set.add(`${edges.sourceNodes[i]}->${edges.targetNodes[i]}`);
  return set;
}
