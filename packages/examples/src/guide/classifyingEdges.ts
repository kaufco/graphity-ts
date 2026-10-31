import { EdgeType, EdgeTypes, Edges } from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** What the example computes and reads. */
export interface Classified {
  readonly types: EdgeTypes;
  readonly storageToModel: EdgeType;
  readonly appToService: EdgeType;
  readonly crossEdges: Edges;
}

/** The type of each edge in a depth-first search of the packages. */
export const ClassifyingEdges = {
  /**
   * Returns the types of the edges of the packages, two of them read, and the cross
   * edges.
   */
  classify(): Classified {
    const dependencies = SmallProgram.dependencies();
    const names = SmallProgram.packageNames();
    const app = SmallProgram.nodeOf(names, "app");
    const service = SmallProgram.nodeOf(names, "service");
    const model = SmallProgram.nodeOf(names, "model");
    const storage = SmallProgram.nodeOf(names, "storage");
    // @start region="edgeTypes"
    const types = EdgeTypes.of(dependencies);
    // EdgeType.BACK - closes a cycle
    const storageToModel = types.typeOf(dependencies.edgeIndexOf(storage, model));
    // EdgeType.FORWARD - also through ui
    const appToService = types.typeOf(dependencies.edgeIndexOf(app, service));

    // All edges of one type, as an edge list.
    const crossEdges = Edges.of(types, EdgeType.CROSS);
    // crossEdges: ui -> util, storage -> util, json -> util
    // @end
    return { types, storageToModel, appToService, crossEdges };
  },
} as const;
