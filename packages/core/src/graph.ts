import { ArrayLimits } from "./arrayLimits.js";
import { type ByteSink, readCsr, writeCsr } from "./csrStreams.js";
import { arrayHashCode, checkIndex, containsInRange, indexOfInRange, sameInts } from "./internal.js";
import { SortedIntView, unionInRange } from "./sortedIntView.js";

// toString() runs implicitly, in debuggers and logs, so it lists a bounded part of the graph: at
// most this many nodes, and this many out-nodes over all listed nodes together.
const TO_STRING_NODES = 16;
const TO_STRING_TARGETS = 64;

/**
 * An action on an edge, given its source, target and edge index: the callback of
 * {@link Graph.forEachEdge}.
 *
 * The parameters come in the order that {@link DfsEdgeTraverser.visitEdge} and the lists of
 * {@link Edges} use as well.
 *
 * Performs this action on edge `edgeIndex`, which is `source -> target`.
 *
 * @param source node ID of the source, in `0..nodeCount-1`
 * @param target node ID of the target, in `0..nodeCount-1`
 * @param edgeIndex edge index in `0..edgeCount-1`
 */
export type EdgeConsumer = (source: number, target: number, edgeIndex: number) => void;

/**
 * A directed graph, which is the input of the algorithms in this library.
 *
 * Nodes are the integer IDs `0..nodeCount-1`. Edges are numbered by edge index `0..edgeCount-1`,
 * ordered by source and then by target. No two edges have the same source and target; self-loops
 * are allowed. The graph holds nothing but this structure: names, weights and any other data live
 * in arrays of the caller, indexed by node ID or by edge index.
 *
 * {@link GraphBuilder} builds a graph from edges in any order. {@link Graph.of} takes the two
 * arrays of a CSR (compressed sparse row) layout. A graph keeps its edges in this form, and
 * {@link Csr} hands the arrays to algorithm code. {@link Graph.writeTo} and {@link Graph.readFrom}
 * store a graph and load it again.
 *
 * A `Graph` holds the out-nodes of every node, called its out-adjacency. Algorithms that also need
 * the in-nodes take a {@link BiAdjacentGraph}, which {@link BiAdjacentGraph.of} builds and which
 * also gives the transposed graph. Algorithms are not methods of the graph but types of their own,
 * such as {@link Components}, {@link TopOrder} and {@link Dominators}; the documentation of the
 * package lists them by topic.
 *
 * Instances are immutable.
 *
 * **Memory:** 4 x (nodeCount + edgeCount) bytes.
 *
 * A graph has at most 2^31 - 10 nodes and 2^31 - 9 edges.
 */
export class Graph {
  /**
   * @internal The CSR layout: the out-nodes of node `v` are
   * `outAdj[outStart[v]..outStart[v + 1] - 1]`, sorted ascending, and the position of an out-node
   * in `outAdj` is the edge index of its edge. The sentinel `outStart[nodeCount] == edgeCount`
   * makes `outStart[v + 1]` valid for every node without a branch.
   */
  readonly outStart: Int32Array;

  /** @internal The out-nodes of all nodes, node after node; see {@link Graph.outStart}. */
  readonly outAdj: Int32Array;

  // Type-only, no field at run time: a private member makes the type nominal, so that an object of
  // the same shape is not taken for an instance, as in Java.
  declare private readonly brand: never;

  // Takes the arrays as they are, neither copied nor checked: the caller guarantees the layout.
  // Protected rather than private because BiAdjacentGraph extends Graph; hidden in the API
  // documentation, as Javadoc leaves out Java's package-private constructor.
  /** @hidden */
  protected constructor(outStart: Int32Array, outAdj: Int32Array) {
    this.outStart = outStart;
    this.outAdj = outAdj;
  }

  /** @internal Takes the arrays as they are: neither copied nor checked. */
  static create(outStart: Int32Array, outAdj: Int32Array): Graph {
    return new Graph(outStart, outAdj);
  }

