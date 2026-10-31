import {
  BiAdjacentGraph,
  ControlFlow,
  Dominators,
  type Graph,
  IteratedDominanceFrontier,
  Loops,
  type SortedIntView,
} from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** What the example reads from the loops of parseArgs. */
export interface Irreducible {
  readonly reducible: boolean;
  readonly loopCount: number;
  readonly entries: SortedIntView;
  readonly header: number;
}

/** The blocks that need a phi-node for each of two variables. */
export interface Phis {
  readonly forI: SortedIntView;
  readonly forLast: SortedIntView;
}

/** Irreducible loops, dominance frontiers, phi-nodes and control dependence. */
export const AnalyzingControlFlowFurther = {
  /** Returns the loop of parseArgs, which can be entered in two places. */
  irreducible(): Irreducible {
    const cfg = SmallProgram.cfgOfParseArgs();
    const entry = SmallProgram.nodeOf(SmallProgram.blockNamesOfParseArgs(), "entry");
    // @start region="irreducible"
    const loops = Loops.of(BiAdjacentGraph.of(cfg), entry);
    const reducible = loops.isReducible;   // false
    const loopCount = loops.loopCount;     // 1 - option and value, entered at both
    const entries = loops.entriesOf(0);    // [1, 2] - option and value
    const header = loops.headerOf(0);      // 1 - option, reached first by the search
    // @end
    return { reducible, loopCount, entries, header };
  },

  /** Returns the dominance frontiers of the control flow of load. */
  dominanceFrontiers(): Graph {
    const cfg = SmallProgram.cfg();
    const entry = SmallProgram.nodeOf(SmallProgram.blockNames(), "entry");
    // @start region="dominanceFrontiers"
    const dominators = Dominators.of(BiAdjacentGraph.of(cfg), entry);
    const frontiers = ControlFlow.dominanceFrontiers(dominators);
    // frontiers: header -> header, body -> header, then -> next, next -> header
    // @end
    return frontiers;
  },

  /** Returns the blocks of load that need a phi-node for i and for last. */
  phiBlocks(): Phis {
    const cfg = SmallProgram.cfg();
    const blocks = SmallProgram.blockNames();
    const entry = SmallProgram.nodeOf(blocks, "entry");
    const then = SmallProgram.nodeOf(blocks, "then");
    const next = SmallProgram.nodeOf(blocks, "next");
    // @start region="phi"
    // The loop counter i is assigned in entry (i = 0) and in next (i++), the variable
    // last in entry (last = null) and in then (last = parse(line)).
    const dominators = Dominators.of(BiAdjacentGraph.of(cfg), entry);
    const frontier = IteratedDominanceFrontier.of(dominators);
    const forI = frontier.frontierOf([entry, next]);   // [1] - header
    const forLast = frontier.frontierOf([entry, then]);
    // forLast: [1, 4] - header and next
    // @end
    return { forI, forLast };
  },

  /** Returns the control dependence between the blocks of load. */
  controlDependence(): Graph {
    const cfg = SmallProgram.cfg();
    const exit = SmallProgram.nodeOf(SmallProgram.blockNames(), "exit");
    // @start region="controlDependence"
    // Control dependence is the transposed graph of the dominance frontiers of the
    // post-dominators.
    const postDominators = Dominators.of(BiAdjacentGraph.of(cfg).transposed(), exit);
    const dependence =
      BiAdjacentGraph.of(ControlFlow.dominanceFrontiers(postDominators)).transposed();
    // dependence: header -> header, header -> body, header -> next, body -> then
    // @end
    return dependence;
  },
} as const;
