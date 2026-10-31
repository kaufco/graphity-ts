import {
  BackEdges,
  type Edges,
  type Graph,
  GraphBuilder,
  Graphs,
} from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** The edges removed and the graph without them. */
export interface Broken {
  readonly backEdges: Edges;
  readonly acyclic: Graph;
  readonly isDag: boolean;
}

/** The packages without the edges that close their cycles. */
export const BreakingCycles = {
  /** Returns the packages without their back edges. */
  withoutBackEdges(): Broken {
    const dependencies = SmallProgram.dependencies();
    // @start region="backEdges"
    const backEdges = BackEdges.of(dependencies);   // storage -> model, edge 10

    // Build the graph again, without the back edges.
    const isBack = new Array<boolean>(dependencies.edgeCount).fill(false);
    for (const edge of backEdges.edgeIndices) {
      isBack[edge] = true;
    }
    const builder = new GraphBuilder();
    builder.addNodes(dependencies.nodeCount);
    dependencies.forEachEdge((source, target, edge) => {
      if (!isBack[edge]) {
        builder.addEdge(source, target);
      }
    });
    const acyclic = builder.build();
    const isDag = Graphs.isDag(acyclic);   // true
    // @end
    return { backEdges, acyclic, isDag };
  },
} as const;
