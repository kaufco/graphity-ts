import type { Edges, Graph } from "@kobayami/graphity";

/** The edges of a graph in edge index order, each as `source -> target` with the names. */
export function edgesByName(graph: Graph, names: readonly string[]): string[] {
  const edges: string[] = [];
  graph.forEachEdge((source, target) => edges.push(`${names[source]} -> ${names[target]}`));
  return edges;
}

/** The edges of an edge list in its order, each as `source -> target` with the names. */
export function edgeListByName(edges: Edges, names: readonly string[]): string[] {
  const result: string[] = [];
  for (let p = 0; p < edges.count; p++) result.push(`${names[edges.sourceNodes[p]]} -> ${names[edges.targetNodes[p]]}`);
  return result;
}