  /**
   * Returns a graph from the two arrays of its CSR layout, as {@link Csr} returns them and
   * {@link Graph.writeTo} writes them.
   *
   * The out-nodes of node `v` are
   * `outAdjacency[outAdjacencyStart[v]..outAdjacencyStart[v + 1] - 1]`, and the position of an
   * out-node in `outAdjacency` is the edge index of its edge. For example, the control flow of a
   * method with a loop:
   *
   * <!-- example: building.ts#of -->
   * ```ts
   * // blocks 0..5: entry, header, body, then, next, exit
   * const outAdjacencyStart = [0, 1, 3, 5, 6, 7, 7];
   * const outAdjacency = [
   *   1,       // entry  -> header
   *   2, 5,    // header -> body, exit
   *   3, 4,    // body   -> then, next
   *   4,       // then   -> next
   *   1];      // next   -> header
   * const cfg = Graph.of(outAdjacencyStart, outAdjacency);
   * ```
   *
   * Both arrays are copied and checked: the offsets start at `0`, never decrease and end at
   * `outAdjacency.length`, and the out-nodes of each node are strictly ascending. For edges in any
   * order or with duplicates, use {@link GraphBuilder}.
   *
   * **Time:** O(nodeCount + edgeCount).
   * **Memory:** 4 x (nodeCount + edgeCount) bytes for the copies, which the result keeps.
   *
   * @param outAdjacencyStart where the out-nodes of each node start in `outAdjacency`, followed by
   *     `edgeCount`; length `nodeCount + 1`; any array of numbers
   * @param outAdjacency the out-nodes of all nodes, node after node; length `edgeCount`
   * @returns the graph
   * @throws RangeError if an out-node is not in `0..nodeCount-1`, which includes one that is not an
   *     integer
   * @throws Error if an offset is not an `int`, `outAdjacencyStart` is empty, does not start at
   *     `0`, decreases or does not end at `outAdjacency.length`, the out-nodes of a node are not
   *     strictly ascending, or the arrays hold more nodes or edges than a graph can have
   */
  static of(outAdjacencyStart: ArrayLike<number>, outAdjacency: ArrayLike<number>): Graph {
    const start = copyInts(outAdjacencyStart);
    // An out-node that is not an int is copied as -1, which fails the range check of ofOwned at its
    // place among Java's checks; the message then names the value the caller passed.
    const adjacency = copyOutNodes(outAdjacency);
    return Graph.ofOwned(start, adjacency, outAdjacency);
  }

  /**
   * @internal {@link Graph.of} without the copy, for arrays nobody else holds, as readFrom reads
   * them. `passedOutNodes` are the out-nodes as the caller passed them, for the message of an
   * out-node out of range.
   */
  static ofOwned(
    outAdjacencyStart: Int32Array,
    outAdjacency: Int32Array,
    passedOutNodes: ArrayLike<number> = outAdjacency,
  ): Graph {
    if (outAdjacencyStart.length === 0) {
      throw new Error("outAdjacencyStart must hold nodeCount + 1 offsets, but is empty");
    }
    const n = outAdjacencyStart.length - 1;
    const m = outAdjacency.length;
    if (n > ArrayLimits.MAX_NODE_COUNT || m > ArrayLimits.MAX_ARRAY_LENGTH) {
      throw new Error(
        `a graph holds at most ${ArrayLimits.MAX_NODE_COUNT} nodes and ${ArrayLimits.MAX_ARRAY_LENGTH} edges, but these arrays hold ${n} and ${m}`,
      );
    }
    if (outAdjacencyStart[0] !== 0) {
      throw new Error(`outAdjacencyStart[0] must be 0, but was ${outAdjacencyStart[0]}`);
    }
    // Offsets first: once they rise from 0 to m, every list below lies inside outAdjacency.
    for (let v = 0; v < n; v++) {
      if (outAdjacencyStart[v + 1] < outAdjacencyStart[v]) {
        throw new Error(
          `outAdjacencyStart decreases after node ${v}: ${outAdjacencyStart[v]} > ${outAdjacencyStart[v + 1]}`,
        );
      }
    }
    if (outAdjacencyStart[n] !== m) {
      throw new Error(`outAdjacencyStart[${n}] must be outAdjacency.length ${m}, but was ${outAdjacencyStart[n]}`);
    }
    for (let v = 0; v < n; v++) {
      const end = outAdjacencyStart[v + 1];
      let previous = -1;
      for (let e = outAdjacencyStart[v]; e < end; e++) {
        const target = outAdjacency[e];
        if (target < 0 || target >= n) {
          throw new RangeError(`out-node ${passedOutNodes[e]} of node ${v} at position ${e} is not in 0..${n - 1}`);
        }
        if (target <= previous) {
          throw new Error(`the out-nodes of node ${v} must be strictly ascending, but ${target} follows ${previous}`);
        }
        previous = target;
      }
    }
    return new Graph(outAdjacencyStart, outAdjacency);
  }

