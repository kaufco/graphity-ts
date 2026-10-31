import { Csr, type Dominators, Graph } from "@kobayami/graphity-core";

/**
 * The JDK's soft maximum array length, the one array limit of the library; the package derives
 * its other limits from it. Follows `ArrayLimits.MAX_ARRAY_LENGTH` in the core, which a package
 * cannot see.
 *
 * @internal
 */
export const MAX_ARRAY_LENGTH = 0x7fffffff - 8;

/**
 * Relations of control flow that follow from `Dominators`, returned as graphs: the dominance
 * frontiers and, from them, control dependence.
 *
 * A block is control dependent on another if that block decides whether it runs. Control dependence
 * is the transposed graph of the dominance frontiers of the post-dominators. The post-dominators
 * are the dominators of the transposed graph with the exits as entries. Here, for a method `load`
 * with a for loop and an if in it, whose control flow `cfg` ends in the block `exit`:
 *
 * <!-- example: analyzingControlFlow.ts#controlDependence -->
 * ```ts
 * const postDominators = Dominators.of(BiAdjacentGraph.of(cfg).transposed(), exit);
 * const controlDependence = BiAdjacentGraph.of(
 *   ControlFlow.dominanceFrontiers(postDominators),
 * ).transposed();
 * // header -> [header, body, next]: the loop condition decides whether they run
 * // body -> [then]: the if decides whether then runs
 * ```
 *
 * For the placement of phi-nodes, {@link IteratedDominanceFrontier} answers without building the
 * dominance frontiers.
 */
export const ControlFlow = {
  /**
   * Returns the dominance frontiers as a graph: an edge `n -> m` for every node `m` in the
   * dominance frontier of `n`.
   *
   * The dominance frontier of `n` holds the nodes where its dominance ends: `m` is in it if `n`
   * dominates an in-node of `m` but does not strictly dominate `m`. A node can be in its own
   * dominance frontier, as the header of a natural loop is, so the result can have self-loops.
   * Nodes that the entries do not reach have empty dominance frontiers and are in none.
   *
   * Uses the algorithm of Cooper, Harvey and Kennedy. The result is computed anew on every call,
   * not cached: keep it to use it more than once. It can grow quadratically with the node count,
   * for example on deeply nested do-while loops.
   *
   * **Time:** O(nodeCount + edgeCount + frontierCount), where frontierCount is the number of edges
   * of the result. **Memory:** 4 x (nodeCount + frontierCount) bytes for the result; while it runs,
   * as much again and 8 x nodeCount bytes more.
   *
   * @param dominators the dominators of the control-flow graph
   * @returns the dominance frontiers, with the node IDs of the graph of `dominators`
   * @throws Error if the result would have more edges than a graph can have
   */
  dominanceFrontiers(dominators: Dominators): Graph {
    const graph = dominators.graph;
    const n = graph.nodeCount;
    const inStart = Csr.inAdjacencyStart(graph);
    const inAdj = Csr.inAdjacency(graph);
    const idom = new Int32Array(n);
    for (let node = 0; node < n; node++) {
      idom[node] = dominators.immediateDominatorOf(node);
    }

    // Walk up from every predecessor of m to just below idom(m), adding m on the way (Cooper,
    // Harvey and Kennedy). A node already holding m means the rest of the walk is done, so every
    // step adds a new pair. Run twice - count, then fill - so that each frontier comes out sorted
    // without an intermediate pair buffer.
    const lastAdded = new Int32Array(n).fill(-1);
    const start = new Int32Array(n + 1);
    let total = 0;
    for (let m = 0; m < n; m++) {
      if (!dominators.isReachable(m)) continue;
      const stop = idom[m];
      for (let i = inStart[m], end = inStart[m + 1]; i < end; i++) {
        let runner = inAdj[i];
        if (!dominators.isReachable(runner)) continue;
        while (runner !== stop && lastAdded[runner] !== m) {
          lastAdded[runner] = m;
          start[runner]++;
          total++;
          runner = idom[runner];
        }
      }
    }
    if (total > MAX_ARRAY_LENGTH) {
      throw new Error(
        `the dominance frontier relation has more than ${MAX_ARRAY_LENGTH} pairs, the largest array length`,
      );
    }
    let next = 0;
    for (let node = 0; node < n; node++) {
      const count = start[node];
      start[node] = next;
      next += count;
    }
    start[n] = next;
    const frontier = new Int32Array(next);
    lastAdded.fill(-1);
    // start[runner] doubles as write pointer and is shifted back afterwards.
    for (let m = 0; m < n; m++) {
      if (!dominators.isReachable(m)) continue;
      const stop = idom[m];
      for (let i = inStart[m], end = inStart[m + 1]; i < end; i++) {
        let runner = inAdj[i];
        if (!dominators.isReachable(runner)) continue;
        while (runner !== stop && lastAdded[runner] !== m) {
          lastAdded[runner] = m;
          frontier[start[runner]++] = m;
          runner = idom[runner];
        }
      }
    }
    for (let node = n; node > 0; node--) {
      start[node] = start[node - 1];
    }
    start[0] = 0;
    return Graph.of(start, frontier);
  },
} as const;
