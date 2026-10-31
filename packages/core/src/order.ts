import { DfsFrames } from "./dfsFrames.js";
import { BiAdjacentGraph, type Graph } from "./graph.js";
import { checkIndex } from "./internal.js";

const VISITED = 0b01;
const ON_STACK = 0b10;

/**
 * The topological order of a DAG (directed acyclic graph), in which every node comes before its
 * out-nodes.
 *
 * Uses a depth-first search, without recursion: {@link TopOrder.of} returns its reverse postorder.
 * The search starts at the nodes in ascending order and takes the out-nodes of each node in
 * ascending order, as {@link DfsTraverser.run} does, so a graph always gets the same order.
 * {@link TopOrderAndLevels} returns another topological order, together with a level per node.
 *
 * A graph with a cycle has no topological order, and {@link TopOrder.of} rejects it;
 * {@link Graphs.isDag} tests for a cycle, and {@link Graphs.findCycle} returns one. On a graph with
 * cycles, {@link Components.sccsOf} puts each cycle into one SCC (strongly connected component) and
 * numbers the SCCs in reverse topological order.
 */
export const TopOrder = {
  /**
   * Returns the nodes of `graph` in topological order: for every edge `u -> v`, `u` comes before
   * `v`.
   *
   * **Time:** O(nodeCount + edgeCount).
   * **Memory:** 4 x nodeCount bytes for the result; while it runs, 2 bits per node and up to
   * 8 x nodeCount bytes for the stack, which grows with the deepest path.
   *
   * @param graph the DAG to sort
   * @returns the node IDs in topological order; a new array that must not be modified (Java:
   *     unmodifiable)
   * @throws Error if `graph` has a cycle, or if a depth-first path is longer than 2^30 - 5 nodes
   */
  of(graph: Graph): Int32Array {
    const order = topOrderOrUndefined(graph);
    if (order === undefined) throw new Error("graph contains a cycle");
    return order;
  },
} as const;

/**
 * Iterative DFS (explicit stack, no recursion) that records reverse postorder and stops at the
 * first back edge. Visited and on-stack flags are packed 2 bits per node, 16 nodes per int.
 *
 * @returns the order, or `undefined` if the graph has a cycle
 */
function topOrderOrUndefined(graph: Graph): Int32Array | undefined {
  const n = graph.nodeCount;
  const out = graph.outStart;
  const adj = graph.outAdj;
  const state = new Int32Array((n >> 4) + 1);
  const order = new Int32Array(n);
  let orderPos = n;
  let frames = DfsFrames.initial(n);

  for (let root = 0; root < n; root++) {
    const rShift = (root & 0xf) << 1;
    if (((state[root >> 4] >>> rShift) & VISITED) !== 0) continue;
    state[root >> 4] |= (VISITED | ON_STACK) << rShift;
    frames[0] = root;
    frames[1] = out[root];
    let top = 0;

    outer: while (top >= 0) {
      const u = frames[2 * top];
      const end = out[u + 1];
      let i = frames[2 * top + 1];
      while (i < end) {
        const v = adj[i++];
        const shift = (v & 0xf) << 1;
        const flags = state[v >> 4] >>> shift;
        if ((flags & ON_STACK) !== 0) return undefined;
        if ((flags & VISITED) === 0) {
          frames[2 * top + 1] = i;
          state[v >> 4] |= (VISITED | ON_STACK) << shift;
          if (++top === frames.length >> 1) frames = DfsFrames.grow(frames, n);
          frames[2 * top] = v;
          frames[2 * top + 1] = out[v];
          continue outer;
        }
      }
      state[u >> 4] &= ~(ON_STACK << ((u & 0xf) << 1));
      order[--orderPos] = u;
      top--;
    }
  }
  return order;
}

