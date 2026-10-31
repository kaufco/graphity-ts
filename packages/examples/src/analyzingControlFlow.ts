import {
  BiAdjacentGraph,
  ControlFlow,
  Dominators,
  type Graph,
  IteratedDominanceFrontier,
  Loops,
  type SortedIntView,
} from "@kobayami/graphity";
import { SmallProgram } from "./smallProgram.js";

/** The loop around a block, with what the example reads from it. */
export interface LoopOfBlock {
  readonly loops: Loops;
  readonly loop: number;
  readonly header: number;
  readonly blocks: Int32Array;
}

/** The loops, the phi-nodes and the control dependence of the method `load`. */
export const AnalyzingControlFlow = {
  /** Returns the loop around the block `then` of `load`. */
  loopOfThen(): LoopOfBlock {
    const cfg = SmallProgram.cfg();
    const names = SmallProgram.blockNames();
    const entry = SmallProgram.nodeOf(names, "entry");
    const then = SmallProgram.nodeOf(names, "then");
    // @start region="loops"
    // The basic blocks of load are the nodes 0..5 of cfg: entry, header, body, then,
    // next, exit.

    // Find the loops of load, from its entry block.
    const loops = Loops.of(BiAdjacentGraph.of(cfg), entry);

    // Find the loop around the block then, with its header and its body.
    const loop = loops.innermostLoopOf(then);   // 0 - the for loop, the only loop
    const header = loops.headerOf(loop);        // 1 - the block header
    // [1, 2, 3, 4] - header, body, then and next
    const blocks = loops.bodyOf(loop);
    // @end
    return { loops, loop, header, blocks };
  },

  /** Returns the blocks of `load` where the variable `i` needs a phi-node. */
  phiBlocksOfI(): SortedIntView {
    const cfg = SmallProgram.cfg();
    const names = SmallProgram.blockNames();
    const entry = SmallProgram.nodeOf(names, "entry");
    const next = SmallProgram.nodeOf(names, "next");
    // @start region="frontierOf"
    const dominators = Dominators.of(BiAdjacentGraph.of(cfg), entry);
    const phis = IteratedDominanceFrontier.of(dominators);
    // i is assigned in entry (i = 0) and in next (i++)
    const phiBlocks = phis.frontierOf([entry, next]);
    // phiBlocks: [1] - header
    // @end
    return phiBlocks;
  },

  /** Returns the control dependence between the blocks of `load`. */
  controlDependenceOfLoad(): Graph {
    const cfg = SmallProgram.cfg();
    const exit = SmallProgram.nodeOf(SmallProgram.blockNames(), "exit");
    // @start region="controlDependence"
    const postDominators = Dominators.of(BiAdjacentGraph.of(cfg).transposed(), exit);
    const controlDependence = BiAdjacentGraph.of(
      ControlFlow.dominanceFrontiers(postDominators),
    ).transposed();
    // header -> [header, body, next]: the loop condition decides whether they run
    // body -> [then]: the if decides whether then runs
    // @end
    return controlDependence;
  },
} as const;
