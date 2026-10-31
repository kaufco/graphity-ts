import { DfsPreorder } from "./dfsPreorder.js";
import type { BiAdjacentGraph } from "./graph.js";
import { checkIndex } from "./internal.js";
import type { IntList } from "./sortedIntView.js";

/** Unlinked marker in the ancestor lane of the path-compression forest. */
const UNLINKED = -1;

/**
 * The dominators of a graph with one or more entries, such as the control flow of a method, given
 * by the immediate dominator of every node.
 *
 * A node `d` dominates a node `n` if every path from an entry to `n` passes through `d`; every node
 * dominates itself. The immediate dominator of `n` is the dominator closest to `n` other than `n`
 * itself. The immediate dominators form the dominator tree, which {@link Graphs.dominatorTree}
 * returns as a graph. Several entries act like one virtual root above all of them. A node that only
 * this virtual root dominates, such as an entry, has no immediate dominator and is a root of the
 * dominator tree, which is then a forest. A node that no entry reaches has no immediate dominator
 * either; {@link Dominators.isReachable} tells the two apart.
 *
 * Whether one node dominates another is an ancestor query on the dominator tree.
 * {@link Ancestry.of} answers it in O(log nodeCount) and {@link PreorderAncestry} in O(1). The
 * analysis follows the edges against their direction, so it takes a {@link BiAdjacentGraph}. Here,
 * the dominators of the basic blocks of the method `load` from its `entry`, and whether `body` and
 * `then` dominate `next`:
 *
 * <!-- example: dominance.ts#dominators -->
 * ```ts
 * const dominators = Dominators.of(BiAdjacentGraph.of(cfg), entry);
 * // 2 - the block body
 * const idom = dominators.immediateDominatorOf(next);
 * const dominance = Ancestry.of(dominators);
 * const bodyDominatesNext = dominance.isAncestorOf(body, next);       // true
 * const thenDominatesNext = dominance.isAncestorOf(then, next);       // false
 * ```
 *
 * The post-dominators are the dominators of the transposed graph, with the exits as entries. A node
 * `p` post-dominates `n` if every path from `n` to an exit passes through `p`. Here, `next` is the
 * first block that every path from `body` to the `exit` of `load` passes through:
 *
 * <!-- example: dominance.ts#postDominators -->
 * ```ts
 * const postDominators = Dominators.of(BiAdjacentGraph.of(cfg).transposed(), exit);
 * const join = postDominators.immediateDominatorOf(body);   // 4 - the block next
 * ```
 *
 * A node from which no exit can be reached, such as one in an endless loop, has no post-dominator,
 * unless an extra exit with an edge from that loop is added to the graph first.
 *
 * Uses the algorithm of Lengauer and Tarjan, without recursion. Dominance frontiers and control
 * dependence are in the package `@kobayami/graphity-controlflow`.
 *
 * Instances are immutable.
 *
 * **Memory:** 4 x nodeCount bytes and 1 bit per node, plus the graph, which stays reachable as long
 * as the dominators are.
 */
export class Dominators {
  readonly #graph: BiAdjacentGraph;

  /** @internal The immediate dominator of each node, `-1` for a root of the forest and a node not reached. */
  readonly immediateDominator: Int32Array;

  /** One bit per node, set for the nodes that an entry reaches. */
  readonly #reachable: Int32Array;

  private constructor(graph: BiAdjacentGraph, immediateDominator: Int32Array, reachable: Int32Array) {
    this.#graph = graph;
    this.immediateDominator = immediateDominator;
    this.#reachable = reachable;
  }