/**
 * A topological order of a DAG (directed acyclic graph) with the level of each node. A root node
 * has level 0, and every other node has one more than the highest level of its in-nodes.
 *
 * The level of a node is the number of edges on a longest path to it from a root node, so no path
 * connects two nodes of the same level. {@link TopOrderAndLevels.order} lists the nodes level by
 * level, {@link TopOrderAndLevels.levelOf} and {@link TopOrderAndLevels.levels} return their
 * levels, and {@link TopOrderAndLevels.levelCount} the number of levels.
 *
 * Uses Kahn's algorithm: {@link TopOrderAndLevels.of} starts with the root nodes in ascending
 * order, places a node once all its in-nodes are placed and takes the out-nodes of each node in
 * ascending order, so a graph always gets the same order. For the order alone, {@link TopOrder.of}
 * needs less memory.
 *
 * Instances are immutable.
 *
 * **Memory:** 8 x nodeCount bytes.
 */
export class TopOrderAndLevels {
  readonly #order: Int32Array;
  readonly #levels: Int32Array;
  readonly #levelCount: number;

  private constructor(order: Int32Array, levels: Int32Array, levelCount: number) {
    this.#order = order;
    this.#levels = levels;
    this.#levelCount = levelCount;
  }

  /**
   * Returns the topological order and the levels of `graph`.
   *
   * On a {@link BiAdjacentGraph}, it reads the in-degrees instead of counting them in a pass over
   * the edges.
   *
   * **Time:** O(nodeCount + edgeCount).
   * **Memory:** 8 x nodeCount bytes for the result; while it runs, 8 x nodeCount bytes more.
   *
   * @param graph the DAG to sort
   * @returns the order and the levels
   * @throws Error if `graph` has a cycle
   */
  static of(graph: Graph): TopOrderAndLevels {
    const n = graph.nodeCount;

    // 1) In-degrees; a BiAdjacentGraph has them in its offsets.
    const inDegree = new Int32Array(n);
    if (graph instanceof BiAdjacentGraph) {
      const inStart = graph.inStart;
      for (let i = 0; i < n; i++) inDegree[i] = inStart[i + 1] - inStart[i];
    } else {
      const outAdj = graph.outAdj;
      for (let i = 0; i < outAdj.length; i++) inDegree[outAdj[i]]++;
    }

    // 2) Roots.
    const queue = new Int32Array(n);
    let queueHead = 0;
    let queueTail = 0;
    for (let i = 0; i < n; i++) if (inDegree[i] === 0) queue[queueTail++] = i;

    // 3) Kahn, one wave per level: a node joins the wave after that of its last predecessor.
    const order = new Int32Array(n);
    const levels = new Int32Array(n);
    let orderPos = 0;
    let level = 0;
    const adjacency = graph.outAdj;
    const adjacencyStart = graph.outStart;
    while (queueHead < queueTail) {
      const levelEnd = queueTail;
      while (queueHead < levelEnd) {
        const node = queue[queueHead++];
        order[orderPos++] = node;
        levels[node] = level;
        for (let i = adjacencyStart[node], end = adjacencyStart[node + 1]; i < end; i++) {
          const target = adjacency[i];
          if (--inDegree[target] === 0) queue[queueTail++] = target;
        }
      }
      level++;
    }
    if (orderPos !== n) throw new Error("graph contains a cycle");
    return new TopOrderAndLevels(order, levels, level);
  }

  /**
   * The nodes in topological order, level by level: for every edge `u -> v`, `u` comes before `v`;
   * not to be modified (Java: `order()`, an unmodifiable list).
   *
   * **Time:** O(1).
   */
  get order(): Int32Array {
    return this.#order;
  }

  /**
   * The level of every node, by node ID; not to be modified (Java: `levels()`, an unmodifiable
   * list).
   *
   * **Time:** O(1).
   */
  get levels(): Int32Array {
    return this.#levels;
  }

  /**
   * Returns the level of `node`. Equivalent to `levels[node]`.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns level
   * @throws RangeError if `node` is out of range
   */
  levelOf(node: number): number {
    checkIndex(node, this.#levels.length);
    return this.#levels[node];
  }

  /**
   * The number of levels, or `0` for a graph without nodes (Java: `levelCount()`). It equals the
   * number of nodes on a longest path.
   *
   * **Time:** O(1).
   */
  get levelCount(): number {
    return this.#levelCount;
  }
}
