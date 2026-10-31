import { ArrayLimits } from "./arrayLimits.js";
import type { Components } from "./components.js";
import { DfsFrames } from "./dfsFrames.js";
import type { Dominators } from "./dominators.js";
import { Edges } from "./edges.js";
import { type BiAdjacentGraph, Graph, emptyGraph } from "./graph.js";
import { GraphDiff } from "./graphDiff.js";
import {
  IntBuffer,
  checkNodes,
  containsInRange,
  indexOfInRange,
  numberOfTrailingZeros,
  sortRange,
} from "./internal.js";
import { EdgeMapping, type NodeMapping, countValid } from "./mapping.js";
import { TopOrder } from "./order.js";
import { ParentForest } from "./parentForest.js";
import { EdgePartition, type NodePartition, sccsOf } from "./partition.js";
import { type IntList, IntLists, SortedIntView } from "./sortedIntView.js";
import { UnionFind } from "./unionFind.js";

const VISITED = 0b01;
const ON_STACK = 0b10;

// The constants of topologyHash as 32-bit halves. Changing one of them, or a shift or rotation
// distance in the code, changes the hash of every graph, which a release must announce in its
// changelog; every implementation changes with it.

/** Seed: the fractional part of the square root of 2, scaled to 64 bits and rounded. */
const HASH_SEED_HI = 0x6a09e667 | 0;
const HASH_SEED_LO = 0xf3bcc909 | 0;

/** Spreads each input over all 64 bits: 2^64 / golden ratio, rounded down. */
const HASH_GOLDEN_GAMMA_HI = 0x9e3779b9 | 0;
const HASH_GOLDEN_GAMMA_LO = 0x7f4a7c15 | 0;

/** Multiplier of each step: PRIME64_2 of xxHash64. */
const HASH_STEP_PRIME_HI = 0xc2b2ae3d | 0;
const HASH_STEP_PRIME_LO = 0x27d4eb4f | 0;

/** The two multipliers of the SplitMix64 finalizer, as in `java.util.SplittableRandom`. */
const SPLITMIX64_MULTIPLIER_1_HI = 0xbf58476d | 0;
const SPLITMIX64_MULTIPLIER_1_LO = 0x1ce4e5b9 | 0;
const SPLITMIX64_MULTIPLIER_2_HI = 0x94d049bb | 0;
const SPLITMIX64_MULTIPLIER_2_LO = 0x133111eb | 0;

/** The high half of a 64-bit product, written by {@link mul64}; the low half is its return value. */
let productHi = 0;

/** High 32 bits of the unsigned 64-bit product of two 32-bit words (Hacker's Delight, mulhu). */
function mulHighUnsigned(a: number, b: number): number {
  const a0 = a & 0xffff;
  const a1 = a >>> 16;
  const b0 = b & 0xffff;
  const b1 = b >>> 16;
  let t = a0 * b0;
  const k0 = t >>> 16;
  t = a1 * b0 + k0;
  const w1 = t & 0xffff;
  const w2 = t >>> 16;
  t = a0 * b1 + w1;
  const k1 = t >>> 16;
  return (a1 * b1 + w2 + k1) | 0;
}

/** The low 64 bits of `(aHi:aLo) * (bHi:bLo)`, as Java's `long` multiplication: low half returned, high half in {@link productHi}. */
function mul64(aHi: number, aLo: number, bHi: number, bLo: number): number {
  productHi = (Math.imul(aHi, bLo) + Math.imul(aLo, bHi) + mulHighUnsigned(aLo, bLo)) | 0;
  return Math.imul(aLo, bLo);
}

/**
 * Operations on graphs, in five families: derived graphs, edge mappings, node sets, shape checks,
 * and a graph as text, hash or diff.
 *
 * - **Derived graphs:** {@link Graphs.remapped} renumbers the nodes of a graph by a
 *   {@link NodeMapping}, which also selects subgraphs; {@link Graphs.transitiveClosure} and
 *   {@link Graphs.transitiveReduction} add and drop the edges that other paths imply;
 *   {@link Graphs.dominatorTree} turns {@link Dominators} into a graph.
 * - **Edge mappings:** {@link Graphs.edgeMapping}, {@link Graphs.transposedEdgeMapping} and
 *   {@link Graphs.edgePartition} relate the edges of a remapped, transposed or condensed graph to
 *   the edges of the graph it came from.
 * - **Node sets:** {@link Graphs.rootNodes} and {@link Graphs.reachableFrom}.
 * - **Shape checks:** {@link Graphs.isDag}, {@link Graphs.isForest}, {@link Graphs.isTree},
 *   {@link Graphs.isPath} and {@link Graphs.isStronglyConnected} read the graph as directed, and
 *   {@link Graphs.findCycle} returns a cycle that makes a graph no DAG (directed acyclic graph);
 *   {@link Graphs.isUndirectedForest}, {@link Graphs.isUndirectedTree}, {@link Graphs.isBipartite}
 *   and {@link Graphs.isWeaklyConnected} read it as undirected.
 * - **Text, hash and diff:** {@link Graphs.adjacencyListOf} writes a whole graph as text,
 *   {@link Graphs.topologyHash} hashes it into 64 bits to keep, and {@link Graphs.diff} returns the
 *   edges added and removed between two versions of a graph.
 *
 * Data on nodes and edges follows a renumbered, transposed or condensed graph through the mappings.
 * Like the node mappings that the factories of {@link NodeMapping} make, the edge mappings point
 * from new to old: from the derived graph to the original one. Their `gather` methods carry an
 * array of data over to the derived graph. An {@link EdgePartition} groups the edges of the
 * original by the condensed edge they became, and its `reduce` method combines their data.
 *
 * A shape check without a prefix reads the graph as directed. One prefixed `undirected` reads it as
 * undirected, as {@link Components.ccsOf} does: each edge connects its source and target both ways,
 * and the edges `a -> b` and `b -> a` count as one. `isBipartite` and `isWeaklyConnected` read it
 * so too, without the prefix, because neither property has a directed reading. The checks of the
 * undirected reading use union-find, whose cost grows with alpha(nodeCount). The inverse Ackermann
 * function alpha is below 5 for any graph. No shape check needs memory in proportion to the edge
 * count.
 *
 * Every result is computed anew on every call, not cached, and shares no array with the arguments:
 * keep a result to use it more than once. No method recurses, so deep graphs do not overflow the
 * call stack.
 */