  /**
   * Returns the dominators of `graph` with the single entry `entry`. Equivalent to
   * `of(graph, [entry])`.
   *
   * **Time:** O((nodeCount + edgeCount) log nodeCount).
   * **Memory:** 4 x nodeCount bytes and 1 bit per node for the result; while it runs, up to
   * 32 x nodeCount bytes more.
   *
   * @param graph the graph
   * @param entry node ID in `0..nodeCount-1`
   * @returns the dominators
   * @throws RangeError if `entry` is out of range
   * @throws Error if `graph` has more than 2^30 - 6 nodes
   */
  static of(graph: BiAdjacentGraph, entry: number): Dominators;
  /**
   * Returns the dominators of `graph` with the given entries.
   *
   * Several entries act like one virtual root above all of them, as the class documentation
   * describes. Their order does not matter. An entry given twice counts once, and with no entries,
   * no node is reachable.
   *
   * **Time:** O(number of entries + (nodeCount + edgeCount) log nodeCount).
   * **Memory:** 4 x nodeCount bytes and 1 bit per node for the result; while it runs, up to
   * 32 x nodeCount bytes more.
   *
   * @param graph the graph
   * @param entries node IDs, each in `0..nodeCount-1`
   * @returns the dominators
   * @throws RangeError if an entry is out of range
   * @throws Error if `graph` has more than 2^30 - 6 nodes
   */
  static of(graph: BiAdjacentGraph, entries: IntList): Dominators;
  static of(graph: BiAdjacentGraph, entries: number | IntList): Dominators {
    const n = graph.nodeCount;
    // A list is an object; anything else is a node ID, so that undefined fails the range check.
    const dfs = DfsPreorder.of(graph, typeof entries === "object" ? entries : [entries], "Dominators");
    const idom = lengauerTarjan(dfs, graph.inStart, graph.inAdj, false);

    // Back to node IDs; the virtual root becomes -1.
    const order = dfs.order;
    const immediateDominator = new Int32Array(n).fill(-1);
    const reachable = new Int32Array((n >> 5) + 1);
    for (let v = 1; v <= dfs.reachedCount; v++) {
      const node = order[v];
      reachable[node >> 5] |= 1 << (node & 31);
      if (idom[v] !== 0) immediateDominator[node] = order[idom[v]];
    }
    return new Dominators(graph, immediateDominator, reachable);
  }

  /**
   * @internal Immediate dominators of each block's induced subgraph, as node IDs, -1 for the entry
   * of a block. A block is the set of nodes the search numbers from one entry. No entry may be
   * reached by the search from an earlier one, and every node must be reached. One node of every
   * strongly connected component, sink components first, satisfies this: each search stays inside
   * its component, so the blocks are the components and the edges between them are ignored.
   *
   * @throws Error if `graph.nodeCount > 2^30 - 6`
   */
  static withinBlocks(graph: BiAdjacentGraph, entries: IntList): Int32Array {
    const dfs = DfsPreorder.of(graph, entries, "Dominators");
    const idom = lengauerTarjan(dfs, graph.inStart, graph.inAdj, true);
    const order = dfs.order;
    const immediateDominator = new Int32Array(graph.nodeCount).fill(-1);
    for (let v = 1; v <= dfs.reachedCount; v++) {
      if (idom[v] !== 0) immediateDominator[order[v]] = order[idom[v]];
    }
    return immediateDominator;
  }

  /**
   * The graph these dominators were computed on, for analyses that need both, such as dominance
   * frontiers (Java: `graph()`).
   *
   * **Time:** O(1).
   */
  get graph(): BiAdjacentGraph {
    return this.#graph;
  }

  /**
   * Returns the immediate dominator of `node`, or `-1` if it has none.
   *
   * A node has none if it is an entry, if only the virtual root above several entries dominates it,
   * or if no entry reaches it.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns immediate dominator, or `-1`
   * @throws RangeError if `node` is out of range
   */
  immediateDominatorOf(node: number): number {
    checkIndex(node, this.immediateDominator.length);
    return this.immediateDominator[node];
  }

