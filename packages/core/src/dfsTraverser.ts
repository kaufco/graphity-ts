import { DfsFrames } from "./dfsFrames.js";
import type { Graph } from "./graph.js";
import { checkIndex, checkNodes } from "./internal.js";
import { type IntList, IntLists } from "./sortedIntView.js";

/** Bit 0 of a node's packed state: the node has been discovered. */
const VISITED = 0b01;

/** Bit 1 of a node's packed state: the node is currently on the DFS path (gray set). */
const ON_STACK = 0b10;

/**
 * The base class of a depth-first search of your own over a {@link Graph}. A subclass overrides the
 * hooks {@link DfsTraverser.enterNode} and {@link DfsTraverser.leaveNode}, and a `run` method
 * starts the search.
 *
 * The search visits each node it reaches once. It calls {@link DfsTraverser.enterNode} when it
 * reaches a node (preorder) and {@link DfsTraverser.leaveNode} when it has searched from all
 * out-nodes of the node (postorder). It takes the out-nodes of each node in ascending order, so the
 * hooks come in the order of a textbook recursive depth-first search. The search itself runs
 * without recursion and keeps its stack on the heap, so a deep graph does not overflow the call
 * stack. Here, `calls` are the calls between the methods of a program, and the postorder puts each
 * method after the methods it calls, except along calls that close a cycle:
 *
 * <!-- example: traversals.ts#leaveNode -->
 * ```ts
 * class CalleesFirst extends DfsTraverser {
 *   readonly order: number[] = [];
 *
 *   protected enterNode(): boolean { return true; }
 *
 *   protected override leaveNode(method: number): void { this.order.push(method); }
 * }
 * const calleesFirst = new CalleesFirst(calls);
 * calleesFirst.run(main);
 * // calleesFirst.order: [1, 6, 8, 3, 7, 9, 4, 5, 2, 0] - parseArgs, parse, read, load,
 * // format, write, save, show, run and main
 * ```
 *
 * Between its two hooks, a node is on the current path. The current path leads from the node where
 * the search started to the node being searched. The hooks may call {@link DfsTraverser.isVisited}
 * and {@link DfsTraverser.isOnStack}, end the search at a node by returning `false` from
 * {@link DfsTraverser.enterNode}, and end the whole run with {@link DfsTraverser.stop}.
 *
 * `run()` searches from every node in ascending order, `run(startNode)` from one node and
 * `run(startNodes)` from several, such as the root nodes that {@link Graphs.rootNodes} returns. The
 * visited nodes add up over the runs of an instance: a node is visited at most once in the lifetime
 * of the instance, and a later run skips it. A hook must not start another run of the same
 * instance, which throws an `Error` (Java: `IllegalStateException`). If a run ends with an error
 * from a hook or from the search, the state of the instance is undefined: nodes of the interrupted
 * path may still count as on the path, for example. A new instance is needed for further runs.
 *
 * {@link DfsEdgeTraverser} also calls a hook for every edge, which suits searches that look at
 * edges to nodes already visited. This class calls no such hook, which makes it the faster choice
 * where node hooks suffice. {@link FrontierTraverser} searches breadth-first. Common searches are
 * ready-made, such as {@link TopOrder}, {@link EdgeTypes}, {@link BackEdges} and
 * {@link Graphs.findCycle}.
 *
 * Instances are mutable.
 *
 * **Memory:** 2 bits per node for the visited state, and up to 8 x nodeCount bytes for the stack,
 * which grows with the deepest path searched.
 */
export abstract class DfsTraverser {
  /** The graph that this traverser searches. */
  protected readonly graph: Graph;

  /** Packed per-node state: visited and on-stack flags, 2 bits per node, 16 nodes per int. */
  private readonly state: Int32Array;

  /** Explicit DFS stack of interleaved (node, resume position) frames; carries its capacity across runs. */
  private frames: Int32Array;

  /** Set by {@link stop}; cleared when a `run` call starts. */
  private stopRequested = false;

  /** Set while a `run` call is in progress, so that a hook cannot start another one. */
  private running = false;

  /**
   * Creates a traverser for `graph`, with no node visited.
   *
   * Public, unlike Java's protected constructor: the class is abstract, so only a subclass can be
   * instantiated, and a subclass without a constructor of its own stays instantiable.
   *
   * **Time:** O(nodeCount).
   *
   * @param graph the graph to search
   */
  constructor(graph: Graph) {
    this.graph = graph;
    const n = graph.nodeCount;
    this.state = new Int32Array((n >> 4) + 1);
    this.frames = DfsFrames.initial(n);
  }

