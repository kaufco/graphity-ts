import { ArrayLimits } from "./arrayLimits.js";
import { DfsFrames } from "./dfsFrames.js";
import { Graph } from "./graph.js";
import { IntBuffer, checkIndex, checkLength, sortRange } from "./internal.js";
import { IndexMapping, type TypedArray, checkDistinct } from "./mapping.js";
import { ParentForest } from "./parentForest.js";
import { SortedIntView } from "./sortedIntView.js";

/**
 * A partition of indices into groups: the common base of {@link NodePartition} and
 * {@link EdgePartition}.
 *
 * The indices are node IDs or edge indices. Each index is in at most one group, and the groups are
 * numbered by group ID `0..groupCount-1`. {@link IndexMapping.get | `get(i)`} returns the group
 * of index `i`, or `-1` if it is in no group, and {@link IndexPartition.indicesOf} the indices of a
 * group in ascending order. {@link IndexPartition.reduce} combines data on the indices into one
 * value per group. The data is an array indexed by node ID or edge index.
 *
 * A partition is a mapping from indices to groups that maps several indices to the same group, so
 * unlike a {@link NodeMapping} or an {@link EdgeMapping}, it cannot be inverted.
 *
 * Instances are immutable.
 *
 * **Memory:** 4 x (indexCount + mappedCount + groupCount) bytes, where mappedCount is the number of
 * indices that belong to a group.
 */
export abstract class IndexPartition extends IndexMapping {
  /**
   * @internal The indices of all groups, group after group, ascending within each: the indices of
   * group `g` are `members[memberStart[g]..memberStart[g + 1] - 1]`.
   */
  readonly members: Int32Array;

  /** @internal Where the indices of each group start in {@link IndexPartition.members}, followed by their count. */
  readonly memberStart: Int32Array;

  // Protected rather than private because the node and edge partitions extend IndexPartition;
  // hidden in the API documentation, as Javadoc leaves out Java's package-private constructor.
  /** @hidden */
  protected constructor(mapping: Int32Array, members: Int32Array, memberStart: Int32Array) {
    super(mapping, members.length);
    this.members = members;
    this.memberStart = memberStart;
  }

  /**
   * The number of groups.
   *
   * **Time:** O(1).
   */
  get groupCount(): number {
    return this.memberStart.length - 1;
  }

  /**
   * Returns the indices in group `groupId`, in ascending order.
   *
   * The result is a view of this partition's own array, not a copy.
   *
   * **Time:** O(1).
   *
   * @param groupId group ID in `0..groupCount-1`
   * @returns indices in the group
   * @throws RangeError if `groupId` is out of range
   */
  indicesOf(groupId: number): SortedIntView {
    checkIndex(groupId, this.memberStart.length - 1);
    return SortedIntView.create(this.members, this.memberStart[groupId], this.memberStart[groupId + 1]);
  }

  /**
   * Returns the number of indices in group `groupId`.
   *
   * **Time:** O(1).
   *
   * @param groupId group ID in `0..groupCount-1`
   * @returns size of the group
   * @throws RangeError if `groupId` is out of range
   */
  sizeOf(groupId: number): number {
    checkIndex(groupId, this.memberStart.length - 1);
    return this.memberStart[groupId + 1] - this.memberStart[groupId];
  }

