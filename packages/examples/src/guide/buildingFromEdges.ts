import { type Graph, GraphBuilder } from "@kobayami/graphity";

/** The graph with its counts. */
export interface Built {
  readonly dependencies: Graph;
  readonly nodeCount: number;
  readonly edgeCount: number;
}

/**
 * A graph built from a list of edges: the dependencies between the packages of a program.
 */
export const BuildingFromEdges = {
  /** Returns the dependencies between the packages, built from a list of edges. */
  dependencies(): Built {
    // @start region="fromEdges"
    // The packages of a program, numbered from 0 to 7, and the dependencies between them
    // as pairs of package numbers: an edge p -> q means that package p uses package q.
    const names = ["app", "cli", "ui", "service", "model", "storage", "json", "util"];
    const uses = [
      [0, 1], [0, 2], [0, 3], [1, 7], [2, 3], [2, 4], [2, 7], [3, 4], [3, 5], [4, 5],
      [5, 4], [5, 6], [5, 7], [6, 7], [2, 4]];

    // One node per package, numbered as in names, and one edge per pair.
    const builder = new GraphBuilder();
    builder.addNodes(names.length);
    for (const [p, q] of uses) {
      builder.addEdge(p, q);
    }
    const dependencies = builder.build();
    const nodeCount = dependencies.nodeCount;   // 8
    const edgeCount = dependencies.edgeCount;   // 14 - the pair [2, 4] was given twice
    // @end
    return { dependencies, nodeCount, edgeCount };
  },
} as const;
