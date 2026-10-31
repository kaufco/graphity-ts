import { ArrayLimits } from "./arrayLimits.js";
import { BitSet } from "./bitSet.js";
import { DfsFrames } from "./dfsFrames.js";
import { BiAdjacentGraph, type Graph } from "./graph.js";
import { checkIndex, checkLength, numberOfTrailingZeros } from "./internal.js";
import { type IntList, IntLists, SortedIntView } from "./sortedIntView.js";

/**
 * The typed arrays of JavaScript: what {@link NodeMapping.gather}, {@link EdgeMapping.gather} and
 * {@link IndexPartition.reduce} take in place of Java's `int[]`, `long[]` and `double[]`, and
 * return in the same type.
 */
export type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array;

/**
 * A mapping from the indices `0..indexCount-1` to the indices of another numbering. It is the
 * common base of the node and edge mappings and of the partitions.
 *
 * The indices are node IDs or edge indices. {@link IndexMapping.get | `get(i)`} is the index that
 * `i` maps to, or `-1` if `i` is not mapped; a mapping with unmapped indices is partial. A
 * {@link NodeMapping} maps the node IDs of one graph to those of another, and an
 * {@link EdgeMapping} does the same for edge indices. Neither maps two indices to the same index,
 * so both can be inverted. An {@link IndexPartition} maps indices to groups and lists the indices
 * of each group. Several indices can map to the same group.
 *
 * That a node or edge mapping maps no two indices to the same index is a contract, not a check:
 * {@link NodeMapping.of} accepts an array that breaks it, and only `inverted` and
 * {@link Graphs.remapped} reject such a mapping.
 *
 * Instances are immutable.
 *
 * **Memory:** 4 x indexCount bytes; a partition holds more.
 */
export abstract class IndexMapping {
  /** @internal The index that each index maps to, or `-1`. */
  readonly mapping: Int32Array;

  /** The number of entries of {@link IndexMapping.mapping} other than `-1`. */
  readonly #validCount: number;

  // Protected rather than private because the mappings and partitions extend IndexMapping; hidden
  // in the API documentation, as Javadoc leaves out Java's package-private constructor.
  /** @hidden */
  protected constructor(mapping: Int32Array, validCount: number) {
    this.mapping = mapping;
    this.#validCount = validCount;
  }

  /**
   * Returns the index that `id` maps to, or `-1` if `id` is not mapped.
   *
   * In a partition, it is the group of `id`.
   *
   * **Time:** O(1).
   *
   * @param id index in `0..indexCount-1`
   * @returns index that `id` maps to, or `-1`
   * @throws RangeError if `id` is out of range
   */
  get(id: number): number {
    checkIndex(id, this.mapping.length);
    return this.mapping[id];
  }

  /**
   * Returns whether `id` is mapped. Equivalent to `get(id) !== -1`.
   *
   * **Time:** O(1).
   *
   * @param id index in `0..indexCount-1`
   * @returns `true` if `id` is mapped
   * @throws RangeError if `id` is out of range
   */
  isMapped(id: number): boolean {
    return this.get(id) >= 0;
  }

  /**
   * Whether some index is not mapped. Equivalent to `mappedCount < indexCount`.
   *
   * **Time:** O(1).
   */
  get isPartial(): boolean {
    return this.#validCount < this.mapping.length;
  }

  /**
   * The number of indices that are mapped; in a partition, the number of indices that belong to a
   * group.
   *
   * **Time:** O(1).
   */
  get mappedCount(): number {
    return this.#validCount;
  }

  /**
   * The number of indices this mapping maps from, mapped or not.
   *
   * It is the length of the arrays that `gather` returns and that `reduce` takes.
   *
   * **Time:** O(1).
   */
  get indexCount(): number {
    return this.mapping.length;
  }
}

/**
 * Inverts `mapping` into a target space of `targetCount` indices.
 *
 * @throws Error if `targetCount` is negative or larger than the largest array, or several
 *     sources map to the same target
 * @throws RangeError if a target is `targetCount` or more
 */
