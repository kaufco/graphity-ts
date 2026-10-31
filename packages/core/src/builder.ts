import { ArrayLimits } from "./arrayLimits.js";
import type { Edges } from "./edges.js";
import { Graph } from "./graph.js";
import { IntBuffer, sortRange } from "./internal.js";
import { type IntList, IntLists, SortedIntView } from "./sortedIntView.js";

/**
 * A builder for a {@link Graph}, from nodes and edges added in any order.
 *
 * The nodes added so far have the node IDs `0..nodeCount-1`, in the order they were added;
 * {@link GraphBuilder.addNode} and {@link GraphBuilder.addNodes} return the IDs of new ones. Edges
 * name their source and target by node ID, in any order and as often as the input has them. Here,
 * the calls between the methods of a program are built from its call sites, one edge per call
 * site; `names` holds the names of the methods:
 *
 * <!-- example: buildingAndReading.ts#build -->
 * ```ts
 * const builder = new GraphBuilder();
 * builder.addNodes(names.length);    // one node per method, numbered as in names
 * for (const site of callSites) {
 *   builder.addEdge(site.caller, site.callee);
 * }
 * const calls = builder.build();
 * // 14 call sites, 12 edges: run -> show and parse -> parse were added twice
 * ```
 *
 * {@link GraphBuilder.build} sorts the edges into edge index order and merges duplicates. The
 * builder stays usable afterwards: more nodes and edges can be added, and `build()` called again.
 *
 * Besides single edges, the builder takes edges in batches: the out-edges or in-edges of one node
 * ({@link GraphBuilder.addOutEdges}, {@link GraphBuilder.addInEdges}), a path
 * ({@link GraphBuilder.addPath}), pairs of node IDs ({@link GraphBuilder.addEdgePairs}), the edges
 * of an algorithm result ({@link GraphBuilder.addEdges}) or a whole graph
 * ({@link GraphBuilder.addGraph}). {@link GraphBuilder.addChild}, {@link GraphBuilder.addParent}
 * and their plural forms add new nodes together with their edges. The out-edges, in-edges and paths
 * take their node IDs as loose arguments or as an {@link IntList}, such as the
 * {@link SortedIntView} that {@link Graph.outNodes} returns. So a result of this library goes in
 * without being copied into an array first. A list is read during the call and not kept. Here, part
 * of the dependencies between the packages of a program is built, with the node IDs of
 * `dependencies`:
 *
 * <!-- example: buildingAndReading.ts#argumentForms -->
 * ```ts
 * const builder = new GraphBuilder();
 * builder.addNodes(dependencies.nodeCount);
 * builder.addOutEdges(0, 1, 2, 3);                   // loose arguments
 * builder.addOutEdges(2, [3, 4, 7]);                 // an array or a typed array
 * builder.addOutEdges(3, dependencies.outNodes(3));  // a SortedIntView, without a copy
 * const someDependencies = builder.build();
 * // app -> [cli, ui, service], ui -> [service, model, util],
 * // service -> [model, storage]
 * ```
 *
 * A method that takes the node ID of an existing node throws a `RangeError` if it is not in
 * `0..nodeCount-1`, so that an edge to a missing node fails at the call. A batch method that throws
 * adds nothing. The methods that add edges between given nodes each have a twin with the suffix
 * `AndNodes`, such as {@link GraphBuilder.addEdgeAndNodes}, which adds missing nodes instead. A
 * twin raises the node count to one more than the highest node ID it is given, and the nodes in
 * between are added too, without edges. So a graph can be built from input numbered elsewhere
 * without counting its nodes first. However, a node ID that is too high adds nodes instead of
 * failing.
 *
 * Nodes and edges cannot be removed. To leave nodes out, build the graph and take a subgraph with
 * {@link Graphs.remapped} and {@link NodeMapping.forSubgraph}.
 *
 * Instances are mutable.
 *
 * **Memory:** 8 bytes per added edge, duplicates included, plus room to grow.
 *
 * A builder holds at most 2^31 - 10 nodes, as many as a graph can have. This number is the _node
 * limit_. A method that would add more throws before it changes anything. A builder builds a graph
 * from at most 2^31 - 9 added edges, duplicates included. This number is the _edge limit_. A batch
 * method that would add more throws an `Error` and adds nothing. The single-edge methods
 * {@link GraphBuilder.addEdge}, {@link GraphBuilder.addEdgeAndNodes}, {@link GraphBuilder.addChild}
 * and {@link GraphBuilder.addParent} do not check the edge limit: beyond it,
 * {@link GraphBuilder.build} throws an `Error`, and the single-edge methods throw once the engine
 * cannot grow the edge storage any further (Java: `OutOfMemoryError`).
 */
