import { BitSet } from "./bitSet.js";
import type { Graph } from "./graph.js";
import { IntBuffer, checkIndex, checkNodes } from "./internal.js";
import { type IntList, IntLists } from "./sortedIntView.js";

/**
 * The base class of a breadth-first search of your own over a {@link Graph}, or of any search that
 * works off a queue of nodes and chooses which nodes enter it.
 *
 * The queue is called the frontier and works first in first out. The traverser calls
 * {@link FrontierTraverser.visitNode} for each node in the order in which it entered the frontier.
 * The `run` methods put the start nodes into the frontier. The hook puts in the nodes that come
 * next: the out-nodes of a node with {@link FrontierTraverser.enqueueChildren}, or a single node
 * with {@link FrontierTraverser.enqueue}. A node counts as visited from the moment it enters the
 * frontier, so it enters the frontier at most once. From a node for which the hook enqueues
 * nothing, the search goes no further. With `enqueueChildren(node)` in every `visitNode(node)`, the
 * traversal is a breadth-first search.
 *
 * The nodes come in levels: the start nodes form level 0, and the nodes that enter the frontier
 * while level `k` is visited form level `k + 1`. In a breadth-first search, those are the nodes at
 * distance `k + 1` from the nearest start node. {@link FrontierTraverser.currentLevel} is the level
 * of the node being visited, and {@link FrontierTraverser.leaveLevel} is called after the last node
 * of each level. Here, `calls` are the calls between the methods of a program, and the search
 * follows them from `main` for two levels:
 *
 * <!-- example: traversals.ts#currentLevel -->
 * ```ts
 * class WithinTwoCalls extends FrontierTraverser {
 *   readonly reached: number[] = [];
 *
 *   protected visitNode(method: number): void {
 *     this.reached.push(method);
 *     if (this.currentLevel < 2) {
 *       this.enqueueChildren(method);
 *     }
 *   }
 * }
 * const withinTwoCalls = new WithinTwoCalls(calls);
 * withinTwoCalls.run(main);
 * // withinTwoCalls.reached: [0, 1, 2, 3, 4, 5] - main, parseArgs, run, load, save and
 * // show
 * ```
 *
 * When `visitNode` returns, the nodes it enqueued are still waiting in the frontier: unlike
 * {@link DfsTraverser}, this traverser has no postorder. A hook can end the whole run with
 * {@link FrontierTraverser.stop}.
 *
 * `run()` searches from every node in ascending order, `run(startNode)` from one node and
 * `run(startNodes)` from several, such as the root nodes that {@link Graphs.rootNodes} returns. The
 * visited nodes add up over the runs of an instance: a node is visited at most once in the lifetime
 * of the instance, and a later run skips it. Nodes enqueued outside a run come first in the next
 * run. A subclass can also keep nodes out of the search by marking them in
 * {@link FrontierTraverser.visited}.
 *
 * A hook must not start another run of the same instance, which throws an `Error` (Java:
 * `IllegalStateException`). If a run ends with an error from a hook or from the search, the state
 * of the instance is undefined: a later run may visit the rest of the frontier, for example. A new
 * instance is needed for further runs. {@link BfsDistances} and {@link Graphs.reachableFrom} are
 * ready-made breadth-first searches.
 *
 * Instances are mutable.
 *
 * **Memory:** 1 bit per node for the visited nodes, and 4 to 6 bytes for every node that has
 * entered the frontier, which keeps them all: up to 6 x nodeCount bytes.
 */
export abstract class FrontierTraverser {
  /** The graph that this traverser searches. */
  protected readonly graph: Graph;

  /**
   * The visited nodes, one bit per node ID: a bit is set when its node enters the frontier.
   *
   * A subclass may set bits to keep nodes out of the search, also before the first run: a node
   * whose bit is set counts as visited and no longer enters the frontier, neither from a `run`
   * method nor from {@link FrontierTraverser.enqueue} or {@link FrontierTraverser.enqueueChildren}.
   * A node already in the frontier is visited all the same. A subclass must not clear a bit; what
   * happens then is not specified.
   */
  protected readonly visited: BitSet;