function invertArray(mapping: Int32Array, targetCount: number): Int32Array {
  if (!(targetCount >= 0 && targetCount <= ArrayLimits.MAX_ARRAY_LENGTH) || (targetCount | 0) !== targetCount) {
    throw new Error(`targetCount out of range: ${targetCount}`);
  }
  const inverse = new Int32Array(targetCount).fill(-1);
  for (let i = 0; i < mapping.length; i++) {
    const value = mapping[i];
    if (value < 0) continue;
    if (value >= targetCount) {
      throw new RangeError(`index ${i} maps to ${value}, but targetCount is ${targetCount}`);
    }
    if (inverse[value] !== -1) {
      throw new Error(`cannot invert mapping: indices ${inverse[value]} and ${i} both map to ${value}`);
    }
    inverse[value] = i;
  }
  return inverse;
}

/**
 * Composes two mapping arrays: `result[i] = outer[inner[i]]`; -1 propagates.
 *
 * @throws RangeError if `inner` maps to a value outside `outer`
 */
function composeArrays(outer: Int32Array, inner: Int32Array): Int32Array {
  const result = new Int32Array(inner.length);
  for (let i = 0; i < result.length; i++) {
    const mid = inner[i];
    if (mid < 0) {
      result[i] = -1;
    } else if (mid < outer.length) {
      result[i] = outer[mid];
    } else {
      throw new RangeError(`inner maps ${i} to ${mid}, outside the indices 0..${outer.length - 1} of this mapping`);
    }
  }
  return result;
}

/** @internal Counts the non-negative entries. */
export function countValid(mapping: Int32Array): number {
  let count = 0;
  for (let i = 0; i < mapping.length; i++) if (mapping[i] >= 0) count++;
  return count;
}

/**
 * `result[i] = values[mapping[i]]`: with `newValues`, written into it and untouched where unmapped,
 * whatever holds the values - Java picks the `T[]` overload by that argument too; without it, a
 * typed array yields a new one of the same type with 0 where unmapped.
 */
function gatherArray<T>(
  mapping: Int32Array,
  values: TypedArray | ArrayLike<T>,
  newValues: T[] | undefined,
): TypedArray | undefined {
  if (newValues === undefined) {
    if (!ArrayBuffer.isView(values)) throw new Error("gather of an array that is not typed needs newValues");
    const typed = values as TypedArray;
    const result = new (typed.constructor as new (length: number) => TypedArray)(mapping.length);
    const length = typed.length;
    for (let i = 0; i < mapping.length; i++) {
      const source = mapping[i];
      if (source >= 0) {
        if (source >= length) throw new RangeError(`Index ${source} out of bounds for length ${length}`);
        result[i] = typed[source]!;
      }
    }
    return result;
  }
  checkDistinct(values, newValues, "newValues");
  checkLength(newValues.length, mapping.length, "newValues");
  const plain = values as ArrayLike<T>;
  for (let i = 0; i < mapping.length; i++) {
    const source = mapping[i];
    if (source >= 0) {
      if (source >= plain.length) throw new RangeError(`Index ${source} out of bounds for length ${plain.length}`);
      newValues[i] = plain[source];
    }
  }
  return undefined;
}

/** @internal Rejects writing the result into the input array, which would overwrite unread values. */
export function checkDistinct(values: unknown, result: unknown, name: string): void {
  if (values === result) throw new Error(`values and ${name} must be distinct arrays`);
}

