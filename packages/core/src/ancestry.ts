import { Dominators } from "./dominators.js";
import type { Graph } from "./graph.js";
import { checkIndex } from "./internal.js";
import { ParentForest } from "./parentForest.js";

/**
 * An index of a forest for ancestor queries: the parent and depth of a node, whether one node is
 * an ancestor of another, and the lowest common ancestor of two nodes.
 *
 * {@link Ancestry.of} builds the index of a forest whose edges point from parent to child, such as
 * a syntax tree. For a forest whose edges point from child to parent, pass the transposed graph:
 * `Ancestry.of(BiAdjacentGraph.of(forest).transposed())`. {@link Ancestry.of} with
 * {@link Dominators} builds the index of a dominator tree, in which the ancestors of a node are its
 * dominators. The index is built once and answers each query in O(log nodeCount) at most, however
 * deep the forest; {@link PreorderAncestry.of} adds an ancestor test in O(1) and the nodes of each
 * subtree.
 *
 * A node is its own ancestor, so `isAncestorOf(a, a)` is `true` and `lowestCommonAncestorOf(a, a)`
 * is `a`. Two nodes in different trees of the forest have no common ancestor. Uses heavy-light
 * decomposition.
 *
 * Instances are immutable.
 *
 * **Memory:** 12 x nodeCount bytes, of which an index built from {@link Dominators} shares
 * 4 x nodeCount bytes with the dominators.
 */
export class Ancestry {
  /** @internal The parent of each node, `-1` for the root of a tree. */
  readonly parent: Int32Array;

  /** @internal The depth of each node, `0` for the root of a tree. */
  readonly depth: Int32Array;

  /**
   * @internal Topmost node of the heavy chain containing each node. Jumping from a node to
   * `parent[chainHead[node]]` skips a whole chain, and every root-to-node path crosses
   * O(log nodeCount) chains.
   */
  readonly chainHead: Int32Array;

  // Type-only, no field at run time: a private member makes the type nominal, so that an object of
  // the same shape is not taken for an instance, as in Java.
  declare private readonly brand: never;

  // Protected rather than private because PreorderAncestry extends Ancestry; hidden in the API
  // documentation, as Javadoc leaves out Java's package-private constructor.
  /** @hidden */
  protected constructor(parent: Int32Array, depth: Int32Array, chainHead: Int32Array) {
    this.parent = parent;
    this.depth = depth;
    this.chainHead = chainHead;
  }

  /** @internal Takes the arrays as they are. */
  static create(parent: Int32Array, depth: Int32Array, chainHead: Int32Array): Ancestry {
    return new Ancestry(parent, depth, chainHead);
  }

  /**
   * Returns the ancestor index of `forest`, whose edges point from parent to child.
   *
   * In such a forest, no node has more than one in-node, and there is no cycle, not even a
   * self-loop; {@link Graphs.isForest} tests this without an error. The roots of the trees are the
   * root nodes of the graph.
   *
   * **Time:** O(nodeCount + edgeCount).
   * **Memory:** 12 x nodeCount bytes for the result; while it runs, 12 x nodeCount bytes more.
   *
   * @param forest a forest whose edges point from parent to child
   * @returns the ancestor index
   * @throws Error if a node of `forest` has more than one in-node, or `forest` has a cycle
   */
  static of(forest: Graph): Ancestry;
  /**
   * Returns the ancestor index of the dominator tree of `dominators`, in which the ancestors of a
   * node are its dominators.
   *
   * `isAncestorOf(a, b)` returns whether `a` dominates `b`. `lowestCommonAncestorOf(a, b)` returns
   * the closest node that dominates both, or `-1` if no node does. With several entries, only a
   * virtual root lies above them. A node that no entry reaches is a tree of its own and dominates
   * only itself here; {@link Dominators.isReachable} returns `false` for such a node.
   *
   * The result is the same as that of `Ancestry.of(Graphs.dominatorTree(dominators))`, but shares
   * the immediate dominators instead of building the tree as a graph.
   *
   * **Time:** O(nodeCount).
   * **Memory:** 8 x nodeCount bytes for the result, which shares the immediate dominators; while it
   * runs, 20 x nodeCount bytes more.
   *
   * @param dominators the dominators whose tree to index
   * @returns the ancestor index of the dominator tree
   */
  static of(dominators: Dominators): Ancestry;
  static of(forest: Graph | Dominators): Ancestry {
    return forest instanceof Dominators ? ofDominators(forest) : ofForest(forest);
  }