export class GraphBuilder {
  // The node count, and the edges as added: source and target at the same position. Duplicates
  // stay until build().
  private nodeCount = 0;
  private readonly edgeSources = new IntBuffer();
  private readonly edgeTargets = new IntBuffer();

  /** Creates an empty builder, without nodes or edges. */
  constructor() {}

  /**
   * Makes room for `totalEdges` edges in total, so that adding up to that many allocates nothing
   * more.
   *
   * The argument counts all edges the builder will hold, duplicates included, not the ones still to
   * come. It can be called at any time and does not change the graph that
   * {@link GraphBuilder.build} returns.
   *
   * **Time:** O(totalEdges) if the room does not suffice yet, otherwise O(1).
   * **Memory:** 8 x totalEdges bytes if the room does not suffice yet, otherwise none.
   *
   * @param totalEdges the number of edges to make room for, duplicates included
   * @throws Error if `totalEdges` is not an integer, negative or above the edge limit
   */
  ensureEdgeCapacity(totalEdges: number): void {
    if (!Number.isInteger(totalEdges)) throw new Error(`totalEdges must be an integer: ${totalEdges}`);
    if (totalEdges < 0) throw new Error(`totalEdges must be non-negative: ${totalEdges}`);
    if (totalEdges > ArrayLimits.MAX_ARRAY_LENGTH) {
      throw new Error(`totalEdges ${totalEdges} exceeds the edge limit of ${ArrayLimits.MAX_ARRAY_LENGTH}`);
    }
    this.edgeSources.ensureCapacity(totalEdges);
    this.edgeTargets.ensureCapacity(totalEdges);
  }

  /**
   * Adds a node and returns its node ID, which is the next in order.
   *
   * **Time:** O(1).
   *
   * @returns node ID of the new node
   * @throws Error if the node count has reached the node limit (Java: `IllegalStateException`)
   */
  addNode(): number {
    this.checkRoomForNode();
    return this.nodeCount++;
  }

  /**
   * Adds `count` nodes and returns the node ID of the first; the others follow in order.
   *
   * **Time:** O(1).
   *
   * @param count number of nodes to add
   * @returns node ID of the first new node
   * @throws Error if `count` is not an integer, is negative, or the nodes would exceed the node
   *     limit
   */
  addNodes(count: number): number {
    this.checkNewNodeCount(count);
    const firstId = this.nodeCount;
    this.nodeCount += count;
    return firstId;
  }

  /**
   * Adds a node with an edge from `parent` to it, and returns its node ID.
   *
   * **Time:** O(1) amortized.
   *
   * @param parent node ID in `0..nodeCount-1`
   * @returns node ID of the new node
   * @throws Error if the node count has reached the node limit (Java: `IllegalStateException`)
   * @throws RangeError if `parent` is out of range
   */
  addChild(parent: number): number {
    this.checkRoomForNode();
    this.checkNode(parent, "parent");
    const child = this.nodeCount++;
    this.edgeSources.push(parent);
    this.edgeTargets.push(child);
    return child;
  }

  /**
   * Adds `count` nodes, each with an edge from `parent` to it, and returns the node ID of the
   * first; the others follow in order.
   *
   * **Time:** O(count) amortized.
   *
   * @param parent node ID in `0..nodeCount-1`
   * @param count number of nodes to add
   * @returns node ID of the first new node
   * @throws Error if `count` is not an integer, is negative, or the nodes or edges would exceed
   *     their limit
   * @throws RangeError if `parent` is out of range
   */
  addChildren(parent: number, count: number): number {
    this.checkNewNodeCount(count);
    this.checkNode(parent, "parent");
    this.reserve(count);
    const firstId = this.nodeCount;
    this.nodeCount += count;
    for (let i = 0; i < count; i++) {
      this.edgeSources.push(parent);
      this.edgeTargets.push(firstId + i);
    }
    return firstId;
  }

