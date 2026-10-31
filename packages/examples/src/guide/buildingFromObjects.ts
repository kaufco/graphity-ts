import { type Graph, GraphBuilder } from "@kobayami/graphity";

/** A package of a program, with the names of the packages it uses. */
export class Package {
  constructor(
    readonly name: string,
    readonly uses: readonly string[],
  ) {}
}

/** The graph and the package of each node. */
export interface Built {
  readonly dependencies: Graph;
  readonly packageOf: readonly Package[];
  readonly usedByApp: string;
}

/**
 * A graph built from objects of the caller's own: packages that name the packages they
 * use.
 */
export const BuildingFromObjects = {
  /** Returns the dependencies between packages given as objects. */
  fromObjects(): Built {
    // @start region="packages"
    // The packages of a program as objects.
    const packages: readonly Package[] = [
      new Package("app", ["cli", "ui", "service"]),
      new Package("cli", ["util"]),
      new Package("ui", ["service", "model", "util"]),
      new Package("service", ["model", "storage"]),
      new Package("model", ["storage"]),
      new Package("storage", ["model", "json", "util"]),
      new Package("json", ["util"]),
      new Package("util", [])];
    // @end
    // @start region="fromObjects"
    // Give each package a node ID, its position in the list, and keep the package of each
    // node ID in an array. A Map from name to node ID finds the node ID of a name; an
    // unknown name gives -1, which the builder rejects.
    const packageOf: Package[] = [...packages];
    const nodeOf = new Map<string, number>();
    for (let node = 0; node < packageOf.length; node++) {
      nodeOf.set(packageOf[node].name, node);
    }

    // Add an edge for each package another package uses.
    const builder = new GraphBuilder();
    builder.addNodes(packages.length);
    for (const p of packages) {
      for (const used of p.uses) {
        builder.addEdge(nodeOf.get(p.name) ?? -1, nodeOf.get(used) ?? -1);
      }
    }
    const dependencies = builder.build();
    const usedByApp = packageOf[dependencies.outNodes(0).get(1)].name;   // ui
    // @end
    return { dependencies, packageOf, usedByApp };
  },

  /**
   * Returns a graph built from edges whose node IDs come from elsewhere, without a node
   * count.
   */
  fromNumberedInput(): Graph {
    // @start region="andNodes"
    // Edges between nodes numbered elsewhere, for example by a database: no node count
    // needed.
    const endpoints = [0, 3, 3, 4, 4, 0, 7, 3];   // 0 -> 3, 3 -> 4, 4 -> 0, 7 -> 3
    const builder = new GraphBuilder();
    builder.addEdgePairsAndNodes(endpoints);
    const graph = builder.build();
    // 8 - the nodes 0 to 7; 1, 2, 5 and 6 have no edges
    const nodeCount = graph.nodeCount;
    // @end
    return graph;
  },
} as const;
