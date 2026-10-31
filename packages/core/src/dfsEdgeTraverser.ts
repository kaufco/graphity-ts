import { DfsFrames } from "./dfsFrames.js";
import type { Graph } from "./graph.js";
import { checkIndex, checkNodes } from "./internal.js";
import { type IntList, IntLists } from "./sortedIntView.js";

/**
 * The state of the target of an edge when {@link DfsEdgeTraverser.visitEdge} reports the edge
 * (Java: the enum `DfsEdgeTraverser.TargetState`; here a constant object with the ordinals of the
 * enum as values, and a type of the same name for one of them).
 */
export const TargetState = {
  /** The search has not reached the target yet. */
  UNVISITED: 0,
  /**
   * The target is on the current path - the source itself or one of its ancestors in the search -
   * so the edge closes a cycle.
   */
  ON_STACK: 1,
  /** The search has reached the target and left it, or a stopped run left it on its path. */
  FINISHED: 2,
} as const;

/** One of the three values of {@link TargetState}. */
export type TargetState = (typeof TargetState)[keyof typeof TargetState];

/**
 * What the search does with an edge that {@link DfsEdgeTraverser.visitEdge} reports (Java: the enum
 * `DfsEdgeTraverser.EdgeAction`; here a constant object with the ordinals of the enum as values,
 * and a type of the same name for one of them).
 */
export const EdgeAction = {
  /**
   * Enters the target if it is unvisited, and searches from it before the next edge; for any other
   * target, the same as {@link EdgeAction.SKIP}.
   */
  DESCEND: 0,
  /**
   * Goes on with the next edge of the source. An unvisited target stays unvisited; a later edge or
   * run may still reach it.
   */
  SKIP: 1,
  /**
   * Ends the run, as {@link DfsEdgeTraverser.stop} does. {@link DfsEdgeTraverser.leaveNode} is not
   * called for the nodes on the current path, but they count as finished afterwards; an unvisited
   * target stays unvisited.
   */
  STOP: 2,
} as const;

/** One of the three values of {@link EdgeAction}. */
export type EdgeAction = (typeof EdgeAction)[keyof typeof EdgeAction];

/** Bit 0 of a node's packed state: the node has been discovered. */
const VISITED = 0b01;

/** Bit 1 of a node's packed state: the node is currently on the DFS path (gray set). */
const ON_STACK = 0b10;

/**
 * Target state by packed flags. On-stack without visited (index 2) does not occur; it holds
 * `ON_STACK` only so that the table has no hole.
 */
const TARGET_STATES: readonly TargetState[] = [
  TargetState.UNVISITED,
  TargetState.FINISHED,
  TargetState.ON_STACK,
  TargetState.ON_STACK,
];

/**
 * The base class of a depth-first search of your own over a {@link Graph}, with a hook for every
 * edge. The hook also sees the edges to nodes already visited.
 *
 * Like {@link DfsTraverser}, it calls {@link DfsEdgeTraverser.enterNode} when the search reaches a
 * node and {@link DfsEdgeTraverser.leaveNode} when it leaves the node. In between, it reports each
 * out-edge of the node to {@link DfsEdgeTraverser.visitEdge}, in edge index order, with the state
 * of the target: {@link TargetState.UNVISITED | unvisited},
 * {@link TargetState.ON_STACK | on the current path} or {@link TargetState.FINISHED | finished}.
 * The hook returns what the search does with the edge: {@link EdgeAction.DESCEND | descend} into an
 * unvisited target and search from it before the next edge, {@link EdgeAction.SKIP | skip} the
 * edge, or {@link EdgeAction.STOP | stop} the run; any hook can stop the run with
 * {@link DfsEdgeTraverser.stop}.
 *
 * By default, the search descends into every unvisited target, and the hooks come in the order of a
 * textbook recursive depth-first search, as in {@link DfsTraverser}. The search itself runs without
 * recursion and keeps its stack on the heap. An edge to a target on the current path closes a
 * cycle. Here, `dependencies` are the dependencies between the packages of a program, and the
 * search stops at the first dependency that closes a cycle:
 *
 * <!-- example: traversals.ts#visitEdge -->
 * ```ts
 * class FirstCycle extends DfsEdgeTraverser {
 *   closingEdge = -1;
 *
 *   protected override visitEdge(
 *     source: number,
 *     target: number,
 *     edgeIndex: number,
 *     state: TargetState,
 *   ): EdgeAction {
 *     if (state === TargetState.ON_STACK) {
 *       this.closingEdge = edgeIndex;
 *       return EdgeAction.STOP;
 *     }
 *     return super.visitEdge(source, target, edgeIndex, state);
 *   }
 * }
 * const firstCycle = new FirstCycle(dependencies);
 * firstCycle.run();
 * // firstCycle.closingEdge: 10 - the edge storage -> model
 * ```
 *
 * {@link Graphs.findCycle} returns such a cycle as a list of nodes. The state of a target does not
 * tell a forward edge from a cross edge; {@link EdgeTypes} classifies every edge.
 *
 * The runs work as in {@link DfsTraverser}. The visited nodes add up over the runs of an instance.
 * A hook must not start another run of the same instance, which throws an `Error` (Java:
 * `IllegalStateException`). After a run that ends with an error, the state of the instance is
 * undefined. A search that needs no hook per edge is faster on {@link DfsTraverser}.
 *
 * Instances are mutable.
 *
 * **Memory:** 2 bits per node for the visited state, and up to 8 x nodeCount bytes for the stack,
 * which grows with the deepest path searched.
 */
