import {
  BiAdjacentGraph,
  Components,
  type Edges,
  type SortedIntView,
} from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** The strong bridges and strong articulation points. */
export interface Splitters {
  readonly strongBridges: Edges;
  readonly strongArticulationPoints: SortedIntView;
}

/** The edges and nodes whose removal splits the loop of the method load. */
export const SplittingGroups = {
  /**
   * Returns the strong bridges and strong articulation points of the control flow of
   * load.
   */
  ofLoad(): Splitters {
    const cfg = SmallProgram.cfg();
    // @start region="strongConnectivity"
    // The loop of cfg - header, body, then, next - is a strongly connected component. The
    // analysis follows edges against their direction too.
    const strong = Components.strongConnectivityOf(BiAdjacentGraph.of(cfg));
    const strongBridges = strong.strongBridges;
    // strongBridges: header -> body, body -> then, then -> next, next -> header
    const strongArticulationPoints = strong.strongArticulationPoints;
    // strongArticulationPoints: [1, 2, 4] - header, body and next
    // @end
    return { strongBridges, strongArticulationPoints };
  },
} as const;
