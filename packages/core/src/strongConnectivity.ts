import { ArrayLimits } from "./arrayLimits.js";
import { Biconnectivity } from "./biconnectivity.js";
import { DfsPreorder } from "./dfsPreorder.js";
import { Dominators } from "./dominators.js";
import { Edges } from "./edges.js";
import type { BiAdjacentGraph } from "./graph.js";
import { IntBuffer } from "./internal.js";
import { ParentForest } from "./parentForest.js";
import { sccsOf } from "./partition.js";
import type { SortedIntView } from "./sortedIntView.js";

/**
 * The strong bridges and strong articulation points of a graph, as
 * {@link Components.strongConnectivityOf} returns them.
 *
 * A strong bridge is an edge whose removal increases the number of SCCs (strongly connected
 * components), and a strong articulation point is a node whose removal does the same. Strong
 * bridges lie inside SCCs of two or more nodes. Strong articulation points lie inside SCCs of three
 * or more nodes, since without one node of an SCC of two, the other still forms an SCC. So a graph
 * without cycles has neither, and a self-loop is never a strong bridge.
 *
 * The edges are followed in their direction, as by {@link Components.sccsOf}: the edges `a -> b`
 * and `b -> a` are two edges, and both are strong bridges of the SCC they form.
 * {@link Biconnectivity} has the counterparts for a graph read as undirected. Here, in the control
 * flow of the method `load`, the loop splits into several SCCs without `header`, `body` or `next`,
 * but not without `then`:
 *
 * <!-- example: connectivity.ts#strongConnectivity -->
 * ```ts
 * const strong = Components.strongConnectivityOf(BiAdjacentGraph.of(cfg));
 * const strongBridges = strong.strongBridges;
 * // strongBridges: header -> body, body -> then, then -> next, next -> header
 * const strongArticulationPoints = strong.strongArticulationPoints;
 * // strongArticulationPoints: [1, 2, 4] - header, body and next
 * ```
 *
 * Instances are immutable.
 *
 * **Memory:** up to 28 x nodeCount bytes.
 */
export class StrongConnectivity {
  readonly #strongBridges: Edges;
  readonly #strongArticulationPoints: SortedIntView;

  private constructor(strongBridges: Edges, strongArticulationPoints: SortedIntView) {
    this.#strongBridges = strongBridges;
    this.#strongArticulationPoints = strongArticulationPoints;
  }

  /**
   * @internal Computes both results, following Italiano, Laura and Santaroni: within a strongly
   * connected component and for any node `r` of it, an edge is a strong bridge exactly if it is a
   * bridge of the flow graph rooted at `r` or of its transpose, and a node other than `r` is a
   * strong articulation point exactly if it dominates another node in one of the two. Whether `r`
   * itself is one is a separate check.
   */
  static of(graph: BiAdjacentGraph): StrongConnectivity {
    const n = graph.nodeCount;
    // The dominators below allow one node less than Tarjan's algorithm: reject before it runs.
    ArrayLimits.checkNodeCount(n, DfsPreorder.MAX_NODE_COUNT, "strongConnectivityOf");
    const sccs = sccsOf(graph);
    const sccCount = sccs.sccCount;
    const sccOf = sccs.mapping;
    const members = sccs.members;
    const memberStart = sccs.memberStart;

    // One entry per component, its first member: sink components first for the graph, source
    // components first for its transpose, so every search stays in its component.
    const sinksFirst = new Int32Array(sccCount);
    const sourcesFirst = new Int32Array(sccCount);
    for (let c = 0; c < sccCount; c++) {
      sinksFirst[c] = members[memberStart[c]];
      sourcesFirst[c] = members[memberStart[sccCount - 1 - c]];
    }
    const forward = Dominators.withinBlocks(graph, sinksFirst);
    const backward = Dominators.withinBlocks(graph.transposed(), sourcesFirst);

    const found: Found = {
      sources: new IntBuffer(),
      targets: new IntBuffer(),
      edgeIndices: new IntBuffer(),
      isArticulation: new Uint8Array(n),
    };
    collect(forward, graph.inStart, graph.inAdj, sccOf, false, found);
    collect(backward, graph.outStart, graph.outAdj, sccOf, true, found);
    markEntries(graph, sccOf, members, memberStart, found.isArticulation);
    return new StrongConnectivity(
      Edges.sortedEdges(
        graph,
        found.sources.data,
        found.targets.data,
        found.edgeIndices.data,
        found.sources.length,
        true,
      ),
      Biconnectivity.flaggedNodes(found.isArticulation),
    );
  }

