import { type Graph, GraphBuilder } from "@kobayami/graphity";
import { SmallProgram } from "./smallProgram.js";

const NAMES: readonly string[] = [
  "Ada", "Ben", "Cleo", "Dora", "Emil", "Finn", "Greta", "Hugo", "Ida", "Jonas",
];

// A person, then the person's parent.
const PARENT: readonly (readonly string[])[] = [
  ["Ben", "Ada"], ["Cleo", "Ada"],
  ["Dora", "Ben"], ["Emil", "Ben"], ["Finn", "Cleo"],
  ["Greta", "Dora"], ["Hugo", "Dora"], ["Ida", "Finn"], ["Jonas", "Finn"],
];

/**
 * The third example domain: a family tree that records one parent per person, over four
 * generations.
 *
 * Each person has the one parent the tree records, so the graph is a tree: an edge from
 * each parent to each child, rooted at `Ada`.
 *
 * ```text
 * Ada
 * +-- Ben
 * |   +-- Dora
 * |   |   +-- Greta
 * |   |   +-- Hugo
 * |   +-- Emil
 * +-- Cleo
 *     +-- Finn
 *         +-- Ida
 *         +-- Jonas
 * ```
 *
 * Node IDs follow the order of the names, which is the order in which
 * {@link SmallFamily.tree} adds the people, generation by generation. The graph never
 * changes: the comments of the examples, and the documentation that shows them, depend on
 * every node and edge.
 */
export const SmallFamily = {
  /**
   * Returns the family tree: an edge from each parent to each child.
   *
   * @returns 10 nodes, 9 edges
   */
  tree(): Graph {
    const builder = new GraphBuilder();
    builder.addNodes(NAMES.length);
    for (const row of PARENT) {
      builder.addEdge(SmallFamily.personOf(row[1]), SmallFamily.personOf(row[0]));
    }
    return builder.build();
  },

  /**
   * Returns the names of the people, by node ID of {@link SmallFamily.tree}.
   *
   * @returns Ada, Ben, Cleo, Dora, Emil, Finn, Greta, Hugo, Ida, Jonas
   */
  names(): string[] {
    return [...NAMES];
  },

  /**
   * Returns the node ID of the person named `name`.
   *
   * @param name the name of the person
   * @returns the node ID
   * @throws Error if nobody has this name
   */
  personOf(name: string): number {
    return SmallProgram.nodeOf(NAMES, name);
  },
} as const;
