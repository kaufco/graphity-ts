import { Edges } from "./edges.js";
import type { BiAdjacentGraph } from "./graph.js";
import { IntBuffer } from "./internal.js";
import { EdgeMapping } from "./mapping.js";
import { ParentForest } from "./parentForest.js";
import { EdgePartition } from "./partition.js";
import { SortedIntView } from "./sortedIntView.js";

/**
 * The bridges, articulation points and biconnected components of a graph read as undirected, as
 * {@link Components.biconnectivityOf} returns them.
 *
 * A bridge is an edge whose removal increases the number of connected components, and an
 * articulation point is a node whose removal does the same. A biconnected component, also called a
 * block, is a maximal group of edges in which any two edges lie on a common cycle. The blocks
 * partition the edges, not the nodes: an articulation point belongs to every block it touches.
 *
 * The graph is read as undirected, as described at {@link Components}: the edges `a -> b` and
 * `b -> a` are one undirected edge. So a graph that stores its edges in both directions still has
 * bridges, and the two directions of an edge lie in the same block. Self-loops are in no block and
 * never a bridge. Here, the control flow of the method `load`, whose loop is connected to the rest
 * only through `header`:
 *
 * <!-- example: connectivity.ts#biconnectivity -->
 * ```ts
 * const biconnectivity = Components.biconnectivityOf(BiAdjacentGraph.of(cfg));
 * const bridges = biconnectivity.bridges;
 * // bridges: entry -> header, header -> exit
 * const articulationPoints = biconnectivity.articulationPoints;
 * // articulationPoints: [1] - header
 * ```
 *
 * Instances are immutable.
 *
 * **Memory:** up to 8 x edgeCount + 20 x nodeCount bytes.
 */
export class Biconnectivity {
  readonly #bridges: Edges;
  readonly #articulationPoints: SortedIntView;
  readonly #blocks: EdgePartition;

  private constructor(bridges: Edges, articulationPoints: SortedIntView, blocks: EdgePartition) {
    this.#bridges = bridges;
    this.#articulationPoints = articulationPoints;
    this.#blocks = blocks;
  }

  /** @internal Computes bridges, articulation points and blocks of `graph`, read as undirected. */
  static of(graph: BiAdjacentGraph): Biconnectivity {
    const finder = new BlockFinder(graph);
    finder.run();
    return new Biconnectivity(finder.bridges(), finder.articulationPoints(), finder.blocks());
  }

  /**
   * The bridges, in edge index order (Java: `bridges()`).
   *
   * Of a bridge stored in both directions, only the edge from the lower to the higher node ID is
   * listed; {@link Biconnectivity.blocks} puts the other direction in the same block.
   *
   * **Time:** O(1).
   */
  get bridges(): Edges {
    return this.#bridges;
  }

  /**
   * The articulation points, in ascending order (Java: `articulationPoints()`).
   *
   * **Time:** O(1).
   */
  get articulationPoints(): SortedIntView {
    return this.#articulationPoints;
  }

  /**
   * The blocks, as a partition of the edges (Java: `blocks()`).
   *
   * Each block is a group of the partition: `blocks.get(e)` returns the block of edge `e`, and
   * `blocks.edgesOf(block)` the edges of a block. Self-loops are in no block and map to `-1`, so
   * {@link IndexMapping.isPartial} is `true` exactly if the graph has self-loops. Which block gets
   * which group ID is not specified, but the same graph always yields the same group IDs.
   *
   * **Time:** O(1).
   */
  get blocks(): EdgePartition {
    return this.#blocks;
  }

  /** @internal The nodes whose flag is set, ascending; {@link StrongConnectivity} uses it as well. */
  static flaggedNodes(isFlagged: Uint8Array): SortedIntView {
    let count = 0;
    for (let i = 0; i < isFlagged.length; i++) if (isFlagged[i] !== 0) count++;
    if (count === 0) return SortedIntView.EMPTY;
    const nodes = new Int32Array(count);
    let pos = 0;
    for (let node = 0; node < isFlagged.length; node++) if (isFlagged[node] !== 0) nodes[pos++] = node;
    return SortedIntView.create(nodes);
  }
}

const UNVISITED = 0;