export const Graphs = {
  /**
   * Returns `graph` with its nodes renumbered by `newToOld`: node `i` of the result is node
   * `newToOld.get(i)` of `graph`.
   *
   * The result has the edges of `graph` between the nodes that `newToOld` maps to; the other nodes
   * are left out, with their edges. The factories of {@link NodeMapping} make the mapping:
   * {@link NodeMapping.forSubgraph} selects nodes, {@link NodeMapping.forPermutation} and
   * {@link NodeMapping.reindex} reorder all of them. Data on the nodes follows with the `gather`
   * methods of the mapping, data on the edges with {@link Graphs.edgeMapping}. Here, `calls` holds
   * the calls between the methods of a program, and the methods that `load` reaches become a graph
   * of their own, with their names from `names`:
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
   * To merge nodes into groups instead, use {@link NodePartition.condense}.
   *
   * **Time:** O(nodeCount + edgeCount log maxOutDegree).
   * **Memory:** 4 bytes per node and per edge for the result; while it runs, 4 x nodeCount bytes
   * more.
   *
   * @param graph the graph to renumber
   * @param newToOld the node of `graph` for each node of the result
   * @returns the renumbered graph
   * @throws Error if a node of the result maps to `-1`, or two map to the same node
   * @throws RangeError if a node of the result maps to an ID that is not a node of `graph`
   */
  remapped(graph: Graph, newToOld: NodeMapping): Graph {
    const oldOf = newToOld.mapping;
    const newNodeCount = oldOf.length;
    // The general path gives the same, but allocates the inverse over every old node first.
    if (newNodeCount === 0) return emptyGraph();

    // Inverse (old to new) for edge-target translation, built in the same pass that checks every
    // new node. Not invertArray of the mappings: remapped rejects an unmapped new node, which an
    // inverse skips, and names both new nodes of a repeat.
    const oldNodeCount = graph.nodeCount;
    const newOf = new Int32Array(oldNodeCount).fill(-1);
    for (let newNode = 0; newNode < newNodeCount; newNode++) {
      const oldNode = oldOf[newNode];
      if (oldNode === -1) throw new Error(`new node ${newNode} is unmapped`);
      if (oldNode >= oldNodeCount) throw notANode(newNode, oldNode, oldNodeCount);
      if (newOf[oldNode] !== -1) {
        throw new Error(`new nodes ${newOf[oldNode]} and ${newNode} both map to node ${oldNode}`);
      }
      newOf[oldNode] = newNode;
    }

    const oldTargets = graph.outAdj;
    const oldStart = graph.outStart;
    // The checks make the mapping injective, so equal counts make it a bijection.
    const total = newNodeCount === oldNodeCount;

    // 1) Out-degree of every new node
    const newStart = new Int32Array(newNodeCount + 1);
    for (let newNode = 0; newNode < newNodeCount; newNode++) {
      const oldNode = oldOf[newNode];
      if (total) {
        newStart[newNode + 1] = oldStart[oldNode + 1] - oldStart[oldNode];
      } else {
        let count = 0;
        for (let i = oldStart[oldNode], end = oldStart[oldNode + 1]; i < end; i++) {
          if (newOf[oldTargets[i]] >= 0) count++;
        }
        newStart[newNode + 1] = count;
      }
    }
    // 2) Prefix sum: degrees to start offsets
    for (let newNode = 0; newNode < newNodeCount; newNode++) newStart[newNode + 1] += newStart[newNode];

    // 3) Targets, each list sorted
    const newTargets = new Int32Array(newStart[newNodeCount]);
    for (let newNode = 0; newNode < newNodeCount; newNode++) {
      let writePos = newStart[newNode];
      const oldNode = oldOf[newNode];
      for (let i = oldStart[oldNode], end = oldStart[oldNode + 1]; i < end; i++) {
        const mapped = newOf[oldTargets[i]];
        if (mapped >= 0) newTargets[writePos++] = mapped;
      }
      sortRange(newTargets, newStart[newNode], writePos);
    }
    return Graph.create(newStart, newTargets);
  },

  /**
   * Returns the dominator tree of `dominators` as a graph, with an edge `d -> n` for every node `n`
   * whose immediate dominator is `d`.
   *
   * The result has the node IDs of the analyzed graph, and its edges point away from the roots of
   * the tree, for a walk down the tree such as with a {@link DfsTraverser}. Its root nodes are the
   * entries, the nodes that only the virtual root above several entries dominates, and the
   * unreachable nodes. To ask whether one node dominates another, use `Ancestry.of(dominators)`,
   * which shares the immediate dominators instead of building this graph.
   *
   * **Time:** O(nodeCount).
   * **Memory:** 4 bytes per node and per edge for the result.
   *
   * @param dominators the dominators of a graph
   * @returns the dominator tree
   */
  dominatorTree(dominators: Dominators): Graph {
    const children = ParentForest.childrenOf(dominators.immediateDominator);
    return Graph.create(children.start, children.members);
  },

  /**
   * Returns the transitive closure of `graph`: the same nodes, with an edge `u -> v` wherever a
   * path of one or more edges leads from `u` to `v`.
   *
   * A node has a self-loop in the result if and only if it lies on a cycle. The result can have up
   * to nodeCount^2 edges; for the nodes reachable from a few nodes, {@link Graphs.reachableFrom}
   * costs far less.
   *
   * The closure is computed on the SCCs (strongly connected components) of `graph`, with a row of
   * bits per SCC for the SCCs it reaches. The rows take sccCount^2 / 8 bytes, about 1.25 GB for 100
   * 000 SCCs.
   *
   * **Time:** O(nodeCount + edgeCount + sccCount x (sccCount + edgeCount) / 32 + resultEdgeCount
   * log nodeCount), with sccCount the number of SCCs; the rows are processed in 32-bit words, where
   * Java takes 64 bits at a time. **Memory:** 4 bytes per node and per edge for the result; while
   * it runs, sccCount^2 / 8 bytes for the rows, which are held together with the result at the
   * peak, and O(nodeCount + edgeCount) more.
   *
   * @param graph the graph to close
   * @returns the transitive closure
   * @throws Error if the closure has more edges than a graph can have, or `graph` has more than
   *     2^30 - 5 nodes
   */
  transitiveClosure(graph: Graph): Graph {
    const n = graph.nodeCount;
    const sccs = sccsOf(graph);
    const k = sccs.sccCount;
    const dag = sccs.condense();
    const dagStart = dag.outStart;
    const dagTargets = dag.outAdj;
    const memberStart = sccs.memberStart;
    const members = sccs.members;
    const words = (k + 31) >>> 5;
    const noRow = new Int32Array(0);

    // SCC IDs are in reverse topological order: every successor of c has a smaller ID.
    const reach = new Array<Int32Array>(k);
    const reachSize = new Int32Array(k);
    let total = 0;
    for (let c = 0; c < k; c++) {
      const row = new Int32Array(words);
      if (sccs.containsCycle(c)) row[c >>> 5] |= 1 << (c & 31);
      for (let e = dagStart[c], end = dagStart[c + 1]; e < end; e++) {
        const d = dagTargets[e];
        row[d >>> 5] |= 1 << (d & 31);
        const below = reach[d];
        for (let w = 0; w < words; w++) row[w] |= below[w];
      }
      reach[c] = row;
      let size = 0;
      for (let w = 0; w < words; w++) {
        for (let bits = row[w]; bits !== 0; bits &= bits - 1) {
          const d = (w << 5) + numberOfTrailingZeros(bits);
          size += memberStart[d + 1] - memberStart[d];
        }
      }
      reachSize[c] = size;
      total += size * (memberStart[c + 1] - memberStart[c]);
      if (total > ArrayLimits.MAX_ARRAY_LENGTH) {
        throw new Error(
          `the transitive closure has more than ${ArrayLimits.MAX_ARRAY_LENGTH} edges, the largest array length`,
        );
      }
    }

    // Each component's sorted target list is written once, at its first node, and copied to its
    // other nodes; its bit row is dropped as soon as the list exists.
    const sccOf = sccs.mapping;
    const start = new Int32Array(n + 1);
    for (let v = 0; v < n; v++) start[v + 1] = start[v] + reachSize[sccOf[v]];
    const targets = new Int32Array(total);
    for (let c = 0; c < k; c++) {
      const row = reach[c];
      const first = start[members[memberStart[c]]];
      let at = first;
      for (let w = 0; w < words; w++) {
        for (let bits = row[w]; bits !== 0; bits &= bits - 1) {
          const d = (w << 5) + numberOfTrailingZeros(bits);
          for (let i = memberStart[d], end = memberStart[d + 1]; i < end; i++) targets[at++] = members[i];
        }
      }
      sortRange(targets, first, at);
      for (let i = memberStart[c] + 1, end = memberStart[c + 1]; i < end; i++) {
        targets.copyWithin(start[members[i]], first, at);
      }
      reach[c] = noRow;
    }
    return Graph.create(start, targets);
  },

  /**
   * Returns the transitive reduction of `dag`: the same nodes, keeping each edge `u -> v` unless
   * another path leads from `u` to `v`.
   *
   * From each node, the result reaches the same nodes as `dag`, with as few edges as possible; on a
   * DAG, this result is unique. For a graph with cycles, reduce the DAG of its SCCs, which is
   * `Components.sccsOf(graph).condense()`.
   *
   * The reduction is computed with a row of bits per node for the nodes it reaches. The rows take
   * nodeCount^2 / 8 bytes, about 1.25 GB for 100 000 nodes.
   *
   * **Time:** O(nodeCount + edgeCount log maxOutDegree + (nodeCount + edgeCount) x nodeCount / 32);
   * the rows are processed in 32-bit words, where Java takes 64 bits at a time. **Memory:** 4 bytes
   * per node and per edge for the result; while it runs, nodeCount^2 / 8 bytes for the rows and
   * O(nodeCount + edgeCount) more.
   *
   * @param dag the DAG to reduce
   * @returns the transitive reduction
   * @throws Error if `dag` has a cycle, a self-loop included, or if a depth-first path is longer
   *     than 2^30 - 5 nodes
   */
  transitiveReduction(dag: Graph): Graph {
    const n = dag.nodeCount;
    const order = TopOrder.of(dag);
    const position = new Int32Array(n);
    for (let i = 0; i < n; i++) position[order[i]] = i;
    const start = dag.outStart;
    const targets = dag.outAdj;
    const words = (n + 31) >>> 5;
    const reach = new Array<Int32Array>(n);
    const keep = new Uint8Array(targets.length);
    let kept = 0;
    // The out-nodes of one node by topological position. Positions are distinct, so they sort
    // alone; slotOf leads from a target back to its edge.
    let byPosition = new Int32Array(16);
    const slotOf = new Int32Array(n);

    for (let i = n - 1; i >= 0; i--) {
      const u = order[i];
      const from = start[u];
      const degree = start[u + 1] - from;
      if (byPosition.length < degree) byPosition = new Int32Array(Math.max(degree, 2 * byPosition.length));
      for (let j = 0; j < degree; j++) {
        const target = targets[from + j];
        byPosition[j] = position[target];
        slotOf[target] = from + j;
      }
      sortRange(byPosition, 0, degree);
      const row = new Int32Array(words);
      for (let j = 0; j < degree; j++) {
        const v = order[byPosition[j]];
        if ((row[v >>> 5] & (1 << (v & 31))) !== 0) continue;
        keep[slotOf[v]] = 1;
        kept++;
        row[v >>> 5] |= 1 << (v & 31);
        const below = reach[v];
        for (let w = 0; w < words; w++) row[w] |= below[w];
      }
      reach[u] = row;
    }

    const resultStart = new Int32Array(n + 1);
    const resultTargets = new Int32Array(kept);
    let next = 0;
    for (let v = 0; v < n; v++) {
      resultStart[v] = next;
      for (let e = start[v], end = start[v + 1]; e < end; e++) if (keep[e] !== 0) resultTargets[next++] = targets[e];
    }
    resultStart[n] = next;
    return Graph.create(resultStart, resultTargets);
  },

  /**
   * Returns the edge mapping from `newGraph` to `oldGraph` that goes with the node mapping
   * `newToOld`.
   *
   * Edge `s -> t` of `newGraph` maps to the edge `newToOld.get(s) -> newToOld.get(t)` of
   * `oldGraph`, or to `-1` if `oldGraph` has no such edge or `s` or `t` maps to `-1`. For a graph
   * from `remapped(oldGraph, newToOld)`, every edge has its counterpart, and the `gather` methods
   * of the result carry data on the edges over to the new graph. Here, `siteCount` holds the number
   * of call sites of each call by edge index of `calls`, and the subgraph `loading` from the
   * example at {@link Graphs.remapped} takes these counts along:
   *
   * <!-- example: mappings.ts#edgeMapping -->
   * ```ts
   * const loadingSiteCount = Graphs.edgeMapping(loading, calls, newToOld).gather(
   *   siteCount,
   * );
   * // 1 for load -> parse and for load -> read, 2 for parse -> parse
   * ```
   *
   * For the opposite direction, from the edges of `oldGraph` to those of `newGraph`, invert the
   * result with {@link EdgeMapping.inverted}. The transposed graph needs
   * {@link Graphs.transposedEdgeMapping} instead, as its edges run the other way.
   *
   * **Time:** O(nodeCount + edgeCount log maxOutDegree), with the node and edge count of `newGraph`
   * and the out-degrees of `oldGraph`.
   * **Memory:** 4 bytes per edge of `newGraph` for the result.
   *
   * @param newGraph the graph whose edges are mapped
   * @param oldGraph the graph they are mapped to
   * @param newToOld the node of `oldGraph` for each node of `newGraph`, or `-1`
   * @returns the edge mapping
   * @throws Error if `newToOld.indexCount !== newGraph.nodeCount`
   * @throws RangeError if a node of `newGraph` maps to an ID that is not a node of `oldGraph`
   */
  edgeMapping(newGraph: Graph, oldGraph: Graph, newToOld: NodeMapping): EdgeMapping {
    const newNodeCount = newGraph.nodeCount;
    const oldOf = newToOld.mapping;
    if (oldOf.length !== newNodeCount) {
      throw new Error(`newToOld has an index count of ${oldOf.length}, but newGraph has ${newNodeCount} nodes`);
    }
    const oldNodeCount = oldGraph.nodeCount;
    const newTargets = newGraph.outAdj;
    const newStart = newGraph.outStart;
    const oldTargets = oldGraph.outAdj;
    const oldStart = oldGraph.outStart;
    const mapping = new Int32Array(newGraph.edgeCount);
    // Every entry is checked in its own node's iteration before the result is returned, so a
    // target needs no check: one that maps to -1 or beyond the old graph is simply not found.
    for (let newNode = 0; newNode < newNodeCount; newNode++) {
      const oldNode = oldOf[newNode];
      const newEnd = newStart[newNode + 1];
      if (oldNode >= oldNodeCount) throw notANode(newNode, oldNode, oldNodeCount);
      if (oldNode < 0) {
        mapping.fill(-1, newStart[newNode], newEnd);
        continue;
      }
      const oldFrom = oldStart[oldNode];
      const oldEnd = oldStart[oldNode + 1];
      for (let i = newStart[newNode]; i < newEnd; i++) {
        mapping[i] = indexOfInRange(oldTargets, oldFrom, oldEnd, oldOf[newTargets[i]]);
      }
    }
    return EdgeMapping.create(mapping, countValid(mapping));
  },

  /**
   * Returns the edge mapping from the transposed graph of `graph` to `graph`.
   *
   * Edge `e` of `BiAdjacentGraph.of(graph).transposed()` maps to the edge of `graph` it reverses:
   * the transposed graph keeps the node IDs, but not the edge indices. The mapping is total, and
   * its `gather` methods carry data on the edges over to the transposed graph. Here, `siteCount`
   * holds the number of call sites of each call by edge index of `calls`, and the counts follow the
   * calls to the transposed graph, which lists the callers of `parse`:
   *
   * <!-- example: mappings.ts#transposedEdges -->
   * ```ts
   * const calledBy = BiAdjacentGraph.of(calls).transposed();
   * const calledBySiteCount = Graphs.transposedEdgeMapping(calls).gather(siteCount);
   * for (
   *   let edge = calledBy.outEdgeStart(parse);
   *   edge < calledBy.outEdgeEnd(parse);
   *   edge++
   * ) {
   *   console.log(`${names[calledBy.edgeTarget(edge)]}: ${calledBySiteCount[edge]}`);
   * }
   * // load: 1
   * // parse: 2
   * ```
   *
   * {@link BiAdjacentGraph.transposedEdgeIndex} translates a single edge, in the opposite
   * direction.
   *
   * **Time:** O(nodeCount + edgeCount).
   * **Memory:** 4 x edgeCount bytes for the result; while it runs, 4 x nodeCount bytes more.
   *
   * @param graph the graph whose transposed graph is mapped to it
   * @returns the edge mapping from the transposed graph to `graph`
   */
  transposedEdgeMapping(graph: Graph): EdgeMapping {
    return EdgeMapping.forTransposed(graph);
  },

  /**
   * Returns the edge partition that goes with the node partition `partition`, from the edges of the
   * partitioned graph to the edges of `condensedGraph`.
   *
   * The edges from group `g` to group `h` all map to the condensed edge `g -> h`, which is edge
   * `condensedGraph.edgeIndexOf(g, h)`. {@link EdgePartition.edgesOf} lists them, and the `reduce`
   * method of the result combines their data. An edge inside a group, or from or to a node in no
   * group, maps to `-1`. Here, `byPackage` groups the methods of a program by package. Its
   * condensed graph `packageCalls` holds the calls between packages (see {@link NodePartition.of}).
   * `byPackageCall` tells which calls between methods are behind the call from `service` to
   * `model`:
   *
   * <!-- example: partitions.ts#edgesOf -->
   * ```ts
   * const byPackageCall = Graphs.edgePartition(packageCalls, byPackage);
   * const serviceToModel = packageCalls.edgeIndexOf(service, model);
   * const behind = byPackageCall.edgesOf(serviceToModel);
   * // behind: [5, 7] - the calls load -> parse and save -> format
   * ```
   *
   * `condensedGraph` must be `partition.condense()`; only its node count is checked.
   *
   * **Time:** O(nodeCount + edgeCount log maxOutDegree), with the node and edge count of the
   * partitioned graph and the out-degrees of `condensedGraph`.
   * **Memory:** up to 12 bytes per edge of the partitioned graph for the result.
   *
   * @param condensedGraph the graph that `partition.condense()` returned
   * @param partition the partition of the nodes
   * @returns the edge partition, with a group per edge of `condensedGraph`
   * @throws Error if `condensedGraph.nodeCount` is not `partition.groupCount`
   */
  edgePartition(condensedGraph: Graph, partition: NodePartition): EdgePartition {
    const groupCount = partition.groupCount;
    if (condensedGraph.nodeCount !== groupCount) {
      throw new Error(
        `condensedGraph has ${condensedGraph.nodeCount} nodes, but the partition has ${groupCount} groups`,
      );
    }
    const graph = partition.graph;
    const mapping = new Int32Array(graph.edgeCount).fill(-1);
    const groupOf = partition.mapping;
    const targets = graph.outAdj;
    const start = graph.outStart;
    const condensedTargets = condensedGraph.outAdj;
    const condensedStart = condensedGraph.outStart;

    // 1) Condensed edge of every cross-group edge.
    for (let node = 0, n = graph.nodeCount; node < n; node++) {
      const sourceGroup = groupOf[node];
      if (sourceGroup < 0) continue;
      for (let ei = start[node], end = start[node + 1]; ei < end; ei++) {
        const targetGroup = groupOf[targets[ei]];
        if (sourceGroup !== targetGroup && targetGroup >= 0) {
          mapping[ei] = indexOfInRange(
            condensedTargets,
            condensedStart[sourceGroup],
            condensedStart[sourceGroup + 1],
            targetGroup,
          );
        }
      }
    }

    // 2) Original edges per condensed edge, as CSR.
    const groups = ParentForest.groupIndices(mapping, condensedGraph.edgeCount);
    return EdgePartition.create(mapping, groups.members, groups.start);
  },

  /**
   * Returns the root nodes of `graph` in ascending order. A root node has in-degree 0.
   *
   * A traversal of a DAG or a forest starts from them, as in
   * `traverser.run(Graphs.rootNodes(graph))` with a {@link DfsTraverser}.
   * {@link BiAdjacentGraph.isRootNode} checks a single node in O(1).
   *
   * **Time:** O(nodeCount).
   * **Memory:** 4 bytes per root node for the result.
   *
   * @param graph the graph to search
   * @returns the root nodes
   */
  rootNodes(graph: BiAdjacentGraph): SortedIntView {
    const n = graph.nodeCount;
    const inStart = graph.inStart;
    let count = 0;
    for (let node = 0; node < n; node++) if (inStart[node] === inStart[node + 1]) count++;
    const roots = new Int32Array(count);
    let next = 0;
    for (let node = 0; node < n; node++) if (inStart[node] === inStart[node + 1]) roots[next++] = node;
    return SortedIntView.create(roots, 0, count);
  },

  /**
   * Returns the nodes reachable from `source`, or from at least one of `sources`, in ascending
   * order and with the sources included (Java: two overloads, one with a single source).
   *
   * The search follows the edges in their direction; for the nodes from which a source is
   * reachable, search the transposed graph, as shown at {@link BiAdjacentGraph.transposed}. A
   * source given twice counts once, and with no sources, no node is reachable. Being sorted, the
   * result goes straight into {@link NodeMapping.forSubgraph} for the subgraph of the reachable
   * nodes, as shown at {@link Graphs.remapped}. For distances and shortest paths, use
   * {@link BfsDistances}.
   *
   * **Time:** O(number of sources + nodeCount + edgeCount). **Memory:** 4 bytes per reachable node
   * for the result; while it runs, 1 bit per node and briefly up to 12 bytes per reachable node.
   *
   * @param graph the graph to search
   * @param sourceOrSources a node ID in `0..nodeCount-1`, or a list of them
   * @returns the reachable nodes
   * @throws RangeError if a source is out of range
   */
  reachableFrom(graph: Graph, sourceOrSources: number | IntList): SortedIntView {
    // A list is an object; anything else is a node ID, so that undefined fails the range check.
    const sources = typeof sourceOrSources === "object" ? IntLists.asArrayLike(sourceOrSources) : [sourceOrSources];
    const n = graph.nodeCount;
    checkNodes(sources, n);
    const sourceCount = sources.length;
    const out = graph.outStart;
    const adj = graph.outAdj;
    const visited = new Int32Array((n >> 5) + 1);
    // Every reachable node enters the queue once, so the queue grows into the result.
    let queue = new Int32Array(Math.min(n, Math.max(16, sourceCount)));
    let tail = 0;
    for (let i = 0; i < sourceCount; i++) {
      const s = sources[i];
      if ((visited[s >> 5] & (1 << (s & 31))) === 0) {
        visited[s >> 5] |= 1 << (s & 31);
        queue[tail++] = s;
      }
    }
    for (let head = 0; head < tail; head++) {
      const u = queue[head];
      for (let e = out[u], end = out[u + 1]; e < end; e++) {
        const v = adj[e];
        if ((visited[v >> 5] & (1 << (v & 31))) === 0) {
          visited[v >> 5] |= 1 << (v & 31);
          if (tail === queue.length) {
            const grown = new Int32Array(Math.min(n, 2 * queue.length));
            grown.set(queue);
            queue = grown;
          }
          queue[tail++] = v;
        }
      }
    }
    // The queue is done; refill it in ascending order from the bit set, at its exact length.
    if (tail < queue.length) queue = queue.slice(0, tail);
    let k = 0;
    for (let w = 0; w < visited.length; w++) {
      for (let bits = visited[w]; bits !== 0; bits &= bits - 1) queue[k++] = (w << 5) + numberOfTrailingZeros(bits);
    }
    return SortedIntView.create(queue, 0, tail);
  },

  /**
   * Returns whether `graph` is a DAG: a graph without cycles. A self-loop is a cycle.
   *
   * {@link Graphs.findCycle} returns a cycle where this method finds one.
   *
   * **Time:** O(nodeCount + edgeCount), stopping at the first cycle. **Memory:** 2 bits per node
   * while it runs, and up to 8 x nodeCount bytes for the stack, which grows with the deepest path.
   *
   * @param graph the graph to check
   * @returns `true` if `graph` has no cycle
   * @throws Error if a depth-first path is longer than 2^30 - 5 nodes
   */
  isDag(graph: Graph): boolean {
    return findCycleIn(graph, false) === undefined;
  },

  /**
   * Returns the nodes of a cycle of `graph` in the order of its edges, or an empty array if `graph`
   * is a DAG.
   *
   * The last node has an edge to the first, and a self-loop is a cycle of one node. The search goes
   * depth-first, from each unvisited node in ascending order and through the out-nodes in ascending
   * order, and returns the first cycle it closes: always the same one, but not necessarily the
   * shortest. Here, the cycle in the dependencies between the packages of a program:
   *
   * <!-- example: graphOperations.ts#findCycle -->
   * ```ts
   * const cycle = Graphs.findCycle(dependencies);
   * // cycle: [4, 5] - model and storage, closed by the edge storage -> model
   * ```
   *
   * For a cycle inside a given SCC, search the subgraph of its nodes from
   * {@link Graphs.remapped}; the node mapping of the subgraph translates the result back.
   *
   * **Time:** O(nodeCount + edgeCount), stopping at the first cycle. **Memory:** 4 bytes per node
   * of the cycle for the result; while it runs, 2 bits per node and up to 8 x nodeCount bytes for
   * the stack, which grows with the deepest path.
   *
   * @param graph the graph to search
   * @returns the nodes of the cycle, each once, or an empty array; a new array that must not be
   *     modified (Java: unmodifiable)
   * @throws Error if a depth-first path is longer than 2^30 - 5 nodes
   */
  findCycle(graph: Graph): Int32Array {
    return findCycleIn(graph, true) ?? new Int32Array(0);
  },

  /**
   * Returns whether `graph` is a forest: a DAG in which every node has in-degree at most 1, so that
   * the edges point away from the root nodes.
   *
   * The empty graph is a forest. For the undirected reading, see {@link Graphs.isUndirectedForest}.
   *
   * **Time:** O(nodeCount + edgeCount).
   * **Memory:** 8 x nodeCount bytes while it runs.
   *
   * @param graph the graph to check
   * @returns `true` if `graph` is a forest
   */
  isForest(graph: Graph): boolean {
    return forestInfo(graph) !== undefined;
  },

  /**
   * Returns whether `graph` is a tree: a forest with at most one root node.
   *
   * The edges of a tree point away from its root. For a tree whose edges point toward the root,
   * check the transposed graph, which is `BiAdjacentGraph.of(graph).transposed()`. For the
   * undirected reading, see {@link Graphs.isUndirectedTree}. The empty graph is a tree.
   *
   * **Time:** O(nodeCount + edgeCount).
   * **Memory:** 8 x nodeCount bytes while it runs.
   *
   * @param graph the graph to check
   * @returns `true` if `graph` is a tree
   */
  isTree(graph: Graph): boolean {
    const info = forestInfo(graph);
    return info !== undefined && info.rootCount <= 1;
  },

  /**
   * Returns whether `graph` is a path: a tree in which every node has out-degree at most 1.
   *
   * The empty graph is a path.
   *
   * **Time:** O(nodeCount + edgeCount).
   * **Memory:** 8 x nodeCount bytes while it runs.
   *
   * @param graph the graph to check
   * @returns `true` if `graph` is a path
   */
  isPath(graph: Graph): boolean {
    const info = forestInfo(graph);
    return info !== undefined && info.rootCount <= 1 && info.maxOutDegree <= 1;
  },

  /**
   * Returns whether `graph` is strongly connected: every node reaches every other along the edges.
   *
   * Answers without the partition of {@link Components.sccsOf}. Uses Tarjan's algorithm, without
   * recursion. It starts from node 0 and stops as soon as an SCC without node 0 is complete. Where
   * the SCCs are already computed, {@link Sccs.isStronglyConnected} answers in O(1). The empty
   * graph is strongly connected, and so is a single node. For the undirected reading, see
   * {@link Graphs.isWeaklyConnected}.
   *
   * **Time:** O(nodeCount + edgeCount), stopping at the first SCC without node 0. **Memory:** 8 x
   * nodeCount bytes while it runs, and up to 8 x nodeCount bytes for the stack, which grows with
   * the deepest path.
   *
   * @param graph the graph to check
   * @returns `true` if every node reaches every other
   * @throws Error if a depth-first path is longer than 2^30 - 5 nodes
   */
  isStronglyConnected(graph: Graph): boolean {
    const n = graph.nodeCount;
    if (n <= 1) return true;
    const out = graph.outStart;
    const adj = graph.outAdj;
    const index = new Int32Array(n); // discovery time from 1; 0 = unvisited
    const low = new Int32Array(n);
    let frames = DfsFrames.initial(n);
    let time = 1;
    index[0] = 1;
    low[0] = 1;
    frames[0] = 0;
    frames[1] = out[0];
    let top = 0;

    outer: for (;;) {
      const u = frames[2 * top];
      const end = out[u + 1];
      let i = frames[2 * top + 1];
      while (i < end) {
        const v = adj[i++];
        if (index[v] === 0) {
          frames[2 * top + 1] = i;
          index[v] = ++time;
          low[v] = time;
          if (++top === frames.length >> 1) frames = DfsFrames.grow(frames, n);
          frames[2 * top] = v;
          frames[2 * top + 1] = out[v];
          continue outer;
        }
        if (index[v] < low[u]) low[u] = index[v];
      }
      if (top === 0) return time === n;
      if (low[u] === index[u]) return false;
      const parent = frames[2 * (top - 1)];
      if (low[u] < low[parent]) low[parent] = low[u];
      top--;
    }
  },

  /**
   * Returns whether `graph` is bipartite: its nodes split into two sets such that every edge runs
   * from one set to the other.
   *
   * Reads the graph as undirected, so the direction of the edges does not matter. A self-loop makes
   * the graph not bipartite, unlike the other checks of the undirected reading, which ignore
   * self-loops. The empty graph is bipartite.
   *
   * **Time:** O(nodeCount + edgeCount x alpha(nodeCount)), stopping at the first cycle of odd
   * length. **Memory:** 10 x nodeCount bytes while it runs.
   *
   * @param graph the graph to check
   * @returns `true` if `graph` is bipartite
   * @throws Error if `graph` has more than 2^30 - 5 nodes
   */
  isBipartite(graph: Graph): boolean {
    const n = graph.nodeCount;
    ArrayLimits.checkNodeCount(n, ArrayLimits.MAX_NODE_COUNT_TWO_INTS, "isBipartite");
    const targets = graph.outAdj;
    const start = graph.outStart;
    // Double cover: element u means "u in class A", u + n "u in class B". An edge ties each
    // endpoint to the other's opposite; a node sharing a set with its opposite is an odd cycle.
    const parent = UnionFind.singletons(2 * n);
    const rank = new Uint8Array(2 * n);
    for (let u = 0; u < n; u++) {
      for (let ei = start[u], end = start[u + 1]; ei < end; ei++) {
        const v = targets[ei];
        if (u === v) return false;
        UnionFind.union(parent, rank, u, v + n);
        UnionFind.union(parent, rank, u + n, v);
        if (UnionFind.find(parent, u) === UnionFind.find(parent, u + n)) return false;
      }
    }
    return true;
  },

  /**
   * Returns whether `graph` is a tree when read as undirected: connected and without cycles.
   *
   * Unlike for {@link Graphs.isTree}, the direction of the edges does not matter: edges toward the
   * root, or in mixed directions, make a tree as well. The edges `a -> b` and `b -> a` count as
   * one, so a tree may store its edges in both directions, and self-loops are ignored. The empty
   * graph is a tree.
   *
   * **Time:** O(nodeCount + edgeCount x alpha(nodeCount)), plus O(log maxOutDegree) for each pair
   * `a -> b`, `b -> a`; O(1) for more than 3 x nodeCount - 2 edges, too many for any tree.
   * **Memory:** 5 x nodeCount bytes while it runs.
   *
   * @param graph the graph to check
   * @returns `true` if `graph` is a tree when read as undirected
   */
  isUndirectedTree(graph: Graph): boolean {
    const n = graph.nodeCount;
    if (n === 0) return true;
    if (exceedsAcyclicEdgeBound(graph)) return false;
    // A cycle yields -1, which never equals n - 1 here.
    return undirectedMergeCount(graph) === n - 1;
  },

  /**
   * Returns whether `graph` is a forest when read as undirected: without cycles.
   *
   * Unlike for {@link Graphs.isForest}, the direction of the edges does not matter. The edges `a ->
   * b` and `b -> a` count as one, so they make no cycle, and self-loops are ignored. The empty
   * graph is a forest.
   *
   * **Time:** O(nodeCount + edgeCount x alpha(nodeCount)), plus O(log maxOutDegree) for each pair
   * `a -> b`, `b -> a`; O(1) for more than 3 x nodeCount - 2 edges, too many for any forest.
   * **Memory:** 5 x nodeCount bytes while it runs.
   *
   * @param graph the graph to check
   * @returns `true` if `graph` is a forest when read as undirected
   */
  isUndirectedForest(graph: Graph): boolean {
    if (exceedsAcyclicEdgeBound(graph)) return false;
    return undirectedMergeCount(graph) >= 0;
  },

  /**
   * Returns whether `graph` is weakly connected: connected when the direction of the edges is
   * ignored.
   *
   * Answers without the partition of {@link Components.wccsOf}, and stops as soon as all nodes are
   * connected. The empty graph is weakly connected, and so is a single node. For the directed
   * reading, see {@link Graphs.isStronglyConnected}.
   *
   * **Time:** O(nodeCount + edgeCount x alpha(nodeCount)), stopping once all nodes are connected.
   * **Memory:** 5 x nodeCount bytes while it runs.
   *
   * @param graph the graph to check
   * @returns `true` if `graph` is weakly connected
   */
  isWeaklyConnected(graph: Graph): boolean {
    const n = graph.nodeCount;
    if (n <= 1) return true;
    const targets = graph.outAdj;
    const start = graph.outStart;
    const parent = UnionFind.singletons(n);
    const rank = new Uint8Array(n);
    let merges = 0;
    for (let u = 0; u < n; u++) {
      for (let ei = start[u], end = start[u + 1]; ei < end; ei++) {
        if (UnionFind.union(parent, rank, u, targets[ei]) && ++merges === n - 1) return true;
      }
    }
    return false;
  },

  /**
   * Returns the whole graph as text: one line per node with its out-nodes, in ascending order.
   *
   * Each line ends with a line feed. For the control flow of a method with a loop:
   *
   * <!-- example: graphOperations.ts#adjacencyListOf -->
   * ```ts
   * const text = Graphs.adjacencyListOf(cfg);
   * // 0 -> [1]
   * // 1 -> [2, 5]
   * // 2 -> [3, 4]
   * // 3 -> [4]
   * // 4 -> [1]
   * // 5 -> []
   * ```
   *
   * Unlike {@link Graph.toString}, which is cut short for large graphs, this lists every node and
   * edge; a {@link BiAdjacentGraph} lists its out-nodes. The text of a graph with some tens of
   * millions of edges is longer than a JavaScript string can be (2^29 - 24 characters in V8, where
   * Java allows 2^31 - 9) and ends in the engine's `RangeError: Invalid string length` (Java: an
   * `OutOfMemoryError`).
   *
   * **Time:** O(nodeCount + edgeCount).
   * **Memory:** 1 byte per character for the result; while it runs, about as much again.
   *
   * @param graph the graph to list
   * @returns the adjacency list, one line per node
   */
  adjacencyListOf(graph: Graph): string {
    const n = graph.nodeCount;
    const start = graph.outStart;
    const targets = graph.outAdj;
    const lines = new Array<string>(n + 1);
    for (let v = 0; v < n; v++) {
      lines[v] = `${v} -> [${Array.prototype.join.call(targets.subarray(start[v], start[v + 1]), ", ")}]`;
    }
    lines[n] = "";
    return lines.join("\n");
  },

  /**
   * Returns a 64-bit hash of the nodes and edges of `graph`, consistent with {@link Graph.equals}.
   * The hash is a signed 64-bit `bigint`, which has the value range of Java's `long`.
   *
   * Equal graphs have equal hashes, and different graphs rarely do. A {@link BiAdjacentGraph} and a
   * `Graph` with the same nodes and edges count as equal. Like {@link Graph.hashCode}, the hash is
   * computed on every call: compute it once and keep it, for instance as the key of a cache of
   * results per graph, or to see when a transformation stops changing a graph. It depends on
   * nothing but the nodes and edges, so it is the same in every run and on every engine; a release
   * of Graphity that changes it says so in its changelog. Every implementation of Graphity computes
   * the same hash. Equal hashes do not prove equal graphs, and graphs can be made to collide on
   * purpose: compare with {@link Graph.equals} where it matters.
   *
   * **Time:** O(nodeCount + edgeCount).
   *
   * @param graph the graph to hash
   * @returns the hash
   */
  topologyHash(graph: Graph): bigint {
    const n = graph.nodeCount;
    const start = graph.outStart;
    const targets = graph.outAdj;
    let hi = HASH_SEED_HI;
    let lo = HASH_SEED_LO;

    // One order-sensitive step per value: h = rotateLeft(h ^ (value * GAMMA), 29) * STEP_PRIME
    // (Java: mixInto), on the two 32-bit halves of h, so that no step allocates a BigInt.
    const mix = (value: number): void => {
      let xLo = mul64(value < 0 ? -1 : 0, value | 0, HASH_GOLDEN_GAMMA_HI, HASH_GOLDEN_GAMMA_LO);
      let xHi = productHi;
      xLo ^= lo;
      xHi ^= hi;
      const rHi = (xHi << 29) | (xLo >>> 3);
      const rLo = (xLo << 29) | (xHi >>> 3);
      lo = mul64(rHi, rLo, HASH_STEP_PRIME_HI, HASH_STEP_PRIME_LO);
      hi = productHi;
    };

    mix(n);
    mix(graph.edgeCount);
    for (let v = 0; v < n; v++) {
      const end = start[v + 1];
      mix(end - start[v]);
      for (let e = start[v]; e < end; e++) mix(targets[e]);
    }

    // SplitMix64 finalizer: every input bit reaches every output bit.
    lo ^= (lo >>> 30) | (hi << 2);
    hi ^= hi >>> 30;
    lo = mul64(hi, lo, SPLITMIX64_MULTIPLIER_1_HI, SPLITMIX64_MULTIPLIER_1_LO);
    hi = productHi;
    lo ^= (lo >>> 27) | (hi << 5);
    hi ^= hi >>> 27;
    lo = mul64(hi, lo, SPLITMIX64_MULTIPLIER_2_HI, SPLITMIX64_MULTIPLIER_2_LO);
    hi = productHi;
    lo ^= (lo >>> 31) | (hi << 1);
    hi ^= hi >>> 31;
    return BigInt.asIntN(64, (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0));
  },

  /**
   * Returns the edges added and removed between `before` and `after`. Both are graphs over the same
   * nodes.
   *
   * Added edges come with their edge indices in `after`, removed edges with theirs in `before`.
   * With these edge indices, the caller can look up data on the edges of either graph in arrays
   * indexed by edge index. Both lists are in edge index order. An empty diff means that the graphs
   * are equal.
   *
   * **Time:** O(nodeCount + edgeCount), with the edges of both graphs. **Memory:** 12 bytes per
   * added or removed edge for the result; while it runs, up to 18 bytes more per such edge.
   *
   * @param before the older graph
   * @param after the newer graph, with the same node count
   * @returns the added and removed edges
   * @throws Error if the node counts differ
   */
  diff(before: Graph, after: Graph): GraphDiff {
    const n = before.nodeCount;
    if (after.nodeCount !== n) {
      throw new Error(`diff needs graphs over the same nodes, but before has ${n} nodes and after ${after.nodeCount}`);
    }
    const oldStart = before.outStart;
    const oldTargets = before.outAdj;
    const newStart = after.outStart;
    const newTargets = after.outAdj;
    const addedSources = new IntBuffer();
    const addedTargets = new IntBuffer();
    const addedEdgeIndices = new IntBuffer();
    const removedSources = new IntBuffer();
    const removedTargets = new IntBuffer();
    const removedEdgeIndices = new IntBuffer();
    for (let v = 0; v < n; v++) {
      let oldPos = oldStart[v];
      const oldEnd = oldStart[v + 1];
      let newPos = newStart[v];
      const newEnd = newStart[v + 1];
      // No target reaches 2^31 - 1 - node IDs stay below it -, so it marks an exhausted list.
      while (oldPos < oldEnd || newPos < newEnd) {
        const oldTarget = oldPos < oldEnd ? oldTargets[oldPos] : 0x7fffffff;
        const newTarget = newPos < newEnd ? newTargets[newPos] : 0x7fffffff;
        if (oldTarget === newTarget) {
          oldPos++;
          newPos++;
        } else if (oldTarget < newTarget) {
          removedSources.push(v);
          removedTargets.push(oldTarget);
          removedEdgeIndices.push(oldPos++);
        } else {
          addedSources.push(v);
          addedTargets.push(newTarget);
          addedEdgeIndices.push(newPos++);
        }
      }
    }
    // Both lists are in edge index order already, which sortedEdges detects and only copies.
    return GraphDiff.create(
      Edges.sortedEdges(after, addedSources.data, addedTargets.data, addedEdgeIndices.data, addedSources.length, false),
      Edges.sortedEdges(
        before,
        removedSources.data,
        removedTargets.data,
        removedEdgeIndices.data,
        removedSources.length,
        false,
      ),
    );
  },
} as const;

