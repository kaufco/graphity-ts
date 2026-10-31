/**
 * Export of graphs to Mermaid flowcharts, which render directly in Markdown, in issues and in
 * documentation.
 *
 * This package is the counterpart of the Java module `graphity-mermaid`, released with
 * `@kobayami/graphity-core` at the same version. {@link MermaidWriter} writes a graph as the text
 * of a Mermaid flowchart, in the {@link Direction} of choice and with node {@link Shape}s. A graph
 * holds no data, so the writer takes labels, shapes, classes and styles from hooks that receive a
 * node ID or an edge index and read the caller's arrays. The clusters come from a partition of the
 * nodes, with a hook for their labels. Here, the packages of a small program that depend on each
 * other in a cycle:
 *
 * <!-- example: writingMermaid.ts#cycle -->
 * ```ts
 * // The packages are the nodes of dependencies, names[node] is the name of a package,
 * // and sccs holds the strongly connected components of dependencies.
 *
 * // Write the packages that lie on a cycle as a Mermaid flowchart, each labeled with
 * // its name.
 * const mermaid = MermaidWriter.of(dependencies)
 *   .nodeLabel((node) => names[node])
 *   .nodeFilter((node) => sccs.containsCycle(sccs.sccOf(node)))
 *   .writeToString();
 * // flowchart TD
 * //   n4["model"]
 * //   n5["storage"]
 * //   n4 --> n5
 * //   n5 --> n4
 * ```
 *
 * The node filter keeps the node IDs of the graph, so the hooks read the same arrays as for the
 * whole graph. Mermaid renders graphs of a few hundred nodes well; for larger ones, the package
 * `@kobayami/graphity-dot` writes DOT (the language of Graphviz).
 *
 * A hook may return `null` or `undefined`, which means none. Errors follow the core: a plain
 * `Error` where Java throws an `IllegalArgumentException`.
 *
 * @packageDocumentation
 */

export { Direction, MermaidWriter, Shape } from "./mermaidWriter.js";
export type { TextSink } from "./output.js";