  /**
   * Writes this graph to `out`, for {@link Graph.readFrom} to read back with the same node IDs and
   * edge indices.
   *
   * Only the structure is written. Data in arrays indexed by node ID or edge index stays valid for
   * the graph read back and can follow it in the same file or stream. Here, the names of the
   * methods of a program follow the calls between them:
   *
   * <!-- example: storing.ts#writeTo -->
   * ```ts
   * const fd = openSync(file, "w");
   * try {
   *   calls.writeTo({ write: (chunk) => writeSync(fd, chunk) });
   *   writeSync(fd, JSON.stringify(names));
   * } finally {
   *   closeSync(fd);
   * }
   * ```
   *
   * A {@link BiAdjacentGraph} writes its out-adjacency only.
   *
   * The format is the two arrays that {@link Graph.of} takes, preceded by the node count and the
   * edge count. Every field is a signed 32-bit integer in little-endian byte order:
   *
   * | offset in bytes | size in bytes | field |
   * |---|---|---|
   * | 0 | 4 | nodeCount |
   * | 4 | 4 | edgeCount |
   * | 8 | 4 x (nodeCount + 1) | outAdjacencyStart |
   * | 8 + 4 x (nodeCount + 1) | 4 x edgeCount | outAdjacency |
   *
   * The arrays follow the rules of {@link Graph.of}. Nothing else is written: no padding, checksum,
   * magic number or version. So a graph takes exactly 8 + 4 x (nodeCount + 1 + edgeCount) bytes,
   * and {@link Graph.readFrom} recognizes foreign data only where it does not form a valid graph.
   * Every implementation of Graphity reads and writes this format, so a graph written in one
   * language can be read in another.
   *
   * Passes the header and then the arrays. Where the platform is little-endian, each array goes in
   * one chunk, which is a view of the graph's own array, so nothing is copied. Otherwise the chunks
   * are little-endian copies in blocks of 64 KiB. A file stream therefore needs no buffering of its
   * own.
   *
   * **Time:** O(nodeCount + edgeCount).
   * **Memory:** 8 bytes for the header; where the platform is big-endian, 4 x (nodeCount + 1 +
   * edgeCount) bytes for the copies.
   *
   * @param out where the bytes go, for instance a file stream of Node.js; not closed
   * @throws Error what `out.write` throws (Java: `IOException`); only a `write` that throws fails
   *     the call. A stream reports its errors through its own event or promise, which the caller
   *     must watch (see {@link ByteSink})
   */
  writeTo(out: ByteSink): void {
    writeCsr(this.outStart, this.outAdj, out);
  }

  /**
   * Reads a graph that {@link Graph.writeTo} wrote, with the same node IDs and edge indices.
   *
   * Reads the graph at the start of `bytes`. Data written after the graph follows it at offset 8 +
   * 4 x (nodeCount + 1 + edgeCount); the bytes from there on are not read. Here, that data is the
   * names of the methods of a program:
   *
   * <!-- example: storing.ts#readFrom -->
   * ```ts
   * const bytes = readFileSync(file);
   * // equal to the graph written, edge indices included
   * const calls = Graph.readFrom(bytes);
   * // The names follow the graph, which takes 8 + 4 x (nodeCount + 1 + edgeCount) bytes.
   * const namesStart = 8 + 4 * (calls.nodeCount + 1 + calls.edgeCount);
   * const names: string[] = JSON.parse(bytes.subarray(namesStart).toString("utf8"));
   * ```
   *
   * The result has no in-adjacency, even if the data was written from a {@link BiAdjacentGraph} and
   * even when called as `BiAdjacentGraph.readFrom(bytes)`; {@link BiAdjacentGraph.of} builds it
   * again.
   *
   * The arrays are checked as by {@link Graph.of}, but not copied. Where the platform is
   * little-endian and an array lies 4-byte aligned in the buffer of `bytes`, the graph keeps a view
   * of that buffer, which must not change afterwards. Otherwise it keeps a converted copy. The
   * length of the data is checked against the header before anything is allocated, so a header that
   * announces more than the data holds ends in an `Error`, not in an allocation of the announced
   * size.
   *
   * **Time:** O(nodeCount + edgeCount).
   * **Memory:** none for views, which keep the whole buffer of `bytes` reachable as long as the
   * graph is; otherwise 4 x (nodeCount + edgeCount) bytes for the result. To keep only the graph,
   * copy it with {@link Graph.of}, or pass a copy of its bytes:
   * `bytes.slice(0, 8 + 4 * (nodeCount + 1 + edgeCount))`.
   *
   * @param bytes the data to read, for instance the content of a file
   * @returns the graph
   * @throws Error if the data ends before the graph does (Java: `EOFException`), a count in the
   *     header is negative or larger than a graph can have, or the arrays do not form a graph that
   *     {@link Graph.of} accepts, whose error is then the `cause` (Java: `IOException`)
   */
  static readFrom(bytes: Uint8Array): Graph {
    const arrays = readCsr(bytes);
    try {
      return Graph.ofOwned(arrays.outAdjacencyStart, arrays.outAdjacency);
    } catch (e) {
      throw new Error(`the data does not hold a valid graph: ${(e as Error).message}`, { cause: e });
    }
  }

  /**
   * The number of nodes.
   *
   * **Time:** O(1).
   */
  get nodeCount(): number {
    return this.outStart.length - 1;
  }

  /**
   * The number of edges.
   *
   * **Time:** O(1).
   */
  get edgeCount(): number {
    return this.outAdj.length;
  }

  /**
   * Whether this graph has no nodes. Equivalent to `nodeCount === 0`.
   *
   * **Time:** O(1).
   */
  get isEmpty(): boolean {
    return this.outStart.length === 1;
  }

  /**
   * Returns the out-degree of `node`. That is the number of edges with `node` as source.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns out-degree
   * @throws RangeError if `node` is out of range
   */
  outDegree(node: number): number {
    checkIndex(node, this.outStart.length - 1);
    return this.outStart[node + 1] - this.outStart[node];
  }

