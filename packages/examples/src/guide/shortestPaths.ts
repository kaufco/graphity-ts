import { BfsDistances } from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** What the example reads from one source. */
export interface FromMain {
  readonly distanceToWrite: number;
  readonly pathToWrite: Int32Array;
  readonly reachesParseArgs: boolean;
}

/** What the example reads from two sources. */
export interface FromTwo {
  readonly fromEither: BfsDistances;
  readonly distanceToFormat: number;
  readonly pathToFormat: Int32Array;
  readonly reachesMain: boolean;
}

/** Shortest chains of calls, from one method and from the nearest of several. */
export const ShortestPaths = {
  /** Returns a shortest chain of calls from main to write. */
  fromMain(): FromMain {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const main = SmallProgram.nodeOf(names, "main");
    const write = SmallProgram.nodeOf(names, "write");
    const parseArgs = SmallProgram.nodeOf(names, "parseArgs");
    // @start region="pathTo"
    const fromMain = BfsDistances.of(calls, main);
    const distance = fromMain.distanceOf(write);       // 3 - three calls away
    // [0, 2, 4, 9] - main, run, save, write
    const path = fromMain.pathTo(write);
    const reached = fromMain.isReachable(parseArgs);   // true
    // @end
    return { distanceToWrite: distance, pathToWrite: path, reachesParseArgs: reached };
  },

  /** Returns how many calls away from main the farthest method is. */
  farthestCall(): number {
    const calls = SmallProgram.calls();
    const main = SmallProgram.nodeOf(SmallProgram.methodNames(), "main");
    // @start region="maxDistance"
    // How many calls away from main is the farthest method?
    const fromMain = BfsDistances.of(calls, main);
    // 3 - every method is at most 3 calls away from main
    const farthest = fromMain.maxDistance;
    // @end
    return farthest;
  },

  /** Returns the distances from the nearer of load and save. */
  fromTwo(): FromTwo {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const load = SmallProgram.nodeOf(names, "load");
    const save = SmallProgram.nodeOf(names, "save");
    const format = SmallProgram.nodeOf(names, "format");
    const main = SmallProgram.nodeOf(names, "main");
    // @start region="nearest"
    // The search starts at both load and save.
    const fromEither = BfsDistances.of(calls, [load, save]);
    const distance = fromEither.distanceOf(format);   // 1 - save calls it
    const path = fromEither.pathTo(format);           // [4, 7] - save, format
    const reached = fromEither.isReachable(main);     // false
    // @end
    return {
      fromEither,
      distanceToFormat: distance,
      pathToFormat: path,
      reachesMain: reached,
    };
  },
} as const;