/**
 * A mapping from the node IDs of one graph to those of another, to extract a subgraph or to
 * renumber the nodes of a graph.
 *
 * {@link IndexMapping.get | `get(node)`} is the node ID that `node` maps to, or `-1` if `node` is
 * not mapped. The factories return mappings from a new graph to an old one. These map each new
 * node to the node it comes from:
 *
 * - {@link NodeMapping.forSubgraph} and its overloads - the selected nodes, numbered in ascending
 *   order;
 * - {@link NodeMapping.forPermutation} - every node, in an order of the caller's choice;
 * - {@link NodeMapping.reindex} - every node, in depth-first preorder;
 * - {@link NodeMapping.of} - any mapping, from an array.
 *
 * {@link Graphs.remapped} builds the new graph from the old one, and {@link NodeMapping.gather}
 * carries data on the old nodes, such as their names, over to the new ones. Here, `calls` holds the
 * calls between the methods of a program, and the methods that `load` reaches become a graph of
 * their own, with their names from `names`:
 *
 * <!-- example: mappings.ts#subgraph -->
 * ```ts
 * const newToOld = NodeMapping.forSubgraph(Graphs.reachableFrom(calls, load));
 * const loading = Graphs.remapped(calls, newToOld);
 * const loadingNames = new Array<string>(loading.nodeCount);
 * newToOld.gather(names, loadingNames);
 * // loadingNames: [load, parse, read]
 * // loading: load -> parse, load -> read, parse -> parse
 * ```
 *
 * {@link Graphs.edgeMapping} derives the {@link EdgeMapping} that carries data on edges.
 * {@link NodeMapping.inverted} returns the mapping from old to new, and
 * {@link NodeMapping.compose} chains two mappings.
 *
 * Instances are immutable.
 *
 * **Memory:** 4 x indexCount bytes.
 */
export class NodeMapping extends IndexMapping {
  private constructor(mapping: Int32Array, validCount: number) {
    super(mapping, validCount);
  }

  /** @internal The mapping array is not copied - the caller must not retain it. */
  static create(mapping: Int32Array, validCount: number): NodeMapping {
    return new NodeMapping(mapping, validCount);
  }

  /**
   * Returns the mapping that maps each node `i` to `mapping[i]`, and leaves it unmapped where that
   * is `-1`.
   *
   * Use it for mappings that the other factories do not cover, from new to old or from old to new.
   * The array is copied. Each value must be `-1` or a node ID, and no two nodes may map to the same
   * node; without a graph, this method can only reject a value below `-1`. {@link Graphs.remapped}
   * rejects a value that is not a node of its graph, and both it and {@link NodeMapping.inverted}
   * reject two nodes that map to the same node.
   *
   * **Time:** O(mapping.length).
   * **Memory:** 4 x mapping.length bytes for the copy, which the result keeps.
   *
   * @param mapping the node ID that each node maps to, or `-1`; any array of numbers
   * @returns the mapping
   * @throws RangeError if a value is less than `-1` or not an integer
   */
  static of(mapping: ArrayLike<number>): NodeMapping {
    const copy = new Int32Array(mapping.length);
    for (let node = 0; node < mapping.length; node++) {
      const value = mapping[node];
      if (!(value >= -1) || (value | 0) !== value) {
        throw new RangeError(`a mapping value must be -1 or a node ID, but node ${node} maps to ${value}`);
      }
      copy[node] = value;
    }
    return new NodeMapping(copy, countValid(copy));
  }

