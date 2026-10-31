import { type Graph, GraphBuilder } from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** The combined graph and the offsets of the two graphs in it. */
export interface Combined {
  readonly graph: Graph;
  readonly programOffset: number;
  readonly libraryOffset: number;
}

/** Two graphs combined into one, and a graph extended by an edge. */
export const CombiningGraphs = {
  /** Returns the packages of the program and of a library, combined into one graph. */
  programWithLibrary(): Combined {
    const dependencies = SmallProgram.dependencies();
    // @start region="combine"
    // library is a JSON library of three packages - api uses parser and writer - that the
    // program's package json (6) uses.
    const libraryBuilder = new GraphBuilder();
    libraryBuilder.addNodes(3);
    // api -> parser, api -> writer
    libraryBuilder.addOutEdges(0, 1, 2);
    const library = libraryBuilder.build();

    // Put both into one graph; the nodes of each graph keep their order, after an offset.
    const builder = new GraphBuilder();
    // 0 - the program keeps 0 to 7
    const programOffset = builder.addGraph(dependencies);
    // 8 - the library becomes 8 to 10
    const libraryOffset = builder.addGraph(library);
    builder.addEdge(programOffset + 6, libraryOffset);      // json -> api
    const combined = builder.build();
    // combined: 11 nodes, 17 edges
    // @end
    return { graph: combined, programOffset, libraryOffset };
  },

  /**
   * Returns the dependencies of a next version of the program, in which ui also uses
   * storage.
   */
  nextVersion(): Graph {
    const dependencies = SmallProgram.dependencies();
    const names = SmallProgram.packageNames();
    const ui = SmallProgram.nodeOf(names, "ui");
    const storage = SmallProgram.nodeOf(names, "storage");
    // @start region="extend"
    // A graph never changes: to add an edge, start a builder with it and build a new
    // graph.
    const builder = new GraphBuilder();
    builder.addGraph(dependencies);   // into an empty builder: the node IDs stay the same
    builder.addEdge(ui, storage);
    const nextVersion = builder.build();
    // nextVersion: 8 nodes, 15 edges
    // @end
    return nextVersion;
  },
} as const;
