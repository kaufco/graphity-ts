import {
  Ancestry,
  BiAdjacentGraph,
  Dominators,
  type Graph,
  Graphs,
} from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** Immediate dominators in the control flow of load. */
export interface Immediate {
  readonly immediateDominatorOfNext: number;
  readonly immediateDominatorOfExit: number;
  readonly exitReachable: boolean;
  readonly dominatorsOfNext: readonly number[];
}

/** The dominator tree and questions answered by it. */
export interface Tree {
  readonly tree: Graph;
  readonly bodyDominatesNext: boolean;
  readonly thenDominatesNext: boolean;
  readonly lowestCommonDominator: number;
}

/** Immediate post-dominators and the post-dominator tree. */
export interface Post {
  readonly joinOfBody: number;
  readonly joinOfHeader: number;
  readonly tree: Graph;
}

/** Dominators from two entries, and their dominator forest. */
export interface TwoEntries {
  readonly immediateDominatorOfLoad: number;
  readonly immediateDominatorOfParse: number;
  readonly immediateDominatorOfFormat: number;
  readonly forest: Graph;
}

/**
 * Dominators, the dominator tree, post-dominators and dominators from several entries.
 */
export const FindingDominators = {
  /** Returns immediate dominators of the control flow of load. */
  immediate(): Immediate {
    const cfg = SmallProgram.cfg();
    const blocks = SmallProgram.blockNames();
    const entry = SmallProgram.nodeOf(blocks, "entry");
    const next = SmallProgram.nodeOf(blocks, "next");
    const exit = SmallProgram.nodeOf(blocks, "exit");
    // @start region="dominators"
    // The analysis follows edges against their direction too, so it takes a
    // BiAdjacentGraph.
    const dominators = Dominators.of(BiAdjacentGraph.of(cfg), entry);
    const immediateDominatorOfNext = dominators.immediateDominatorOf(next);   // 2 - body
    // 1 - header
    const immediateDominatorOfExit = dominators.immediateDominatorOf(exit);
    const exitReachable = dominators.isReachable(exit);                       // true

    // All blocks that dominate next: next, its immediate dominator, that one's, and so
    // on.
    const dominatorsOfNext: number[] = [];
    for (let d = next; d !== -1; d = dominators.immediateDominatorOf(d)) {
      dominatorsOfNext.push(d);
    }
    // dominatorsOfNext: [4, 2, 1, 0] - next, body, header, entry
    // @end
    return {
      immediateDominatorOfNext,
      immediateDominatorOfExit,
      exitReachable,
      dominatorsOfNext,
    };
  },

  /** Returns the dominator tree of the control flow of load and what it answers. */
  tree(): Tree {
    const cfg = SmallProgram.cfg();
    const blocks = SmallProgram.blockNames();
    const entry = SmallProgram.nodeOf(blocks, "entry");
    const body = SmallProgram.nodeOf(blocks, "body");
    const then = SmallProgram.nodeOf(blocks, "then");
    const next = SmallProgram.nodeOf(blocks, "next");
    // @start region="dominatorTree"
    // Dominators takes a BiAdjacentGraph, which also holds the in-nodes.
    const dominators = Dominators.of(BiAdjacentGraph.of(cfg), entry);
    const tree = Graphs.dominatorTree(dominators);
    // tree: entry -> header, header -> body, header -> exit, body -> then, body -> next

    // Does one block dominate another? An ancestor question on the dominator tree.
    const dominance = Ancestry.of(dominators);
    const bodyDominatesNext = dominance.isAncestorOf(body, next);   // true
    const thenDominatesNext = dominance.isAncestorOf(then, next);   // false
    // 2 - body
    const lowestCommonDominator = dominance.lowestCommonAncestorOf(then, next);
    // @end
    return { tree, bodyDominatesNext, thenDominatesNext, lowestCommonDominator };
  },

  /**
   * Returns immediate post-dominators of the control flow of load, and its post-dominator
   * tree.
   */
  post(): Post {
    const cfg = SmallProgram.cfg();
    const blocks = SmallProgram.blockNames();
    const body = SmallProgram.nodeOf(blocks, "body");
    const header = SmallProgram.nodeOf(blocks, "header");
    const exit = SmallProgram.nodeOf(blocks, "exit");
    // @start region="postDominators"
    // The post-dominators are the dominators of the transposed graph, from the exit.
    // Dominators takes a BiAdjacentGraph, which also holds the in-nodes.
    const postDominators = Dominators.of(BiAdjacentGraph.of(cfg).transposed(), exit);
    const joinOfBody = postDominators.immediateDominatorOf(body);       // 4 - next
    const joinOfHeader = postDominators.immediateDominatorOf(header);   // 5 - exit

    // The post-dominator tree: an edge from each block to the blocks it immediately
    // post-dominates.
    const tree = Graphs.dominatorTree(postDominators);
    // tree: header -> entry, header -> next, next -> body, next -> then, exit -> header
    // @end
    return { joinOfBody, joinOfHeader, tree };
  },

  /**
   * Returns dominators of the calls from main and from load, and their dominator forest.
   */
  twoEntries(): TwoEntries {
    const calls = SmallProgram.calls();
    const methods = SmallProgram.methodNames();
    const main = SmallProgram.nodeOf(methods, "main");
    const load = SmallProgram.nodeOf(methods, "load");
    const parse = SmallProgram.nodeOf(methods, "parse");
    const format = SmallProgram.nodeOf(methods, "format");
    // @start region="entries"
    // Besides main, a background job calls load directly.
    const dominators = Dominators.of(BiAdjacentGraph.of(calls), [main, load]);
    // -1 - an entry
    const immediateDominatorOfLoad = dominators.immediateDominatorOf(load);
    // 3 - load
    const immediateDominatorOfParse = dominators.immediateDominatorOf(parse);
    // 2 - run
    const immediateDominatorOfFormat = dominators.immediateDominatorOf(format);

    // The dominator forest: here a tree from main and one from load.
    const forest = Graphs.dominatorTree(dominators);
    // forest: main -> parseArgs, main -> run, run -> save, run -> show, run -> format,
    //         load -> parse, load -> read, save -> write
    // @end
    return {
      immediateDominatorOfLoad,
      immediateDominatorOfParse,
      immediateDominatorOfFormat,
      forest,
    };
  },
} as const;
