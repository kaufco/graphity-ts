import { BiAdjacentGraph, Loops } from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** What the example reads from the loops of `show`. */
export interface Nesting {
  readonly loopCount: number;
  readonly notesLoop: number;
  readonly linesLoop: number;
  readonly header: number;
  readonly body: Int32Array;
  readonly parent: number;
  readonly depth: number;
}

/** The loops of the method `show` and how they nest. */
export const FindingLoops = {
  /** Returns the loops of `show` and how they nest. */
  loopsOfShow(): Nesting {
    const cfg = SmallProgram.cfgOfShow();
    const names = SmallProgram.blockNamesOfShow();
    const entry = SmallProgram.nodeOf(names, "entry");
    const format = SmallProgram.nodeOf(names, "format");
    const print = SmallProgram.nodeOf(names, "print");
    // @start region="loops"
    // Find the loops of show, from its entry block.
    const loops = Loops.of(BiAdjacentGraph.of(cfg), entry);
    const loopCount = loops.loopCount;                 // 2

    // The innermost loop of format is the loop over the notes; that of print, over the
    // lines.
    const notesLoop = loops.innermostLoopOf(format);   // 0
    const linesLoop = loops.innermostLoopOf(print);    // 1
    const header = loops.headerOf(linesLoop);          // 3 - nextLine
    // [1, 2, 3, 4] - all but entry and exit
    const body = loops.bodyOf(notesLoop);

    // How the loops nest.
    const parent = loops.parentOf(linesLoop);          // 0 - the loop over the notes
    const depth = loops.loopDepthOf(print);            // 2 - print runs in both loops
    // @end
    return { loopCount, notesLoop, linesLoop, header, body, parent, depth };
  },
} as const;
