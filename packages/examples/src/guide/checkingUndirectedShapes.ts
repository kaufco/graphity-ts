import { Graphs } from "@kobayami/graphity";
import { SmallFamily } from "../smallFamily.js";
import { SmallProgram } from "../smallProgram.js";
import { FindingParts } from "./findingParts.js";

/** Whether two graphs are bipartite. */
export interface Bipartite {
  readonly family: boolean;
  readonly dependencies: boolean;
}

/** Whether graphs are trees or forests when read as undirected. */
export interface Shapes {
  readonly familyTree: boolean;
  readonly restForest: boolean;
  readonly restTree: boolean;
  readonly callsForest: boolean;
}

/** Bipartite graphs, trees and forests, all read as undirected. */
export const CheckingUndirectedShapes = {
  /** Returns whether the family and the packages are bipartite. */
  bipartite(): Bipartite {
    const family = SmallFamily.tree();
    const dependencies = SmallProgram.dependencies();
    // @start region="isBipartite"
    // Every edge joins a parent and a child, whose depths differ by one: one even, one
    // odd.
    const familyBipartite = Graphs.isBipartite(family);           // true

    // Read as undirected, app, ui and service form a cycle of three edges.
    const packagesBipartite = Graphs.isBipartite(dependencies);   // false
    // @end
    return { family: familyBipartite, dependencies: packagesBipartite };
  },

  /**
   * Returns whether the family, the calls and the rest of the calls are trees or forests.
   */
  shapes(): Shapes {
    const family = SmallFamily.tree();
    const calls = SmallProgram.calls();
    const rest = FindingParts.callsBelowRun();
    // @start region="undirectedTree"
    const familyTree = Graphs.isUndirectedTree(family);     // true

    // The self-loops of parse and format do not count as cycles here.
    const restForest = Graphs.isUndirectedForest(rest);     // true - five trees
    const restTree = Graphs.isUndirectedTree(rest);         // false - not connected

    // Read as undirected, run, save, format and show lie on a cycle.
    const callsForest = Graphs.isUndirectedForest(calls);   // false
    // @end
    return { familyTree, restForest, restTree, callsForest };
  },
} as const;