  /**
   * Adds a node with an edge from it to `child`, and returns its node ID.
   *
   * **Time:** O(1) amortized.
   *
   * @param child node ID in `0..nodeCount-1`
   * @returns node ID of the new node
   * @throws Error if the node count has reached the node limit (Java: `IllegalStateException`)
   * @throws RangeError if `child` is out of range
   */
  addParent(child: number): number {
    this.checkRoomForNode();
    this.checkNode(child, "child");
    const parent = this.nodeCount++;
    this.edgeSources.push(parent);
    this.edgeTargets.push(child);
    return parent;
  }

  /**
   * Adds `count` nodes, each with an edge from it to `child`, and returns the node ID of the first;
   * the others follow in order.
   *
   * **Time:** O(count) amortized.
   *
   * @param child node ID in `0..nodeCount-1`
   * @param count number of nodes to add
   * @returns node ID of the first new node
   * @throws Error if `count` is not an integer, is negative, or the nodes or edges would exceed
   *     their limit
   * @throws RangeError if `child` is out of range
   */
  addParents(child: number, count: number): number {
    this.checkNewNodeCount(count);
    this.checkNode(child, "child");
    this.reserve(count);
    const firstId = this.nodeCount;
    this.nodeCount += count;
    for (let i = 0; i < count; i++) {
      this.edgeSources.push(firstId + i);
      this.edgeTargets.push(child);
    }
    return firstId;
  }

  /**
   * Adds the edge `source -> target`.
   *
   * An edge added more than once is still one edge in the graph: {@link GraphBuilder.build} merges
   * duplicates.
   *
   * **Time:** O(1) amortized.
   *
   * @param source node ID in `0..nodeCount-1`
   * @param target node ID in `0..nodeCount-1`
   * @throws RangeError if `source` or `target` is out of range
   */
  addEdge(source: number, target: number): void {
    this.checkNode(source, "source");
    this.checkNode(target, "target");
    this.edgeSources.push(source);
    this.edgeTargets.push(target);
  }

  /**
   * Adds the edge `source -> target`, and the missing nodes up to the higher of the two node IDs.
   *
   * **Time:** O(1) amortized.
   *
   * @param source node ID, `0` or more
   * @param target node ID, `0` or more
   * @throws RangeError if `source` or `target` is negative or not below the node limit
   */
  addEdgeAndNodes(source: number, target: number): void {
    checkCreatable(source);
    checkCreatable(target);
    this.raiseNodeCount(Math.max(source, target));
    this.edgeSources.push(source);
    this.edgeTargets.push(target);
  }

  /**
   * Adds an edge from `source` to each node of `targets`.
   *
   * **Time:** O(number of targets) amortized.
   *
   * @param source node ID in `0..nodeCount-1`
   * @param targets node IDs in `0..nodeCount-1`
   * @throws Error if the edges would exceed the edge limit
   * @throws RangeError if `source` or a node of `targets` is out of range
   */
  addOutEdges(source: number, targets: IntList): void;
  /**
   * Adds an edge from `source` to each node of `targets`.
   *
   * **Time:** O(targets.length) amortized.
   *
   * @param source node ID in `0..nodeCount-1`
   * @param targets node IDs in `0..nodeCount-1`
   * @throws Error if the edges would exceed the edge limit
   * @throws RangeError if `source` or a node of `targets` is out of range
   */
  addOutEdges(source: number, ...targets: number[]): void;
  addOutEdges(source: number, ...rest: (number | IntList)[]): void {
    const [targets, from, to] = listOf(rest);
    this.checkNode(source, "source");
    this.checkNodes(targets, from, to, "target");
    this.writeFanOut(source, targets, from, to);
  }

