/**
 * Export of graphs to DOT (the language of Graphviz) to look at them with its layout tools.
 *
 * This package is the counterpart of the Java module `graphity-dot`, released with
 * `@kobayami/graphity-core` at the same version. {@link DotWriter} writes a graph as DOT text. A
 * graph holds no data, so the writer takes labels and attributes from hooks that receive a node ID
 * or an edge index and read the caller's arrays. {@link AttributeHook} is the hook for the
 * attributes of one node or edge. The clusters come from a partition of the nodes, with a hook for
 * their labels. Here, the packages of a small program that depend on each other in a cycle:
 *
 * <!-- example: writingDot.ts#cycle -->
 * ```ts
 * // The packages are the nodes of dependencies, names[node] is the name of a package,
 * // and sccs holds the strongly connected components of dependencies.
 *
 * // Write the packages that lie on a cycle in DOT, each labeled with its name.
 * const dot = DotWriter.of(dependencies)
 *   .nodeLabel((node) => names[node])
 *   .nodeFilter((node) => sccs.containsCycle(sccs.sccOf(node)))
 *   .writeToString();
 * // digraph {
 * //   4 [label="model"];
 * //   5 [label="storage"];
 * //   4 -> 5;
 * //   5 -> 4;
 * // }
 * ```
 *
 * The node filter keeps the node IDs of the graph, so the hooks read the same arrays as for the
 * whole graph. For Markdown and documentation, the package `@kobayami/graphity-mermaid` writes
 * Mermaid flowcharts.
 *
 * A hook for a label may return `null` or `undefined`, which means none. Errors follow the core: a
 * plain `Error` where Java throws an `IllegalArgumentException`.
 *
 * @packageDocumentation
 */

export { type AttributeHook, DotWriter } from "./dotWriter.js";
export type { TextSink } from "./output.js";
