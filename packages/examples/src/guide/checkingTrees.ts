import { type Graph, GraphBuilder, Graphs } from "@kobayami/graphity";
import { SmallFamily } from "../smallFamily.js";
import { SmallProgram } from "../smallProgram.js";

/** The answers of the example, and the line of descent it builds. */
export interface Shapes {
  readonly familyTree: boolean;
  readonly familyPath: boolean;
  readonly line: Graph;
  readonly lineTree: boolean;
  readonly linePath: boolean;
  readonly dependenciesForest: boolean;
}

/**
 * Whether graphs are trees, forests or paths, with their edges pointing away from the
 * root.
 */
export const CheckingTrees = {
  /**
   * Returns the shapes of the family, of one line of descent in it, and of the packages.
   */
  shapes(): Shapes {
    const family = SmallFamily.tree();
    const dependencies = SmallProgram.dependencies();
    // @start region="isTree"
    // true - one root node, one parent per person
    const familyTree = Graphs.isTree(family);
    const familyPath = Graphs.isPath(family);   // false - Ada has two children

    // One line of descent, Ada, Cleo, Finn and Ida, as a graph of its own: the nodes
    // 0 to 3.
    const builder = new GraphBuilder();
    builder.addNodes(4);
    builder.addPath(0, 1, 2, 3);
    const line = builder.build();
    const lineTree = Graphs.isTree(line);       // true
    const linePath = Graphs.isPath(line);       // true - one child per person at most

    // service has two in-nodes: app and ui. model and storage lie on a cycle.
    const dependenciesForest = Graphs.isForest(dependencies);   // false
    // @end
    return { familyTree, familyPath, line, lineTree, linePath, dependenciesForest };
  },
} as const;