  /**
   * Adds an edge from `source` to each node of `targets`, and the missing nodes up to the highest
   * of these node IDs.
   *
   * **Time:** O(number of targets) amortized.
   *
   * @param source node ID, `0` or more
   * @param targets node IDs, `0` or more
   * @throws Error if the edges would exceed the edge limit
   * @throws RangeError if a node ID is negative or not below the node limit
   */
  addOutEdgesAndNodes(source: number, targets: IntList): void;
  /**
   * Adds an edge from `source` to each node of `targets`, and the missing nodes up to the highest
   * of these node IDs.
   *
   * **Time:** O(targets.length) amortized.
   *
   * @param source node ID, `0` or more
   * @param targets node IDs, `0` or more
   * @throws Error if the edges would exceed the edge limit
   * @throws RangeError if a node ID is negative or not below the node limit
   */
  addOutEdgesAndNodes(source: number, ...targets: number[]): void;
  addOutEdgesAndNodes(source: number, ...rest: (number | IntList)[]): void {
    const [targets, from, to] = listOf(rest);
    checkCreatable(source);
    const highest = Math.max(source, highestCreatable(targets, from, to));
    this.writeFanOut(source, targets, from, to);
    this.raiseNodeCount(highest);
  }

  /**
   * Adds an edge from each node of `sources` to `target`.
   *
   * **Time:** O(number of sources) amortized.
   *
   * @param target node ID in `0..nodeCount-1`
   * @param sources node IDs in `0..nodeCount-1`
   * @throws Error if the edges would exceed the edge limit
   * @throws RangeError if `target` or a node of `sources` is out of range
   */
  addInEdges(target: number, sources: IntList): void;
  /**
   * Adds an edge from each node of `sources` to `target`.
   *
   * **Time:** O(sources.length) amortized.
   *
   * @param target node ID in `0..nodeCount-1`
   * @param sources node IDs in `0..nodeCount-1`
   * @throws Error if the edges would exceed the edge limit
   * @throws RangeError if `target` or a node of `sources` is out of range
   */
  addInEdges(target: number, ...sources: number[]): void;
  addInEdges(target: number, ...rest: (number | IntList)[]): void {
    const [sources, from, to] = listOf(rest);
    this.checkNode(target, "target");
    this.checkNodes(sources, from, to, "source");
    this.writeFanIn(target, sources, from, to);
  }

  /**
   * Adds an edge from each node of `sources` to `target`, and the missing nodes up to the highest
   * of these node IDs.
   *
   * **Time:** O(number of sources) amortized.
   *
   * @param target node ID, `0` or more
   * @param sources node IDs, `0` or more
   * @throws Error if the edges would exceed the edge limit
   * @throws RangeError if a node ID is negative or not below the node limit
   */
  addInEdgesAndNodes(target: number, sources: IntList): void;
  /**
   * Adds an edge from each node of `sources` to `target`, and the missing nodes up to the highest
   * of these node IDs.
   *
   * **Time:** O(sources.length) amortized.
   *
   * @param target node ID, `0` or more
   * @param sources node IDs, `0` or more
   * @throws Error if the edges would exceed the edge limit
   * @throws RangeError if a node ID is negative or not below the node limit
   */
  addInEdgesAndNodes(target: number, ...sources: number[]): void;
  addInEdgesAndNodes(target: number, ...rest: (number | IntList)[]): void {
    const [sources, from, to] = listOf(rest);
    checkCreatable(target);
    const highest = Math.max(target, highestCreatable(sources, from, to));
    this.writeFanIn(target, sources, from, to);
    this.raiseNodeCount(highest);
  }

  /**
   * Adds a path through `nodes`: an edge from each node of the list to the next.
   *
   * Fewer than two nodes add no edge.
   *
   * **Time:** O(number of nodes) amortized.
   *
   * @param nodes node IDs in `0..nodeCount-1`, in the order of the path
   * @throws Error if the edges would exceed the edge limit
   * @throws RangeError if a node of `nodes` is out of range
   */
  addPath(nodes: IntList): void;
  /**
   * Adds a path through `nodes`: an edge from each node of the array to the next.
   *
   * Fewer than two nodes add no edge.
   *
   * **Time:** O(nodes.length) amortized.
   *
   * @param nodes node IDs in `0..nodeCount-1`, in the order of the path
   * @throws Error if the edges would exceed the edge limit
   * @throws RangeError if a node of `nodes` is out of range
   */
  addPath(...nodes: number[]): void;
  addPath(...rest: (number | IntList)[]): void {
    const [nodes, from, to] = listOf(rest);
    this.checkNodes(nodes, from, to, "path");
    this.writePath(nodes, from, to);
  }