  /**
   * Returns a mapping from the nodes of a subgraph to the selected nodes, given as the set bits of
   * `selected` (Java: `java.util.BitSet`).
   *
   * The selected nodes get the new node IDs `0..selected.cardinality()-1`, in ascending order of
   * their node IDs. The selected node IDs are checked against a graph only when the mapping is
   * used: {@link Graphs.remapped} rejects one that is not a node of its graph.
   *
   * **Time:** O(selected.length()).
   * **Memory:** 4 x selected.cardinality() bytes for the result.
   *
   * @param selected the selected node IDs
   * @returns the mapping from new to old node IDs
   */
  static forSubgraph(selected: BitSet): NodeMapping;
  /**
   * Returns a mapping from the nodes of a subgraph to the selected nodes, given as a list.
   *
   * The selected nodes get the new node IDs `0..selected.length-1`, in ascending order of their
   * node IDs, whatever the order of the list. A {@link SortedIntView}, as
   * {@link Graphs.reachableFrom} and {@link NodePartition.nodesOf} return it, is taken as it is;
   * any other list is sorted first, in a copy. As with the `BitSet` form, the node IDs are checked
   * against a graph only when the mapping is used.
   *
   * **Time:** O(k) for a {@link SortedIntView}, O(k log k) for any other list, where k is
   * `selected.length`.
   * **Memory:** 4 x selected.length bytes for the result.
   *
   * @param selected the selected node IDs
   * @returns the mapping from new to old node IDs
   * @throws RangeError if a node ID is negative or not an integer
   * @throws Error if a node ID occurs more than once
   * @throws TypeError if `selected` is not a list, as {@link IntLists.asArrayLike} rejects it
   */
  static forSubgraph(selected: IntList): NodeMapping;
  /**
   * Returns a mapping from the nodes of a subgraph to the selected nodes, given as node IDs.
   *
   * The selected nodes get the new node IDs `0..selected.length-1`, in ascending order of their
   * node IDs, whatever the order of the arguments; the array is sorted in a copy. As with the
   * `BitSet` form, the node IDs are checked against a graph only when the mapping is used.
   *
   * **Time:** O(k log k), where k is `selected.length`.
   * **Memory:** 4 x selected.length bytes for the result.
   *
   * @param selected the selected node IDs
   * @returns the mapping from new to old node IDs
   * @throws RangeError if a node ID is negative or not an integer
   * @throws Error if a node ID occurs more than once
   */
  static forSubgraph(...selected: number[]): NodeMapping;
  static forSubgraph(...args: (BitSet | IntList | number)[]): NodeMapping {
    const first = args[0];
    if (args.length === 1 && first instanceof BitSet) {
      const k = first.cardinality();
      const map = new Int32Array(k);
      let idx = 0;
      for (let bit = first.nextSetBit(0); bit >= 0; bit = first.nextSetBit(bit + 1)) map[idx++] = bit;
      return new NodeMapping(map, k);
    }
    let map: Int32Array;
    if (args.length === 1 && first instanceof SortedIntView) {
      map = first.toInt32Array();
    } else {
      const list =
        args.length === 1 && typeof first === "object" ? IntLists.asArrayLike(first as IntList) : (args as number[]);
      map = toSelectedIds(list).sort();
    }
    checkSelection(map);
    return new NodeMapping(map, map.length);
  }

  /**
   * Returns a mapping that numbers the nodes in the given order, from new to old node IDs.
   *
   * `order[newNode]` is the node that gets the new node ID `newNode`. `order` holds every node ID
   * in `0..order.length-1` once, so the mapping maps every node. For example,
   * `NodeMapping.forPermutation(TopOrder.of(dag))` numbers the nodes of a DAG (directed acyclic
   * graph) in topological order, so that every edge of the remapped graph goes from a lower to a
   * higher node ID.
   *
   * **Time:** O(order.length).
   * **Memory:** 4 x order.length bytes for the result; while it runs, 1 bit per node.
   *
   * @param order the node IDs in their new order
   * @returns the mapping from new to old node IDs
   * @throws RangeError if a node ID is not in `0..order.length-1`
   * @throws Error if a node ID occurs more than once
   */
  static forPermutation(order: IntList): NodeMapping {
    const list = IntLists.asArrayLike(order);
    const n = list.length;
    const map = new Int32Array(n);
    // One bit per node, as Java's BitSet.
    const seen = new Int32Array((n >> 5) + 1);
    for (let i = 0; i < n; i++) {
      const old = list[i];
      if (!(old >= 0 && old < n) || (old | 0) !== old) {
        throw new RangeError(`order value out of range 0..${n - 1} at position ${i}: ${old}`);
      }
      const mask = 1 << (old & 31);
      if ((seen[old >>> 5] & mask) !== 0) throw new Error(`order contains ${old} more than once`);
      seen[old >>> 5] |= mask;
      map[i] = old;
    }
    return new NodeMapping(map, n);
  }

