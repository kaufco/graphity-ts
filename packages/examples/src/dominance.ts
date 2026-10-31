import {
  Ancestry,
  BiAdjacentGraph,
  Dominators,
  PreorderAncestry,
} from "@kobayami/graphity";
import { SmallProgram } from "./smallProgram.js";

/** The immediate dominator of `next`, and whether `body` and `then` dominate it. */
export interface DominatorsOfNext {
  readonly idom: number;
  readonly bodyDominatesNext: boolean;
  readonly thenDominatesNext: boolean;
}

/** Dominators, and ancestor queries on the dominator tree. */
export const Dominance = {
  /** Returns what the dominators of `load` say about its basic block `next`. */
  dominatorsOfNext(): DominatorsOfNext {
    const cfg = SmallProgram.cfg();
    const names = SmallProgram.blockNames();
    const entry = SmallProgram.nodeOf(names, "entry");
    const body = SmallProgram.nodeOf(names, "body");
    const then = SmallProgram.nodeOf(names, "then");
    const next = SmallProgram.nodeOf(names, "next");
    // @start region="dominators"
    const dominators = Dominators.of(BiAdjacentGraph.of(cfg), entry);
    // 2 - the block body
    const idom = dominators.immediateDominatorOf(next);
    const dominance = Ancestry.of(dominators);
    const bodyDominatesNext = dominance.isAncestorOf(body, next);       // true
    const thenDominatesNext = dominance.isAncestorOf(then, next);       // false
    // @end
    return { idom, bodyDominatesNext, thenDominatesNext };
  },

  /** Returns the immediate post-dominator of `body` in the control flow of `load`. */
  postDominatorOfBody(): number {
    const cfg = SmallProgram.cfg();
    const names = SmallProgram.blockNames();
    const body = SmallProgram.nodeOf(names, "body");
    const exit = SmallProgram.nodeOf(names, "exit");
    // @start region="postDominators"
    const postDominators = Dominators.of(BiAdjacentGraph.of(cfg).transposed(), exit);
    const join = postDominators.immediateDominatorOf(body);   // 4 - the block next
    // @end
    return join;
  },

  /** Returns the basic blocks of `load` that `body` dominates. */
  dominatedByBody(): Int32Array {
    const cfg = SmallProgram.cfg();
    const names = SmallProgram.blockNames();
    const entry = SmallProgram.nodeOf(names, "entry");
    const body = SmallProgram.nodeOf(names, "body");
    const dominators = Dominators.of(BiAdjacentGraph.of(cfg), entry);
    // @start region="subtreeOf"
    const dominance = PreorderAncestry.of(Ancestry.of(dominators));
    // [2, 3, 4] - body, then and next
    const dominatedByBody = dominance.subtreeOf(body);
    // @end
    return dominatedByBody;
  },
} as const;