function notANode(newNode: number, oldNode: number, oldNodeCount: number): RangeError {
  return new RangeError(
    `new node ${newNode} maps to ${oldNode}, which is not a node of the old graph (nodeCount=${oldNodeCount})`,
  );
}

/**
 * Iterative DFS for cycle detection: stops at the first back edge (self-loops included).
 *
 * @param recordCycle whether to return the cycle; {@link Graphs.isDag} needs only the answer
 * @returns `undefined` for a DAG; otherwise the cycle closed by the first back edge, from its
 *     target to its source, or an empty array if it was not recorded
 */
function findCycleIn(graph: Graph, recordCycle: boolean): Int32Array | undefined {
  const n = graph.nodeCount;
  const out = graph.outStart;
  const adj = graph.outAdj;
  const state = new Int32Array((n >> 4) + 1);
  let frames = DfsFrames.initial(n);

  for (let root = 0; root < n; root++) {
    const rShift = (root & 0xf) << 1;
    if (((state[root >> 4] >>> rShift) & VISITED) !== 0) continue;
    state[root >> 4] |= (VISITED | ON_STACK) << rShift;
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
        const flags = state[v >> 4] >>> shift;
        if ((flags & ON_STACK) !== 0) {
          if (!recordCycle) return new Int32Array(0);
          // The path from v up to u, the top, is on the frame stack: the edge u -> v closes it.
          let at = top;
          while (frames[2 * at] !== v) at--;
          const cycle = new Int32Array(top - at + 1);
          for (let k = 0; k < cycle.length; k++) cycle[k] = frames[2 * (at + k)];
          return cycle;
        }
        if ((flags & VISITED) === 0) {
          frames[2 * top + 1] = i;
          state[v >> 4] |= (VISITED | ON_STACK) << shift;
          if (++top === frames.length >> 1) frames = DfsFrames.grow(frames, n);
          frames[2 * top] = v;
          frames[2 * top + 1] = out[v];
          continue outer;
        }
      }
      state[u >> 4] &= ~(ON_STACK << ((u & 0xf) << 1));
      top--;
    }
  }
  return undefined;
}