  /**
   * Returns the inverse mapping, which maps `get(node)` back to `node`.
   *
   * The inverse maps the `targetCount` nodes of the graph that this mapping maps to; a node that no
   * node maps to is not mapped, and the inverse is then partial. For a mapping from new to old node
   * IDs, as the factories return it, `targetCount` is the node count of the old graph, and the
   * inverse gives the new node ID of an old node:
   * `newToOld.inverted(oldGraph.nodeCount).get(oldNode)`.
   *
   * **Time:** O(indexCount + targetCount).
   * **Memory:** 4 x targetCount bytes for the result.
   *
   * @param targetCount the node count of the graph that this mapping maps to
   * @returns the inverse mapping, with an index count of `targetCount`
   * @throws Error if `targetCount` is not an integer, is negative or larger than 2^31 - 9, or two
   *     nodes map to the same node
   * @throws RangeError if a node maps to `targetCount` or more
   */
  inverted(targetCount: number): NodeMapping {
    return new NodeMapping(invertArray(this.mapping, targetCount), this.mappedCount);
  }

  /**
   * Returns the mapping that applies `inner` first and then this mapping.
   *
   * If `inner` maps the nodes of a graph A to those of B, and this mapping maps B to C, the result
   * maps A to C. A node is not mapped in the result if `inner` does not map it, or if this mapping
   * does not map the node that `inner` maps it to. For mappings from new to old node IDs,
   * `firstToOriginal.compose(secondToFirst)` maps the nodes of a graph remapped twice back to those
   * of the original one.
   *
   * **Time:** O(inner.indexCount).
   * **Memory:** 4 x inner.indexCount bytes for the result.
   *
   * @param inner the mapping to apply first
   * @returns the composed mapping
   * @throws RangeError if `inner` maps a node to a node ID outside `0..indexCount-1`
   */
  compose(inner: NodeMapping): NodeMapping {
    const composed = composeArrays(this.mapping, inner.mapping);
    return new NodeMapping(composed, countValid(composed));
  }

  /**
   * Returns `values` renumbered by this mapping: the value at position `i` of the result is
   * `values[get(i)]`, or `0` if `i` is not mapped. The result is a typed array of the type of
   * `values` (Java: the `int[]`, `long[]` and `double[]` forms; here any typed array).
   *
   * For a mapping from new to old node IDs, as the factories return it, this carries data on the
   * nodes of the old graph over to the new graph. The form with `newValues` does the same for
   * values of any kind, such as names.
   *
   * **Time:** O(indexCount).
   * **Memory:** one element per index for the result: 4 x indexCount bytes for an `Int32Array`,
   * 8 x indexCount bytes for a `Float64Array` or a `BigInt64Array`.
   *
   * @param values the value of each node of the graph that this mapping maps to
   * @returns the renumbered values, of length {@link IndexMapping.indexCount}
   * @throws RangeError if a node maps to a node ID outside `values`
   */
  gather<A extends TypedArray>(values: A): A;
  /**
   * Writes `values` renumbered by this mapping into `newValues`, for values of any kind, such as
   * names (Java: the `T[]` form). The second argument selects this form, as in Java's overload
   * resolution: the values may be in any array-like, also in a typed array.
   *
   * `newValues[i]` becomes `values[get(i)]`, and stays as it is if `i` is not mapped. References
   * are copied, not the objects. If an error is thrown, `newValues` may be partly written.
   *
   * **Time:** O(indexCount).
   *
   * @param values the value of each node of the graph that this mapping maps to
   * @param newValues receives the renumbered values; length {@link IndexMapping.indexCount}, and
   *     not the same array as `values`
   * @throws Error if `newValues.length !== indexCount`, or both are the same array
   * @throws RangeError if a node maps to a node ID outside `values`
   */
  gather<T>(values: ArrayLike<T>, newValues: T[]): void;
  gather<T>(values: TypedArray | ArrayLike<T>, newValues?: T[]): TypedArray | undefined {
    return gatherArray(this.mapping, values, newValues);
  }

