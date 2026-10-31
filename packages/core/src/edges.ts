import type { EdgeType, EdgeTypes } from "./edgeTypes.js";
import type { Graph } from "./graph.js";

const NO_INTS = new Int32Array(0);

/**
 * A list of edges of a graph, each with its source, target and edge index. Algorithms such as
 * {@link BackEdges.of} and {@link Biconnectivity.bridges} return it.
 *
 * The edge at position `p`, in `0..count-1`, is `sourceNodes[p] -> targetNodes[p]`, and
 * `edgeIndices[p]` is its edge index in the graph the algorithm ran on. The edge index finds the
 * data of the edge in the caller's arrays indexed by edge index, without a search. Here, the back
 * edges of the calls between the methods of a program are its recursive calls. `names` holds the
 * names of the methods, and `siteCount` holds the number of call sites of each call, by edge index:
 *
 * <!-- example: buildingAndReading.ts#edges -->
 * ```ts
 * const recursive = BackEdges.of(calls);
 * for (let p = 0; p < recursive.count; p++) {
 *   const caller = recursive.sourceNodes[p];
 *   const callee = recursive.targetNodes[p];
 *   const edge = recursive.edgeIndices[p];
 *   console.log(`${names[caller]} -> ${names[callee]}: ${siteCount[edge]}`);
 * }
 * // parse -> parse: 2
 * // format -> format: 1
 * ```
 *
 * Each method that returns `Edges` says in which order the edges come.
 * {@link GraphBuilder.addEdges} adds them to a graph under construction.
 *
 * Each of the three lists is an `Int32Array` that must not be modified (Java: an unmodifiable
 * list). Instances are immutable.
 *
 * **Memory:** 12 bytes per edge.
 */
export class Edges {
  private static readonly EMPTY = new Edges(NO_INTS, NO_INTS, NO_INTS);

  /**
   * The source of each edge, by position (Java: `sourceNodes()`); not to be modified.
   *
   * **Time:** O(1).
   */
  readonly sourceNodes: Int32Array;

  /**
   * The target of each edge, by position (Java: `targetNodes()`); not to be modified.
   *
   * **Time:** O(1).
   */
  readonly targetNodes: Int32Array;

  /**
   * The edge index of each edge in the graph the algorithm ran on, by position (Java:
   * `edgeIndices()`); not to be modified.
   *
   * **Time:** O(1).
   */
  readonly edgeIndices: Int32Array;

  // Type-only, no field at run time: a private member makes the type nominal, so that an object of
  // the same shape is not taken for an instance, as in Java.
  declare private readonly brand: never;

  private constructor(sourceNodes: Int32Array, targetNodes: Int32Array, edgeIndices: Int32Array) {
    this.sourceNodes = sourceNodes;
    this.targetNodes = targetNodes;
    this.edgeIndices = edgeIndices;
  }

  /** @internal The three lists must have the same length and be held by nobody else. */
  static create(sourceNodes: Int32Array, targetNodes: Int32Array, edgeIndices: Int32Array): Edges {
    return new Edges(sourceNodes, targetNodes, edgeIndices);
  }

  /**
   * Returns the edges of one type from an edge classification, in edge index order.
   *
   * Each call goes through every edge, however few have the type: call it once per type and keep
   * the result.
   *
   * **Time:** O(nodeCount + edgeCount).
   * **Memory:** 12 bytes per edge of the result.
   *
   * @param edgeTypes the classification of the edges of a graph
   * @param type the edge type to collect
   * @returns the edges of type `type`
   * @throws Error if `type` is not one of {@link EdgeType}; this includes `undefined` and `null`
   *     (Java: `NullPointerException` for `null`)
   */
  static of(edgeTypes: EdgeTypes, type: EdgeType): Edges {
    // A value outside the enum, such as a misspelled EdgeType.BAK, would otherwise collect no edge.
    if (!(type >= 0 && type <= 3) || (type | 0) !== type) throw new Error(`not an edge type: ${String(type)}`);
    // Counts the edges of the type first, so that the arrays of the result get their exact length,
    // then fills them in one scan over all edges.
    const graph = edgeTypes.graph;
    const types = edgeTypes.types;
    let count = 0;
    for (let e = 0; e < types.length; e++) {
      if (types[e] === type) count++;
    }
    if (count === 0) return Edges.EMPTY;
    const sources = new Int32Array(count);
    const targets = new Int32Array(count);
    const edgeIndices = new Int32Array(count);
    const adjacency = graph.outAdj;
    const adjacencyStart = graph.outStart;
    const n = graph.nodeCount;
    let p = 0;
    for (let node = 0; node < n; node++) {
      for (let e = adjacencyStart[node], end = adjacencyStart[node + 1]; e < end; e++) {
        if (types[e] === type) {
          sources[p] = node;
          targets[p] = adjacency[e];
          edgeIndices[p] = e;
          p++;
        }
      }
    }
    return new Edges(sources, targets, edgeIndices);
  }

  /** @internal The empty list. */
  static empty(): Edges {
    return Edges.EMPTY;
  }

  /**
   * The number of edges (Java: `count()`).
   *
   * **Time:** O(1).
   */
  get count(): number {
    return this.sourceNodes.length;
  }