  /**
   * The strong bridges, in edge index order (Java: `strongBridges()`).
   *
   * **Time:** O(1).
   */
  get strongBridges(): Edges {
    return this.#strongBridges;
  }

  /**
   * The strong articulation points, in ascending order (Java: `strongArticulationPoints()`).
   *
   * **Time:** O(1).
   */
  get strongArticulationPoints(): SortedIntView {
    return this.#strongArticulationPoints;
  }
}

/** What {@link collect} gathers over both flow graphs. */
interface Found {
  readonly sources: IntBuffer;
  readonly targets: IntBuffer;
  readonly edgeIndices: IntBuffer;
  readonly isArticulation: Uint8Array;
}

/**
 * Adds the bridges and non-trivial dominators of one flow graph, given by its immediate dominators
 * and its in-adjacency. The edge `idom(v) -> v` is a bridge exactly if it exists - the immediate
 * dominator need not be a predecessor - and `v` dominates every other predecessor of `v` in its
 * component.
 *
 * @param transposed whether the flow graph is the transpose, so a bridge `u -> v` found there is
 *     the edge `v -> u` of the graph, and the in-adjacency slot of `u` is the out-adjacency slot
 *     of the graph - its edge index
 */
function collect(
  idom: Int32Array,
  inStart: Int32Array,
  inAdj: Int32Array,
  sccOf: Int32Array,
  transposed: boolean,
  found: Found,
): void {
  const n = idom.length;
  const preorderIndex = new Int32Array(n);
  const subtreeSize = new Int32Array(n);
  ParentForest.preorder(idom, preorderIndex, new Int32Array(n), subtreeSize);
  const isArticulation = found.isArticulation;
  for (let v = 0; v < n; v++) {
    const u = idom[v];
    if (u < 0) continue;
    if (idom[u] >= 0) isArticulation[u] = 1;
    const scc = sccOf[v];
    const pre = preorderIndex[v];
    const size = subtreeSize[v];
    let fromIdom = -1;
    let bridge = true;
    for (let i = inStart[v], end = inStart[v + 1]; i < end; i++) {
      const w = inAdj[i];
      if (w === u) {
        fromIdom = i;
      } else if (sccOf[w] === scc) {
        // v dominates w exactly if w lies in v's subtree, as in PreorderAncestry.isAncestorOf.
        const offset = preorderIndex[w] - pre;
        if (offset < 0 || offset >= size) {
          bridge = false;
          break;
        }
      }
    }
    if (bridge && fromIdom >= 0) {
      found.sources.push(transposed ? v : u);
      found.targets.push(transposed ? u : v);
      found.edgeIndices.push(transposed ? fromIdom : -1);
    }
  }
}

/**
 * Marks the entry `r` of every component of three or more nodes if the rest of the component is
 * not strongly connected: a search from another member, avoiding `r` and the edges leaving the
 * component, misses a member forwards or backwards.
 */
function markEntries(
  graph: BiAdjacentGraph,
  sccOf: Int32Array,
  members: Int32Array,
  memberStart: Int32Array,
  isArticulation: Uint8Array,
): void {
  const n = graph.nodeCount;
  const stamp = new Int32Array(n);
  const queue = new Int32Array(n);
  for (let c = 0; c < memberStart.length - 1; c++) {
    const size = memberStart[c + 1] - memberStart[c];
    if (size < 3) continue;
    const entry = members[memberStart[c]];
    const start = members[memberStart[c] + 1];
    const rest = size - 1;
    // A fresh mark per component and direction, so stamp is never cleared.
    if (
      reachedAvoiding(graph.outStart, graph.outAdj, sccOf, c, entry, start, 2 * c + 1, stamp, queue) < rest ||
      reachedAvoiding(graph.inStart, graph.inAdj, sccOf, c, entry, start, 2 * c + 2, stamp, queue) < rest
    ) {
      isArticulation[entry] = 1;
    }
  }
}

/** Breadth-first count of the members of component `scc` reached from `start`. */
function reachedAvoiding(
  adjStart: Int32Array,
  adj: Int32Array,
  sccOf: Int32Array,
  scc: number,
  avoided: number,
  start: number,
  mark: number,
  stamp: Int32Array,
  queue: Int32Array,
): number {
  stamp[avoided] = mark;
  stamp[start] = mark;
  queue[0] = start;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const u = queue[head++];
    for (let i = adjStart[u], end = adjStart[u + 1]; i < end; i++) {
      const v = adj[i];
      if (stamp[v] !== mark && sccOf[v] === scc) {
        stamp[v] = mark;
        queue[tail++] = v;
      }
    }
  }
  return tail;
}
