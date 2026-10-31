import { Biconnectivity } from "./biconnectivity.js";
import type { BiAdjacentGraph, Graph } from "./graph.js";
import { ParentForest } from "./parentForest.js";
import { NodePartition, type Sccs, sccsOf } from "./partition.js";
import { StrongConnectivity } from "./strongConnectivity.js";
import { UnionFind } from "./unionFind.js";

/**
 * The algorithms for the components of a graph, and for the edges and nodes whose removal splits
 * them.
 *
 * {@link Components.sccsOf} returns the SCCs (strongly connected components), and
 * {@link Components.wccsOf} the weakly connected components. {@link Components.ccsOf} returns the
 * weakly connected components under another name: the connected components of the graph read as
 * undirected. {@link Components.biconnectivityOf} returns the bridges, articulation points and
 * biconnected components. Bridges and articulation points are the edges and nodes whose removal
 * splits a connected component. {@link Components.strongConnectivityOf} returns the strong bridges
 * and strong articulation points, which split an SCC.
 *
 * A graph is always directed, and each method says how it reads the edges. `sccsOf` and
 * `strongConnectivityOf` follow them in their direction. `wccsOf`, `ccsOf` and `biconnectivityOf`
 * read the graph as undirected: an edge connects its source and target whether or not the reverse
 * edge exists, and the edges `a -> b` and `b -> a` count as one undirected edge, not two. An
 * undirected graph can therefore be stored with one edge per pair of neighbors or with both
 * directions, and these methods read it the same way. For the bridges this matters: read as two
 * edges, the two directions would form a cycle, and no edge stored in both directions could be a
 * bridge.
 */
export const Components = {
  /**
   * Returns the SCCs of `graph`. Uses Tarjan's algorithm, without recursion.
   *
   * Every node is in exactly one SCC; a node that lies on no cycle is an SCC of its own. SCC IDs
   * are in reverse topological order: every edge between two SCCs goes from the higher SCC ID to
   * the lower one, so SCC `0` has no edges to other SCCs. The nodes of each SCC are in ascending
   * order. Here, `dependencies` are the dependencies between the packages of a program, and `names`
   * holds the names of the packages. The example groups the packages by SCC, in the order of the
   * SCC IDs. In this order, each package comes after the packages it uses, and the packages that
   * use each other come together:
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
   * **Time:** O(nodeCount + edgeCount), plus sorting the nodes of each SCC: up to
   * O(nodeCount log nodeCount) when one SCC holds most of the nodes.
   * **Memory:** up to 12 x nodeCount bytes for the result; while it runs, 24 x nodeCount bytes
   * more.
   *
   * @param graph the graph
   * @returns the SCCs
   * @throws Error if `graph` has more than 2^30 - 5 nodes
   */
  sccsOf(graph: Graph): Sccs {
    return sccsOf(graph);
  },

  /**
   * Returns the weakly connected components of `graph`. These are the components of the graph read
   * as undirected.
   *
   * Every node is in exactly one component. Each component is a group of the result. The groups are
   * in the order of their smallest nodes: group `0` holds node `0`, group `1` the smallest node not
   * in group `0`, and so on. Uses union-find, whose cost grows with alpha(nodeCount). The inverse
   * Ackermann function alpha is below 5 for any graph.
   *
   * **Time:** O((nodeCount + edgeCount) x alpha(nodeCount)).
   * **Memory:** up to 12 x nodeCount bytes for the result; while it runs, 9 x nodeCount bytes
   * more.
   *
   * @param graph the graph
   * @returns the weakly connected components
   */
  wccsOf(graph: Graph): NodePartition {
    const n = graph.nodeCount;

    // 1) Union the endpoints of every edge; self-loops are no-ops.
    const parent = UnionFind.singletons(n);
    const rank = new Uint8Array(n);
    const adjacency = graph.outAdj;
    const adjacencyStart = graph.outStart;
    for (let u = 0; u < n; u++) {
      for (let ei = adjacencyStart[u], end = adjacencyStart[u + 1]; ei < end; ei++) {
        UnionFind.union(parent, rank, u, adjacency[ei]);
      }
    }

    // 2) Dense component IDs, in order of each component's smallest node.
    const nodeToGroup = new Int32Array(n);
    const groupOfRoot = new Int32Array(n).fill(-1);
    let groupCount = 0;
    for (let i = 0; i < n; i++) {
      const root = UnionFind.find(parent, i);
      if (groupOfRoot[root] < 0) groupOfRoot[root] = groupCount++;
      nodeToGroup[i] = groupOfRoot[root];
    }

    // 3) Members as CSR.
    const groups = ParentForest.groupIndices(nodeToGroup, groupCount);
    return NodePartition.create(graph, nodeToGroup, groups.members, groups.start);
  },

  /**
   * Returns the connected components of `graph` read as undirected. Equivalent to
   * `wccsOf(graph)`.
   *
   * The two names let a call say which reading of the graph it means.
   *
   * **Time:** O((nodeCount + edgeCount) x alpha(nodeCount)), as for {@link Components.wccsOf}.
   * **Memory:** up to 12 x nodeCount bytes for the result; while it runs, 9 x nodeCount bytes
   * more.
   *
   * @param graph the graph
   * @returns the connected components
   */
  ccsOf(graph: Graph): NodePartition {
    return Components.wccsOf(graph);
  },

  /**
   * Returns the bridges, articulation points and biconnected components of `graph`, read as
   * undirected.
   *
   * All three come from one depth-first search, so there is no cheaper method for one of them
   * alone; {@link Biconnectivity} describes them. The search follows the edges of every node in
   * both directions, so it takes a {@link BiAdjacentGraph}. For a plain {@link Graph}, call
   * `Components.biconnectivityOf(BiAdjacentGraph.of(graph))`. Uses the algorithm of Hopcroft and
   * Tarjan, without recursion.
   *
   * **Time:** O(nodeCount + edgeCount).
   * **Memory:** up to 8 x edgeCount + 20 x nodeCount bytes for the result; while it runs,
   * 8 x edgeCount + 63 x nodeCount bytes more.
   *
   * @param graph the graph
   * @returns the bridges, articulation points and biconnected components
   */
  biconnectivityOf(graph: BiAdjacentGraph): Biconnectivity {
    return Biconnectivity.of(graph);
  },

  /**
   * Returns the strong bridges and strong articulation points of `graph`. These are the edges and
   * nodes whose removal splits an SCC.
   *
   * The edges are followed in their direction, as by {@link Components.sccsOf};
   * {@link StrongConnectivity} describes the results. The computation also follows them against
   * their direction, so it takes a {@link BiAdjacentGraph}. For a plain {@link Graph}, call
   * `Components.strongConnectivityOf(BiAdjacentGraph.of(graph))`. Uses the algorithm of Italiano,
   * Laura and Santaroni, which finds both from the {@link Dominators} within each SCC, without
   * recursion.
   *
   * **Time:** O((nodeCount + edgeCount) log nodeCount).
   * **Memory:** up to 28 x nodeCount bytes for the result; while it runs, about 80 x nodeCount
   * bytes more.
   *
   * @param graph the graph
   * @returns the strong bridges and strong articulation points
   * @throws Error if `graph` has more than 2^30 - 6 nodes
   */
  strongConnectivityOf(graph: BiAdjacentGraph): StrongConnectivity {
    return StrongConnectivity.of(graph);
  },
} as const;