  /**
   * Returns the lowest common ancestor of `a` and `b`, or `-1` if they are in different trees.
   *
   * The lowest common ancestor is the deepest node that is an ancestor of both. As a node is its
   * own ancestor, the result is `a` if `a` is an ancestor of `b`.
   *
   * **Time:** O(log nodeCount).
   *
   * @param a node ID in `0..nodeCount-1`
   * @param b node ID in `0..nodeCount-1`
   * @returns lowest common ancestor, or `-1`
   * @throws RangeError if `a` or `b` is out of range
   */
  lowestCommonAncestorOf(a: number, b: number): number {
    const parent = this.parent;
    checkIndex(a, parent.length);
    checkIndex(b, parent.length);
    const chainHead = this.chainHead;
    const depth = this.depth;
    // Lift whichever node sits on the deeper chain to its chain head's parent, until both are on
    // one chain. Once they are, the shallower of the two is the ancestor of the other.
    while (chainHead[a] !== chainHead[b]) {
      if (depth[chainHead[a]] < depth[chainHead[b]]) {
        b = parent[chainHead[b]];
        if (b < 0) return -1;
      } else {
        a = parent[chainHead[a]];
        if (a < 0) return -1;
      }
    }
    return depth[a] < depth[b] ? a : b;
  }

  /**
   * Returns whether `node` is an ancestor of `descendant`: whether it lies on the path from the
   * root of its tree to `descendant`. Equivalent to
   * `lowestCommonAncestorOf(node, descendant) === node`.
   *
   * A node is its own ancestor. {@link PreorderAncestry} answers in O(1).
   *
   * **Time:** O(log nodeCount).
   *
   * @param node node ID in `0..nodeCount-1`
   * @param descendant node ID in `0..nodeCount-1`
   * @returns `true` if `node` is an ancestor of `descendant`
   * @throws RangeError if `node` or `descendant` is out of range
   */
  isAncestorOf(node: number, descendant: number): boolean {
    return this.lowestCommonAncestorOf(node, descendant) === node;
  }

  /**
   * Returns the depth of `node`: the number of edges from the root of its tree to it. A root has
   * depth `0`.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns depth
   * @throws RangeError if `node` is out of range
   */
  depthOf(node: number): number {
    checkIndex(node, this.parent.length);
    return this.depth[node];
  }

  /**
   * Returns the parent of `node`, or `-1` if it is the root of its tree.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns parent, or `-1`
   * @throws RangeError if `node` is out of range
   */
  parentOf(node: number): number {
    checkIndex(node, this.parent.length);
    return this.parent[node];
  }
}

/**
 * An {@link Ancestry} that also holds the preorder of its forest, for an ancestor test in O(1) and
 * the nodes of every subtree.
 *
 * {@link PreorderAncestry.of} builds it from an index and shares the arrays of that index. In
 * preorder, every subtree is a contiguous range: the subtree of `node` takes the positions
 * `preorderIndexOf(node)..preorderIndexOf(node) + subtreeSizeOf(node) - 1` of
 * {@link PreorderAncestry.preorder}. So {@link PreorderAncestry.isAncestorOf} is a range test, and
 * {@link PreorderAncestry.subtreeOf} returns a view of that range. Here, the basic blocks of the
 * method `load` that `body` dominates, from the `dominators` of `load`:
 *
 * <!-- example: dominance.ts#subtreeOf -->
 * ```ts
 * const dominance = PreorderAncestry.of(Ancestry.of(dominators));
 * // [2, 3, 4] - body, then and next
 * const dominatedByBody = dominance.subtreeOf(body);
 * ```
 *
 * The preorder visits the roots in ascending order, and the children of each node in ascending
 * order. If the node IDs were assigned in this order, as is usual for a syntax tree numbered in
 * source order, the preorder is `0..nodeCount-1`, and the subtree of `node` is
 * `node..node + subtreeSizeOf(node) - 1`.
 *
 * Instances are immutable.
 *
 * **Memory:** 12 x nodeCount bytes on top of the {@link Ancestry} it extends.
 */
export class PreorderAncestry extends Ancestry {
  /** The position of each node in the preorder. */
  readonly #preorderIndex: Int32Array;