  /**
   * Returns the out-nodes of `node` in ascending order. These are the targets of the edges with
   * `node` as source.
   *
   * The result is a view of this graph's own array, not a copy.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns out-nodes
   * @throws RangeError if `node` is out of range
   */
  outNodes(node: number): SortedIntView {
    checkIndex(node, this.outStart.length - 1);
    return SortedIntView.create(this.outAdj, this.outStart[node], this.outStart[node + 1]);
  }

  /**
   * Returns the start of the edge index range of the out-edges of `node`. The out-edges are the
   * edges with `node` as source.
   *
   * Their edge indices are `outEdgeStart(node)..outEdgeEnd(node)-1`, in the order of
   * {@link Graph.outNodes}; the range is empty if `node` has no out-edges. A loop over the range
   * reads the data of each edge from arrays indexed by edge index. Here, it lists the methods that
   * `run` calls, with the number of call sites of each call in `siteCount`:
   *
   * <!-- example: edgeData.ts#outEdges -->
   * ```ts
   * for (let edge = calls.outEdgeStart(run); edge < calls.outEdgeEnd(run); edge++) {
   *   console.log(`${names[calls.edgeTarget(edge)]}: ${siteCount[edge]}`);
   * }
   * // load: 1
   * // save: 1
   * // show: 2
   * ```
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns start of the range
   * @throws RangeError if `node` is out of range
   */
  outEdgeStart(node: number): number {
    checkIndex(node, this.outStart.length - 1);
    return this.outStart[node];
  }

  /**
   * Returns the end, exclusive, of the edge index range of the out-edges of `node`; see
   * {@link Graph.outEdgeStart}.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns end of the range, exclusive
   * @throws RangeError if `node` is out of range
   */
  outEdgeEnd(node: number): number {
    checkIndex(node, this.outStart.length - 1);
    return this.outStart[node + 1];
  }

  /**
   * Returns the node IDs `0..nodeCount-1` as a generator, in ascending order (Java: an
   * `IntStream`).
   *
   * **Time:** O(1) to create the generator.
   *
   * @returns node IDs
   */
  *nodes(): Generator<number, void, undefined> {
    for (let v = 0, n = this.nodeCount; v < n; v++) yield v;
  }

  /**
   * Calls `action` for every edge with its source, target and edge index, in edge index order.
   *
   * The source comes with each edge at no cost, whereas {@link Graph.edgeSource} searches for it.
   *
   * **Time:** O(nodeCount + edgeCount).
   *
   * @param action called with `(source, target, edgeIndex)` for each edge
   */
  forEachEdge(action: EdgeConsumer): void {
    const start = this.outStart;
    const adj = this.outAdj;
    for (let source = 0, n = start.length - 1; source < n; source++) {
      for (let e = start[source], end = start[source + 1]; e < end; e++) action(source, adj[e], e);
    }
  }

  /**
   * Returns the target of edge `edgeIndex`.
   *
   * **Time:** O(1).
   *
   * @param edgeIndex edge index in `0..edgeCount-1`
   * @returns target node ID
   * @throws RangeError if `edgeIndex` is out of range
   */
  edgeTarget(edgeIndex: number): number {
    checkIndex(edgeIndex, this.outAdj.length);
    return this.outAdj[edgeIndex];
  }