  /**
   * Returns one value per group, combined from the values of its indices. The result is a typed
   * array of the type of `values` (Java: the `int[]` and `double[]` forms; here any typed array of
   * numbers).
   *
   * For each group, starts from `identity` and combines the result so far with the value of each
   * index in the group, in ascending order of the indices. A group without indices gets
   * `identity`, and the values of indices in no group are left out. Each step is stored in the
   * element type, so an `Int32Array` wraps at 32 bits like Java's `int`, and a `Float64Array`
   * computes in `double` like Java. Here, `byPackageCall` groups the calls between the methods of a
   * program by the call between packages that each belongs to (see {@link EdgePartition}), and the
   * call sites in `siteCount` are summed per call between packages:
   *
   * <!-- example: partitions.ts#reduce -->
   * ```ts
   * const packageSiteCount = byPackageCall.reduce(
   *   siteCount,
   *   0,
   *   (sum, count) => sum + count,
   * );
   * // 2 for app -> ui, app -> service, service -> model and service -> storage,
   * // 1 for app -> cli and ui -> model
   * ```
   *
   * **Time:** O(indexCount + groupCount).
   * **Memory:** one element per group for the result: 4 x groupCount bytes for an `Int32Array`,
   * 8 x groupCount bytes for a `Float64Array`.
   *
   * @param values the value of each index; length {@link IndexMapping.indexCount}
   * @param identity the start value of each group
   * @param combine called with the result so far and the value of the next index, returns the two
   *     combined
   * @returns one value per group, by group ID
   * @throws Error if `values.length !== indexCount`
   */
  reduce<A extends Exclude<TypedArray, BigInt64Array | BigUint64Array>>(
    values: A,
    identity: number,
    combine: (accumulated: number, value: number) => number,
  ): A;
  /**
   * Returns one value per group, combined from the values of its indices, as the `Int32Array` form
   * does. Each step is stored in a `BigInt64Array`, so it wraps at 64 bits like Java's `long`.
   *
   * **Time:** O(indexCount + groupCount).
   * **Memory:** 8 x groupCount bytes for the result.
   *
   * @param values the value of each index; length {@link IndexMapping.indexCount}
   * @param identity the start value of each group
   * @param combine called with the result so far and the value of the next index, returns the two
   *     combined
   * @returns one value per group, by group ID
   * @throws Error if `values.length !== indexCount`
   */
  reduce(
    values: BigInt64Array,
    identity: bigint,
    combine: (accumulated: bigint, value: bigint) => bigint,
  ): BigInt64Array;
  /**
   * Returns one value per group, combined from the values of its indices, as the `BigInt64Array`
   * form does. This is the form for unsigned 64-bit values. It is not in Java, which has no
   * unsigned `long`.
   *
   * **Time:** O(indexCount + groupCount).
   * **Memory:** 8 x groupCount bytes for the result.
   *
   * @throws Error if `values.length !== indexCount`
   */
  reduce(
    values: BigUint64Array,
    identity: bigint,
    combine: (accumulated: bigint, value: bigint) => bigint,
  ): BigUint64Array;
  /**
   * Writes one value per group into `groupValues`, combined from the values of the indices of that
   * group. This is the form of `reduce` for values of any kind (Java: the `T[]` form). The second
   * argument selects this form, as in Java's overload resolution: the values may be in any
   * array-like, also in a typed array.
   *
   * For each group, starts from the value of its first index and combines the result so far with
   * the value of each further index, in ascending order of the indices. A group without indices
   * keeps its entry in `groupValues`, and the values of indices in no group are left out.
   *
   * **Time:** O(indexCount + groupCount).
   *
   * @param values the value of each index; length {@link IndexMapping.indexCount}
   * @param groupValues receives one value per group, by group ID; length
   *     {@link IndexPartition.groupCount}, and not the same array as `values`
   * @param combine called with the result so far and the value of the next index, returns the two
   *     combined
   * @throws Error if `values.length !== indexCount`, `groupValues.length !== groupCount`, or both
   *     are the same array
   */
  reduce<T>(values: ArrayLike<T>, groupValues: T[], combine: (accumulated: T, value: T) => T): void;
  reduce(
    values: TypedArray | ArrayLike<unknown>,
    identityOrGroupValues: unknown,
    combine: (accumulated: never, value: never) => unknown,
  ): TypedArray | undefined {
    const fold = combine as (accumulated: unknown, value: unknown) => unknown;
    const members = this.members;
    const memberStart = this.memberStart;
    const groups = memberStart.length - 1;
    // Java picks the T[] overload by the second argument, and so does this: an array there is
    // groupValues, whatever holds the values.
    if (!Array.isArray(identityOrGroupValues)) {
      if (!ArrayBuffer.isView(values)) throw new Error("reduce of an array that is not typed needs groupValues");
      const typed = values as unknown as unknown[] & TypedArray;
      checkLength(typed.length, this.indexCount, "values");
      const Type = typed.constructor as new (length: number) => unknown[];
      const result = new Type(groups);
      // Every step goes through the element type, as Java's int and long arithmetic would.
      const step = new Type(1);
      for (let g = 0; g < groups; g++) {
        step[0] = identityOrGroupValues;
        for (let i = memberStart[g], end = memberStart[g + 1]; i < end; i++) {
          step[0] = fold(step[0], typed[members[i]]);
        }
        result[g] = step[0];
      }
      return result as unknown as TypedArray;
    }
    const groupValues = identityOrGroupValues as unknown[];
    checkDistinct(values, groupValues, "groupValues");
    checkLength(values.length, this.indexCount, "values");
    checkLength(groupValues.length, groups, "groupValues");
    for (let g = 0; g < groups; g++) {
      let i = memberStart[g];
      const end = memberStart[g + 1];
      if (i === end) continue;
      let acc = values[members[i]];
      for (i++; i < end; i++) acc = fold(acc, values[members[i]]);
      groupValues[g] = acc;
    }
    return undefined;
  }
}