  /**
   * Adds a path through `nodes`, and the missing nodes up to the highest of these node IDs. The
   * path has an edge from each node of the list to the next.
   *
   * Fewer than two nodes add no edge, but still add the nodes.
   *
   * **Time:** O(number of nodes) amortized.
   *
   * @param nodes node IDs, `0` or more, in the order of the path
   * @throws Error if the edges would exceed the edge limit
   * @throws RangeError if a node ID is negative or not below the node limit
   */
  addPathAndNodes(nodes: IntList): void;
  /**
   * Adds a path through `nodes`, and the missing nodes up to the highest of these node IDs. The
   * path has an edge from each node of the array to the next.
   *
   * Fewer than two nodes add no edge, but still add the nodes.
   *
   * **Time:** O(nodes.length) amortized.
   *
   * @param nodes node IDs, `0` or more, in the order of the path
   * @throws Error if the edges would exceed the edge limit
   * @throws RangeError if a node ID is negative or not below the node limit
   */
  addPathAndNodes(...nodes: number[]): void;
  addPathAndNodes(...rest: (number | IntList)[]): void {
    const [nodes, from, to] = listOf(rest);
    const highest = highestCreatable(nodes, from, to);
    this.writePath(nodes, from, to);
    this.raiseNodeCount(highest);
  }

  /**
   * Adds an edge for each pair of node IDs in `endpoints`: `endpoints[0] -> endpoints[1]`,
   * `endpoints[2] -> endpoints[3]`, and so on.
   *
   * **Time:** O(number of endpoints) amortized.
   *
   * @param endpoints node IDs in `0..nodeCount-1`, source and target of each edge in turn, as one
   *     array or as loose arguments
   * @throws Error if `endpoints` has an odd length, or the edges would exceed the edge limit
   * @throws RangeError if a node of `endpoints` is out of range
   */
  addEdgePairs(endpoints: ArrayLike<number>): void;
  addEdgePairs(...endpoints: number[]): void;
  addEdgePairs(...rest: (number | ArrayLike<number>)[]): void {
    const [endpoints, from, to] = listOf(rest);
    checkPairCount(to - from);
    this.checkNodes(endpoints, from, to, "endpoint");
    this.writePairs(endpoints, from, to);
  }

  /**
   * Adds an edge for each pair of node IDs in `endpoints`, as {@link GraphBuilder.addEdgePairs}
   * does, and the missing nodes up to the highest of these node IDs.
   *
   * **Time:** O(number of endpoints) amortized.
   *
   * @param endpoints node IDs, `0` or more, source and target of each edge in turn, as one array or
   *     as loose arguments
   * @throws Error if `endpoints` has an odd length, or the edges would exceed the edge limit
   * @throws RangeError if a node ID is negative or not below the node limit
   */
  addEdgePairsAndNodes(endpoints: ArrayLike<number>): void;
  addEdgePairsAndNodes(...endpoints: number[]): void;
  addEdgePairsAndNodes(...rest: (number | ArrayLike<number>)[]): void {
    const [endpoints, from, to] = listOf(rest);
    checkPairCount(to - from);
    const highest = highestCreatable(endpoints, from, to);
    this.writePairs(endpoints, from, to);
    this.raiseNodeCount(highest);
  }

  /**
   * Adds the edges of an algorithm result, such as {@link BackEdges.of} or
   * {@link Biconnectivity.bridges}.
   *
   * Only the sources and targets are read: the edge indices of `edges` belong to the graph the
   * algorithm ran on.
   *
   * **Time:** O(edges.count) amortized.
   *
   * @param edges the edges to add, between nodes in `0..nodeCount-1`
   * @throws Error if the edges would exceed the edge limit
   * @throws RangeError if a source or target is out of range
   */
  addEdges(edges: Edges): void {
    const sources = edges.sourceNodes;
    const targets = edges.targetNodes;
    this.checkNodes(sources, 0, sources.length, "source");
    this.checkNodes(targets, 0, targets.length, "target");
    this.writeLists(sources, targets);
  }

