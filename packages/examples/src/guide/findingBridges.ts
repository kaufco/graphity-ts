import {
  BiAdjacentGraph,
  Components,
  type Edges,
  type SortedIntView,
} from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** The bridges and articulation points. */
export interface Splitters {
  readonly bridges: Edges;
  readonly articulationPoints: SortedIntView;
}

/** The blocks, and the edges in no block. */
export interface Blocks {
  readonly blockCount: number;
  readonly largeBlock: readonly string[];
  readonly inNoBlock: readonly string[];
}

/**
 * The bridges and articulation points of the calls between methods, read as undirected:
 * the single calls and methods whose removal splits a component; and the blocks of the
 * calls.
 */
export const FindingBridges = {
  /** Returns the bridges and articulation points of the calls, read as undirected. */
  splitters(): Splitters {
    const calls = SmallProgram.calls();
    // @start region="biconnectivity"
    // The analysis reads the edges as undirected and follows them both ways, so it takes
    // a BiAdjacentGraph.
    const biconnectivity = Components.biconnectivityOf(BiAdjacentGraph.of(calls));
    const bridges = biconnectivity.bridges;
    // bridges: main -> parseArgs, main -> run, run -> load, load -> parse, load -> read,
    //          save -> write
    const articulationPoints = biconnectivity.articulationPoints;
    // articulationPoints: [0, 2, 3, 4] - main, run, load and save
    // @end
    return { bridges, articulationPoints };
  },

  /**
   * Returns the blocks of the calls: their number, the edges of the large block, those in
   * none.
   */
  blocks(): Blocks {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    // @start region="blocks"
    // The blocks come from the same analysis as the bridges.
    const biconnectivity = Components.biconnectivityOf(BiAdjacentGraph.of(calls));
    const blocks = biconnectivity.blocks;
    // 7 - six blocks of one edge, one of four edges
    const blockCount = blocks.groupCount;

    // The edges other than self-loops that lie on a cycle, read as undirected: those of
    // the blocks of three edges or more. A bridge is a block of one edge, or of two if it
    // is stored in both directions.
    const largeBlock: string[] = [];
    for (let block = 0; block < blockCount; block++) {
      if (blocks.sizeOf(block) > 2) {
        for (const edge of blocks.edgesOf(block)) {
          largeBlock.push(
            `${names[calls.edgeSource(edge)]} -> ${names[calls.edgeTarget(edge)]}`,
          );
        }
      }
    }
    // largeBlock: [run -> save, run -> show, save -> format, show -> format]
    // @end
    const inNoBlock: string[] = [];
    for (let edge = 0; edge < calls.edgeCount; edge++) {
      if (blocks.get(edge) === -1) {
        inNoBlock.push(
          `${names[calls.edgeSource(edge)]} -> ${names[calls.edgeTarget(edge)]}`,
        );
      }
    }
    return { blockCount, largeBlock, inNoBlock };
  },
} as const;