/**
 * A partition of the nodes of a graph into groups, such as its components.
 *
 * {@link IndexMapping.get | `get(node)`} returns the group of `node`, or `-1` if it is in no group,
 * and {@link NodePartition.nodesOf} the nodes of a group in ascending order. {@link Components}
 * returns partitions into components, in which every node is in exactly one group: an {@link Sccs}
 * for the strongly connected components, a plain `NodePartition` for the weakly connected ones.
 * {@link NodePartition.of} takes groups of the caller's choice, which may leave nodes out.
 *
 * A partition holds the graph whose nodes it partitions. {@link NodePartition.condense} builds the
 * condensed graph, with a node for each group and an edge between two groups wherever an edge of
 * the graph runs between them. {@link Graphs.edgePartition} builds the {@link EdgePartition} that
 * tells which edges of the graph are behind each edge of the condensed graph. The methods for
 * groups of any kind, such as {@link IndexPartition.groupCount}, {@link IndexPartition.sizeOf} and
 * {@link IndexPartition.reduce}, come from {@link IndexPartition}.
 *
 * Instances are immutable.
 *
 * **Memory:** 4 x (nodeCount + mappedCount + groupCount) bytes, where mappedCount is the number of
 * nodes that belong to a group; the graph is shared, not copied.
 */
export class NodePartition extends IndexPartition {
  /** @internal The graph whose nodes are partitioned. */
  readonly graph: Graph;

  // Protected rather than private because Sccs extends NodePartition; hidden in the API
  // documentation, as Javadoc leaves out Java's package-private constructor.
  /** @hidden */
  protected constructor(graph: Graph, nodeToGroup: Int32Array, members: Int32Array, memberStart: Int32Array) {
    super(nodeToGroup, members, memberStart);
    this.graph = graph;
  }

  /** @internal Takes the arrays as they are. */
  static create(graph: Graph, nodeToGroup: Int32Array, members: Int32Array, memberStart: Int32Array): NodePartition {
    return new NodePartition(graph, nodeToGroup, members, memberStart);
  }