  /**
   * Adds the edges of an algorithm result, as {@link GraphBuilder.addEdges} does, and the missing
   * nodes up to the highest of their node IDs.
   *
   * **Time:** O(edges.count) amortized.
   *
   * @param edges the edges to add
   * @throws Error if the edges would exceed the edge limit
   * @throws RangeError if a source or target is not below the node limit
   */
  addEdgesAndNodes(edges: Edges): void {
    const sources = edges.sourceNodes;
    const targets = edges.targetNodes;
    const highest = Math.max(
      highestCreatable(sources, 0, sources.length),
      highestCreatable(targets, 0, targets.length),
    );
    this.writeLists(sources, targets);
    this.raiseNodeCount(highest);
  }

  /**
   * Adds the nodes and edges of `graph` after the nodes already added, and returns the offset of
   * its node IDs.
   *
   * Node `v` of `graph` becomes node `offset + v` of this builder, where the offset is the node
   * count before the call. Into an empty builder, the node IDs stay the same, which makes this the
   * way to extend a graph: a {@link Graph} is immutable, but a builder that starts with it can add
   * to it and build a new one. Here, the dependencies between the packages of a program are
   * extended to a next version, in which `ui` also uses `storage`:
   *
   * <!-- example: buildingAndReading.ts#addGraph -->
   * ```ts
   * const builder = new GraphBuilder();
   * // into an empty builder: the node IDs stay the same
   * builder.addGraph(dependencies);
   * builder.addEdge(ui, storage);
   * const nextVersion = builder.build();
   * ```
   *
   * **Time:** O(graph.nodeCount + graph.edgeCount) amortized.
   *
   * @param graph the graph to add
   * @returns the offset: node ID of node `0` of `graph` in this builder
   * @throws Error if the nodes or edges of `graph` would exceed their limit
   */
  addGraph(graph: Graph): number {
    const srcNodeCount = graph.nodeCount;
    if (srcNodeCount > ArrayLimits.MAX_NODE_COUNT - this.nodeCount) {
      throw this.beyondNodeLimit(`a graph of ${srcNodeCount} nodes`);
    }
    this.reserve(graph.edgeCount);
    const offset = this.nodeCount;
    this.nodeCount += srcNodeCount;
    const adjacency = graph.outAdj;
    const adjacencyStart = graph.outStart;
    const sources = this.edgeSources;
    const targets = this.edgeTargets;
    for (let node = 0; node < srcNodeCount; node++) {
      for (let i = adjacencyStart[node], end = adjacencyStart[node + 1]; i < end; i++) {
        sources.push(node + offset);
        targets.push(adjacency[i] + offset);
      }
    }
    return offset;
  }

  /**
   * Returns a graph with the nodes and edges added so far.
   *
   * The edges are sorted into edge index order (by source and then by target), and duplicates are
   * merged, so an edge does not keep the position at which it was added; {@link Graph.edgeIndexOf}
   * finds where it went. The builder does not change: more nodes and edges can be added and built
   * into another graph.
   *
   * **Time:** O(nodeCount + k log d), where k is the number of added edges, duplicates included,
   * and d the most of them with the same source.
   * **Memory:** 4 x (nodeCount + edgeCount) bytes for the result; while it runs, briefly up to
   * 4 x (nodeCount + k) bytes more.
   *
   * @returns the graph
   * @throws Error if the edges added exceed the edge limit
   */
  build(): Graph {
    const nodeCount = this.nodeCount;
    const rawEdgeCount = this.edgeSources.length;
    GraphBuilder.checkEdgeLimit(rawEdgeCount);
    const sources = this.edgeSources.data;
    const targets = this.edgeTargets.data;

    // 1) Count out-degrees.
    const outStart = new Int32Array(nodeCount + 1);
    for (let i = 0; i < rawEdgeCount; i++) outStart[sources[i] + 1]++;

    // 2) Prefix sum: degrees to start offsets.
    for (let n = 0; n < nodeCount; n++) outStart[n + 1] += outStart[n];

    // 3) Distribute targets into per-node buckets.
    let outAdj = new Int32Array(outStart[nodeCount]);
    const writePos = outStart.slice(0, nodeCount);
    for (let i = 0; i < rawEdgeCount; i++) outAdj[writePos[sources[i]]++] = targets[i];

    // 4) Sort and deduplicate each bucket, compacting left: writes never pass the read position.
    let compactEnd = 0;
    for (let node = 0; node < nodeCount; node++) {
      const start = outStart[node];
      const end = outStart[node + 1];
      sortRange(outAdj, start, end);
      outStart[node] = compactEnd;
      if (start < end) {
        outAdj[compactEnd++] = outAdj[start];
        for (let r = start + 1; r < end; r++) {
          if (outAdj[r] !== outAdj[r - 1]) outAdj[compactEnd++] = outAdj[r];
        }
      }
    }
    outStart[nodeCount] = compactEnd;
    if (compactEnd < outAdj.length) outAdj = outAdj.slice(0, compactEnd);
    return Graph.create(outStart, outAdj);
  }

