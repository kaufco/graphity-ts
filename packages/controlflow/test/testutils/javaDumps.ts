/**
 * The results of the three analyses on fixed graphs as text, the same text that `JavaDumps.java`
 * next to this file writes with the Java classes of `graphity-controlflow` 3.0 on the same graphs
 * (the generators of the test utilities reproduce Java's graphs bit for bit). The tests compare
 * Java's `String.hashCode` and the length of the text with the values that program prints, so that
 * every loop ID, header, parent, body order, entry list, frontier and phi set has to be Java's; its
 * header has the command that prints them again, and writes the texts for a diff.
 *
 * Format, one record per graph, every line ending in `\n`, lists comma-separated without spaces:
 *
 * - Loops: `<label> n=<nodeCount> loops=<loopCount> reducible=<true|false>`, then per loop
 *   `L<id> h=<headerOf> p=<parentOf> body=<bodyOf> entries=<entriesOf>`, then
 *   `inner=<innermostLoopOf of every node> depth=<loopDepthOf of every node>`.
 * - Dominance frontiers: `<label> edges=<edgeCount>`, then `<x>:<outNodes(x)>` for every node with
 *   a non-empty frontier.
 * - Iterated dominance frontiers: `<label> q=<query> nodes=<input> idf=<frontierOf(input)>` per
 *   query, the input drawn from `java.util.Random`.
 *
 * Labels are `seed=<seed>` for the graphs of the fuzz tests (with their entries) and the generator
 * call for the larger graphs.
 */

import { BiAdjacentGraph, Dominators, type Graph, type IntList, IntLists } from "@kobayami/graphity-core";
import { ControlFlow, IteratedDominanceFrontier, Loops } from "../../src/index.js";
import { ControlFlowGraphs, JavaRandom, RandomGraphs } from "./core.js";

/** Java's `String.hashCode`, fed piece by piece: `31 * h + c` over the UTF-16 units, in 32 bits. */
export class JavaStringHash {
  #hash = 0;
  #length = 0;
  #parts: string[] | undefined;

  /** With `keepText`, the text is kept as well, for a diff against Java's output. */
  constructor(keepText = false) {
    if (keepText) this.#parts = [];
  }

  append(value: string | number | boolean): this {
    const s = String(value);
    let h = this.#hash;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    this.#hash = h;
    this.#length += s.length;
    this.#parts?.push(s);
    return this;
  }

  get hash(): number {
    return this.#hash;
  }

  get length(): number {
    return this.#length;
  }

  get text(): string {
    return this.#parts?.join("") ?? "";
  }
}

function join(list: IntList): string {
  return Array.from(IntLists.asArrayLike(list)).join(",");
}

function dumpLoops(out: JavaStringHash, label: string, graph: Graph, entries: number[]): void {
  const loops = Loops.of(BiAdjacentGraph.of(graph), entries);
  const n = graph.nodeCount;
  out.append(`${label} n=${n} loops=${loops.loopCount} reducible=${loops.isReducible}\n`);
  for (let l = 0; l < loops.loopCount; l++) {
    out.append(
      `L${l} h=${loops.headerOf(l)} p=${loops.parentOf(l)} body=${join(loops.bodyOf(l))} entries=${join(loops.entriesOf(l))}\n`,
    );
  }
  const inner: number[] = [];
  const depth: number[] = [];
  for (let x = 0; x < n; x++) {
    inner.push(loops.innermostLoopOf(x));
    depth.push(loops.loopDepthOf(x));
  }
  out.append(`inner=${inner.join(",")} depth=${depth.join(",")}\n`);
}

function dumpFrontiers(out: JavaStringHash, label: string, graph: Graph, entries: number[]): void {
  const df = ControlFlow.dominanceFrontiers(Dominators.of(BiAdjacentGraph.of(graph), entries));
  out.append(`${label} edges=${df.edgeCount}\n`);
  for (let x = 0; x < df.nodeCount; x++) {
    if (df.outDegree(x) > 0) out.append(`${x}:${join(df.outNodes(x))}\n`);
  }
}