export abstract class DfsEdgeTraverser {
  /** The graph that this traverser searches. */
  protected readonly graph: Graph;

  /** Packed per-node state: visited and on-stack flags, 2 bits per node, 16 nodes per int. */
  private readonly state: Int32Array;

  /** Explicit DFS stack of interleaved (node, resume position) frames. */
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
   * Called when the search reaches `node`, before its out-edges: the preorder hook. Returns `true`
   * unless overridden.
   *
   * The search calls it once per node: for a start node, or for the target of an edge for which
   * {@link DfsEdgeTraverser.visitEdge} returned {@link EdgeAction.DESCEND} while the target was
   * unvisited. From this call on, `node` counts as visited and is on the current path. Returning
   * `false` skips the out-edges of `node`: none of them is reported, and
   * {@link DfsEdgeTraverser.leaveNode} follows right away.
   *
   * @param _node node ID in `0..nodeCount-1`
   * @returns `true` to report the out-edges of `node`, `false` to skip them
   */
  protected enterNode(_node: number): boolean {
    return true;
  }

  /**
   * Called when the search leaves `node`, after all its out-edges have been reported and searched:
   * the postorder hook. Does nothing unless overridden.
   *
   * The search calls it once for every node it has visited, right after
   * {@link DfsEdgeTraverser.enterNode} if that returned `false`. From this call on, `node` is no
   * longer on the current path. After the run is stopped, it is not called for the nodes still on
   * the path.
   *
   * @param _node node ID in `0..nodeCount-1`
   */
  protected leaveNode(_node: number): void {}

  /**
   * Called for each out-edge of a node that the search has entered, with the state of its target;
   * returns what the search does with the edge.
   *
   * The search reports the out-edges of `source` in edge index order, between `enterNode(source)`
   * and `leaveNode(source)`. It reports no out-edge of a node whose `enterNode` returned `false`.
   * The state is that of the target when the edge is reported: an unvisited target that one edge
   * skips is reported as unvisited again by the next edge to it. Unless overridden, returns
   * {@link EdgeAction.DESCEND} for an unvisited target and {@link EdgeAction.SKIP} for any other. A
   * value that is not one of {@link EdgeAction}, such as `undefined`, makes the run throw an
   * `Error` (Java: a `NullPointerException` for `null`).
   *
   * @param _source the source of the edge, which is on the current path
   * @param _target the target of the edge
   * @param _edgeIndex edge index of the edge `source -> target`
   * @param state the state of `target`
   * @returns what the search does with the edge
   */
  protected visitEdge(_source: number, _target: number, _edgeIndex: number, state: TargetState): EdgeAction {
    return state === TargetState.UNVISITED ? EdgeAction.DESCEND : EdgeAction.SKIP;
  }

  /**
   * Returns whether the search has reached `node`, in this run or in an earlier one.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`; for any other value the method returns `false`, also
   *     for one that is not an integer
   * @returns `true` if {@link DfsEdgeTraverser.enterNode} has been called for `node`
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
   * node is on the path from its {@link DfsEdgeTraverser.enterNode} until its
   * {@link DfsEdgeTraverser.leaveNode}. Outside a run, no node is on the path.
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
   * It works from every hook; from {@link DfsEdgeTraverser.visitEdge}, it does the same as
   * returning {@link EdgeAction.STOP}. {@link DfsEdgeTraverser.leaveNode} is not called for the
   * nodes on the current path, but they count as finished afterwards. This includes a node whose
   * {@link DfsEdgeTraverser.enterNode} called this method. A later run skips every node visited so
   * far; it does not go on where the stopped run ended. Called outside a run, this method has no
   * effect.
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
   * unchanged. {@link EdgeAction.STOP} and {@link DfsEdgeTraverser.stop} end the whole call, not
   * only the search from one start node.
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

  private begin(): void {
    if (this.running) throw new Error("a run is in progress; a hook must not start another run");
    this.running = true;
    this.stopRequested = false;
  }

  /** As in {@link DfsTraverser}: reads the state itself rather than the overridable {@link isVisited}. */
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
        const edge = i++;
        const v = adj[edge];
        const shift = (v & 0xf) << 1;
        const flags = (state[v >> 4] >>> shift) & (VISITED | ON_STACK);
        let action = this.visitEdge(u, v, edge, TARGET_STATES[flags]);
        if (this.stopRequested) action = EdgeAction.STOP;
        if (action === EdgeAction.DESCEND) {
          if (flags !== 0) continue;
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
              this.frames = frames;
            }
            frames[2 * top] = v;
            frames[2 * top + 1] = out[v];
            continue outer;
          }
          state[v >> 4] &= ~(ON_STACK << shift);
          this.leaveNode(v);
          if (this.stopRequested) {
            this.leaveStack(frames, top);
            return false;
          }
        } else if (action === EdgeAction.STOP) {
          this.leaveStack(frames, top);
          return false;
        } else if (action !== EdgeAction.SKIP) {
          // Java's switch fails on a null action; any other value would read as SKIP here.
          throw new Error(`not an edge action: ${String(action)}`);
        }
        // SKIP: go on with the next edge.
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
