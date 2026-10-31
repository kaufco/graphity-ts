import type { Graph } from "./graph.js";
import { checkIndex, checkNodes } from "./internal.js";
import { type IntList, IntLists } from "./sortedIntView.js";

/**
 * The distances of the nodes of a graph from one or several sources, with a shortest path to every
 * node reached.
 *
 * The sources are the nodes where the search starts. The distance of a node is the number of edges
 * on a shortest path to it from the nearest source. A source has distance 0, and a node that no
 * source reaches has distance `-1`. Edges are followed in their direction. For distances against
 * their direction, pass the transposed graph: `BiAdjacentGraph.of(graph).transposed()`. Here,
 * `calls` are the calls between the methods of a program, and the search finds a shortest chain of
 * calls from `main` to `parse`:
 *
 * <!-- example: traversals.ts#pathTo -->
 * ```ts
 * const fromMain = BfsDistances.of(calls, main);
 * const depth = fromMain.distanceOf(parse);
 * const chain = fromMain.pathTo(parse);
 * // depth: 3
 * // chain: [0, 2, 3, 6] - main -> run -> load -> parse
 * ```
 *
 * Uses a breadth-first search that takes the sources in list order and the out-nodes of each node
 * in ascending order. For the reachable nodes alone, {@link Graphs.reachableFrom} needs less
 * memory.
 *
 * Instances are immutable.
 *
 * **Memory:** 8 x nodeCount bytes: the distance of each node and the node before it on its
 * shortest path.
 */
export class BfsDistances {
  /** The distance of each node from the nearest source, `-1` if no source reaches it. */
  readonly #distance: Int32Array;

  /** The node before each node on its shortest path, `-1` for a source and a node not reached. */
  readonly #predecessor: Int32Array;

  readonly #maxDistance: number;

  private constructor(distance: Int32Array, predecessor: Int32Array, maxDistance: number) {
    this.#distance = distance;
    this.#predecessor = predecessor;
    this.#maxDistance = maxDistance;
  }

  /**
   * Returns the distances of the nodes of `graph` from `source`. Equivalent to
   * `of(graph, [source])`.
   *
   * **Time:** O(nodeCount + edgeCount).
   * **Memory:** as for the form with a list of sources.
   *
   * @param graph the graph to search
   * @param source node ID in `0..nodeCount-1`
   * @returns the distances
   * @throws RangeError if `source` is out of range
   */
  static of(graph: Graph, source: number): BfsDistances;
  /**
   * Returns the distances of the nodes of `graph` from the nearest of `sources`.
   *
   * A source given twice counts once, and with no sources, no node is reachable.
   *
   * **Time:** O(number of sources + nodeCount + edgeCount).
   * **Memory:** 8 x nodeCount bytes for the result; while it runs, 4 x nodeCount bytes more.
   *
   * @param graph the graph to search
   * @param sources node IDs, each in `0..nodeCount-1`
   * @returns the distances
   * @throws RangeError if a source is out of range
   */
  static of(graph: Graph, sources: IntList): BfsDistances;
  static of(graph: Graph, sourceOrSources: number | IntList): BfsDistances {
    // A list is an object; anything else is a node ID, so that undefined fails the range check.
    const sources = typeof sourceOrSources === "object" ? IntLists.asArrayLike(sourceOrSources) : [sourceOrSources];
    const n = graph.nodeCount;
    checkNodes(sources, n);
    const sourceCount = sources.length;
    const out = graph.outStart;
    const adj = graph.outAdj;
    const distance = new Int32Array(n).fill(-1);
    const predecessor = new Int32Array(n).fill(-1);
    const queue = new Int32Array(n);
    let tail = 0;
    for (let i = 0; i < sourceCount; i++) {
      const s = sources[i];
      if (distance[s] < 0) {
        distance[s] = 0;
        queue[tail++] = s;
      }
    }
    for (let head = 0; head < tail; head++) {
      const u = queue[head];
      const next = distance[u] + 1;
      for (let e = out[u], end = out[u + 1]; e < end; e++) {
        const v = adj[e];
        if (distance[v] < 0) {
          distance[v] = next;
          predecessor[v] = u;
          queue[tail++] = v;
        }
      }
    }
    const maxDistance = tail === 0 ? -1 : distance[queue[tail - 1]];
    return new BfsDistances(distance, predecessor, maxDistance);
  }

  /**
   * Returns the distance of `node`, or `-1` if no source reaches it. The distance is the number of
   * edges on a shortest path to `node` from the nearest source.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns distance, or `-1`
   * @throws RangeError if `node` is out of range
   */
  distanceOf(node: number): number {
    checkIndex(node, this.#distance.length);
    return this.#distance[node];
  }

  /**
   * Returns whether a source reaches `node`. Equivalent to `distanceOf(node) >= 0`.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns `true` if a source reaches `node`
   * @throws RangeError if `node` is out of range
   */
  isReachable(node: number): boolean {
    checkIndex(node, this.#distance.length);
    return this.#distance[node] >= 0;
  }

  /**
   * Returns a shortest path to `node` from the nearest source, or an empty array if no source
   * reaches `node`.
   *
   * The path has `distanceOf(node) + 1` nodes, with the source first and `node` last. Of several
   * shortest paths, this method returns the one that the search finds first.
   *
   * **Time:** O(distanceOf(node)).
   * **Memory:** 4 x (distanceOf(node) + 1) bytes for the result.
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns the node IDs of the path, or an empty array; a new array that must not be modified
   *     (Java: unmodifiable)
   * @throws RangeError if `node` is out of range
   */
  pathTo(node: number): Int32Array {
    checkIndex(node, this.#distance.length);
    const d = this.#distance[node];
    if (d < 0) return new Int32Array(0);
    const path = new Int32Array(d + 1);
    for (let i = d, v = node; i >= 0; i--, v = this.#predecessor[v]) path[i] = v;
    return path;
  }

  /**
   * The largest distance of a node that a source reaches, or `-1` if there are no sources (Java:
   * `maxDistance()`).
   *
   * **Time:** O(1).
   */
  get maxDistance(): number {
    return this.#maxDistance;
  }
}