  /**
   * @internal Rejects more added edges than the edge limit. The single-edge methods leave the edge
   * limit to {@link GraphBuilder.build}: the edge storage grows past it. Static, so that the tests
   * reach the limit without adding the edges.
   */
  static checkEdgeLimit(addedEdges: number): void {
    if (addedEdges > ArrayLimits.MAX_ARRAY_LENGTH) {
      throw new Error(`${addedEdges} edges added exceed the edge limit of ${ArrayLimits.MAX_ARRAY_LENGTH}`);
    }
  }

  /** @internal Capacity of the internal edge storage, so that tests can observe reallocation. */
  edgeCapacity(): number {
    return Math.min(this.edgeSources.data.length, this.edgeTargets.data.length);
  }

  // The batch writers and checkers read `values[from..to)`, so that a SortedIntView is read in
  // place, without the Int32Array view that IntLists.asArrayLike would allocate per call.

  private writeFanOut(source: number, targets: ArrayLike<number>, from: number, to: number): void {
    this.reserve(to - from);
    for (let i = from; i < to; i++) {
      this.edgeSources.push(source);
      this.edgeTargets.push(targets[i]);
    }
  }

  private writeFanIn(target: number, sources: ArrayLike<number>, from: number, to: number): void {
    this.reserve(to - from);
    for (let i = from; i < to; i++) {
      this.edgeSources.push(sources[i]);
      this.edgeTargets.push(target);
    }
  }

  private writePath(nodes: ArrayLike<number>, from: number, to: number): void {
    this.reserve(Math.max(to - from - 1, 0));
    for (let i = from + 1; i < to; i++) {
      this.edgeSources.push(nodes[i - 1]);
      this.edgeTargets.push(nodes[i]);
    }
  }

  private writePairs(endpoints: ArrayLike<number>, from: number, to: number): void {
    this.reserve((to - from) >> 1);
    for (let i = from; i < to; i += 2) {
      this.edgeSources.push(endpoints[i]);
      this.edgeTargets.push(endpoints[i + 1]);
    }
  }

  private writeLists(sources: ArrayLike<number>, targets: ArrayLike<number>): void {
    const count = sources.length;
    this.reserve(count);
    for (let i = 0; i < count; i++) {
      this.edgeSources.push(sources[i]);
      this.edgeTargets.push(targets[i]);
    }
  }

  private checkNode(node: number, role: string): void {
    if (!(node >= 0 && node < this.nodeCount) || (node | 0) !== node) {
      throw new RangeError(`${role} node does not exist: ${node} (nodeCount=${this.nodeCount})`);
    }
  }

  /** Validates every consumed node ID before any is written, so a rejected batch changes nothing. */
  private checkNodes(nodes: ArrayLike<number>, from: number, to: number, role: string): void {
    for (let i = from; i < to; i++) this.checkNode(nodes[i], role);
  }