/**
 * Hopcroft-Tarjan biconnectivity on an explicit stack.
 *
 * Neighbours are read as undirected by merging a node's out- and in-adjacency, both sorted
 * ascending, emitting each neighbour once. The merge is also where a block's edge indices come
 * from: for one undirected edge it sees the out-adjacency slot - already an edge index - and the
 * in-adjacency slot in the same step, and the latter translates to an edge index through the
 * transposed edge mapping. Collapsing the reciprocal pair means the parent appears exactly once in
 * the merged sequence, so skipping it needs no parent-edge identity.
 *
 * Per-node state lives in arrays rather than in stack frames, because a node is on the depth-first
 * stack at most once. The edge stack grows on demand.
 */
class BlockFinder {
  private readonly graph: BiAdjacentGraph;
  private readonly outAdjacency: Int32Array;
  private readonly outAdjacencyStart: Int32Array;
  private readonly inAdjacency: Int32Array;
  private readonly inAdjacencyStart: Int32Array;

  /** In-adjacency slot to edge index of the same edge in the graph. */
  private readonly inSlotToEdge: Int32Array;

  /** Discovery time, UNVISITED until the node is reached. Counting starts at 1. */
  private readonly disc: Int32Array;
  private readonly low: Int32Array;
  private readonly dfsParent: Int32Array;

  /** Edge-stack height before the tree edge into this node was pushed. */
  private readonly blockMark: Int32Array;

  private readonly outCursor: Int32Array;
  private readonly inCursor: Int32Array;

  private readonly dfsStack: Int32Array;
  private edgeStack: Int32Array;
  private edgeTop = 0;

  private readonly isArticulation: Uint8Array;
  /** Bridges as parallel lists of source, target and edge index, each a stored edge. */
  private readonly bridgeSources = new IntBuffer();
  private readonly bridgeTargets = new IntBuffer();
  private readonly bridgeEdgeIndices = new IntBuffer();

  /** Edge index to block ID, -1 for a self-loop. */
  private readonly blockOfEdge: Int32Array;
  private blockCount = 0;

  private timer = 0;

  /** Neighbour found by {@link advance}, with the edge indices of its two directions. */
  private pendingNode = 0;
  private pendingOutEdge = 0;
  private pendingInSlot = 0;

  constructor(graph: BiAdjacentGraph) {
    this.graph = graph;
    const n = graph.nodeCount;
    const m = graph.edgeCount;
    this.outAdjacency = graph.outAdj;
    this.outAdjacencyStart = graph.outStart;
    this.inAdjacency = graph.inAdj;
    this.inAdjacencyStart = graph.inStart;
    this.inSlotToEdge = EdgeMapping.forTransposed(graph).mapping;
    this.disc = new Int32Array(n);
    this.low = new Int32Array(n);
    this.dfsParent = new Int32Array(n);
    this.blockMark = new Int32Array(n);
    this.outCursor = new Int32Array(n);
    this.inCursor = new Int32Array(n);
    this.dfsStack = new Int32Array(n);
    // Sized like DfsFrames.initial: one slot per edge, but at least 16 and at most 1024.
    this.edgeStack = new Int32Array(Math.max(16, Math.min(m, 1024)));
    this.isArticulation = new Uint8Array(n);
    this.blockOfEdge = new Int32Array(m).fill(-1);
  }

  run(): void {
    const n = this.graph.nodeCount;
    const disc = this.disc;
    const low = this.low;
    const dfsParent = this.dfsParent;
    const dfsStack = this.dfsStack;
    for (let root = 0; root < n; root++) {
      if (disc[root] !== UNVISITED) continue;

      this.discover(root, -1);
      dfsStack[0] = root;
      let top = 0;
      let rootChildren = 0;

      outer: while (top >= 0) {
        const u = dfsStack[top];
        while (this.advance(u)) {
          const v = this.pendingNode;
          // The one occurrence of the parent is the tree edge back up; it is already pushed.
          if (v === dfsParent[u]) continue;
          if (disc[v] === UNVISITED) {
            const mark = this.edgeTop;
            this.pushPendingEdges();
            this.discover(v, u);
            this.blockMark[v] = mark;
            if (u === root) rootChildren++;
            dfsStack[++top] = v;
            continue outer;
          }
          if (disc[v] < disc[u]) {
            // Back edge to an ancestor. Undirected depth-first search has no cross edges, so the
            // other case - a finished descendant - was already handled from its own side.
            this.pushPendingEdges();
            if (disc[v] < low[u]) low[u] = disc[v];
          }
        }

        top--;
        const parent = dfsParent[u];
        if (parent >= 0) {
          if (low[u] < low[parent]) low[parent] = low[u];
          if (low[u] >= disc[parent]) {
            if (low[u] > disc[parent]) this.addBridge(parent, u, this.blockMark[u]);
            this.closeBlock(this.blockMark[u]);
            // The root is an articulation point only if it has two or more subtrees.
            if (parent !== root) this.isArticulation[parent] = 1;
          }
        }
      }

      if (rootChildren >= 2) this.isArticulation[root] = 1;
    }
  }