  /**
   * Returns the source of edge `edgeIndex`.
   *
   * Unlike the target, the source is searched for; {@link Graph.forEachEdge} gives every edge with
   * its source without a search.
   *
   * **Time:** O(log nodeCount).
   *
   * @param edgeIndex edge index in `0..edgeCount-1`
   * @returns source node ID
   * @throws RangeError if `edgeIndex` is out of range
   */
  edgeSource(edgeIndex: number): number {
    checkIndex(edgeIndex, this.outAdj.length);
    // The largest node with outStart[node] <= edgeIndex: a node without out-edges shares its
    // offset with the next one.
    const start = this.outStart;
    let lo = 0;
    let hi = start.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (start[mid] <= edgeIndex) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /**
   * Returns whether the edge `node -> outNode` exists.
   *
   * **Time:** O(log outDegree(node)).
   *
   * @param node node ID in `0..nodeCount-1`
   * @param outNode node ID; a value out of range yields `false`
   * @returns `true` if the edge exists
   * @throws RangeError if `node` is out of range
   */
  hasOutNode(node: number, outNode: number): boolean {
    checkIndex(node, this.outStart.length - 1);
    return containsInRange(this.outAdj, this.outStart[node], this.outStart[node + 1], outNode);
  }

  /**
   * Returns the edge index of the edge `source -> target`, or `-1` if there is none.
   *
   * {@link GraphBuilder} sorts the edges and merges duplicates, so an edge does not keep the
   * position at which it was added; this method finds where it went. Here, `calls` was built with
   * one edge per call site, and the call sites of each call are counted:
   *
   * <!-- example: edgeData.ts#edgeIndexOf -->
   * ```ts
   * const siteCount = new Int32Array(calls.edgeCount);
   * for (const site of callSites) {
   *   siteCount[calls.edgeIndexOf(site.caller, site.callee)]++;
   * }
   * // 2 for run -> show and for parse -> parse, 1 for every other edge
   * ```
   *
   * **Time:** O(log outDegree(source)).
   *
   * @param source node ID in `0..nodeCount-1`
   * @param target node ID; a value out of range yields `-1`
   * @returns edge index in `0..edgeCount-1`, or `-1`
   * @throws RangeError if `source` is out of range
   */
  edgeIndexOf(source: number, target: number): number {
    checkIndex(source, this.outStart.length - 1);
    return indexOfInRange(this.outAdj, this.outStart[source], this.outStart[source + 1], target);
  }

  /**
   * Returns whether `node` has an edge to itself, called a self-loop. Equivalent to
   * `hasOutNode(node, node)`.
   *
   * **Time:** O(log outDegree(node)).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns `true` if the edge `node -> node` exists
   * @throws RangeError if `node` is out of range
   */
  containsSelfLoop(node: number): boolean {
    return this.hasOutNode(node, node);
  }

  /**
   * Returns a graph with the same nodes and edges, without in-adjacency. A plain `Graph` returns
   * itself, and a {@link BiAdjacentGraph} returns a `Graph` over its out-adjacency.
   *
   * **Time:** O(1).
   *
   * @returns this graph, or a graph over the out-adjacency of a `BiAdjacentGraph`
   */
  uniAdjacentGraph(): Graph {
    return this;
  }

  /**
   * Returns whether `other` is a graph with the same nodes and edges (Java: `equals(Object)`).
   *
   * The in-adjacency does not count: a {@link BiAdjacentGraph} equals a `Graph` with the same
   * nodes and edges.
   *
   * **Time:** O(nodeCount + edgeCount).
   */
  equals(other: unknown): boolean {
    if (this === other) return true;
    if (!(other instanceof Graph)) return false;
    return sameInts(this.outStart, other.outStart) && sameInts(this.outAdj, other.outAdj);
  }

  /**
   * Returns a hash code over the nodes and edges, consistent with {@link Graph.equals}. It has the
   * same value as in Java.
   *
   * It is computed on every call, so each lookup of a graph by this hash walks the whole graph.
   * {@link Graphs.topologyHash} gives a 64-bit hash to compute once and keep.
   *
   * **Time:** O(nodeCount + edgeCount).
   */
  hashCode(): number {
    return (Math.imul(31, arrayHashCode(this.outStart)) + arrayHashCode(this.outAdj)) | 0;
  }

  /**
   * Returns the node and edge counts and the out-nodes of the first nodes, for debuggers and logs.
   * For the control flow of a method with a loop:
   *
   * <!-- example: building.ts#toString -->
   * ```ts
   * const text = cfg.toString();
   * // Graph[nodes=6, edges=7] {0 -> [1], 1 -> [2, 5], 2 -> [3, 4], 3 -> [4], 4 -> [1],
   * //                          5 -> []}
   * ```
   *
   * The text stays short however large the graph: it lists at most 16 nodes and 64 out-nodes in
   * total. `...` marks where it is cut - after the 16th node, or inside the list that would go
   * beyond 64 out-nodes. A {@link BiAdjacentGraph} is named as such and lists its out-nodes.
   * {@link Graphs.adjacencyListOf} gives the whole graph as text.
   *
   * **Time:** O(1), as the text is bounded.
   */
  toString(): string {
    const n = this.nodeCount;
    let s = `${this instanceof BiAdjacentGraph ? "BiAdjacentGraph" : "Graph"}[nodes=${n}, edges=${this.edgeCount}] {`;
    let budget = TO_STRING_TARGETS;
    const listed = Math.min(n, TO_STRING_NODES);
    for (let v = 0; v < listed; v++) {
      if (v > 0) s += ", ";
      const start = this.outStart[v];
      const end = this.outStart[v + 1];
      const shown = Math.min(end - start, budget);
      s += `${v} -> [${Array.from(this.outAdj.subarray(start, start + shown)).join(", ")}`;
      budget -= shown;
      if (shown < end - start) {
        s += shown > 0 ? ", ...]" : "...]";
        if (v + 1 < n) s += ", ...";
        return s + "}";
      }
      s += "]";
    }
    if (listed < n) s += ", ...";
    return s + "}";
  }
}

/**
 * A {@link Graph} that also holds the in-nodes of every node, for algorithms that follow edges
 * against their direction.
 *
 * {@link BiAdjacentGraph.of} builds the in-adjacency of a graph - the in-nodes of every node. The
 * result has the node IDs and edge indices of the graph and shares the out-nodes of every node,
 * called its out-adjacency. Algorithms that need in-nodes, such as {@link Dominators}, take a
 * `BiAdjacentGraph`, so that the in-adjacency is built once and serves all of them.
 * {@link BiAdjacentGraph.transposed} reverses every edge without copying, and
 * {@link BiAdjacentGraph.uniAdjacentGraph} drops the in-adjacency again.
 *
 * The in-nodes of a node are in ascending order, like its out-nodes. A `BiAdjacentGraph` equals a
 * `Graph` with the same nodes and edges. Instances are immutable.
 *
 * **Memory:** 8 x (nodeCount + edgeCount) bytes, half of it for the out-adjacency, which is shared
 * with the graph it was built from.
 */
export class BiAdjacentGraph extends Graph {
  /**
   * @internal The in-adjacency in the layout of the out-adjacency: the in-nodes of node `v` are
   * `inAdj[inStart[v]..inStart[v + 1] - 1]`, sorted ascending, with the sentinel
   * `inStart[nodeCount] == edgeCount`. A position in `inAdj` is not an edge index.
   */
  readonly inStart: Int32Array;