  /** Rejects a `count` that is not an integer, a negative one and one that would exceed the node limit. */
  private checkNewNodeCount(count: number): void {
    if (!Number.isInteger(count)) throw new Error(`count must be an integer: ${count}`);
    if (count < 0) throw new Error(`count must be non-negative: ${count}`);
    // Cannot overflow: the node count never exceeds the limit.
    if (count > ArrayLimits.MAX_NODE_COUNT - this.nodeCount) throw this.beyondNodeLimit(`count ${count}`);
  }

  private checkRoomForNode(): void {
    if (this.nodeCount === ArrayLimits.MAX_NODE_COUNT) {
      throw new Error(`the node limit of ${ArrayLimits.MAX_NODE_COUNT} is reached`);
    }
  }

  private beyondNodeLimit(what: string): Error {
    return new Error(
      `${what} would exceed the node limit of ${ArrayLimits.MAX_NODE_COUNT} (nodeCount=${this.nodeCount})`,
    );
  }

  /**
   * Raises the node count so that `node` exists; a negative argument leaves it untouched.
   *
   * The batch twins call it after writing their edges, because the write can still reject the
   * batch at the edge limit and must then leave the node count as it was. The writers do not read
   * the node count.
   */
  private raiseNodeCount(node: number): void {
    if (node >= this.nodeCount) this.nodeCount = node + 1;
  }

  /**
   * Reserves room for `count` additional edges, or rejects them before any is written if they
   * would exceed the edge limit. Grows by at least half the capacity, so that batch calls in a
   * loop cost amortized O(1) per edge. The half step stops at the edge limit, and a batch larger
   * than the step gets exactly the room it needs, one allocation per list.
   */
  private reserve(count: number): void {
    const size = this.edgeSources.length;
    const required = size + count;
    if (required > ArrayLimits.MAX_ARRAY_LENGTH) {
      throw new Error(
        `${count} more edges would exceed the edge limit of ${ArrayLimits.MAX_ARRAY_LENGTH} (${size} edges added)`,
      );
    }
    const capacity = this.edgeSources.data.length;
    if (required <= capacity) return;
    const grown = Math.max(required, capacity + (capacity >> 1));
    const newCapacity = Math.min(grown, ArrayLimits.MAX_ARRAY_LENGTH);
    this.edgeSources.ensureCapacity(newCapacity);
    this.edgeTargets.ensureCapacity(newCapacity);
  }
}

/**
 * Rejects IDs that cannot be created: those that are not integers, negative ones, and those whose
 * node count would exceed `ArrayLimits.MAX_NODE_COUNT`.
 */
function checkCreatable(node: number): void {
  if (!(node >= 0 && node < ArrayLimits.MAX_NODE_COUNT) || (node | 0) !== node) throw notCreatable(node);
}

function notCreatable(node: number): RangeError {
  if (!Number.isInteger(node)) return new RangeError(`node ID must be an integer: ${node}`);
  if (node < 0) return new RangeError(`node ID must be non-negative: ${node}`);
  return new RangeError(`node ID must be below the node limit of ${ArrayLimits.MAX_NODE_COUNT}: ${node}`);
}

/** Validates every ID of `nodes[from..to)` before any node is created, and returns the highest, or -1 if none. */
function highestCreatable(nodes: ArrayLike<number>, from: number, to: number): number {
  let highest = -1;
  for (let i = from; i < to; i++) {
    const node = nodes[i];
    checkCreatable(node);
    if (node > highest) highest = node;
  }
  return highest;
}

function checkPairCount(length: number): void {
  if ((length & 1) !== 0) throw new Error(`expected an even number of node IDs, got ${length}`);
}

/**
 * The node IDs of a batch method as `[values, from, to]`, to be read as `values[from..to)`: a
 * {@link SortedIntView} as the range of its array, read in place; any other single list argument
 * as it is; or the loose arguments.
 */
function listOf(rest: (number | IntList)[]): [values: ArrayLike<number>, from: number, to: number] {
  if (rest.length === 1) {
    const list = rest[0];
    if (list instanceof SortedIntView) return [list.array, list.fromIndex, list.toIndex];
    if (typeof list === "object") {
      const values = IntLists.asArrayLike(list);
      return [values, 0, values.length];
    }
  }
  return [rest as number[], 0, rest.length];
}
