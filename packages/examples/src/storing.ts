import { closeSync, openSync, readFileSync, writeSync } from "node:fs";
import { Graph } from "@kobayami/graphity";

/** A graph with the names of its nodes. */
export interface Named {
  readonly graph: Graph;
  readonly names: string[];
}

/**
 * Storing a graph in a file together with the data on its nodes, and loading both again.
 */
export const Storing = {
  /** Writes `calls` to `file`, followed by the names of the methods. */
  store(calls: Graph, names: readonly string[], file: string): void {
    // @start region="writeTo"
    const fd = openSync(file, "w");
    try {
      calls.writeTo({ write: (chunk) => writeSync(fd, chunk) });
      writeSync(fd, JSON.stringify(names));
    } finally {
      closeSync(fd);
    }
    // @end
  },

  /** Reads what {@link Storing.store} wrote. */
  load(file: string): Named {
    // @start region="readFrom"
    const bytes = readFileSync(file);
    // equal to the graph written, edge indices included
    const calls = Graph.readFrom(bytes);
    // The names follow the graph, which takes 8 + 4 x (nodeCount + 1 + edgeCount) bytes.
    const namesStart = 8 + 4 * (calls.nodeCount + 1 + calls.edgeCount);
    const names: string[] = JSON.parse(bytes.subarray(namesStart).toString("utf8"));
    // @end
    return { graph: calls, names };
  },
} as const;
