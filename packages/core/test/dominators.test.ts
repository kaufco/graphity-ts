import { describe, expect, it } from "vitest";
import { Ancestry, BiAdjacentGraph, Dominators, Graphs, SortedIntView } from "../src/index.js";
import { DfsPreorder } from "../src/dfsPreorder.js";
import { expectArgumentError, expectIndexError } from "./testutils/assertions.js";
import { ControlFlowGraphs } from "./testutils/controlFlowGraphs.js";
import { TestGraphs } from "./testutils/testGraphs.js";

function immediateDominators(d: Dominators, n: number): number[] {
  return Array.from({ length: n }, (_, node) => d.immediateDominatorOf(node));
}

const bi = (n: number, ...edges: number[]): BiAdjacentGraph => BiAdjacentGraph.of(TestGraphs.of(n, ...edges));

describe("DominatorsTest", () => {
  it("a diamond joins at the entry", () => {
    const d = Dominators.of(bi(4, 0, 1, 0, 2, 1, 3, 2, 3), 0);
    expect(immediateDominators(d, 4)).toEqual([-1, 0, 0, 0]);
  });

  it("a loop header dominates its body", () => {
    const d = Dominators.of(bi(4, 0, 1, 1, 2, 2, 1, 2, 3), 0);
    expect(immediateDominators(d, 4)).toEqual([-1, 0, 1, 2]);
  });

  it("an irreducible cycle is dominated only by the entry", () => {
    const d = Dominators.of(bi(3, 0, 1, 0, 2, 1, 2, 2, 1), 0);
    expect(immediateDominators(d, 3)).toEqual([-1, 0, 0]);
  });

  it("solves the textbook example", () => {
    // Lengauer and Tarjan's example, nodes R=0, A..L = 1..12.
    const [r, a, b, c, dd, e, f, g, h, i, j, k, l] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const graph = bi(
      13,
      ...[r, a, r, b, r, c, a, dd, b, a, b, dd, b, e, c, f, c, g, dd, l, e, h, f, i, g, i, g, j],
      ...[h, e, h, k, i, k, j, i, k, r, k, i, l, h],
    );
    const d = Dominators.of(graph, r);
    expect(immediateDominators(d, 13)).toEqual([-1, r, r, r, r, r, c, c, r, r, g, r, dd]);
  });

  it("several entries share a virtual root", () => {
    const d = Dominators.of(bi(4, 0, 1, 3, 1, 1, 2), [0, 3]);
    expect(immediateDominators(d, 4)).toEqual([-1, -1, 1, -1]);
  });

  it("an entry reachable from another entry is still a root", () => {
    const d = Dominators.of(bi(3, 0, 1, 1, 2), [0, 1]);
    expect(immediateDominators(d, 3)).toEqual([-1, -1, 1]);
  });

  it("takes the entries as a typed array or a SortedIntView", () => {
    const graph = bi(4, 0, 1, 3, 1, 1, 2);
    expect(immediateDominators(Dominators.of(graph, Int32Array.of(0, 3)), 4)).toEqual([-1, -1, 1, -1]);
    const view = SortedIntView.viewOf(Int32Array.of(0, 3), 0, 2);
    expect(immediateDominators(Dominators.of(graph, view), 4)).toEqual([-1, -1, 1, -1]);
  });

  it("unreachable nodes have no dominator", () => {
    const d = Dominators.of(bi(4, 0, 1, 2, 3), 0);
    expect(d.isReachable(0)).toBe(true);
    expect(d.isReachable(1)).toBe(true);
    expect(d.isReachable(2)).toBe(false);
    expect(d.isReachable(3)).toBe(false);
    expect(d.immediateDominatorOf(3)).toBe(-1);
  });

  it("edges from unreachable nodes are ignored", () => {
    const d = Dominators.of(bi(4, 0, 1, 1, 3, 2, 1, 2, 3), 0);
    expect(immediateDominators(d, 4)).toEqual([-1, 0, -1, 1]);
  });

  it("self-loops change nothing", () => {
    const d = Dominators.of(bi(2, 0, 0, 0, 1, 1, 1), 0);
    expect(immediateDominators(d, 2)).toEqual([-1, 0]);
  });

  it("an empty entry list leaves everything unreachable", () => {
    const d = Dominators.of(bi(2, 0, 1), []);
    expect(d.isReachable(0)).toBe(false);
    expect(d.isReachable(1)).toBe(false);
    expect(immediateDominators(d, 2)).toEqual([-1, -1]);
  });

  it("duplicate entries are ignored", () => {
    const d = Dominators.of(bi(3, 0, 1, 1, 2), [0, 0, 0]);
    expect(immediateDominators(d, 3)).toEqual([-1, 0, 1]);
  });

  it("handles the empty graph", () => {
    const d = Dominators.of(BiAdjacentGraph.of(TestGraphs.empty()), []);
    expect(Graphs.dominatorTree(d).nodeCount).toBe(0);
  });

  it("rejects out-of-range arguments", () => {
    const graph = bi(2, 0, 1);
    expectIndexError(() => Dominators.of(graph, 2));
    expectIndexError(() => Dominators.of(graph, [0, -1]));
    expectIndexError(() => Dominators.of(graph, 0.5));
    expectIndexError(() => Dominators.of(graph, undefined as never), "Index undefined");
    const d = Dominators.of(graph, 0);
    expectIndexError(() => d.immediateDominatorOf(2));
    expectIndexError(() => d.isReachable(-1));
  });

  it("rejects a node count beyond the limit of the preorder", () => {
    // A graph at the limit takes gigabytes; the check itself is the one DfsPreorder makes first.
    expect(DfsPreorder.MAX_NODE_COUNT).toBe(2 ** 30 - 6);
    const huge = { nodeCount: DfsPreorder.MAX_NODE_COUNT + 1 } as unknown as BiAdjacentGraph;
    expectArgumentError(() => Dominators.of(huge, []), /Dominators keeps two ints per node/);
  });

  it("the dominator tree has an edge from each immediate dominator", () => {
    const d = Dominators.of(bi(4, 0, 1, 1, 2, 2, 1, 2, 3), 0);
    const tree = Graphs.dominatorTree(d);
    expect(tree.edgeCount).toBe(3);
    expect(tree.hasOutNode(0, 1)).toBe(true);
    expect(tree.hasOutNode(1, 2)).toBe(true);
    expect(tree.hasOutNode(2, 3)).toBe(true);
    expect(Graphs.isTree(tree)).toBe(true);
  });

  it("computes post-dominators on the transpose", () => {
    const cfg = bi(3, 0, 1, 0, 2, 1, 2);
    const postDominators = Dominators.of(cfg.transposed(), 2);
    expect(postDominators.immediateDominatorOf(0)).toBe(2);
    expect(postDominators.immediateDominatorOf(1)).toBe(2);
    expect(postDominators.immediateDominatorOf(2)).toBe(-1);
  });

  it("graph is the analyzed graph", () => {
    const cfg = bi(3, 0, 1, 1, 2);
    expect(Dominators.of(cfg, 0).graph).toBe(cfg);
    const transposed = cfg.transposed();
    expect(Dominators.of(transposed, 2).graph).toBe(transposed);
  });

  it("an Ancestry of the dominators answers dominance", () => {
    const d = Dominators.of(bi(5, 0, 1, 1, 2, 2, 1, 2, 3, 0, 4, 4, 3), 0);
    const index = Ancestry.of(d);
    expect(index.isAncestorOf(1, 2)).toBe(true);
    expect(index.isAncestorOf(0, 3)).toBe(true);
    expect(index.isAncestorOf(1, 3)).toBe(false);
    expect(index.lowestCommonAncestorOf(2, 4)).toBe(0);
    expect(index.depthOf(2)).toBe(2);
  });

  it("finds the nearest common dominator in a DAG", () => {
    const dag = bi(6, 0, 1, 1, 2, 1, 3, 5, 3);
    const index = Ancestry.of(Dominators.of(dag, [0, 5]));
    expect(index.lowestCommonAncestorOf(2, 3)).toBe(-1);
    const single = Ancestry.of(Dominators.of(dag, 0));
    expect(single.lowestCommonAncestorOf(2, 3)).toBe(1);
  });

  it("a fan behind a chain is dominated by the entry", () => {
    const graph = BiAdjacentGraph.of(ControlFlowGraphs.fanBehindChain(1000, 1000));
    const d = Dominators.of(graph, 0);
    for (let fan = 1001; fan <= 2000; fan++) expect(d.immediateDominatorOf(fan)).toBe(0);
    expect(d.immediateDominatorOf(1000)).toBe(999);
  });

  it("a long chain does not overflow the stack", () => {
    const n = 200_000;
    const d = Dominators.of(BiAdjacentGraph.of(ControlFlowGraphs.chain(n)), 0);
    expect(d.immediateDominatorOf(n - 1)).toBe(n - 2);
    expect(Ancestry.of(d).depthOf(n - 1)).toBe(n - 1);
  });

  it("withinBlocks ignores the edges between the blocks", () => {
    // Components {0, 1, 2} (0 -> 1 -> 2 -> 0) and {3, 4} (3 <-> 4), joined by 2 -> 3; the entries
    // are one node per component, sink component first.
    const graph = bi(5, 0, 1, 1, 2, 2, 0, 3, 4, 4, 3, 2, 3);
    expect(Array.from(Dominators.withinBlocks(graph, [3, 0]))).toEqual([-1, 0, 1, -1, 3]);
  });
});