  /**
   * Returns a partition of the nodes of `graph` into groups of the caller's choice.
   *
   * `groupOf[node]` is the group of each node, in `0..groupCount-1`, or `-1` for a node in no
   * group; the array is copied. A group may have no nodes: it becomes a node without edges in
   * {@link NodePartition.condense}, so that group IDs from a numbering of the caller stay valid.
   * Here, `packageOf` holds the package of each method of `calls` as a node ID of the package graph
   * `dependencies`, and the condensed graph shows which packages call which:
   *
   * <!-- example: partitions.ts#of -->
   * ```ts
   * const byPackage = NodePartition.of(calls, packageOf, dependencies.nodeCount);
   * const packageCalls = byPackage.condense();
   * // packageCalls: app -> [cli, ui, service], ui -> [model], service -> [model, storage]
   * ```
   *
   * **Time:** O(nodeCount + groupCount).
   * **Memory:** 4 x (nodeCount + mappedCount + groupCount) bytes for the result.
   *
   * @param graph the graph whose nodes are partitioned
   * @param groupOf the group of each node, or `-1`; length `graph.nodeCount`; any array of numbers
   * @param groupCount the number of groups, at most as many as a graph can have nodes
   * @returns the partition
   * @throws RangeError if a group is not in `-1..groupCount-1`, which includes one that is not an
   *     integer
   * @throws Error if `groupOf.length !== graph.nodeCount`, or `groupCount` is not an integer, is
   *     negative or larger than a graph can have nodes
   */
  static of(graph: Graph, groupOf: ArrayLike<number>, groupCount: number): NodePartition {
    const n = graph.nodeCount;
    checkLength(groupOf.length, n, "groupOf");
    if (!(groupCount >= 0 && groupCount <= ArrayLimits.MAX_NODE_COUNT) || (groupCount | 0) !== groupCount) {
      throw new Error(`groupCount out of range: ${groupCount}`);
    }
    const nodeToGroup = new Int32Array(n);
    // Counted here rather than in ParentForest.groupIndices, so that the range check needs no
    // pass of its own.
    const memberStart = new Int32Array(groupCount + 1);
    for (let node = 0; node < n; node++) {
      const group = groupOf[node];
      if (!(group >= -1 && group < groupCount) || (group | 0) !== group) {
        throw new RangeError(`group of node ${node} is ${group}, outside -1..${groupCount - 1}`);
      }
      if (group >= 0) memberStart[group]++;
      nodeToGroup[node] = group;
    }
    const members = ParentForest.groupCounted(nodeToGroup, memberStart);
    return new NodePartition(graph, nodeToGroup, members, memberStart);
  }

  /**
   * The number of nodes of the partitioned graph, in a group or not. Equivalent to
   * {@link IndexMapping.indexCount}.
   *
   * **Time:** O(1).
   */
  get nodeCount(): number {
    return this.indexCount;
  }

  /**
   * Returns the nodes in group `groupId`, in ascending order. Equivalent to
   * `indicesOf(groupId)`.
   *
   * The result is a view of this partition's own array, not a copy.
   *
   * **Time:** O(1).
   *
   * @param groupId group ID in `0..groupCount-1`
   * @returns nodes in the group
   * @throws RangeError if `groupId` is out of range
   */
  nodesOf(groupId: number): SortedIntView {
    return this.indicesOf(groupId);
  }

  /**
   * Returns the condensed graph, with a node for each group and an edge between two groups wherever
   * an edge of the partitioned graph runs between them.
   *
   * The node IDs of the condensed graph are the group IDs. It has the edge `g -> h` if a node in
   * group `g` has an out-node in group `h` and `g !== h`. Edges within a group and edges from or to
   * a node in no group are left out. The edges from one group to another become a single edge.
   * {@link Graphs.edgePartition} tells which edges are behind each edge of the condensed graph. For
   * an {@link Sccs}, the condensed graph is acyclic.
   *
   * The condensed graph is built anew on every call, not cached: keep the result to use it more
   * than once.
   *
   * **Time:** O(nodeCount + edgeCount + groupCount), plus O(d log d) for each group with d
   * out-nodes in the result.
   * **Memory:** 4 x (groupCount + condensedEdgeCount) bytes for the result, where
   * condensedEdgeCount is its edge count; while it runs, 1 bit per group and up to
   * 6 x condensedEdgeCount bytes more.
   *
   * @returns the condensed graph
   */
  condense(): Graph {
    const groups = this.groupCount;
    const nodeToGroup = this.mapping;
    const members = this.members;
    const memberStart = this.memberStart;
    const adjacency = this.graph.outAdj;
    const adjacencyStart = this.graph.outStart;
    const condensedStart = new Int32Array(groups + 1);
    const condensedTargets = new IntBuffer();
    // Own bit array, so that clearing costs one write per emitted edge.
    const seen = new Int32Array((groups >> 5) + 1);

    for (let g = 0; g < groups; g++) {
      const groupStart = condensedTargets.length;
      condensedStart[g] = groupStart;
      for (let ni = memberStart[g], nodesEnd = memberStart[g + 1]; ni < nodesEnd; ni++) {
        const u = members[ni];
        for (let ei = adjacencyStart[u], edgeEnd = adjacencyStart[u + 1]; ei < edgeEnd; ei++) {
          const tgtGroup = nodeToGroup[adjacency[ei]];
          if (tgtGroup !== g && tgtGroup >= 0 && (seen[tgtGroup >>> 5] & (1 << (tgtGroup & 31))) === 0) {
            seen[tgtGroup >>> 5] |= 1 << (tgtGroup & 31);
            condensedTargets.push(tgtGroup);
          }
        }
      }
      // The bits set above are exactly the group's emitted targets; zeroing the whole word is safe,
      // because every set bit in it belongs to this group.
      const groupEnd = condensedTargets.length;
      const elements = condensedTargets.data;
      for (let i = groupStart; i < groupEnd; i++) seen[elements[i] >>> 5] = 0;
      sortRange(elements, groupStart, groupEnd);
    }
    condensedStart[groups] = condensedTargets.length;
    return Graph.create(condensedStart, condensedTargets.toInt32Array());
  }
}