/**
 * The root count and the largest out-degree of `graph` if it is a forest, or `undefined` if some
 * node has in-degree > 1 or lies on or below a cycle. `Ancestry.of` makes the same check with a
 * witness for its message; a change to what counts as a forest changes both.
 */
function forestInfo(graph: Graph): { rootCount: number; maxOutDegree: number } | undefined {
  const n = graph.nodeCount;
  const targets = graph.outAdj;
  const start = graph.outStart;
  const inDegree = new Int32Array(n);
  for (let i = 0; i < targets.length; i++) {
    if (++inDegree[targets[i]] > 1) return undefined;
  }
  // With every in-degree <= 1, a BFS from the roots enqueues each node at most once; a node it
  // misses lies on a cycle or below one.
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  let maxOutDegree = 0;
  for (let i = 0; i < n; i++) {
    const outDegree = start[i + 1] - start[i];
    if (outDegree > maxOutDegree) maxOutDegree = outDegree;
    if (inDegree[i] === 0) queue[tail++] = i;
  }
  const rootCount = tail;
  while (head < tail) {
    const node = queue[head++];
    for (let i = start[node], end = start[node + 1]; i < end; i++) queue[tail++] = targets[i];
  }
  if (tail !== n) return undefined;
  return { rootCount, maxOutDegree };
}

