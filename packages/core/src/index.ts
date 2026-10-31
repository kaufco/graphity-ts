/**
 * Directed graphs and their analysis, for tools that see a program as graphs: components, orders
 * and cycles, reachability, trees and dominators, and graphs derived from other graphs.
 *
 * This package is the counterpart of the Java module `graphity-core`; the packages
 * `@kobayami/graphity-controlflow`, `@kobayami/graphity-dot` and `@kobayami/graphity-mermaid` build
 * on it and are released with it at the same version. A {@link Graph} has the nodes
 * `0..nodeCount-1` and holds nothing but its edges, in 4 bytes per node and per edge; names and
 * other data on nodes and edges stay in arrays of the caller, indexed by node ID or edge index.
 * {@link GraphBuilder} builds a graph from a model of the caller, and the algorithms take the graph
 * and return immutable results. None of them recurses, so a deep graph does not overflow the call
 * stack. Here, the packages of a small program and the packages each of them uses become a graph,
 * which has a cycle:
 *
 * <!-- example: gettingStarted.ts#firstResult -->
 * ```ts
 * // The packages are the nodes 0..7, and uses[p] lists the packages that package p uses.
 * const names = ["app", "cli", "ui", "service", "model", "storage", "json", "util"];
 * const uses = [[1, 2, 3], [7], [3, 4, 7], [4, 5], [5], [4, 6, 7], [7], []];
 *
 * // Build the graph: an edge p -> q for every package q that p uses.
 * const builder = new GraphBuilder();
 * builder.addNodes(uses.length);
 * for (let pkg = 0; pkg < uses.length; pkg++) {
 *   builder.addOutEdges(pkg, uses[pkg]);
 * }
 * const dependencies = builder.build();
 *
 * // Find a cycle.
 * const cycle = Graphs.findCycle(dependencies);
 * // cycle: [4, 5] - model and storage use each other
 * ```
 *
 * ## Graphs
 *
 * - {@link Graph} - a directed graph with the out-nodes of every node; {@link BiAdjacentGraph} -
 *   one that also holds the in-nodes, for the algorithms that follow edges against their direction.
 *   It gives the transposed graph as well.
 * - {@link GraphBuilder} - builds a graph from edges in any order; {@link Graph.of} takes the
 *   arrays of its CSR (compressed sparse row) layout, which {@link Csr} hands to algorithm code of
 *   your own.
 * - {@link Graph.writeTo} and {@link Graph.readFrom} - store a graph and load it again.
 * - {@link SortedIntView} - the sorted list of node IDs or edge indices that lookups such as
 *   {@link Graph.outNodes} return; {@link Edges} - a list of edges, each with its source, target
 *   and edge index.
 * - {@link Graphs.adjacencyListOf}, {@link Graphs.topologyHash} and {@link Graphs.diff} - a whole
 *   graph as text, a hash to keep, and the edges added and removed between two versions of a
 *   graph.
 *
 * ## Components and connectivity
 *
 * - {@link Components.sccsOf} - the SCCs (strongly connected components), as {@link Sccs}.
 * - {@link Components.wccsOf} - the weakly connected components, which are the components of the
 *   graph read as undirected.
 * - {@link Components.biconnectivityOf} - the bridges, articulation points and biconnected
 *   components, as {@link Biconnectivity}.
 * - {@link Components.strongConnectivityOf} - the strong bridges and strong articulation points,
 *   as {@link StrongConnectivity}.
 * - {@link Graphs.isStronglyConnected} and {@link Graphs.isWeaklyConnected} - the same questions
 *   for the whole graph, answered without the components.
 *
 * ## Orders, cycles and traversals
 *
 * - {@link TopOrder} - a topological order of a DAG (directed acyclic graph);
 *   {@link TopOrderAndLevels} - one with a level per node.
 * - {@link Graphs.isDag} and {@link Graphs.findCycle} - whether a graph has a cycle, and one of its
 *   cycles.
 * - {@link EdgeTypes} - the tree, back, forward and cross edges of a depth-first search;
 *   {@link BackEdges} - the back edges alone.
 * - {@link DfsTraverser}, {@link DfsEdgeTraverser} and {@link FrontierTraverser} - the base
 *   classes of depth-first and breadth-first searches of your own.
 *
 * ## Reachability and distances
 *
 * - {@link Graphs.reachableFrom} - the nodes reachable from one or several nodes;
 *   {@link Graphs.rootNodes} - the nodes with in-degree 0, called root nodes.
 * - {@link BfsDistances} - distances and shortest paths from one or several nodes.
 * - {@link Graphs.transitiveClosure} and {@link Graphs.transitiveReduction} - an edge for every
 *   path, and the fewest edges for the same paths.
 *
 * ## Trees and dominators
 *
 * - {@link Ancestry} - parent, depth and lowest common ancestor in a forest;
 *   {@link PreorderAncestry} - the ancestor test in O(1) and the nodes of each subtree.
 * - {@link Graphs.isTree}, {@link Graphs.isForest} and {@link Graphs.isPath} - shape checks, and
 *   their counterparts for the graph read as undirected, such as {@link Graphs.isUndirectedTree}.
 * - {@link Dominators} - the dominators of a control-flow graph, and on its transposed graph the
 *   post-dominators; {@link Graphs.dominatorTree} - the dominator tree as a graph.
 *
 * Loops, dominance frontiers, control dependence and the placement of phi-nodes are in the package
 * `@kobayami/graphity-controlflow`. The package `@kobayami/graphity-mermaid` writes a graph as a
 * Mermaid flowchart, and `@kobayami/graphity-dot` writes it as text in DOT (the language of
 * Graphviz).
 *
 * ## Derived graphs and the data on them
 *
 * - {@link Graphs.remapped} with a {@link NodeMapping} - a subgraph or a graph with renumbered
 *   nodes; {@link EdgeMapping} carries data on the edges over to it.
 * - {@link NodePartition.condense} - the condensed graph of a partition of the nodes into groups;
 *   {@link EdgePartition} - the edges behind each of its edges.
 * - {@link BiAdjacentGraph.transposed} - the transposed graph, without copying;
 *   {@link Graphs.transposedEdgeMapping} carries data on the edges over to it.
 *
 * ## Errors
 *
 * The errors keep Java's distinction and Java's messages: a `RangeError` where Java throws an
 * `IndexOutOfBoundsException`, a plain `Error` where it throws an `IllegalArgumentException`, an
 * `IllegalStateException`, a `NoSuchElementException` or an `IOException`. A number that is not an
 * integer in the 32-bit range, where the library expects a node ID, an index or a count, fails the
 * range check of its parameter.
 *
 * @packageDocumentation
 */

