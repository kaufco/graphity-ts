import { closeSync, openSync, readFileSync, statSync, writeSync } from "node:fs";
import { Graph, GraphBuilder, type GraphDiff, Graphs } from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** What the example reads after storing and loading. */
export interface Stored {
  readonly loaded: Graph;
  readonly same: boolean;
  readonly size: number;
}

/** Hashes compared, and the graph built a second time. */
export interface Hashes {
  readonly rebuilt: Graph;
  readonly sameForEqualGraphs: boolean;
  readonly differentForNextVersion: boolean;
}

/** Graphs stored in a file, hashed and compared. */
export const StoringAndComparing = {
  /** Returns the packages after a round trip through `file`. */
  roundTrip(file: string): Stored {
    const dependencies = SmallProgram.dependencies();
    // @start region="writeRead"
    const fd = openSync(file, "w");
    try {
      dependencies.writeTo({ write: (chunk) => writeSync(fd, chunk) });
    } finally {
      closeSync(fd);
    }
    const loaded = Graph.readFrom(readFileSync(file));
    const same = loaded.equals(dependencies);   // true
    const size = statSync(file).size;           // 100 - bytes, for 8 nodes and 14 edges
    // @end
    return { loaded, same, size };
  },

  /** The next version of the packages: storage no longer uses model, ui uses storage. */
  nextVersion(): Graph {
    const dependencies = SmallProgram.dependencies();
    const names = SmallProgram.packageNames();
    const ui = SmallProgram.nodeOf(names, "ui");
    const model = SmallProgram.nodeOf(names, "model");
    const storage = SmallProgram.nodeOf(names, "storage");
    const builder = new GraphBuilder();
    builder.addNodes(dependencies.nodeCount);
    dependencies.forEachEdge((source, target) => {
      if (source !== storage || target !== model) {
        builder.addEdge(source, target);
      }
    });
    builder.addEdge(ui, storage);
    return builder.build();
  },

  /** Returns how the hashes of three graphs compare. */
  hashes(): Hashes {
    const dependencies = SmallProgram.dependencies();
    const nextVersion = StoringAndComparing.nextVersion();
    // @start region="topologyHash"
    // The same graph built a second time, from its edges as pairs in another order, with
    // the pair [2, 4] given twice:
    const uses = [
      [5, 7], [2, 4], [0, 3], [6, 7], [4, 5], [2, 7], [3, 5], [1, 7], [5, 4], [0, 1],
      [2, 3], [3, 4], [5, 6], [0, 2], [2, 4]];
    const builder = new GraphBuilder();
    builder.addNodes(8);
    for (const [p, q] of uses) {
      builder.addEdge(p, q);
    }
    const rebuilt = builder.build();

    // The hash of dependencies, a 64-bit bigint, compared with those of the other two
    // graphs:
    const hash = Graphs.topologyHash(dependencies);
    const sameForEqualGraphs = hash === Graphs.topologyHash(rebuilt);            // true
    const differentForNextVersion = hash !== Graphs.topologyHash(nextVersion);   // true
    // @end
    return { rebuilt, sameForEqualGraphs, differentForNextVersion };
  },

  /** Returns the edges added and removed between two versions of the packages. */
  diff(): GraphDiff {
    const dependencies = SmallProgram.dependencies();
    const nextVersion = StoringAndComparing.nextVersion();
    // @start region="diff"
    const diff = Graphs.diff(dependencies, nextVersion);
    const added = diff.addedEdges;       // ui -> storage, edge 6 of nextVersion
    const removed = diff.removedEdges;   // storage -> model, edge 10 of dependencies
    const unchanged = diff.isEmpty;      // false
    // @end
    return diff;
  },
} as const;