  /**
   * Returns whether `node` is reachable from an entry.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns `true` if a path leads from an entry to `node`
   * @throws RangeError if `node` is out of range
   */
  isReachable(node: number): boolean {
    checkIndex(node, this.immediateDominator.length);
    return (this.#reachable[node >> 5] & (1 << (node & 31))) !== 0;
  }
}

/**
 * Immediate dominators by preorder number, 0 for the virtual root. `inStart` and `inAdj` are the
 * in-adjacency over node IDs, translated per edge into preorder numbers (0 = unreachable).
 *
 * Step 1 settles a node once the search path from its semidominator down to it is linked: the
 * node then gets its immediate dominator, or a node with the same one, which step 2 resolves.
 *
 * With `withinBlocks`, predecessors outside the block of the node are ignored. A block is a
 * contiguous range of preorder numbers that starts at its entry, and every predecessor in another
 * block comes from a later one.
 */
function lengauerTarjan(dfs: DfsPreorder, inStart: Int32Array, inAdj: Int32Array, withinBlocks: boolean): Int32Array {
  const size = dfs.reachedCount + 1;
  const parent = dfs.parent;
  const order = dfs.order;
  const number = dfs.preorderNumber;
  const semi = new Int32Array(size);
  // Two lanes per preorder number, ancestor and label of the path-compression forest.
  const lanes = new Int32Array(2 * size);
  // While a node waits in a bucket, its slot links it to the next node of the same bucket.
  const idom = new Int32Array(size);
  const bucket = new Int32Array(size).fill(-1);
  for (let v = 0; v < size; v++) {
    semi[v] = v;
    lanes[2 * v] = UNLINKED;
    lanes[2 * v + 1] = v;
  }

  // 1) Reverse preorder: semidominator, link to the search parent, settle the parent's bucket.
  let blockEnd = size - 1;
  for (let v = size - 1; v >= 1; v--) {
    let best = v;
    const node = order[v];
    if (withinBlocks) {
      for (let i = inStart[node], end = inStart[node + 1]; i < end; i++) {
        const u = number[inAdj[i]];
        if (u > blockEnd) continue;
        const candidate = u < v ? u : semi[evaluate(lanes, semi, u)];
        if (candidate < best) best = candidate;
      }
      if (dfs.isEntry(v)) blockEnd = v - 1;
    } else {
      for (let i = inStart[node], end = inStart[node + 1]; i < end; i++) {
        const u = number[inAdj[i]];
        if (u === 0) continue;
        const candidate = u < v ? u : semi[evaluate(lanes, semi, u)];
        if (candidate < best) best = candidate;
      }
    }
    const s = dfs.isEntry(v) ? 0 : best;
    semi[v] = s;
    idom[v] = bucket[s];
    bucket[s] = v;
    const p = parent[v];
    lanes[2 * v] = p;
    for (let w = bucket[p]; w >= 0;) {
      const next = idom[w];
      const u = evaluate(lanes, semi, w);
      idom[w] = semi[u] < semi[w] ? u : p;
      w = next;
    }
    bucket[p] = -1;
  }

  // 2) Preorder: a node settled with a deferred dominator takes that node's, already final.
  for (let v = 1; v < size; v++) {
    if (idom[v] !== semi[v]) idom[v] = idom[idom[v]];
  }
  return idom;
}

/**
 * The node of least semidominator on the forest path from `v` up to, but excluding, its tree
 * root, compressing the path on the way (Java: `eval`).
 */
function evaluate(lanes: Int32Array, semi: Int32Array, v: number): number {
  const ancestor = lanes[2 * v];
  if (ancestor === UNLINKED) return v;
  if (lanes[2 * ancestor] !== UNLINKED) compress(lanes, semi, v);
  return lanes[2 * v + 1];
}

/**
 * Path compression without recursion and without a stack: the way up reverses the ancestor
 * pointers, the way down restores them pointing at the tree root and carries the best label along.
 */
function compress(lanes: Int32Array, semi: Int32Array, v: number): void {
  let below = UNLINKED;
  let x = v;
  while (lanes[2 * lanes[2 * x]] !== UNLINKED) {
    const up = lanes[2 * x];
    lanes[2 * x] = below;
    below = x;
    x = up;
  }
  while (below !== UNLINKED) {
    const y = below;
    below = lanes[2 * y];
    const xLabel = lanes[2 * x + 1];
    if (semi[xLabel] < semi[lanes[2 * y + 1]]) lanes[2 * y + 1] = xLabel;
    lanes[2 * y] = lanes[2 * x];
    x = y;
  }
}