  /** @internal The in-nodes of all nodes, node after node; see {@link BiAdjacentGraph.inStart}. */
  readonly inAdj: Int32Array;

  // Takes the arrays as they are, neither copied nor checked: the caller guarantees the layout.
  private constructor(outStart: Int32Array, outAdj: Int32Array, inStart: Int32Array, inAdj: Int32Array) {
    super(outStart, outAdj);
    this.inStart = inStart;
    this.inAdj = inAdj;
  }

  /**
   * Returns a `BiAdjacentGraph` with the nodes and edges of `graph`, building its in-adjacency.
   *
   * Node IDs and edge indices stay the same, and the out-adjacency is shared with `graph`, not
   * copied. The in-adjacency is built anew on every call, not cached: keep the result to use it
   * more than once. If `graph` already is a `BiAdjacentGraph`, returns it.
   *
   * **Time:** O(nodeCount + edgeCount), or O(1) if already bi-adjacent.
   * **Memory:** +4 x (nodeCount + edgeCount) bytes, or none if already bi-adjacent.
   *
   * @param graph the graph to build the in-adjacency for
   * @returns the graph with in-adjacency
   */
  static override of(graph: Graph): BiAdjacentGraph;
  /**
   * Returns a {@link Graph} from the two arrays of its CSR layout, without in-adjacency. This is
   * {@link Graph.of}, inherited as Java's static methods are.
   */
  static override of(outAdjacencyStart: ArrayLike<number>, outAdjacency: ArrayLike<number>): Graph;
  static override of(graph: Graph | ArrayLike<number>, outAdjacency?: ArrayLike<number>): Graph {
    if (!(graph instanceof Graph)) return Graph.of(graph, outAdjacency!);
    return graph instanceof BiAdjacentGraph ? graph : BiAdjacentGraph.withInAdjacency(graph);
  }

  // The body of of(Graph) for a graph without in-adjacency.
  private static withInAdjacency(graph: Graph): BiAdjacentGraph {
    const n = graph.nodeCount;
    const m = graph.edgeCount;
    const outStart = graph.outStart;
    const outAdj = graph.outAdj;
    const inStart = new Int32Array(n + 1);
    const inAdj = new Int32Array(m);

    // 1) Count in-degrees.
    for (let e = 0; e < m; e++) inStart[outAdj[e]]++;

    // 2) Prefix sum: in-degrees to start offsets.
    let nextStart = 0;
    for (let v = 0; v < n; v++) {
      const inDegree = inStart[v];
      inStart[v] = nextStart;
      nextStart += inDegree;
    }

    // 3) Fill the in-adjacency; inStart[target]++ doubles as write pointer. The ascending node
    //    scan leaves each in-list sorted.
    for (let v = 0; v < n; v++) {
      for (let e = outStart[v], end = outStart[v + 1]; e < end; e++) inAdj[inStart[outAdj[e]]++] = v;
    }

    // 4) Repair: step 3 shifted inStart left by one; a right shift restores it, sentinel included.
    for (let v = n; v > 0; v--) inStart[v] = inStart[v - 1];
    inStart[0] = 0;

    return new BiAdjacentGraph(outStart, outAdj, inStart, inAdj);
  }

  /**
   * Returns the in-degree of `node`. That is the number of edges with `node` as target.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns in-degree
   * @throws RangeError if `node` is out of range
   */
  inDegree(node: number): number {
    checkIndex(node, this.inStart.length - 1);
    return this.inStart[node + 1] - this.inStart[node];
  }

  /**
   * Returns the in-nodes of `node` in ascending order. These are the sources of the edges with
   * `node` as target.
   *
   * The result is a view of this graph's own array, not a copy.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns in-nodes
   * @throws RangeError if `node` is out of range
   */
  inNodes(node: number): SortedIntView {
    checkIndex(node, this.inStart.length - 1);
    return SortedIntView.create(this.inAdj, this.inStart[node], this.inStart[node + 1]);
  }

  /**
   * Returns whether the edge `inNode -> node` exists.
   *
   * **Time:** O(log inDegree(node)).
   *
   * @param node node ID in `0..nodeCount-1`
   * @param inNode node ID; a value out of range yields `false`
   * @returns `true` if the edge exists
   * @throws RangeError if `node` is out of range
   */
  hasInNode(node: number, inNode: number): boolean {
    checkIndex(node, this.inStart.length - 1);
    return containsInRange(this.inAdj, this.inStart[node], this.inStart[node + 1], inNode);
  }

