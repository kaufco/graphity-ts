import { Csr, type Dominators, Graphs, type IntList, IntLists, SortedIntView } from "@kobayami/graphity-core";
import { IntOpenHashSet } from "./intOpenHashSet.js";
import { checkIndex, IntBuffer } from "./internal.js";

/**
 * The iterated dominance frontiers of a control-flow graph, which tell where SSA (static single
 * assignment) form places phi-nodes.
 *
 * In SSA form, every assignment to a variable creates a new version of it, and a phi-node merges
 * the versions where paths of control flow meet. The phi-nodes of a variable go into the iterated
 * dominance frontier of the blocks that assign it: the dominance frontier of these blocks, then the
 * dominance frontier of the result, and so on until nothing new is added. A compiler asks this once
 * per variable, so {@link IteratedDominanceFrontier.of} prepares the queries once per control-flow
 * graph, and {@link IteratedDominanceFrontier.frontierOf} answers them. Here, for the loop variable
 * `i` of a method `load`, whose control flow `cfg` has the blocks `entry` and `next`:
 *
 * <!-- example: analyzingControlFlow.ts#frontierOf -->
 * ```ts
 * const dominators = Dominators.of(BiAdjacentGraph.of(cfg), entry);
 * const phis = IteratedDominanceFrontier.of(dominators);
 * // i is assigned in entry (i = 0) and in next (i++)
 * const phiBlocks = phis.frontierOf([entry, next]);
 * // phiBlocks: [1] - header
 * ```
 *
 * Uses the algorithm of Sreedhar and Gao. A query walks the subtrees of the dominator tree below
 * the nodes it is given and the nodes it adds, so its cost depends on the part of the graph it
 * explores, not on the whole graph. It never builds the dominance frontiers themselves, which can
 * grow quadratically with the node count; {@link ControlFlow.dominanceFrontiers} returns them as a
 * graph.
 *
 * Instances are immutable.
 *
 * **Memory:** 16 x nodeCount bytes, plus the `Dominators` it was built from, which stay reachable
 * as long as it is held.
 */
export class IteratedDominanceFrontier {
  readonly #dominators: Dominators;

  /** Depth of each node in the dominator forest, 0 for a root, -1 if unreachable. */
  readonly #depth: Int32Array;

  /** Position of each node in the preorder of the dominator forest. */
  readonly #preorderIndex: Int32Array;

  /** Size of each node's subtree in the dominator forest, the node included. */
  readonly #subtreeSize: Int32Array;

  /** Node at each preorder position. */
  readonly #order: Int32Array;

  private constructor(
    dominators: Dominators,
    depth: Int32Array,
    preorderIndex: Int32Array,
    subtreeSize: Int32Array,
    order: Int32Array,
  ) {
    this.#dominators = dominators;
    this.#depth = depth;
    this.#preorderIndex = preorderIndex;
    this.#subtreeSize = subtreeSize;
    this.#order = order;
  }

  /**
   * Returns the iterated dominance frontiers of the graph that `dominators` were computed on, ready
   * for queries.
   *
   * They are prepared anew on every call, not cached: keep the result and query it for every
   * variable.
   *
   * **Time:** O(nodeCount).
   * **Memory:** 16 x nodeCount bytes for the result; while it runs, 8 x nodeCount bytes more.
   *
   * @param dominators the dominators of the control-flow graph
   * @returns the iterated dominance frontiers
   */
  static of(dominators: Dominators): IteratedDominanceFrontier {
    const tree = Graphs.dominatorTree(dominators);
    const n = tree.nodeCount;
    const childStart = Csr.outAdjacencyStart(tree);
    const children = Csr.outAdjacency(tree);
    const preorderIndex = new Int32Array(n);
    const order = new Int32Array(n);
    const subtreeSize = new Int32Array(n);
    const depth = new Int32Array(n);

    // Canonical preorder - roots ascending, children ascending - as ParentForest.preorder in the
    // core computes it; change both together. Every node is pushed exactly once, so the stack
    // fits in n slots; the subtree-size array serves as the stack until it is filled below.
    // Preorder visits every parent before its children, so depth follows on the way.
    const stack = subtreeSize;
    let top = 0;
    for (let node = n - 1; node >= 0; node--) {
      if (dominators.immediateDominatorOf(node) < 0) {
        stack[top++] = node;
        depth[node] = dominators.isReachable(node) ? 0 : -1;
      }
    }
    let position = 0;
    while (top > 0) {
      const node = stack[--top];
      preorderIndex[node] = position;
      order[position++] = node;
      for (let i = childStart[node + 1] - 1; i >= childStart[node]; i--) {
        const child = children[i];
        depth[child] = depth[node] + 1;
        stack[top++] = child;
      }
    }

    // Reverse preorder visits every child before its parent.
    subtreeSize.fill(1);
    for (let i = n - 1; i >= 0; i--) {
      const node = order[i];
      const p = dominators.immediateDominatorOf(node);
      if (p >= 0) subtreeSize[p] += subtreeSize[node];
    }
    return new IteratedDominanceFrontier(dominators, depth, preorderIndex, subtreeSize, order);
  }