/**
 * A partition of the edges of a graph into groups: the edges behind each edge of a condensed
 * graph, or the blocks of a graph.
 *
 * {@link IndexMapping.get | `get(e)`} returns the group of edge `e`, or `-1` if it is in no group,
 * and {@link EdgePartition.edgesOf} the edge indices of a group in ascending order. The groups come
 * from one of two methods:
 *
 * - {@link Graphs.edgePartition} groups the edges of the graph of a {@link NodePartition} by the
 *   edge of its condensed graph that they condense to: the group IDs are the edge indices of the
 *   condensed graph. Edges within a group of nodes, and edges from or to a node in no group,
 *   condense to no edge and are in no group.
 * - {@link Biconnectivity.blocks} groups the edges by block (biconnected component); self-loops are
 *   in no block.
 *
 * Here, `byPackage` groups the methods of a program by package. Its condensed graph `packageCalls`
 * holds the calls between packages (see {@link NodePartition.of}). `byPackageCall` tells which
 * calls between methods are behind the call from `service` to `model`:
 *
 * <!-- example: partitions.ts#edgesOf -->
 * ```ts
 * const byPackageCall = Graphs.edgePartition(packageCalls, byPackage);
 * const serviceToModel = packageCalls.edgeIndexOf(service, model);
 * const behind = byPackageCall.edgesOf(serviceToModel);
 * // behind: [5, 7] - the calls load -> parse and save -> format
 * ```
 *
 * {@link IndexPartition.reduce} combines data on the edges into one value per group, such as the
 * number of call sites behind each call between packages.
 *
 * Instances are immutable.
 *
 * **Memory:** 4 x (edgeCount + mappedCount + groupCount) bytes, where mappedCount is the number of
 * edges that belong to a group.
 */
export class EdgePartition extends IndexPartition {
  private constructor(mapping: Int32Array, members: Int32Array, memberStart: Int32Array) {
    super(mapping, members, memberStart);
  }

  /** @internal Takes the arrays as they are. */
  static create(mapping: Int32Array, members: Int32Array, memberStart: Int32Array): EdgePartition {
    return new EdgePartition(mapping, members, memberStart);
  }

  /**
   * The number of edges of the partitioned graph, in a group or not. Equivalent to
   * {@link IndexMapping.indexCount}.
   *
   * **Time:** O(1).
   */
  get edgeCount(): number {
    return this.indexCount;
  }

  /**
   * Returns the edge indices in group `groupId`, in ascending order. Equivalent to
   * `indicesOf(groupId)`.
   *
   * The result is a view of this partition's own array, not a copy.
   *
   * **Time:** O(1).
   *
   * @param groupId group ID in `0..groupCount-1`
   * @returns edge indices in the group
   * @throws RangeError if `groupId` is out of range
   */
  edgesOf(groupId: number): SortedIntView {
    return this.indicesOf(groupId);
  }
}