  /**
   * Returns a `Graph` with the same nodes and edges, without the in-adjacency.
   *
   * The result shares the out-adjacency of this graph; nothing is copied. Once only the result is
   * kept, the in-adjacency can be garbage-collected.
   *
   * **Time:** O(1).
   *
   * @returns a graph over the out-adjacency of this graph
   */
  override uniAdjacentGraph(): Graph {
    return Graph.create(this.outStart, this.outAdj);
  }

  /**
   * Returns the transposed graph as a view of this graph's arrays. The transposed graph has every
   * edge reversed.
   *
   * Node IDs stay the same, edge indices do not: edge `e` of the transposed graph is in general not
   * the reverse of edge `e` of this graph. {@link BiAdjacentGraph.transposedEdgeIndex} translates
   * one edge index, and {@link Graphs.transposedEdgeMapping} translates all of them.
   *
   * A plain {@link Graph} needs its in-adjacency first: `BiAdjacentGraph.of(graph).transposed()`.
   * Here, the packages of a program that depend on `model`, directly or indirectly, are the ones
   * reachable from it against the direction of the dependencies:
   *
   * <!-- example: transposing.ts#transposed -->
   * ```ts
   * const model = 4;
   * const usedBy = BiAdjacentGraph.of(dependencies).transposed();
   * const affected = Graphs.reachableFrom(usedBy, model);
   * // affected: [0, 2, 3, 4, 5] - app, ui, service, model and storage
   * ```
   *
   * **Time:** O(1).
   *
   * @returns the transposed graph
   */
  transposed(): BiAdjacentGraph {
    return new BiAdjacentGraph(this.inStart, this.inAdj, this.outStart, this.outAdj);
  }

  /**
   * Returns the edge index that edge `edgeIndex` has in the transposed graph.
   *
   * Called on {@link BiAdjacentGraph.transposed}, it translates back:
   * `transposed().transposedEdgeIndex(transposedEdgeIndex(e)) === e`. To translate every edge,
   * {@link Graphs.transposedEdgeMapping} needs one pass instead of a search per edge; it maps from
   * the transposed graph to this one.
   *
   * **Time:** O(log nodeCount).
   *
   * @param edgeIndex edge index in `0..edgeCount-1`
   * @returns edge index in the transposed graph
   * @throws RangeError if `edgeIndex` is out of range
   */
  transposedEdgeIndex(edgeIndex: number): number {
    checkIndex(edgeIndex, this.outAdj.length);
    const source = this.edgeSource(edgeIndex);
    const target = this.outAdj[edgeIndex];
    return indexOfInRange(this.inAdj, this.inStart[target], this.inStart[target + 1], source);
  }

  /**
   * Returns the degree of `node`. Equivalent to `inDegree(node) + outDegree(node)`.
   *
   * It counts edges, not neighbors: a self-loop counts twice, and so do the edges `node -> v` and
   * `v -> node`, although `v` is one neighbor.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns degree
   * @throws RangeError if `node` is out of range
   */
  degree(node: number): number {
    return this.inDegree(node) + this.outDegree(node);
  }

  /**
   * Returns the neighbors of `node` in ascending order and without duplicates. These are its
   * in-nodes and out-nodes.
   *
   * Unlike {@link BiAdjacentGraph.inNodes} and {@link Graph.outNodes}, which are views, the result
   * is a copy, merged on every call.
   *
   * **Time:** O(inDegree(node) + outDegree(node)).
   * **Memory:** up to 4 x (inDegree(node) + outDegree(node)) bytes for the result; while it runs,
   * up to as much again if a neighbor is both an in-node and an out-node.
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns neighbors
   * @throws RangeError if `node` is out of range
   */
  neighbors(node: number): SortedIntView {
    checkIndex(node, this.inStart.length - 1);
    const outStart = this.outStart;
    return SortedIntView.create(
      unionInRange(
        this.outAdj,
        outStart[node],
        outStart[node + 1],
        this.inAdj,
        this.inStart[node],
        this.inStart[node + 1],
      ),
    );
  }

  /**
   * Returns whether `neighbor` is a neighbor of `node`. Equivalent to
   * `hasOutNode(node, neighbor) || hasInNode(node, neighbor)`.
   *
   * **Time:** O(log outDegree(node) + log inDegree(node)).
   *
   * @param node node ID in `0..nodeCount-1`
   * @param neighbor node ID; a value out of range yields `false`
   * @returns `true` if `neighbor` is an in-node or an out-node of `node`
   * @throws RangeError if `node` is out of range
   */
  hasNeighbor(node: number, neighbor: number): boolean {
    return this.hasOutNode(node, neighbor) || this.hasInNode(node, neighbor);
  }