  /**
   * Returns the iterated dominance frontier of `nodes`, in ascending order.
   *
   * The result can contain given nodes, such as the header of a natural loop, which is in its own
   * dominance frontier. Nodes that the entries do not reach are ignored, and so are duplicates.
   *
   * **Time:** O(number of nodes + e + (s + k) log(s + k)), where e is the number of nodes and edges
   * the query explores, at most nodeCount + edgeCount; s is the number of distinct given nodes that
   * the entries reach, and k the size of the result. **Memory:** 4 x k bytes for the result; while
   * it runs, up to about 60 bytes per node the query explores, and nothing sized by the whole
   * graph.
   *
   * @param nodes node IDs in `0..nodeCount-1`, such as the blocks that assign a variable
   * @returns the iterated dominance frontier
   * @throws RangeError if a node is out of range
   * @throws Error if the query explores more than about 8 x 10^8 nodes
   */
  frontierOf(nodes: IntList): SortedIntView {
    const depth = this.#depth;
    const preorderIndex = this.#preorderIndex;
    const subtreeSize = this.#subtreeSize;
    const order = this.#order;
    const n = depth.length;
    const list = IntLists.asArrayLike(nodes);
    const size = list.length;
    // Sized by a capped guess and grown on demand, so that duplicates and unreachable nodes in a
    // long input cost no scratch space.
    const initial = Math.min(Math.max(4, size), 1024);
    const given = new IntOpenHashSet(initial);
    let heap: Int32Array = new Int32Array(2 * initial);
    let heapSize = 0;
    for (let i = 0; i < size; i++) {
      const node = list[i];
      checkIndex(node, n);
      if (depth[node] < 0 || !given.add(node)) continue;
      heap = push(heap, heapSize++, depth[node], node, n);
    }

    const graph = this.#dominators.graph;
    const out = Csr.outAdjacencyStart(graph);
    const adj = Csr.outAdjacency(graph);
    const inFrontier = new IntOpenHashSet();
    const walked = new IntOpenHashSet();
    const result = new IntBuffer();

    // Deepest root first. A subtree walked once need not be walked again for a shallower root:
    // every edge it could contribute leaves no deeper than the earlier root, and was taken then.
    // Walked parts are closed under descendants, so the scan skips each one in a single step.
    while (heapSize > 0) {
      const rootDepth = heap[0];
      const root = heap[1];
      heapSize = pop(heap, heapSize);
      let position = preorderIndex[root];
      const end = position + subtreeSize[root];
      while (position < end) {
        const x = order[position];
        if (!walked.add(x)) {
          position += subtreeSize[x];
          continue;
        }
        for (let i = out[x], last = out[x + 1]; i < last; i++) {
          const y = adj[i];
          // Targets deeper than the root lie strictly inside its subtree and fall out here; what
          // remains - the root itself or a node beyond its subtree - is in its frontier.
          const yDepth = depth[y];
          if (yDepth > rootDepth || !inFrontier.add(y)) continue;
          result.push(y);
          if (!given.contains(y)) heap = push(heap, heapSize++, yDepth, y, n);
        }
        position++;
      }
    }

    const sorted = result.toInt32Array().sort();
    return SortedIntView.viewOf(sorted, 0, sorted.length);
  }
}

/**
 * Adds `(key, node)` to the binary max-heap of interleaved pairs holding `size` entries, growing
 * the array if needed, and returns the array. Every node enters at most once, so the array never
 * needs more than two slots per node of the graph, and the growth is capped there.
 */
function push(heap: Int32Array, size: number, key: number, node: number, nodeCount: number): Int32Array {
  if (2 * (size + 1) > heap.length) {
    const grown = new Int32Array(Math.min(2 * heap.length, 2 * nodeCount));
    grown.set(heap);
    heap = grown;
  }
  let i = size;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[2 * parent] >= key) break;
    heap[2 * i] = heap[2 * parent];
    heap[2 * i + 1] = heap[2 * parent + 1];
    i = parent;
  }
  heap[2 * i] = key;
  heap[2 * i + 1] = node;
  return heap;
}

/** Removes the top of the heap holding `size` entries and returns the new size. */
function pop(heap: Int32Array, size: number): number {
  const last = size - 1;
  const key = heap[2 * last];
  const node = heap[2 * last + 1];
  let i = 0;
  while (true) {
    let child = 2 * i + 1;
    if (child >= last) break;
    if (child + 1 < last && heap[2 * (child + 1)] > heap[2 * child]) child++;
    if (heap[2 * child] <= key) break;
    heap[2 * i] = heap[2 * child];
    heap[2 * i + 1] = heap[2 * child + 1];
    i = child;
  }
  heap[2 * i] = key;
  heap[2 * i + 1] = node;
  return last;
}