  private readonly frontier = new IntBuffer();
  private cursor = 0;
  private level = 0;

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
    this.visited = new BitSet(graph.nodeCount);
  }

  /**
   * Called for each node of the frontier, in the order in which the nodes entered it.
   *
   * The hook puts the nodes that come next into the frontier: `enqueueChildren(node)` for a
   * breadth-first search, {@link FrontierTraverser.enqueue} for single nodes, or nothing to end the
   * search at `node`. They join the next level and are visited after the rest of the current one.
   *
   * @param node node ID in `0..nodeCount-1`
   */
  protected abstract visitNode(node: number): void;

  /**
   * Puts the out-nodes of `node` that are not visited yet into the frontier, in ascending order,
   * and marks them visited.
   *
   * Called from `visitNode(node)`, it makes the traversal a breadth-first search. Called outside a
   * run, it adds the nodes to the next run, as {@link FrontierTraverser.enqueue} does.
   *
   * **Time:** O(outDegree(node)).
   *
   * @param node node ID in `0..nodeCount-1`
   * @throws RangeError if `node` is out of range
   */
  protected enqueueChildren(node: number): void {
    const adjacency = this.graph.outAdj;
    const adjacencyStart = this.graph.outStart;
    // Java's array accesses fail for a node out of range, at node + 1 or else at node; here a read
    // past the offsets would enqueue nothing. The same checks give Java's messages.
    checkIndex(node + 1, adjacencyStart.length);
    checkIndex(node, adjacencyStart.length);
    const visited = this.visited;
    for (let i = adjacencyStart[node], end = adjacencyStart[node + 1]; i < end; i++) {
      const child = adjacency[i];
      if (!visited.get(child)) {
        visited.set(child);
        this.frontier.push(child);
      }
    }
  }

  /**
   * Puts `node` into the frontier and marks it visited, unless it is visited already.
   *
   * Called from a hook, it adds `node` to the next level. Called outside a run, it adds `node` to
   * the next run: the nodes enqueued then come first in its level 0, ahead of its start nodes, and
   * `run()` visits them before it starts from a node of its own.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns `true` if `node` was not visited and is now in the frontier
   * @throws RangeError if `node` is out of range
   */
  protected enqueue(node: number): boolean {
    checkIndex(node, this.graph.nodeCount);
    return this.enqueueUnchecked(node);
  }

  private enqueueUnchecked(node: number): boolean {
    if (this.visited.get(node)) return false;
    this.visited.set(node);
    this.frontier.push(node);
    return true;
  }

  /**
   * Returns whether `node` is visited: it has entered the frontier, or a subclass has marked it in
   * {@link FrontierTraverser.visited}.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`; for a larger value the method returns `false`, and for
   *     a negative one or one that is not an integer it throws a `RangeError`
   * @returns `true` if `node` is visited
   */
  protected isVisited(node: number): boolean {
    return this.visited.get(node);
  }

  /**
   * The level of the node being visited: 0 for the start nodes, `k + 1` for the nodes that entered
   * the frontier while level `k` was visited (Java: `currentLevel()`).
   *
   * In {@link FrontierTraverser.leaveLevel}, it is the level just completed. Outside a run, the
   * value has no meaning.
   *
   * **Time:** O(1).
   */
  protected get currentLevel(): number {
    return this.level;
  }

  /**
   * Called after the last node of a level has been visited, before the first node of the next
   * level. Does nothing unless overridden.
   *
   * Nodes enqueued here join the next level, which then follows even if the completed level
   * enqueued nothing.
   *
   * @param _level the level just completed
   */
  protected leaveLevel(_level: number): void {}

  /**
   * Stops the run in progress: the run returns as soon as the hook that calls this method returns,
   * without calling another hook.
   *
   * The nodes still waiting in the frontier are dropped from it, but stay marked visited, so no
   * later run visits them. A later run skips every node visited so far. Called outside a run, this
   * method has no effect.
   *
   * **Time:** O(1).
   */
  protected stop(): void {
    this.stopRequested = true;
  }

  /**
   * Searches from every node not visited yet, in ascending order, until every node is visited.
   *
   * Nodes enqueued before the call come first, as a level 0 of their own. Then each node that no
   * earlier search has reached when its turn comes starts a search of its own, with levels counted
   * from 0 again.
   *
   * **Time:** O(nodeCount), plus the hooks: O(nodeCount + edgeCount) for a breadth-first search.
   *
   * @throws Error if called from a hook, during a run of this instance (Java:
   *     `IllegalStateException`)
   */
  run(): void;
  /**
   * Searches from `startNode` and from the nodes enqueued before the call, visiting the nodes they
   * reach that are not visited yet.
   *
   * Level 0 holds the nodes enqueued before the call, then `startNode` unless it is visited
   * already.
   *
   * **Time:** O(nodes visited), plus the hooks: O(reachable nodes + reachable edges) for a
   * breadth-first search.
   *
   * @param startNode node ID in `0..nodeCount-1`
   * @throws RangeError if `startNode` is out of range
   * @throws Error if called from a hook, during a run of this instance (Java:
   *     `IllegalStateException`)
   */
  run(startNode: number): void;
  /**
   * Searches from `startNodes` and from the nodes enqueued before the call, visiting the nodes they
   * reach that are not visited yet.
   *
   * Level 0 holds the nodes enqueued before the call, then the start nodes in list order, skipping
   * those visited already. The list is checked first, so a start node out of range leaves the
   * traverser unchanged.
   *
   * **Time:** O(number of start nodes + nodes visited), plus the hooks: O(number of start nodes +
   * reachable nodes + reachable edges) for a breadth-first search.
   *
   * @param startNodes node IDs, each in `0..nodeCount-1`
   * @throws RangeError if a start node is out of range
   * @throws Error if called from a hook, during a run of this instance (Java:
   *     `IllegalStateException`)
   */
  run(startNodes: IntList): void;
  run(start?: number | IntList): void {
    // By the number of arguments, so that a start node read past the end of an array, undefined,
    // fails the range check instead of starting the search from every node. A list is an object;
    // null goes the way of a list and fails there, as Java's null IntList.
    if (arguments.length === 0) {
      this.begin();
      try {
        // Nodes enqueued outside a run first; an empty frontier calls no hook.
        if (!this.processFrontier()) return;
        const n = this.graph.nodeCount;
        let root = this.visited.nextClearBit(0);
        while (root < n) {
          this.enqueueUnchecked(root);
          if (!this.processFrontier()) return;
          root = this.visited.nextClearBit(root + 1);
        }
      } finally {
        this.running = false;
      }
    } else if (typeof start !== "object") {
      checkIndex(start as number, this.graph.nodeCount);
      this.begin();
      try {
        this.enqueueUnchecked(start as number);
        this.processFrontier();
      } finally {
        this.running = false;
      }
    } else {
      const startNodes = IntLists.asArrayLike(start);
      checkNodes(startNodes, this.graph.nodeCount);
      this.begin();
      try {
        for (let i = 0; i < startNodes.length; i++) this.enqueueUnchecked(startNodes[i]);
        this.processFrontier();
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

  /**
   * Processes the frontier one level per round and fires {@link leaveLevel} after each.
   *
   * @returns false if the traversal was stopped
   */
  private processFrontier(): boolean {
    const frontier = this.frontier;
    this.level = 0;
    while (this.cursor < frontier.length) {
      const levelEnd = frontier.length;
      while (this.cursor < levelEnd) {
        this.visitNode(frontier.data[this.cursor++]);
        if (this.stopRequested) {
          this.cursor = frontier.length;
          return false;
        }
      }
      this.leaveLevel(this.level);
      if (this.stopRequested) {
        this.cursor = frontier.length;
        return false;
      }
      this.level++;
    }
    return true;
  }
}