  /** Discovers `node` as a child of `parent` and initialises its merge cursors. */
  private discover(node: number, parent: number): void {
    this.disc[node] = ++this.timer;
    this.low[node] = this.disc[node];
    this.dfsParent[node] = parent;
    this.outCursor[node] = this.outAdjacencyStart[node];
    this.inCursor[node] = this.inAdjacencyStart[node];
  }

  /**
   * Advances `node`'s merge cursors to its next undirected neighbour, skipping self-loops, and
   * reports it in `pendingNode`. Returns false once the neighbours are exhausted.
   */
  private advance(node: number): boolean {
    let out = this.outCursor[node];
    const outEnd = this.outAdjacencyStart[node + 1];
    let inPos = this.inCursor[node];
    const inEnd = this.inAdjacencyStart[node + 1];
    const outAdjacency = this.outAdjacency;
    const inAdjacency = this.inAdjacency;

    while (out < outEnd || inPos < inEnd) {
      const outNeighbor = out < outEnd ? outAdjacency[out] : 0x7fffffff;
      const inNeighbor = inPos < inEnd ? inAdjacency[inPos] : 0x7fffffff;

      let neighbor: number;
      let outEdge = -1;
      let inSlot = -1;
      if (outNeighbor < inNeighbor) {
        neighbor = outNeighbor;
        outEdge = out++;
      } else if (inNeighbor < outNeighbor) {
        neighbor = inNeighbor;
        inSlot = inPos++;
      } else {
        // Both directions of one undirected edge; both indices belong to the same block.
        neighbor = outNeighbor;
        outEdge = out++;
        inSlot = inPos++;
      }

      if (neighbor === node) continue; // self-loop: in no block, never a bridge

      this.outCursor[node] = out;
      this.inCursor[node] = inPos;
      this.pendingNode = neighbor;
      this.pendingOutEdge = outEdge;
      this.pendingInSlot = inSlot;
      return true;
    }

    this.outCursor[node] = out;
    this.inCursor[node] = inPos;
    return false;
  }

  /** Pushes the edge indices of the pending undirected edge - one per stored direction. */
  private pushPendingEdges(): void {
    if (this.pendingOutEdge >= 0) this.pushEdge(this.pendingOutEdge);
    if (this.pendingInSlot >= 0) this.pushEdge(this.inSlotToEdge[this.pendingInSlot]);
  }

  private pushEdge(edgeIndex: number): void {
    if (this.edgeTop === this.edgeStack.length) {
      // Every non-self-loop edge is pushed at most once, so the edge count is the hard cap.
      const grown = new Int32Array(Math.min(2 * this.edgeTop, this.blockOfEdge.length));
      grown.set(this.edgeStack);
      this.edgeStack = grown;
    }
    this.edgeStack[this.edgeTop++] = edgeIndex;
  }

  /**
   * Records the bridge `parent - child` before its block closes. The edges above `mark` are
   * exactly the one or two stored directions of the bridge, pushed `parent -> child` first. A
   * bridge stored both ways is reported from the lower node ID.
   */
  private addBridge(parent: number, child: number, mark: number): void {
    const edge = this.edgeTop - mark === 2 && parent > child ? this.edgeStack[mark + 1] : this.edgeStack[mark];
    const target = this.outAdjacency[edge];
    this.bridgeSources.push(target === child ? parent : child);
    this.bridgeTargets.push(target);
    this.bridgeEdgeIndices.push(edge);
  }

  /** Turns the edges above `mark` into one block. */
  private closeBlock(mark: number): void {
    const block = this.blockCount++;
    while (this.edgeTop > mark) this.blockOfEdge[this.edgeStack[--this.edgeTop]] = block;
  }

  bridges(): Edges {
    return Edges.sortedEdges(
      this.graph,
      this.bridgeSources.data,
      this.bridgeTargets.data,
      this.bridgeEdgeIndices.data,
      this.bridgeSources.length,
      false,
    );
  }

  articulationPoints(): SortedIntView {
    return Biconnectivity.flaggedNodes(this.isArticulation);
  }

  blocks(): EdgePartition {
    const groups = ParentForest.groupIndices(this.blockOfEdge, this.blockCount);
    return EdgePartition.create(this.blockOfEdge, groups.members, groups.start);
  }
}