  /**
   * Returns a mapping that numbers the nodes of `graph` in depth-first preorder, from new to old
   * node IDs.
   *
   * The search starts at node `0`, follows the out-nodes of each node in ascending order, and
   * starts again at the smallest node not yet visited until it has visited every node; each node
   * gets the next new node ID when the search reaches it. Nodes that the search visits one after
   * another thus get adjacent node IDs. Traversals of the remapped graph then read its arrays more
   * in order, which can make them faster on large graphs.
   *
   * **Time:** O(nodeCount + edgeCount).
   * **Memory:** 4 x nodeCount bytes for the result; while it runs, 1 bit per node and up to
   * 8 x nodeCount bytes for the stack, which grows with the deepest path.
   *
   * @param graph the graph whose nodes are numbered
   * @returns the mapping from new to old node IDs
   * @throws Error if a depth-first path is longer than 2^30 - 5 nodes
   */
  static reindex(graph: Graph): NodeMapping {
    const n = graph.nodeCount;
    const out = graph.outStart;
    const adj = graph.outAdj;
    // Visited bits in raw words, so that the scan tests and sets a bit with one load and store.
    const visited = new Int32Array((n >> 5) + 1);
    const order = new Int32Array(n);
    let pos = 0;
    let frames = DfsFrames.initial(n);

    for (let root = nextClearBit(visited, 0); root < n; root = nextClearBit(visited, root + 1)) {
      visited[root >>> 5] |= 1 << (root & 31);
      order[pos++] = root;
      frames[0] = root;
      frames[1] = out[root];
      let top = 0;

      outer: while (top >= 0) {
        const u = frames[2 * top];
        const end = out[u + 1];
        let i = frames[2 * top + 1];
        while (i < end) {
          const v = adj[i++];
          const w = v >>> 5;
          const bits = visited[w];
          const mask = 1 << (v & 31);
          if ((bits & mask) === 0) {
            visited[w] = bits | mask;
            order[pos++] = v;
            frames[2 * top + 1] = i;
            if (++top === frames.length >> 1) frames = DfsFrames.grow(frames, n);
            frames[2 * top] = v;
            frames[2 * top + 1] = out[v];
            continue outer;
          }
        }
        top--;
      }
    }
    return new NodeMapping(order, n);
  }
}

/**
 * A mapping from the edge indices of one graph to those of another, to carry data on edges over to
 * a subgraph, a renumbered graph or the transposed graph.
 *
 * {@link IndexMapping.get | `get(e)`} is the edge index that edge `e` maps to, or `-1` if edge `e`
 * is not mapped. The factories return mappings from a new graph to an old one. These map each new
 * edge to the edge it comes from. {@link Graphs.edgeMapping} derives one from the
 * {@link NodeMapping} of a subgraph or a renumbering, and leaves a new edge without a counterpart
 * in the old graph unmapped. {@link Graphs.transposedEdgeMapping} maps each edge of the transposed
 * graph to the edge it reverses.
 *
 * {@link EdgeMapping.gather} carries data on the old edges over to the new ones. Here, `siteCount`
 * holds the number of call sites of each call by edge index of `calls`, and the subgraph `loading`
 * from the example at {@link NodeMapping} takes these counts along:
 *
 * <!-- example: mappings.ts#edgeMapping -->
 * ```ts
 * const loadingSiteCount = Graphs.edgeMapping(loading, calls, newToOld).gather(
 *   siteCount,
 * );
 * // 1 for load -> parse and for load -> read, 2 for parse -> parse
 * ```
 *
 * {@link EdgeMapping.inverted} returns the mapping from old to new, and
 * {@link EdgeMapping.compose} chains two mappings.
 *
 * Instances are immutable.
 *
 * **Memory:** 4 x indexCount bytes.
 */
export class EdgeMapping extends IndexMapping {
  private constructor(mapping: Int32Array, validCount: number) {
    super(mapping, validCount);
  }