  /** The number of nodes in the subtree of each node, the node itself included. */
  readonly #subtreeSize: Int32Array;

  /** The node at each position of the preorder. */
  readonly #order: Int32Array;

  private constructor(ancestry: Ancestry, preorderIndex: Int32Array, subtreeSize: Int32Array, order: Int32Array) {
    super(ancestry.parent, ancestry.depth, ancestry.chainHead);
    this.#preorderIndex = preorderIndex;
    this.#subtreeSize = subtreeSize;
    this.#order = order;
  }

  /**
   * Returns a `PreorderAncestry` for the forest of `ancestry`.
   *
   * The result shares the arrays of `ancestry` instead of copying them. The preorder is computed
   * anew on every call, not cached: keep the result to use it more than once. If `ancestry` already
   * is a `PreorderAncestry`, returns it.
   *
   * **Time:** O(nodeCount), or O(1) if already a `PreorderAncestry`.
   * **Memory:** +12 x nodeCount bytes for the result; while it runs, 8 x nodeCount bytes more; none
   * if already a `PreorderAncestry`.
   *
   * @param ancestry the index to add the preorder to
   * @returns the index with the preorder
   */
  static override of(ancestry: Ancestry): PreorderAncestry;
  /**
   * Returns the plain index of a forest or of a dominator tree, without the preorder. This is
   * {@link Ancestry.of}, inherited as Java's static methods are.
   */
  static override of(forest: Graph | Dominators): Ancestry;
  static override of(source: Ancestry | Graph | Dominators): Ancestry {
    if (!(source instanceof Ancestry)) return source instanceof Dominators ? ofDominators(source) : ofForest(source);
    if (source instanceof PreorderAncestry) return source;
    const parent = source.parent;
    const n = parent.length;
    const preorderIndex = new Int32Array(n);
    const order = new Int32Array(n);
    const subtreeSize = new Int32Array(n);
    ParentForest.preorder(parent, preorderIndex, order, subtreeSize);
    return new PreorderAncestry(source, preorderIndex, subtreeSize, order);
  }

  /**
   * Returns whether `node` is an ancestor of `descendant`: whether it lies on the path from the
   * root of its tree to `descendant`. A node is its own ancestor.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @param descendant node ID in `0..nodeCount-1`
   * @returns `true` if `node` is an ancestor of `descendant`
   * @throws RangeError if `node` or `descendant` is out of range
   */
  override isAncestorOf(node: number, descendant: number): boolean {
    const preorderIndex = this.#preorderIndex;
    checkIndex(node, preorderIndex.length);
    checkIndex(descendant, preorderIndex.length);
    const offset = preorderIndex[descendant] - preorderIndex[node];
    return offset >= 0 && offset < this.#subtreeSize[node];
  }

