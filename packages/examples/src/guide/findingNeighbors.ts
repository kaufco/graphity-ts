import { BiAdjacentGraph, type SortedIntView } from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** What the example reads from the out-nodes. */
export interface Out {
  readonly calledByRun: SortedIntView;
  readonly outDegree: number;
  readonly runCallsSave: boolean;
  readonly recursive: boolean;
}

/** What the example reads from the in-nodes. */
export interface In {
  readonly callersOfFormat: SortedIntView;
  readonly inDegree: number;
  readonly saveCallsFormat: boolean;
  readonly neighborsOfSave: SortedIntView;
  readonly degreeOfSave: number;
  readonly mainIsRoot: boolean;
}

/**
 * The out-nodes and in-nodes of single nodes: the methods a method calls, and its
 * callers.
 */
export const FindingNeighbors = {
  /** Returns what `run` calls. */
  outNodes(): Out {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const run = SmallProgram.nodeOf(names, "run");
    const save = SmallProgram.nodeOf(names, "save");
    const parse = SmallProgram.nodeOf(names, "parse");
    // @start region="outNodes"
    const calledByRun = calls.outNodes(run);            // [3, 4, 5] - load, save and show
    const outDegree = calls.outDegree(run);             // 3
    const runCallsSave = calls.hasOutNode(run, save);   // true
    const recursive = calls.containsSelfLoop(parse);    // true - parse calls itself
    // @end
    return { calledByRun, outDegree, runCallsSave, recursive };
  },

  /** Returns who calls `format`. */
  inNodes(): In {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const format = SmallProgram.nodeOf(names, "format");
    const save = SmallProgram.nodeOf(names, "save");
    const main = SmallProgram.nodeOf(names, "main");
    // @start region="inNodes"
    // A Graph stores the out-nodes of every node; BiAdjacentGraph adds the in-nodes.
    // Build it once and keep it.
    const both = BiAdjacentGraph.of(calls);
    // [4, 5, 7] - save, show and format
    const callers = both.inNodes(format);
    const inDegree = both.inDegree(format);                 // 3
    const saveCallsFormat = both.hasInNode(format, save);   // true
    // [2, 7, 9] - run, format, write
    const neighbors = both.neighbors(save);
    const degree = both.degree(save);                       // 3 - 1 in-node, 2 out-nodes
    const mainIsRoot = both.isRootNode(main);               // true - nobody calls main
    // @end
    return {
      callersOfFormat: callers,
      inDegree,
      saveCallsFormat,
      neighborsOfSave: neighbors,
      degreeOfSave: degree,
      mainIsRoot,
    };
  },
} as const;