  /** @internal The mapping array is not copied - the caller must not retain it. */
  static create(mapping: Int32Array, validCount: number): EdgeMapping {
    return new EdgeMapping(mapping, validCount);
  }

  /**
   * @internal The body of `Graphs.transposedEdgeMapping`, here so that the algorithms that need it
   * do not call the facade: the edge index in `graph` of every position of its in-adjacency, which
   * is every edge index of its transpose.
   */
  static forTransposed(graph: Graph): EdgeMapping {
    const n = graph.nodeCount;
    const m = graph.edgeCount;
    const targets = graph.outAdj;
    const start = graph.outStart;

    // Write pointer per target node: where that node's next in-edge slot goes. A bi-adjacent graph
    // already has those offsets; otherwise count and prefix-sum them.
    let writePos: Int32Array;
    if (graph instanceof BiAdjacentGraph) {
      writePos = graph.inStart.slice(0, n);
    } else {
      writePos = new Int32Array(n);
      for (let i = 0; i < m; i++) writePos[targets[i]]++;
      let nextStart = 0;
      for (let node = 0; node < n; node++) {
        const inDegree = writePos[node];
        writePos[node] = nextStart;
        nextStart += inDegree;
      }
    }

    // The counting sort of BiAdjacentGraph.of, with the edge index as payload instead of the source
    // node: slot q of the transpose and entry q of the mapping describe the same edge.
    const mapping = new Int32Array(m);
    for (let node = 0; node < n; node++) {
      for (let edgeIndex = start[node], end = start[node + 1]; edgeIndex < end; edgeIndex++) {
        mapping[writePos[targets[edgeIndex]]++] = edgeIndex;
      }
    }
    return new EdgeMapping(mapping, m);
  }

  /**
   * Returns the inverse mapping, which maps `get(e)` back to `e`.
   *
   * The inverse maps the `targetCount` edges of the graph that this mapping maps to; an edge that
   * no edge maps to is not mapped, and the inverse is then partial. For a mapping from new to old
   * edge indices, as the factories return it, `targetCount` is the edge count of the old graph, and
   * the inverse gives the new edge index of an old edge:
   * `newToOld.inverted(oldGraph.edgeCount).get(oldEdge)`.
   *
   * **Time:** O(indexCount + targetCount).
   * **Memory:** 4 x targetCount bytes for the result.
   *
   * @param targetCount the edge count of the graph that this mapping maps to
   * @returns the inverse mapping, with an index count of `targetCount`
   * @throws Error if `targetCount` is not an integer, is negative or larger than 2^31 - 9, or two
   *     edges map to the same edge
   * @throws RangeError if an edge maps to `targetCount` or more
   */
  inverted(targetCount: number): EdgeMapping {
    return new EdgeMapping(invertArray(this.mapping, targetCount), this.mappedCount);
  }

  /**
   * Returns the mapping that applies `inner` first and then this mapping.
   *
   * If `inner` maps the edges of a graph A to those of B, and this mapping maps B to C, the result
   * maps A to C. An edge is not mapped in the result if `inner` does not map it, or if this mapping
   * does not map the edge that `inner` maps it to.
   *
   * **Time:** O(inner.indexCount).
   * **Memory:** 4 x inner.indexCount bytes for the result.
   *
   * @param inner the mapping to apply first
   * @returns the composed mapping
   * @throws RangeError if `inner` maps an edge to an edge index outside `0..indexCount-1`
   */
  compose(inner: EdgeMapping): EdgeMapping {
    const composed = composeArrays(this.mapping, inner.mapping);
    return new EdgeMapping(composed, countValid(composed));
  }

