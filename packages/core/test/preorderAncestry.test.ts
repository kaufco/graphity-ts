import { describe, expect, it } from "vitest";
import { Ancestry, PreorderAncestry } from "../src/index.js";
import { expectIndexError, ints } from "./testutils/assertions.js";
import { TestGraphs } from "./testutils/testGraphs.js";

/** The fixture of AncestryTest; preorder 0, 1, 3, 4, 6, 2, 5. */
const tree = (): PreorderAncestry =>
  PreorderAncestry.of(Ancestry.of(TestGraphs.of(7, 0, 1, 0, 2, 1, 3, 1, 4, 2, 5, 4, 6)));

describe("PreorderAncestryTest", () => {
  it("the preorder visits children in ascending order", () => {
    expect(ints(tree().preorder)).toEqual([0, 1, 3, 4, 6, 2, 5]);
  });

  it("the preorder index is the position in the preorder", () => {
    const a = tree();
    for (let i = 0; i < 7; i++) expect(a.preorderIndexOf(a.preorder[i])).toBe(i);
  });

  it("the subtree size counts the node and all descendants", () => {
    const a = tree();
    expect(a.subtreeSizeOf(0)).toBe(7);
    expect(a.subtreeSizeOf(1)).toBe(4);
    expect(a.subtreeSizeOf(4)).toBe(2);
    expect(a.subtreeSizeOf(5)).toBe(1);
  });

  it("a subtree starts with the node and follows the preorder", () => {
    const a = tree();
    expect(ints(a.subtreeOf(1))).toEqual([1, 3, 4, 6]);
    expect(ints(a.subtreeOf(2))).toEqual([2, 5]);
    expect(ints(a.subtreeOf(6))).toEqual([6]);
  });

  it("a subtree is a view on the preorder", () => {
    const a = tree();
    const subtree = a.subtreeOf(1);
    expect(subtree.buffer).toBe(a.preorder.buffer);
    expect(subtree.byteOffset / 4).toBe(a.preorderIndexOf(1));
  });

  it("isAncestorOf is an interval test", () => {
    const a = tree();
    expect(a.isAncestorOf(0, 6)).toBe(true);
    expect(a.isAncestorOf(1, 6)).toBe(true);
    expect(a.isAncestorOf(4, 6)).toBe(true);
    expect(a.isAncestorOf(6, 6)).toBe(true);
    expect(a.isAncestorOf(2, 6)).toBe(false);
    expect(a.isAncestorOf(6, 4)).toBe(false);
    expect(a.isAncestorOf(3, 4)).toBe(false);
  });

  it("inherited queries still work", () => {
    const a = tree();
    expect(a.lowestCommonAncestorOf(3, 6)).toBe(1);
    expect(a.depthOf(6)).toBe(3);
    expect(a.parentOf(6)).toBe(4);
  });

  it("isAncestorOf through the base type uses the interval test", () => {
    const a: Ancestry = tree();
    expect(a).toBeInstanceOf(PreorderAncestry);
    expect(a.isAncestorOf(1, 6)).toBe(true);
    expect(a.isAncestorOf(2, 6)).toBe(false);
  });

  it("forest roots come in ascending order", () => {
    // Two trees, 3 -> {0, 4} and 1 -> 2; the roots are 1 and 3.
    const a = PreorderAncestry.of(Ancestry.of(TestGraphs.of(5, 3, 0, 3, 4, 1, 2)));
    expect(ints(a.preorder)).toEqual([1, 2, 3, 0, 4]);
    expect(a.isAncestorOf(1, 4)).toBe(false);
    expect(a.isAncestorOf(3, 4)).toBe(true);
  });

  it("isolated nodes are singleton trees", () => {
    const a = PreorderAncestry.of(Ancestry.of(TestGraphs.isolated(3)));
    expect(ints(a.preorder)).toEqual([0, 1, 2]);
    expect(a.subtreeSizeOf(1)).toBe(1);
    expect(a.isAncestorOf(0, 1)).toBe(false);
  });

  it("handles the empty forest", () => {
    expect(ints(PreorderAncestry.of(Ancestry.of(TestGraphs.empty())).preorder)).toEqual([]);
  });

  it("of a PreorderAncestry returns it unchanged", () => {
    const a = tree();
    expect(PreorderAncestry.of(a)).toBe(a);
  });

  it("rejects out-of-range nodes", () => {
    const a = tree();
    expectIndexError(() => a.isAncestorOf(7, 0));
    expectIndexError(() => a.isAncestorOf(0, -1));
    expectIndexError(() => a.subtreeSizeOf(7));
    expectIndexError(() => a.subtreeOf(-1));
    expectIndexError(() => a.preorderIndexOf(7));
  });
});