  /**
   * Called when the search reaches `node`, before its out-nodes: the preorder hook.
   *
   * The search calls it once per node: for a start node, or for an unvisited out-node of the node
   * it is searching. From this call on, `node` counts as visited and is on the current path.
   * Returning `true` lets the search go on with the out-nodes of `node`. Returning `false` skips
   * them, and {@link DfsTraverser.leaveNode} follows right away; out-nodes skipped this way stay
   * unvisited unless the search reaches them from another node.
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns `true` to search from the out-nodes of `node`, `false` to skip them
   */
  protected abstract enterNode(node: number): boolean;

  /**
   * Called when the search leaves `node`, after it has searched from all its out-nodes: the
   * postorder hook. Does nothing unless overridden.
   *
   * The search calls it once for every node it has visited, right after
   * {@link DfsTraverser.enterNode} if that returned `false`. From this call on, `node` is no longer
   * on the current path. After {@link DfsTraverser.stop}, it is not called for the nodes still on
   * the path.
   *
   * @param _node node ID in `0..nodeCount-1`
   */
  protected leaveNode(_node: number): void {}

  /**
   * Returns whether the search has reached `node`, in this run or in an earlier one.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`; for any other value the method returns `false`, also
   *     for one that is not an integer
   * @returns `true` if {@link DfsTraverser.enterNode} has been called for `node`
   */
  protected isVisited(node: number): boolean {
    // A value that is not an int would read the bits of another node: false, as for one out of
    // range.
    return (node | 0) === node && ((this.state[node >> 4] >>> ((node & 0xf) << 1)) & VISITED) !== 0;
  }

  /**
   * Returns whether `node` is on the stack of the search, that is, on the current path.
   *
   * The current path leads from the node where the search started to the node being searched. A
   * node is on the path from its {@link DfsTraverser.enterNode} until its
   * {@link DfsTraverser.leaveNode}. An edge from the node being searched to a node on the path
   * closes a cycle. Outside a run, no node is on the path.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`; for any other value the method returns `false`, also
   *     for one that is not an integer
   * @returns `true` if `node` is on the current path
   */
  protected isOnStack(node: number): boolean {
    // A value that is not an int would read the bits of another node: false, as for one out of
    // range.
    return (node | 0) === node && ((this.state[node >> 4] >>> ((node & 0xf) << 1)) & ON_STACK) !== 0;
  }

  /**
   * Stops the run in progress: the run returns as soon as the hook that calls this method returns,
   * without calling another hook.
   *
   * {@link DfsTraverser.leaveNode} is not called for the nodes on the current path, but they count
   * as visited and as no longer on the path. A later run skips every node visited so far; it does
   * not go on where the stopped run ended. Called outside a run, this method has no effect.
   *
   * **Time:** O(1).
   */
  protected stop(): void {
    this.stopRequested = true;
  }