export { Ancestry, PreorderAncestry } from "./ancestry.js";
export { BackEdges } from "./backEdges.js";
export { BfsDistances } from "./bfsDistances.js";
export { Biconnectivity } from "./biconnectivity.js";
export { BitSet } from "./bitSet.js";
export { GraphBuilder } from "./builder.js";
export { Components } from "./components.js";
export { DfsEdgeTraverser, EdgeAction, TargetState } from "./dfsEdgeTraverser.js";
export { DfsTraverser } from "./dfsTraverser.js";
export { Dominators } from "./dominators.js";
export { Edges } from "./edges.js";
export { EdgeType, EdgeTypes } from "./edgeTypes.js";
export { FrontierTraverser } from "./frontierTraverser.js";
export type { ByteSink } from "./csrStreams.js";
export { BiAdjacentGraph, Csr, type EdgeConsumer, Graph } from "./graph.js";
export { GraphDiff } from "./graphDiff.js";
export { Graphs } from "./graphs.js";
export { EdgeMapping, IndexMapping, NodeMapping, type TypedArray } from "./mapping.js";
export { TopOrder, TopOrderAndLevels } from "./order.js";
export { EdgePartition, IndexPartition, NodePartition, Sccs } from "./partition.js";
export { type IntList, IntLists, SortedIntView } from "./sortedIntView.js";
export { StrongConnectivity } from "./strongConnectivity.js";
