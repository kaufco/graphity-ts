/**
 * SCCs and the condensation, WCCs, edge types, `NodeMapping.reindex`, `isDag` and `findCycle`,
 * `TopOrder` and `TopOrderAndLevels`, the hook order of `DfsTraverser`, and the binary format and
 * the builder against the results of the Java implementation, on the fixtures in `fixtures/`. The
 * other algorithms are pinned by the expected values of the ported Java tests.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BiAdjacentGraph,
  Components,
  EdgeTypes,
  Graph,
  GraphBuilder,
  DfsTraverser,
  Graphs,
  NodeMapping,
  type NodePartition,
  TopOrder,
  TopOrderAndLevels,
} from "../src/index.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

interface Case {
  name: string;
  isDag: boolean;
  sccCount: number;
  wccCount: number;
  levelCount: number;
}

const cases: Case[] = readFileSync(join(FIXTURES, "cases.tsv"), "utf8")
  .trim()
  .split("\n")
  .slice(1)
  .map((line) => {
    const f = line.split("\t");
    return {
      name: f[0],
      isDag: f[4] === "true",
      sccCount: Number(f[5]),
      wccCount: Number(f[6]),
      levelCount: Number(f[7]),
    };
  });

const groupIds = (partition: NodePartition, graph: Graph) =>
  Array.from({ length: graph.nodeCount }, (_, v) => partition.get(v));
const bytes = (file: string) => readFileSync(join(FIXTURES, file));
const graphOf = (file: string) => Graph.readFrom(bytes(file));
const ints = (c: Case, suffix: string) => {
  const b = bytes(`${c.name}.${suffix}`);
  return Array.from(new Int32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)));
};

class Trace extends DfsTraverser {
  readonly pre: number[] = [];
  readonly post: number[] = [];
  protected enterNode(node: number): boolean {
    this.pre.push(node);
    return true;
  }
  protected override leaveNode(node: number): void {
    this.post.push(node);
  }
}

describe.each(cases)("$name", (c) => {
  const graph = graphOf(`${c.name}.gphy`);

  it("SCCs and condensation match Java", () => {
    const sccs = Components.sccsOf(graph);
    expect(sccs.sccCount).toBe(c.sccCount);
    expect(groupIds(sccs, graph)).toEqual(ints(c, "scc.i32"));
    expect(sccs.condense().equals(graphOf(`${c.name}.condensed.gphy`))).toBe(true);
  });

  it("WCCs match Java", () => {
    const wccs = Components.wccsOf(graph);
    expect(wccs.groupCount).toBe(c.wccCount);
    expect(groupIds(wccs, graph)).toEqual(ints(c, "wcc.i32"));
  });

  it("edge types match Java", () => {
    const types = EdgeTypes.of(graph);
    const actual = Array.from({ length: graph.edgeCount }, (_, e) => types.typeOf(e));
    expect(actual).toEqual(Array.from(bytes(`${c.name}.edgetypes.u8`)));
  });

  it("reindex matches Java and remaps losslessly", () => {
    const mapping = NodeMapping.reindex(graph);
    expect(Array.from({ length: graph.nodeCount }, (_, v) => mapping.get(v))).toEqual(ints(c, "reindex.i32"));
    const back = Graphs.remapped(Graphs.remapped(graph, mapping), mapping.inverted(graph.nodeCount));
    expect(back.equals(graph)).toBe(true);
  });

  it("orders and levels match Java", () => {
    expect(Graphs.isDag(graph)).toBe(c.isDag);
    if (!c.isDag) {
      expect(() => TopOrder.of(graph)).toThrow("cycle");
      expect(Graphs.findCycle(graph).length).toBeGreaterThan(0);
      return;
    }
    expect(Array.from(TopOrder.of(graph))).toEqual(ints(c, "toporder.i32"));
    for (const g of [graph, BiAdjacentGraph.of(graph)]) {
      const tol = TopOrderAndLevels.of(g);
      expect(Array.from(tol.order)).toEqual(ints(c, "kahnorder.i32"));
      expect(Array.from(tol.levels)).toEqual(ints(c, "levels.i32"));
      expect(tol.levelCount).toBe(c.levelCount);
    }
  });

  it("traverser hook order matches Java", () => {
    const trace = new Trace(graph);
    trace.run();
    expect(trace.pre).toEqual(ints(c, "dfspre.i32"));
    expect(trace.post).toEqual(ints(c, "dfspost.i32"));
  });

  it("writeTo and the builder reproduce the graph", () => {
    const chunks: Uint8Array[] = [];
    graph.writeTo({ write: (chunk) => chunks.push(chunk) });
    expect(chunks.flatMap((chunk) => Array.from(chunk))).toEqual(Array.from(bytes(`${c.name}.gphy`)));
    const b = new GraphBuilder();
    b.addNodes(graph.nodeCount);
    graph.forEachEdge((s, t) => b.addEdge(t, s));
    const transposed = b.build();
    const bi = BiAdjacentGraph.of(graph);
    for (let v = 0; v < graph.nodeCount; v++) {
      expect(bi.inNodes(v).equals(transposed.outNodes(v))).toBe(true);
    }
  });
});

it("covers the full fixture set", () => {
  expect(cases.length).toBeGreaterThanOrEqual(28);
});
