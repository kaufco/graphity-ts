import {
  BiAdjacentGraph,
  Components,
  type Edges,
  type SortedIntView,
} from "@kobayami/graphity";
import { SmallProgram } from "./smallProgram.js";

/** The edges and nodes whose removal splits a component. */
export interface Splitters {
  readonly edges: Edges;
  readonly nodes: SortedIntView;
}

/** The components of a graph, and the edges and nodes that keep them connected. */
export const Connectivity = {
  /**
   * Returns the packages grouped by strongly connected component, in the order of their
   * IDs.
   */
  buildOrder(): string[][] {
    const dependencies = SmallProgram.dependencies();
    const names = SmallProgram.packageNames();
    // @start region="sccsOf"
    // The SCCs in reverse topological order, each as the names of its packages.
    const sccs = Components.sccsOf(dependencies);
    const buildOrder: string[][] = [];
    for (let scc = 0; scc < sccs.sccCount; scc++) {
      buildOrder.push(Array.from(sccs.nodesOf(scc), (node) => names[node]));
    }
    // buildOrder: [[util], [cli], [json], [model, storage], [service], [ui], [app]]
    // @end
    return buildOrder;
  },

  /** Returns the bridges and articulation points of the control flow of `load`. */
  bridgesOfLoad(): Splitters {
    const cfg = SmallProgram.cfg();
    // @start region="biconnectivity"
    const biconnectivity = Components.biconnectivityOf(BiAdjacentGraph.of(cfg));
    const bridges = biconnectivity.bridges;
    // bridges: entry -> header, header -> exit
    const articulationPoints = biconnectivity.articulationPoints;
    // articulationPoints: [1] - header
    // @end
    return { edges: bridges, nodes: articulationPoints };
  },

  /**
   * Returns the strong bridges and strong articulation points of the control flow of
   * `load`.
   */
  strongBridgesOfLoad(): Splitters {
    const cfg = SmallProgram.cfg();
    // @start region="strongConnectivity"
    const strong = Components.strongConnectivityOf(BiAdjacentGraph.of(cfg));
    const strongBridges = strong.strongBridges;
    // strongBridges: header -> body, body -> then, then -> next, next -> header
    const strongArticulationPoints = strong.strongArticulationPoints;
    // strongArticulationPoints: [1, 2, 4] - header, body and next
    // @end
    return { edges: strongBridges, nodes: strongArticulationPoints };
  },
} as const;