  /**
   * Whether there are no edges. Equivalent to `count === 0` (Java: `isEmpty()`).
   *
   * **Time:** O(1).
   */
  get isEmpty(): boolean {
    return this.sourceNodes.length === 0;
  }

  /**
   * @internal Orders `count` edges of `graph`, given as three parallel arrays in their direction in
   * the graph, by source and then target - which is edge index order -, optionally dropping
   * repeated edges. An edge index of `-1` is looked up with one binary search in the source's
   * adjacency. Two stable counting passes, first by target, then by source: O(nodeCount + count)
   * without comparisons. Input that is already in order, or in exactly reverse order, is copied
   * instead; the check stops at the first edge out of line.
   *
   * **Memory:** 4 x nodeCount bytes for the counts and 24 x count bytes for the intermediate and
   * final lists.
   */
  static sortedEdges(
    graph: Graph,
    sources: Int32Array,
    targets: Int32Array,
    edgeIndices: Int32Array,
    count: number,
    dropDuplicates: boolean,
  ): Edges {
    if (count === 0) return Edges.EMPTY;
    let sortedSources = new Int32Array(count);
    let sortedTargets = new Int32Array(count);
    let sortedEdgeIndices = new Int32Array(count);
    const order = direction(sources, targets, count);
    if (order > 0) {
      sortedSources.set(sources.subarray(0, count));
      sortedTargets.set(targets.subarray(0, count));
      sortedEdgeIndices.set(edgeIndices.subarray(0, count));
    } else if (order < 0) {
      for (let i = 0, from = count - 1; i < count; i++, from--) {
        sortedSources[i] = sources[from];
        sortedTargets[i] = targets[from];
        sortedEdgeIndices[i] = edgeIndices[from];
      }
    } else {
      countingSort(
        sources,
        targets,
        edgeIndices,
        count,
        graph.nodeCount,
        sortedSources,
        sortedTargets,
        sortedEdgeIndices,
      );
    }
    let kept = count;
    if (dropDuplicates) {
      kept = 0;
      for (let i = 0; i < count; i++) {
        if (kept > 0 && sortedSources[kept - 1] === sortedSources[i] && sortedTargets[kept - 1] === sortedTargets[i]) {
          if (sortedEdgeIndices[kept - 1] < 0) sortedEdgeIndices[kept - 1] = sortedEdgeIndices[i];
          continue;
        }
        sortedSources[kept] = sortedSources[i];
        sortedTargets[kept] = sortedTargets[i];
        sortedEdgeIndices[kept] = sortedEdgeIndices[i];
        kept++;
      }
    }
    if (kept < count) {
      sortedSources = sortedSources.slice(0, kept);
      sortedTargets = sortedTargets.slice(0, kept);
      sortedEdgeIndices = sortedEdgeIndices.slice(0, kept);
    }
    for (let p = 0; p < kept; p++) {
      if (sortedEdgeIndices[p] < 0) sortedEdgeIndices[p] = graph.edgeIndexOf(sortedSources[p], sortedTargets[p]);
    }
    return new Edges(sortedSources, sortedTargets, sortedEdgeIndices);
  }
}

/** `1` if the edges are in order, `-1` if exactly reversed, else `0`. */
function direction(sources: Int32Array, targets: Int32Array, count: number): number {
  let result = 0;
  for (let i = 1; i < count; i++) {
    const bySource = Math.sign(sources[i - 1] - sources[i]);
    const step = bySource !== 0 ? bySource : Math.sign(targets[i - 1] - targets[i]);
    if (step === 0) continue;
    const sign = step < 0 ? 1 : -1;
    if (result === 0) {
      result = sign;
    } else if (result !== sign) {
      return 0;
    }
  }
  return result === 0 ? 1 : result;
}

/** Two stable counting passes, by target and then by source, into the given arrays. */
function countingSort(
  sources: Int32Array,
  targets: Int32Array,
  edgeIndices: Int32Array,
  count: number,
  nodeCount: number,
  sortedSources: Int32Array,
  sortedTargets: Int32Array,
  sortedEdgeIndices: Int32Array,
): void {
  const start = new Int32Array(nodeCount + 1);
  for (let i = 0; i < count; i++) start[targets[i] + 1]++;
  for (let v = 0; v < nodeCount; v++) start[v + 1] += start[v];
  const byTargetSources = new Int32Array(count);
  const byTargetTargets = new Int32Array(count);
  const byTargetEdgeIndices = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const slot = start[targets[i]]++;
    byTargetSources[slot] = sources[i];
    byTargetTargets[slot] = targets[i];
    byTargetEdgeIndices[slot] = edgeIndices[i];
  }
  start.fill(0);
  for (let i = 0; i < count; i++) start[byTargetSources[i] + 1]++;
  for (let v = 0; v < nodeCount; v++) start[v + 1] += start[v];
  for (let i = 0; i < count; i++) {
    const source = byTargetSources[i];
    const slot = start[source]++;
    sortedSources[slot] = source;
    sortedTargets[slot] = byTargetTargets[i];
    sortedEdgeIndices[slot] = byTargetEdgeIndices[i];
  }
}