  /**
   * Returns whether `node` is a root node. Equivalent to `inDegree(node) === 0`.
   *
   * {@link Graphs.rootNodes} returns all root nodes.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns `true` if no edge has `node` as target
   * @throws RangeError if `node` is out of range
   */
  isRootNode(node: number): boolean {
    return this.inDegree(node) === 0;
  }
}

/**
 * Access to the arrays in which a graph keeps its edges, for algorithm code that loops over all
 * edges. These arrays are called the CSR (compressed sparse row) layout of the graph.
 *
 * Each method returns the graph's own array, not a copy. The out-nodes of node `v` are
 * `outAdjacency[outAdjacencyStart[v]..outAdjacencyStart[v + 1] - 1]`, in ascending order, and the
 * position of an out-node in `outAdjacency` is the edge index of its edge. `outAdjacencyStart` has
 * `nodeCount + 1` values, from `0` to `edgeCount`. A loop loads the two arrays into local variables
 * once and reads them without a method call or an argument check per edge. Here, `calls` holds the
 * calls between the methods of a program, and the loop counts the callers of each method:
 *
 * <!-- example: buildingAndReading.ts#loop -->
 * ```ts
 * const start = Csr.outAdjacencyStart(calls);
 * const callees = Csr.outAdjacency(calls);
 * const callerCount = new Int32Array(calls.nodeCount);
 * for (let method = 0; method < calls.nodeCount; method++) {
 *   for (let edge = start[method], end = start[method + 1]; edge < end; edge++) {
 *     callerCount[callees[edge]]++;
 *   }
 * }
 * // callerCount: 3 for format, 2 for parse, 0 for main, 1 for every other method
 * ```
 *
 * A {@link BiAdjacentGraph} also holds the in-nodes of every node, called its in-adjacency. The
 * in-adjacency has the same layout, in {@link Csr.inAdjacencyStart} and {@link Csr.inAdjacency}. A
 * position in `inAdjacency` is not an edge index of the graph, though, but of its transposed graph;
 * {@link Graphs.transposedEdgeMapping} translates all of them in one pass.
 *
 * The arrays must not be modified. Nothing prevents a write, but it changes the graph for everyone
 * who holds it and breaks what every algorithm relies on: that the graph is immutable, and that the
 * out-nodes of each node are sorted. The algorithms of this library read the arrays the same way.
 * Code that reads the out-nodes of a few nodes is better served by {@link Graph.outNodes} and the
 * edge index methods of {@link Graph}, which check their arguments.
 */
export const Csr = {
  /**
   * Returns where the out-nodes of each node start in {@link Csr.outAdjacency}, followed by
   * `edgeCount`.
   *
   * **Time:** O(1).
   *
   * @param graph the graph
   * @returns the graph's own array, of length `nodeCount + 1`; not to be modified
   */
  outAdjacencyStart(graph: Graph): Int32Array {
    return graph.outStart;
  },

  /**
   * Returns the out-nodes of all nodes, node after node, at the positions of their edge indices.
   *
   * **Time:** O(1).
   *
   * @param graph the graph
   * @returns the graph's own array, of length `edgeCount`; not to be modified
   */
  outAdjacency(graph: Graph): Int32Array {
    return graph.outAdj;
  },

  /**
   * Returns where the in-nodes of each node start in {@link Csr.inAdjacency}, followed by
   * `edgeCount`.
   *
   * **Time:** O(1).
   *
   * @param graph the graph
   * @returns the graph's own array, of length `nodeCount + 1`; not to be modified
   */
  inAdjacencyStart(graph: BiAdjacentGraph): Int32Array {
    return graph.inStart;
  },

  /**
   * Returns the in-nodes of all nodes, node after node.
   *
   * A position in this array is the edge index of the edge in the transposed graph, not in
   * `graph`.
   *
   * **Time:** O(1).
   *
   * @param graph the graph
   * @returns the graph's own array, of length `edgeCount`; not to be modified
   */
  inAdjacency(graph: BiAdjacentGraph): Int32Array {
    return graph.inAdj;
  },
} as const;

/** @internal The graph without nodes. */
export function emptyGraph(): Graph {
  return Graph.create(new Int32Array(1), new Int32Array(0));
}

/**
 * Copies the offsets of {@link Graph.of} into a new `Int32Array`, rejecting a value that is not an
 * `int`, which the typed array would otherwise truncate: a fraction, `NaN`, a value beyond 32 bits,
 * a hole.
 */
function copyInts(values: ArrayLike<number>): Int32Array {
  if (values instanceof Int32Array) return values.slice();
  const copy = new Int32Array(values.length);
  for (let i = 0; i < copy.length; i++) {
    const value = values[i];
    if ((value | 0) !== value) throw new Error(`outAdjacencyStart[${i}] must be an int, but was ${value}`);
    copy[i] = value;
  }
  return copy;
}

/** The out-nodes of {@link Graph.of} as an `Int32Array`, with -1 for every value that is not an int. */
function copyOutNodes(values: ArrayLike<number>): Int32Array {
  if (values instanceof Int32Array) return values.slice();
  const copy = new Int32Array(values.length);
  for (let i = 0; i < copy.length; i++) {
    const value = values[i];
    copy[i] = (value | 0) === value ? value : -1;
  }
  return copy;
}
