import { DfsFrames } from "./dfsFrames.js";
import type { Edges } from "./edges.js";
import type { Graph } from "./graph.js";
import { checkIndex } from "./internal.js";

/**
 * The type of an edge in a DFS (depth-first search), as {@link EdgeTypes} classifies the edges of
 * a graph (Java: the enum `EdgeType`; here a constant object with the ordinals of the enum as
 * values, and a type of the same name for one of them).
 *
 * A depth-first search through all nodes reaches each node once, either by a tree edge or as the
 * root of a new search tree; the tree edges form the DFS forest. Every other edge gets its type
 * from where its target lies relative to its source in that forest, so each edge has exactly one
 * type. {@link Edges.of} collects the edges of one type.
 */
export const EdgeType = {
  /** An edge by which the search reaches its target for the first time: an edge of the forest. */
  TREE: 0,
  /**
   * An edge to an ancestor of its source in the DFS forest, or to the source itself. A graph has a
   * cycle exactly when it has a back edge.
   */
  BACK: 1,
  /** An edge to a descendant of its source in the DFS forest, other than a tree edge. */
  FORWARD: 2,
  /**
   * An edge between two nodes of which neither is an ancestor of the other in the DFS forest: the
   * search had finished the target before it reached the source.
   */
  CROSS: 3,
} as const;

/** One of the four values of {@link EdgeType}. */
export type EdgeType = (typeof EdgeType)[keyof typeof EdgeType];

const VISITED = 0b01;
const ON_STACK = 0b10;

/**
 * The type of every edge of a graph in a depth-first search: tree, back, forward or cross edge, as
 * {@link EdgeType} defines them.
 *
 * The types depend on the search. Uses a depth-first search, without recursion. The search starts
 * at the nodes in ascending order and takes the out-nodes of each node in ascending order, as
 * {@link DfsTraverser.run} does. {@link EdgeTypes.typeOf} returns the type of one edge, and
 * {@link Edges.of} collects the edges of one type. Here, `cfg` is the control flow of a method with
 * a loop and a branch: the edge `next -> header` closes the loop, and `body -> next` skips `then`:
 *
 * <!-- example: traversals.ts#edgeTypes -->
 * ```ts
 * const types = EdgeTypes.of(cfg);
 * const loopEdge = types.typeOf(cfg.edgeIndexOf(next, header));
 * const forwardEdges = Edges.of(types, EdgeType.FORWARD);
 * // loopEdge: EdgeType.BACK
 * // forwardEdges: body -> next
 * ```
 *
 * A graph is a DAG (directed acyclic graph) exactly if it has no back edge. For the back edges
 * alone, {@link BackEdges.of} saves the classification of the other edges.
 *
 * Instances are immutable.
 *
 * **Memory:** 1 byte per edge; an instance also keeps a reference to its graph.
 */
export class EdgeTypes {
  /** @internal The graph, for the sources and targets in {@link Edges.of}. */
  readonly graph: Graph;

  /** @internal The type of each edge, by edge index. */
  readonly types: Uint8Array;

  // Type-only, no field at run time: a private member makes the type nominal, so that an object of
  // the same shape is not taken for an instance, as in Java.
  declare private readonly brand: never;

  private constructor(graph: Graph, types: Uint8Array) {
    this.graph = graph;
    this.types = types;
  }

  /**
   * Returns the type of every edge of `graph`, from one depth-first search.
   *
   * **Time:** O(nodeCount + edgeCount).
   * **Memory:** edgeCount bytes for the result; while it runs, 4 bytes and 2 bits per node, and up
   * to 8 x nodeCount bytes for the stack, which grows with the deepest path.
   *
   * @param graph the graph to classify
   * @returns the edge types
   * @throws Error if a depth-first path is longer than 2^30 - 5 nodes
   */
  static of(graph: Graph): EdgeTypes {
    if (graph.edgeCount === 0) return new EdgeTypes(graph, new Uint8Array(0));
    return new EdgeTypes(graph, classify(graph));
  }

  /**
   * Returns the type of edge `edgeIndex`.
   *
   * **Time:** O(1).
   *
   * @param edgeIndex edge index in `0..edgeCount-1`
   * @returns edge type
   * @throws RangeError if `edgeIndex` is out of range
   */
  typeOf(edgeIndex: number): EdgeType {
    checkIndex(edgeIndex, this.types.length);
    return this.types[edgeIndex] as EdgeType;
  }
}

/**
 * Iterative DFS (explicit stack, no recursion) that classifies all edges using discovery times
 * and a packed visited/on-stack state: 2 bits per node, 16 nodes per int.
 *
 * Rules for an edge `u -> v`: v unvisited is TREE (and descends), v on the DFS stack is BACK,
 * v finished with `disc[u] < disc[v]` is FORWARD, otherwise CROSS.
 */
function classify(graph: Graph): Uint8Array {
  const n = graph.nodeCount;
  const out = graph.outStart;
  const adj = graph.outAdj;
  const state = new Int32Array((n >> 4) + 1);
  const disc = new Int32Array(n);
  const types = new Uint8Array(adj.length);
  // Each frame is two interleaved ints, the node and its resume position in the adjacency
  // array; the array grows on demand.
  let frames = DfsFrames.initial(n);
  let time = 0;

  for (let root = 0; root < n; root++) {
    const rShift = (root & 0xf) << 1;
    if (((state[root >> 4] >>> rShift) & VISITED) !== 0) continue;
    state[root >> 4] |= (VISITED | ON_STACK) << rShift;
    disc[root] = ++time;
    frames[0] = root;
    frames[1] = out[root];
    let top = 0;

    outer: while (top >= 0) {
      const u = frames[2 * top];
      const end = out[u + 1];
      // Tight neighbor scan: the frame is touched only when the search descends.
      let i = frames[2 * top + 1];
      while (i < end) {
        const e = i++;
        const v = adj[e];
        const shift = (v & 0xf) << 1;
        const flags = state[v >> 4] >>> shift;
        if ((flags & VISITED) === 0) {
          types[e] = EdgeType.TREE;
          frames[2 * top + 1] = i;
          state[v >> 4] |= (VISITED | ON_STACK) << shift;
          disc[v] = ++time;
          if (++top === frames.length >> 1) frames = DfsFrames.grow(frames, n);
          frames[2 * top] = v;
          frames[2 * top + 1] = out[v];
          continue outer;
        } else if ((flags & ON_STACK) !== 0) {
          types[e] = EdgeType.BACK;
        } else if (disc[u] < disc[v]) {
          types[e] = EdgeType.FORWARD;
        } else {
          types[e] = EdgeType.CROSS;
        }
      }
      state[u >> 4] &= ~(ON_STACK << ((u & 0xf) << 1));
      top--;
    }
  }
  return types;
}
