import { describe, expect, it } from "vitest";
import { Ancestry, BiAdjacentGraph } from "../src/index.js";
import { expectArgumentError, expectIndexError } from "./testutils/assertions.js";
import { TestGraphs } from "./testutils/testGraphs.js";

/**
 * Standard fixture, a tree of depth 3:
 * ```
 *        0
 *      /   \
 *     1     2
 *    / \     \
 *   3   4     5
 *      /
 *     6
 * ```
 */
const tree = (): Ancestry => Ancestry.of(TestGraphs.of(7, 0, 1, 0, 2, 1, 3, 1, 4, 2, 5, 4, 6));

describe("AncestryTest", () => {
  it("the lowest common ancestor of siblings is their parent", () => {
    expect(tree().lowestCommonAncestorOf(3, 4)).toBe(1);
  });

  it("the lowest common ancestor across branches is the root", () => {
    const a = tree();
    expect(a.lowestCommonAncestorOf(6, 5)).toBe(0);
    expect(a.lowestCommonAncestorOf(3, 2)).toBe(0);
  });

  it("the lowest common ancestor of ancestor and descendant is the ancestor", () => {
    const a = tree();
    expect(a.lowestCommonAncestorOf(1, 6)).toBe(1);
    expect(a.lowestCommonAncestorOf(6, 1)).toBe(1);
  });

  it("the lowest common ancestor of a node with itself is the node", () => {
    const a = tree();
    for (let node = 0; node < 7; node++) expect(a.lowestCommonAncestorOf(node, node)).toBe(node);
  });

  it("the lowest common ancestor is symmetric", () => {
    const a = tree();
    for (let x = 0; x < 7; x++) {
      for (let y = 0; y < 7; y++) expect(a.lowestCommonAncestorOf(x, y)).toBe(a.lowestCommonAncestorOf(y, x));
    }
  });

  it("the lowest common ancestor with the root is the root", () => {
    const a = tree();
    for (let node = 0; node < 7; node++) expect(a.lowestCommonAncestorOf(0, node)).toBe(0);
  });

  it("the lowest common ancestor across trees is -1", () => {
    const a = Ancestry.of(TestGraphs.of(5, 0, 1, 1, 2, 3, 4));
    expect(a.lowestCommonAncestorOf(2, 4)).toBe(-1);
    expect(a.lowestCommonAncestorOf(0, 3)).toBe(-1);
  });

  it("the lowest common ancestor on a path is the shallower node", () => {
    const a = Ancestry.of(TestGraphs.path(64));
    expect(a.lowestCommonAncestorOf(10, 40)).toBe(10);
    expect(a.lowestCommonAncestorOf(63, 0)).toBe(0);
  });

  it("the lowest common ancestor on a star is the center", () => {
    expect(Ancestry.of(TestGraphs.outStar(10)).lowestCommonAncestorOf(3, 7)).toBe(0);
  });

  it("isAncestorOf holds along the root path", () => {
    const a = tree();
    expect(a.isAncestorOf(0, 6)).toBe(true);
    expect(a.isAncestorOf(1, 6)).toBe(true);
    expect(a.isAncestorOf(4, 6)).toBe(true);
    expect(a.isAncestorOf(6, 6)).toBe(true);
    expect(a.isAncestorOf(6, 4)).toBe(false);
    expect(a.isAncestorOf(2, 6)).toBe(false);
    expect(a.isAncestorOf(3, 4)).toBe(false);
  });

  it("isAncestorOf is false across trees", () => {
    expect(Ancestry.of(TestGraphs.of(5, 0, 1, 1, 2, 3, 4)).isAncestorOf(0, 4)).toBe(false);
  });

  it("depthOf counts the edges from the root", () => {
    const a = tree();
    expect(a.depthOf(0)).toBe(0);
    expect(a.depthOf(1)).toBe(1);
    expect(a.depthOf(5)).toBe(2);
    expect(a.depthOf(6)).toBe(3);
  });

  it("depthOf is 0 for every tree root", () => {
    const a = Ancestry.of(TestGraphs.of(5, 0, 1, 1, 2, 3, 4));
    expect(a.depthOf(0)).toBe(0);
    expect(a.depthOf(3)).toBe(0);
  });

  it("parentOf is -1 for every tree root", () => {
    const a = Ancestry.of(TestGraphs.of(5, 0, 1, 1, 2, 3, 4));
    expect(a.parentOf(0)).toBe(-1);
    expect(a.parentOf(3)).toBe(-1);
    expect(a.parentOf(4)).toBe(3);
  });

  it("parentOf reports the tree parent", () => {
    const a = tree();
    expect(a.parentOf(6)).toBe(4);
    expect(a.parentOf(4)).toBe(1);
    expect(a.parentOf(1)).toBe(0);
  });

  it("of accepts the empty graph", () => {
    const a = Ancestry.of(TestGraphs.empty());
    expectIndexError(() => a.depthOf(0));
  });

  it("of accepts isolated nodes", () => {
    const a = Ancestry.of(TestGraphs.isolated(3));
    expect(a.lowestCommonAncestorOf(0, 0)).toBe(0);
    expect(a.lowestCommonAncestorOf(0, 1)).toBe(-1);
    expect(a.depthOf(2)).toBe(0);
    expect(a.parentOf(2)).toBe(-1);
  });

  it("of rejects a node with two parents", () => {
    const diamond = TestGraphs.of(4, 0, 1, 0, 2, 1, 3, 2, 3);
    expectArgumentError(() => Ancestry.of(diamond), /node 3/);
  });

  it("of rejects a cycle", () => {
    expectArgumentError(() => Ancestry.of(TestGraphs.cycle(4)), /cycle/);
  });

  it("of names a node on the cycle and not one below it", () => {
    // Node 0 hangs below the cycle 2 -> 3 -> 2, so it is unreachable from any root as well.
    const cycleWithATail = TestGraphs.of(4, 2, 0, 2, 3, 3, 2);
    expectArgumentError(() => Ancestry.of(cycleWithATail), /node [23] lies on a cycle/);
  });

  it("of rejects a self-loop", () => {
    expectArgumentError(() => Ancestry.of(TestGraphs.of(2, 0, 0, 0, 1)), /cycle/);
  });

  it("of accepts an in-tree forest via the transpose", () => {
    const a = Ancestry.of(BiAdjacentGraph.of(TestGraphs.inStar(3)).transposed());
    expect(a.lowestCommonAncestorOf(1, 2)).toBe(0);
  });

  it("handles a path of a million nodes without overflowing the stack", () => {
    const n = 1_000_000;
    const a = Ancestry.of(TestGraphs.path(n));
    expect(a.depthOf(n - 1)).toBe(n - 1);
    expect(a.lowestCommonAncestorOf(n - 1, n / 2)).toBe(n / 2);
  });

  it.each([-1, 7, 1000, 0.5])("rejects the out-of-range node %d in every query", (node) => {
    const a = tree();
    expectIndexError(() => a.lowestCommonAncestorOf(node, 0));
    expectIndexError(() => a.lowestCommonAncestorOf(0, node));
    expectIndexError(() => a.isAncestorOf(node, 0));
    expectIndexError(() => a.depthOf(node));
    expectIndexError(() => a.parentOf(node));
  });
});
