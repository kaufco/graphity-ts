/**
 * Character-for-character agreement with the Java writer on random graphs and configurations.
 *
 * Each seed draws, with `java.util.Random` ({@link JavaRandom}), a graph of up to 9 nodes, the
 * undirected reading, a node filter, clusters, labels, graph attributes and attributes per node
 * and edge from fragments that every escaping rule acts on (quotes, backslashes, line breaks, `&`,
 * NUL, surrogate pairs, empty strings, names in any case). The expected digest is the SHA-256 of
 * the text that the same generator, written in Java with the same calls in the same order,
 * produced through `graphity-dot` 3.0.0; `JavaConformance.java` next to this file is that
 * generator and prints the digest. The generator draws the same values as the one of the Mermaid
 * package, up to the last value the DOT writer needs.
 */

import { createHash } from "node:crypto";
import { GraphBuilder, NodePartition } from "@kobayami/graphity-core";
import { describe, expect, it } from "vitest";
import { JavaRandom } from "../../core/test/testutils/javaRandom.js";
import { DotWriter } from "../src/index.js";

// prettier-ignore
const FRAGMENTS = ["a", "Z", '"', "\\", "\n", "\r", "\r\n", "&", "&amp;", "\u0000", "#", "%", "%%", ":", ";", "<", ">",
  "`", "direction", "Direction", " ", "\t", "\u3000", "\u00a0", "\ufeff", "\u001c", "\u0085", "\u2007", "\u{1F600}",
  "{", "}", "[", "|", "'"];
const GRAPH_ATTRIBUTES = ["label", "rankdir", "URL", "xlabel", "Label", "fontname"];
const ATTRIBUTES = ["label", "shape", "xlabel", "headlabel", "taillabel", "color", "URL", "tooltip", "LABEL"];

const JAVA_DIGEST = "785056616b32bedc1abdc6ced2ec3a62662c3eaa5e4b8e2d17cd278d00a1da99";
const CASES = 3000;

interface Attributes {
  readonly entries: [string, string][];
  readonly removeLabel: boolean;
}

function text(r: JavaRandom): string {
  let s = "";
  for (let i = 0, k = r.nextInt(5); i < k; i++) s += FRAGMENTS[r.nextInt(FRAGMENTS.length)];
  return s;
}

function nullableText(r: JavaRandom): string | null {
  return r.nextInt(4) === 0 ? null : text(r);
}

function attributes(r: JavaRandom): Attributes {
  const entries: [string, string][] = [];
  for (let i = 0, k = r.nextInt(3); i < k; i++) {
    const name = ATTRIBUTES[r.nextInt(ATTRIBUTES.length)];
    entries.push([name, text(r)]);
  }
  return { entries, removeLabel: r.nextInt(5) === 0 };
}

function apply(attributes: Attributes, map: Map<string, string>): void {
  for (const [name, value] of attributes.entries) map.set(name, value);
  if (attributes.removeLabel) map.delete("label");
}

/** Draws `count` values in order, or nothing when the coin says so. */
function maybe<T>(r: JavaRandom, count: number, draw: () => T): T[] | null {
  if (!r.nextBoolean()) return null;
  const values: T[] = [];
  for (let i = 0; i < count; i++) values.push(draw());
  return values;
}

function writeCase(seed: number): string {
  const r = new JavaRandom(seed);
  const n = r.nextInt(10);
  const builder = new GraphBuilder();
  builder.addNodes(n);
  for (let i = 0, m = n === 0 ? 0 : r.nextInt(3 * n + 1); i < m; i++) {
    const source = r.nextInt(n);
    builder.addEdge(source, r.nextInt(n));
  }
  const graph = builder.build();
  const e = graph.edgeCount;

  const undirected = r.nextBoolean();
  const include = maybe(r, n, () => r.nextInt(4) !== 0);
  let partition: NodePartition | null = null;
  const clusterLabels: (string | null)[] = [];
  if (r.nextBoolean()) {
    const groupCount = r.nextInt(4) + 1;
    const groupOf: number[] = [];
    for (let v = 0; v < n; v++) groupOf.push(r.nextInt(groupCount + 1) - 1);
    for (let c = 0; c < groupCount; c++) clusterLabels.push(nullableText(r));
    partition = NodePartition.of(graph, groupOf, groupCount);
  }
  const nodeLabels = maybe(r, n, () => nullableText(r));
  const edgeLabels = maybe(r, e, () => nullableText(r));
  const graphAttributes: [string, string][] = [];
  for (let i = 0, k = r.nextInt(3); i < k; i++) {
    const name = GRAPH_ATTRIBUTES[r.nextInt(GRAPH_ATTRIBUTES.length)];
    graphAttributes.push([name, text(r)]);
  }
  const nodeAttributes = maybe(r, n, () => attributes(r));
  const edgeAttributes = maybe(r, e, () => attributes(r));

  const dot = DotWriter.of(graph);
  if (undirected) dot.undirected();
  if (include !== null) dot.nodeFilter((v) => include[v]);
  if (partition !== null) dot.clusters(partition, (c) => clusterLabels[c]);
  if (nodeLabels !== null) dot.nodeLabel((v) => nodeLabels[v]);
  if (edgeLabels !== null) dot.edgeLabel((i) => edgeLabels[i]);
  for (const [name, value] of graphAttributes) dot.graphAttribute(name, value);
  if (nodeAttributes !== null) dot.nodeAttributes((v, map) => apply(nodeAttributes[v], map));
  if (edgeAttributes !== null) dot.edgeAttributes((i, map) => apply(edgeAttributes[i], map));

  return `=== ${seed}\n${dot.writeToString()}`;
}

describe("Java conformance of the DOT writer", () => {
  it(`writes ${CASES} random cases exactly as graphity-dot does`, () => {
    const hash = createHash("sha256");
    for (let seed = 0; seed < CASES; seed++) hash.update(writeCase(seed), "utf8");
    expect(hash.digest("hex")).toBe(JAVA_DIGEST);
  });

  it("reaches every escaping rule", () => {
    let all = "";
    for (let seed = 0; seed < CASES; seed++) all += writeCase(seed);
    for (const piece of ["&amp;amp;", '    label="";', "�", "\\\\", "\\n", '\\"', "subgraph cluster_", " -- "]) {
      expect(all, piece).toContain(piece);
    }
  });
});
