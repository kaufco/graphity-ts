import { BackEdges, type SortedIntView } from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** What the example reads from sorted lists. */
export interface Sorted {
  readonly size: number;
  readonly first: number;
  readonly last: number;
  readonly position: number;
  readonly hasFormat: boolean;
  readonly both: SortedIntView;
  readonly copy: Int32Array;
}

/** The two kinds of lists that Graphity returns: sorted node lists and edge lists. */
export const ReadingResultLists = {
  /** Returns what the example reads from the out-nodes of two methods. */
  sortedLists(): Sorted {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const run = SmallProgram.nodeOf(names, "run");
    const save = SmallProgram.nodeOf(names, "save");
    const show = SmallProgram.nodeOf(names, "show");
    const format = SmallProgram.nodeOf(names, "format");
    // @start region="sortedLists"
    const calledByRun = calls.outNodes(run);          // [3, 4, 5] - load, save and show
    const size = calledByRun.size;                    // 3
    const first = calledByRun.first();                // 3
    const last = calledByRun.last();                  // 5
    const position = calledByRun.indexOf(save);       // 1 - found by binary search
    const hasFormat = calledByRun.contains(format);   // false

    // Out-nodes come in ascending order and without duplicates, so they combine cheaply:
    // the methods that save or show call.
    const both = calls.outNodes(save).union(calls.outNodes(show));
    // both: [7, 9] - format and write

    // [3, 4, 5] - a copy that may be changed
    const copy = calledByRun.toInt32Array();
    // @end
    return { size, first, last, position, hasFormat, both, copy };
  },

  /** Returns the recursive calls, read from an edge list. */
  edgeLists(): string[] {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    // @start region="edges"
    // An algorithm that returns edges returns an Edges: here the back edges of a search,
    // which are the recursive calls, since the only cycles of calls are methods that call
    // themselves.
    // Position p is the edge sourceNodes[p] -> targetNodes[p], and edgeIndices[p] is its
    // edge index in calls.
    const recursive = BackEdges.of(calls);
    const lines: string[] = [];
    for (let p = 0; p < recursive.count; p++) {
      const caller = recursive.sourceNodes[p];
      const callee = recursive.targetNodes[p];
      const edge = recursive.edgeIndices[p];
      lines.push(`${names[caller]} -> ${names[callee]} (edge ${edge})`);
    }
    // lines: [parse -> parse (edge 10), format -> format (edge 11)]
    // @end
    return lines;
  },
} as const;