  /**
   * Searches from every node not visited yet, in ascending order, until every node is visited.
   *
   * A node that no earlier search has reached when its turn comes starts a search of its own.
   *
   * **Time:** O(nodeCount + edgeCount), plus the hooks.
   *
   * @throws Error if a depth-first path is longer than 2^30 - 5 nodes, or if called from a hook,
   *     during a run of this instance (Java: `IllegalStateException`)
   */
  run(): void;
  /**
   * Searches from `startNode`, visiting the nodes it reaches that are not visited yet.
   *
   * If `startNode` is visited already, nothing happens.
   *
   * **Time:** O(reachable nodes + reachable edges), plus the hooks.
   *
   * @param startNode node ID in `0..nodeCount-1`
   * @throws RangeError if `startNode` is out of range
   * @throws Error if a depth-first path is longer than 2^30 - 5 nodes, or if called from a hook,
   *     during a run of this instance (Java: `IllegalStateException`)
   */
  run(startNode: number): void;
  /**
   * Searches from each of `startNodes` in list order, skipping those visited already.
   *
   * The list is checked before the first hook, so a start node out of range leaves the traverser
   * unchanged. {@link DfsTraverser.stop} ends the whole call, not only the search from one start
   * node.
   *
   * **Time:** O(number of start nodes + reachable nodes + reachable edges), plus the hooks.
   *
   * @param startNodes node IDs, each in `0..nodeCount-1`; not to be changed until the call returns
   * @throws RangeError if a start node is out of range
   * @throws Error if a depth-first path is longer than 2^30 - 5 nodes, or if called from a hook,
   *     during a run of this instance (Java: `IllegalStateException`)
   */
  run(startNodes: IntList): void;
  run(start?: number | IntList): void {
    // By the number of arguments, so that a start node read past the end of an array, undefined,
    // fails the range check instead of starting the search from every node. A list is an object;
    // null goes the way of a list and fails there, as Java's null IntList.
    if (arguments.length === 0) {
      this.begin();
      try {
        for (let root = 0, n = this.graph.nodeCount; root < n; root++) {
          if (!this.dfsIfUnvisited(root)) return;
        }
      } finally {
        this.running = false;
      }
    } else if (typeof start !== "object") {
      checkIndex(start as number, this.graph.nodeCount);
      this.begin();
      try {
        this.dfsIfUnvisited(start as number);
      } finally {
        this.running = false;
      }
    } else {
      const startNodes = IntLists.asArrayLike(start);
      checkNodes(startNodes, this.graph.nodeCount);
      this.begin();
      try {
        for (let i = 0; i < startNodes.length; i++) {
          if (!this.dfsIfUnvisited(startNodes[i])) return;
        }
      } finally {
        this.running = false;
      }
    }
  }

  /** Starts a `run` call after its argument checks: rejects a call from a hook and clears an earlier stop. */
  private begin(): void {
    if (this.running) throw new Error("a run is in progress; a hook must not start another run");
    this.running = true;
    this.stopRequested = false;
  }

  /**
   * The single entry of every `run` form; false if the traversal was stopped. Reads the state
   * itself: a subclass may override {@link isVisited}, which is `final` in Java.
   */
  private dfsIfUnvisited(root: number): boolean {
    return ((this.state[root >> 4] >>> ((root & 0xf) << 1)) & VISITED) !== 0 || this.dfsFrom(root);
  }

  /** Iterative DFS from `root` (unvisited); false if the traversal was stopped. */
  private dfsFrom(root: number): boolean {
    const out = this.graph.outStart;
    const adj = this.graph.outAdj;
    const state = this.state;
    let frames = this.frames;

    const rShift = (root & 0xf) << 1;
    state[root >> 4] |= (VISITED | ON_STACK) << rShift;
    let descend = this.enterNode(root);
    if (this.stopRequested) {
      state[root >> 4] &= ~(ON_STACK << rShift);
      return false;
    }
    if (!descend) {
      state[root >> 4] &= ~(ON_STACK << rShift);
      this.leaveNode(root);
      return !this.stopRequested;
    }
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
        if (((state[v >> 4] >>> shift) & VISITED) === 0) {
          // tree edge
          state[v >> 4] |= (VISITED | ON_STACK) << shift;
          descend = this.enterNode(v);
          if (this.stopRequested) {
            state[v >> 4] &= ~(ON_STACK << shift);
            this.leaveStack(frames, top);
            return false;
          }
          if (descend) {
            frames[2 * top + 1] = i;
            if (++top === frames.length >> 1) {
              frames = DfsFrames.grow(frames, this.graph.nodeCount);
              this.frames = frames; // keep the grown capacity for later runs
            }
            frames[2 * top] = v;
            frames[2 * top + 1] = out[v];
            continue outer;
          }
          // The frame's cursor is saved only on descent; u's scan goes on from the local i.
          state[v >> 4] &= ~(ON_STACK << shift);
          this.leaveNode(v);
          if (this.stopRequested) {
            this.leaveStack(frames, top);
            return false;
          }
        }
      }
      state[u >> 4] &= ~(ON_STACK << ((u & 0xf) << 1));
      this.leaveNode(u);
      top--;
      if (this.stopRequested) {
        this.leaveStack(frames, top);
        return false;
      }
    }
    return true;
  }

  /** Clears the on-stack flag of every node in `frames[0..top]`, once per stop. */
  private leaveStack(frames: Int32Array, top: number): void {
    for (let d = 0; d <= top; d++) {
      const w = frames[2 * d];
      this.state[w >> 4] &= ~(ON_STACK << ((w & 0xf) << 1));
    }
  }
}