  /**
   * Returns the number of nodes in the subtree of `node`, `node` included.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns subtree size, at least `1`
   * @throws RangeError if `node` is out of range
   */
  subtreeSizeOf(node: number): number {
    checkIndex(node, this.#subtreeSize.length);
    return this.#subtreeSize[node];
  }

  /**
   * Returns the nodes of the subtree of `node`, in preorder, starting with `node`.
   *
   * The result is a view of this index's own array, not a copy, and must not be modified (Java: an
   * unmodifiable view).
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns nodes of the subtree
   * @throws RangeError if `node` is out of range
   */
  subtreeOf(node: number): Int32Array {
    checkIndex(node, this.#preorderIndex.length);
    const from = this.#preorderIndex[node];
    return this.#order.subarray(from, from + this.#subtreeSize[node]);
  }

  /**
   * All nodes in preorder: the roots in ascending order, and the children of each node in ascending
   * order; each node once (Java: `preorder()`).
   *
   * It is this index's own array, not a copy, and must not be modified (Java: an unmodifiable
   * view).
   *
   * **Time:** O(1).
   */
  get preorder(): Int32Array {
    return this.#order;
  }

  /**
   * Returns the position of `node` in {@link PreorderAncestry.preorder}.
   *
   * Data in an array indexed by preorder position has every subtree in a contiguous range. Prefix
   * sums over such an array, for example, give the sum over any subtree in O(1).
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns position in `0..nodeCount-1`
   * @throws RangeError if `node` is out of range
   */
  preorderIndexOf(node: number): number {
    checkIndex(node, this.#preorderIndex.length);
    return this.#preorderIndex[node];
  }
}

/** Builds the ancestor index of a forest, rejecting anything else with a witness in the message. */
function ofForest(forest: Graph): Ancestry {
  // The forest check is that of Graphs' forest info, here with witnesses for the messages; a
  // change to what counts as a forest belongs in both.
  const n = forest.nodeCount;
  const adjacency = forest.outAdj;
  const adjacencyStart = forest.outStart;

  // Parent per node. A second parent means in-degree > 1, which no forest has.
  const parent = new Int32Array(n).fill(-1);
  for (let node = 0; node < n; node++) {
    for (let i = adjacencyStart[node], end = adjacencyStart[node + 1]; i < end; i++) {
      const child = adjacency[i];
      if (parent[child] >= 0) {
        throw new Error(`not a forest: node ${child} has more than one parent (${parent[child]} and ${node})`);
      }
      parent[child] = node;
    }
  }

  // BFS from all roots. With in-degree <= 1 every node is enqueued at most once, so the queue
  // doubles as a topological order: parents before children. A node it misses lies on a cycle, a
  // self-loop included, or below one.
  const depth = new Int32Array(n).fill(-1);
  const order = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let node = 0; node < n; node++) {
    if (parent[node] < 0) {
      depth[node] = 0;
      order[tail++] = node;
    }
  }
  while (head < tail) {
    const node = order[head++];
    for (let i = adjacencyStart[node], end = adjacencyStart[node + 1]; i < end; i++) {
      const child = adjacency[i];
      depth[child] = depth[node] + 1;
      order[tail++] = child;
    }
  }
  if (tail !== n) throw new Error(`not a forest: node ${nodeOnCycle(parent, depth)} lies on a cycle`);
  return withHeavyChains(parent, depth, order);
}

/** Builds the ancestor index of a dominator tree, sharing the immediate dominators. */
function ofDominators(dominators: Dominators): Ancestry {
  const parent = dominators.immediateDominator;
  const n = parent.length;
  // Children per node, then a BFS from all roots for a parents-first order and the depths. The
  // dominator tree is acyclic by construction, so no check is needed.
  const { start: childStart, members: children } = ParentForest.childrenOf(parent);
  const depth = new Int32Array(n);
  const order = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let node = 0; node < n; node++) if (parent[node] < 0) order[tail++] = node;
  while (head < tail) {
    const node = order[head++];
    for (let i = childStart[node], end = childStart[node + 1]; i < end; i++) {
      const child = children[i];
      depth[child] = depth[node] + 1;
      order[tail++] = child;
    }
  }
  return withHeavyChains(parent, depth, order);
}

/** Completes the index from the parents, the depths and a parents-first order. */
function withHeavyChains(parent: Int32Array, depth: Int32Array, order: Int32Array): Ancestry {
  const n = parent.length;
  // Subtree sizes, then the heaviest child per node, in one backward pass.
  const subtreeSize = new Int32Array(n).fill(1);
  const heavyChild = new Int32Array(n).fill(-1);
  for (let i = n - 1; i >= 0; i--) {
    const node = order[i];
    const nodeParent = parent[node];
    if (nodeParent < 0) continue;
    subtreeSize[nodeParent] += subtreeSize[node];
    const rival = heavyChild[nodeParent];
    if (rival < 0 || subtreeSize[node] > subtreeSize[rival]) heavyChild[nodeParent] = node;
  }
  // Chain heads, forwards: a heavy child continues its parent's chain, every other node starts one.
  const chainHead = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const node = order[i];
    const nodeParent = parent[node];
    chainHead[node] = nodeParent >= 0 && heavyChild[nodeParent] === node ? chainHead[nodeParent] : node;
  }
  return Ancestry.create(parent, depth, chainHead);
}

/**
 * Names a node that actually lies on a cycle, not merely one hanging below it: walking up from an
 * unreached node stays unreached, and after nodeCount steps the walk is on the cycle it circles.
 */
function nodeOnCycle(parent: Int32Array, depth: Int32Array): number {
  const n = depth.length;
  let node = -1;
  for (let candidate = 0; candidate < n; candidate++) {
    if (depth[candidate] < 0) {
      node = candidate;
      break;
    }
  }
  if (node < 0) throw new Error("assertion failed: some node is unreached");
  for (let step = 0; step < n; step++) node = parent[node];
  return node;
}