  /**
   * Returns `values` renumbered by this mapping: the value at position `i` of the result is
   * `values[get(i)]`, or `0` if edge `i` is not mapped. The result is a typed array of the type of
   * `values` (Java: the `int[]`, `long[]` and `double[]` forms; here any typed array).
   *
   * For a mapping from new to old edge indices, as the factories return it, this carries data on
   * the edges of the old graph over to the new graph. The form with `newValues` does the same for
   * values of any kind.
   *
   * **Time:** O(indexCount).
   * **Memory:** one element per index for the result: 4 x indexCount bytes for an `Int32Array`,
   * 8 x indexCount bytes for a `Float64Array` or a `BigInt64Array`.
   *
   * @param values the value of each edge of the graph that this mapping maps to
   * @returns the renumbered values, of length {@link IndexMapping.indexCount}
   * @throws RangeError if an edge maps to an edge index outside `values`
   */
  gather<A extends TypedArray>(values: A): A;
  /**
   * Writes `values` renumbered by this mapping into `newValues`, for values of any kind (Java: the
   * `T[]` form). The second argument selects this form, as in Java's overload resolution: the
   * values may be in any array-like, also in a typed array.
   *
   * `newValues[i]` becomes `values[get(i)]`, and stays as it is if edge `i` is not mapped.
   * References are copied, not the objects. If an error is thrown, `newValues` may be partly
   * written.
   *
   * **Time:** O(indexCount).
   *
   * @param values the value of each edge of the graph that this mapping maps to
   * @param newValues receives the renumbered values; length {@link IndexMapping.indexCount}, and
   *     not the same array as `values`
   * @throws Error if `newValues.length !== indexCount`, or both are the same array
   * @throws RangeError if an edge maps to an edge index outside `values`
   */
  gather<T>(values: ArrayLike<T>, newValues: T[]): void;
  gather<T>(values: TypedArray | ArrayLike<T>, newValues?: T[]): TypedArray | undefined {
    return gatherArray(this.mapping, values, newValues);
  }
}

/**
 * Copies a list of node IDs into an `Int32Array`, rejecting values that are not integers in the
 * `int` range with a `RangeError`.
 */
/**
 * The selected node IDs of {@link NodeMapping.forSubgraph} as an `Int32Array`. A value that is not
 * an integer fails as Java fails for one out of range, after the check for duplicates: in Java,
 * `forSubgraph` rejects a node ID that occurs twice before a negative one.
 */
function toSelectedIds(list: ArrayLike<number>): Int32Array {
  const ids = new Int32Array(list.length);
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    if ((v | 0) !== v) throwForSelected(list, v);
    ids[i] = v;
  }
  return ids;
}

/**
 * Throws for a selection that holds `nonInt`, a value that is not an integer: the error for a
 * value that occurs twice if there is one, otherwise a `RangeError` for `nonInt`. Only the error
 * path sorts the values as numbers, in a `Float64Array`, where `NaN` sorts last and never equals
 * another value.
 */
function throwForSelected(list: ArrayLike<number>, nonInt: number): never {
  const sorted = Float64Array.from(list).sort();
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]) throw new Error(`selected contains node ${sorted[i]} more than once`);
  }
  throw new RangeError(`selected node ID must be an integer: ${nonInt}`);
}

/** Rejects a repeated ID in a sorted selection, and then a negative first ID, the only place one can be. */
function checkSelection(sorted: Int32Array): void {
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]) throw new Error(`selected contains node ${sorted[i]} more than once`);
  }
  if (sorted.length > 0 && sorted[0] < 0) {
    throw new RangeError(`selected node ID must be non-negative: ${sorted[0]}`);
  }
}

/**
 * Index of the first clear bit at or after `from`, as `BitSet.nextClearBit`: words of set bits
 * are skipped 32 at a time, and a result beyond the node count is left to the caller's bound check.
 */
function nextClearBit(bits: Int32Array, from: number): number {
  let word = from >>> 5;
  if (word >= bits.length) return bits.length << 5;
  let candidates = ~bits[word] & (-1 << (from & 31));
  while (candidates === 0) {
    if (++word === bits.length) return bits.length << 5;
    candidates = ~bits[word];
  }
  return (word << 5) + numberOfTrailingZeros(candidates);
}