/**
 * The SCCs (strongly connected components) of a graph, as {@link Components.sccsOf} returns them.
 *
 * It is a {@link NodePartition} whose groups are the SCCs, numbered by SCC ID `0..sccCount-1`.
 * {@link Sccs.sccOf} returns the SCC of a node and {@link NodePartition.nodesOf} the nodes of an
 * SCC. {@link Sccs.containsCycle} distinguishes the SCCs with a cycle from those of a single node
 * without one. {@link NodePartition.condense} returns the DAG (directed acyclic graph) of the SCCs.
 *
 * Every node is in exactly one SCC; a node that lies on no cycle is an SCC of its own. SCC IDs are
 * in reverse topological order: every edge between two SCCs goes from the higher SCC ID to the
 * lower one, so SCC `0` has no edges to other SCCs. The nodes of each SCC are in ascending order.
 * Here, `dependencies` are the dependencies between the packages of a program, and `names` holds
 * the names of the packages. The example groups the packages by SCC, in the order of the SCC IDs.
 * In this order, each package comes after the packages it uses, and the packages that use each
 * other come together:
 *
 * <!-- example: connectivity.ts#sccsOf -->
 * ```ts
 * // The SCCs in reverse topological order, each as the names of its packages.
 * const sccs = Components.sccsOf(dependencies);
 * const buildOrder: string[][] = [];
 * for (let scc = 0; scc < sccs.sccCount; scc++) {
 *   buildOrder.push(Array.from(sccs.nodesOf(scc), (node) => names[node]));
 * }
 * // buildOrder: [[util], [cli], [json], [model, storage], [service], [ui], [app]]
 * ```
 *
 * Instances are immutable.
 *
 * **Memory:** 4 x (2 x nodeCount + sccCount) bytes; the graph is shared, not copied.
 */
export class Sccs extends NodePartition {
  private constructor(graph: Graph, nodeToScc: Int32Array, sccNodes: Int32Array, sccStart: Int32Array) {
    super(graph, nodeToScc, sccNodes, sccStart);
  }

  /** @internal Takes the arrays as they are. */
  static override create(graph: Graph, nodeToScc: Int32Array, sccNodes: Int32Array, sccStart: Int32Array): Sccs {
    return new Sccs(graph, nodeToScc, sccNodes, sccStart);
  }

  /**
   * Returns the SCC ID of `node`. Equivalent to `get(node)`.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns SCC ID
   * @throws RangeError if `node` is out of range
   */
  sccOf(node: number): number {
    return this.get(node);
  }

  /**
   * The number of SCCs. Equivalent to {@link IndexPartition.groupCount}.
   *
   * **Time:** O(1).
   */
  get sccCount(): number {
    return this.groupCount;
  }

  /**
   * Returns whether SCC `sccId` contains a cycle: whether it has more than one node, or a single
   * node with a self-loop.
   *
   * **Time:** O(1) for an SCC of more than one node, O(log outDegree(v)) for an SCC of a single
   * node `v`.
   *
   * @param sccId SCC ID in `0..sccCount-1`
   * @returns `true` if the SCC contains a cycle
   * @throws RangeError if `sccId` is out of range
   */
  containsCycle(sccId: number): boolean {
    checkIndex(sccId, this.memberStart.length - 1);
    return (
      this.memberStart[sccId + 1] - this.memberStart[sccId] > 1 ||
      this.graph.containsSelfLoop(this.members[this.memberStart[sccId]])
    );
  }

  /**
   * Whether the graph is strongly connected: whether it has at most one SCC. Equivalent to
   * `sccCount <= 1`.
   *
   * A graph without nodes counts as strongly connected.
   *
   * **Time:** O(1).
   */
  get isStronglyConnected(): boolean {
    return this.groupCount <= 1;
  }
}

/** Bits 0-30 of a Tarjan lane. */
const VALUE = 0x7fffffff;