function dumpIdf(
  out: JavaStringHash,
  label: string,
  graph: Graph,
  entries: number[],
  querySeed: bigint,
  queries: number,
  maxNodes: number,
): void {
  const n = graph.nodeCount;
  const idf = IteratedDominanceFrontier.of(Dominators.of(BiAdjacentGraph.of(graph), entries));
  const rnd = new JavaRandom(querySeed);
  for (let q = 0; q < queries; q++) {
    const nodes: number[] = [];
    const count = 1 + rnd.nextInt(Math.min(maxNodes, n));
    for (let i = 0; i < count; i++) nodes.push(rnd.nextInt(n));
    out.append(`${label} q=${q} nodes=${nodes.join(",")} idf=${join(idf.frontierOf(nodes))}\n`);
  }
}

/** The loop forests of the `LoopsFuzzTest` graphs (seeds 0..149) and of nine larger graphs. */
export function loopsDump(out: JavaStringHash): void {
  for (let seed = 0; seed < 150; seed++) {
    let graph: Graph;
    let entries: number[];
    if (seed % 3 !== 2) {
      graph = ControlFlowGraphs.anyControlFlowGraph(seed).graph;
      entries = [0];
    } else {
      graph = RandomGraphs.anyGraph(seed).graph;
      const rnd = new JavaRandom(seed);
      entries = [];
      for (let i = 0, c = 1 + rnd.nextInt(3); i < c; i++) entries.push(rnd.nextInt(graph.nodeCount));
    }
    dumpLoops(out, `seed=${seed}`, graph, entries);
  }
  for (let s = 0; s < 4; s++) {
    dumpLoops(out, `irreducible(5000,400,${s})`, ControlFlowGraphs.irreducible(5000, 400, s), [0]);
    dumpLoops(out, `gnm(3000,6000,${s})`, RandomGraphs.gnm(3000, 6000, s), [0, 5, 17]);
  }
  dumpLoops(out, "structured(20000,7)", ControlFlowGraphs.structured(20000, 7), [0]);
}

/** The dominance frontiers of the `ControlFlowFuzzTest` graphs (seeds 0..119) and of two larger graphs. */
export function frontiersDump(out: JavaStringHash): void {
  for (let seed = 0; seed < 120; seed++) {
    let graph: Graph;
    let entries: number[];
    if (seed % 2 === 0) {
      graph = ControlFlowGraphs.anyControlFlowGraph(seed).graph;
      entries = [0];
    } else {
      graph = RandomGraphs.anyGraph(seed).graph;
      const n = graph.nodeCount;
      const rnd = new JavaRandom(BigInt(seed) * 17n + 5n);
      entries = [];
      const count = rnd.nextInt(10) === 0 ? 0 : 1 + rnd.nextInt(3);
      for (let i = 0; i < count; i++) entries.push(rnd.nextInt(n));
    }
    dumpFrontiers(out, `seed=${seed}`, graph, entries);
  }
  for (let s = 0; s < 2; s++) {
    dumpFrontiers(out, `irreducible(3000,300,${s})`, ControlFlowGraphs.irreducible(3000, 300, s), [0]);
  }
}

/** The `IteratedDominanceFrontierFuzzTest` queries (seeds 0..99) and 50 queries each on two larger graphs. */
export function idfDump(out: JavaStringHash): void {
  for (let seed = 0; seed < 100; seed++) {
    let graph: Graph;
    let entries: number[];
    if (seed % 2 === 0) {
      graph = ControlFlowGraphs.anyControlFlowGraph(seed).graph;
      entries = [0];
    } else {
      graph = RandomGraphs.anyGraph(seed).graph;
      const r = new JavaRandom(seed);
      entries = [r.nextInt(graph.nodeCount), r.nextInt(graph.nodeCount)];
    }
    dumpIdf(out, `seed=${seed}`, graph, entries, BigInt(seed) * 13n + 7n, 20, 8);
  }
  for (let s = 0; s < 2; s++) {
    dumpIdf(
      out,
      `irreducible(5000,400,${s})`,
      ControlFlowGraphs.irreducible(5000, 400, s),
      [0],
      99n + BigInt(s),
      50,
      20,
    );
  }
}