/**
 * Whether `graph` holds more edges than any acyclic undirected reading could: at most
 * `nodeCount - 1` undirected edges in up to two directions each, plus one self-loop per node.
 */
function exceedsAcyclicEdgeBound(graph: Graph): boolean {
  const n = graph.nodeCount;
  return graph.edgeCount > (n === 0 ? 0 : 3 * n - 2);
}

/**
 * Merges the endpoints of every undirected edge and returns the number of merges, so that the
 * nodes form `nodeCount - result` components; or -1 as soon as an edge closes an undirected cycle.
 * Self-loops are skipped.
 *
 * Nodes are walked in ascending order, which makes a failed union classifiable: for `v > u` the
 * opposite direction sits in a list not yet visited, so the failure is a cycle; for `v < u` one
 * binary search in v's out-adjacency decides whether the edge is the second stored direction of
 * an edge already counted.
 */
function undirectedMergeCount(graph: Graph): number {
  const n = graph.nodeCount;
  const targets = graph.outAdj;
  const start = graph.outStart;
  const parent = UnionFind.singletons(n);
  const rank = new Uint8Array(n);
  let merges = 0;
  for (let u = 0; u < n; u++) {
    for (let ei = start[u], end = start[u + 1]; ei < end; ei++) {
      const v = targets[ei];
      if (u === v) continue;
      if (UnionFind.union(parent, rank, u, v)) {
        merges++;
      } else if (v > u || !containsInRange(targets, start[v], start[v + 1], u)) {
        return -1;
      }
    }
  }
  return merges;
}