/** Bit 31: visited in lane 0, on-stack in lane 1. */
const FLAG = 1 << 31;

/**
 * @internal The body of `Components.sccsOf`, here so that the algorithms that need SCCs do not call
 * the facade (Java: `Sccs.of`).
 *
 * Iterative Tarjan SCC: a single-pass DFS with an explicit stack. SCC IDs are assigned in reverse
 * topological order of the component DAG.
 *
 * The per-node state - index, lowlink, visited and on-stack - lives in two interleaved int lanes
 * per node: `index | visited << 31` and `lowlink | onStack << 31`. Every node touch is one cache
 * line, and everything stays in 32-bit arithmetic.
 *
 * Two stacks drive the traversal: `frames` for the descent (node and resume position), and
 * `sccStack` holding the nodes not yet assigned to a completed SCC.
 */
export function sccsOf(graph: Graph): Sccs {
  const n = graph.nodeCount;
  ArrayLimits.checkNodeCount(n, ArrayLimits.MAX_NODE_COUNT_TWO_INTS, "Tarjan's algorithm");
  const out = graph.outStart;
  const adj = graph.outAdj;
  const lanes = new Int32Array(2 * n);
  const sccStack = new Int32Array(n);
  const nodeToScc = new Int32Array(n);
  const sccNodes = new Int32Array(n);
  const sccStart = new Int32Array(n + 1);
  let nextIndex = 0;
  let sccTop = 0;
  let sccCount = 0;
  let sccNodesPos = 0;
  let frames = DfsFrames.initial(n);

  for (let root = 0; root < n; root++) {
    if ((lanes[2 * root] & FLAG) !== 0) continue;
    // preorder(root)
    lanes[2 * root] = nextIndex | FLAG;
    lanes[2 * root + 1] = nextIndex | FLAG;
    nextIndex++;
    sccStack[sccTop++] = root;
    frames[0] = root;
    frames[1] = out[root];
    let top = 0;

    outer: while (top >= 0) {
      const u = frames[2 * top];
      const end = out[u + 1];
      let i = frames[2 * top + 1];
      while (i < end) {
        const v = adj[i++];
        if ((lanes[2 * v] & FLAG) === 0) {
          frames[2 * top + 1] = i; // resume here after v's subtree finishes
          lanes[2 * v] = nextIndex | FLAG;
          lanes[2 * v + 1] = nextIndex | FLAG;
          nextIndex++;
          sccStack[sccTop++] = v;
          if (++top === frames.length >> 1) frames = DfsFrames.grow(frames, n);
          frames[2 * top] = v;
          frames[2 * top + 1] = out[v];
          continue outer;
        } else if ((lanes[2 * v + 1] & FLAG) !== 0) {
          // lowlink[u] = min(lowlink[u], index[v])
          const idxV = lanes[2 * v] & VALUE;
          const lowLane = lanes[2 * u + 1];
          if (idxV < (lowLane & VALUE)) lanes[2 * u + 1] = (lowLane & FLAG) | idxV;
        }
      }

      // Postorder: close u's SCC if it is a root, then propagate its lowlink to the parent.
      const lowU = lanes[2 * u + 1] & VALUE;
      if (lowU === (lanes[2 * u] & VALUE)) {
        const start = sccNodesPos;
        sccStart[sccCount] = start;
        let w: number;
        do {
          w = sccStack[--sccTop];
          lanes[2 * w + 1] &= VALUE;
          nodeToScc[w] = sccCount;
          sccNodes[sccNodesPos++] = w;
        } while (w !== u);
        sortRange(sccNodes, start, sccNodesPos);
        sccCount++;
      }
      if (--top >= 0) {
        const parent = frames[2 * top];
        const lowLane = lanes[2 * parent + 1];
        if (lowU < (lowLane & VALUE)) lanes[2 * parent + 1] = (lowLane & FLAG) | lowU;
      }
    }
  }
  sccStart[sccCount] = sccNodesPos;
  return Sccs.create(graph, nodeToScc, sccNodes, sccStart.slice(0, sccCount + 1));
}
