/**
 * Character-for-character agreement with the Java writer on random graphs and configurations.
 *
 * Each seed draws, with `java.util.Random` ({@link JavaRandom}), a graph of up to 9 nodes, the
 * undirected reading, a node filter, clusters and labels from fragments that every escaping rule
 * acts on (quotes, line breaks, `&`, `#`, `%`, `:`, `<`, `>`, backticks, `direction` with Java's
 * whitespace classes, surrogate pairs, empty strings), and the direction, shapes, classes and link
 * styles. The expected digest is the SHA-256 of the text that the same generator, written in Java
 * with the same calls in the same order, produced through `graphity-mermaid` 3.0.0;
 * `JavaConformance.java` next to this file is that generator and prints the digest. The generator
 * draws the same values as the one of the DOT package, the DOT attributes included, so that both
 * write the same graphs.
 */

import { createHash } from "node:crypto";
import { GraphBuilder, NodePartition } from "@kobayami/graphity-core";
import { describe, expect, it } from "vitest";
import { JavaRandom } from "../../core/test/testutils/javaRandom.js";
import { Direction, MermaidWriter, Shape } from "../src/index.js";

// prettier-ignore
const FRAGMENTS = ["a", "Z", '"', "\\", "\n", "\r", "\r\n", "&", "&amp;", "\u0000", "#", "%", "%%", ":", ";", "<", ">",
  "`", "direction", "Direction", " ", "\t", "\u3000", "\u00a0", "\ufeff", "\u001c", "\u0085", "\u2007", "\u{1F600}",
  "{", "}", "[", "|", "'"];
const GRAPH_ATTRIBUTES = ["label", "rankdir", "URL", "xlabel", "Label", "fontname"];
const ATTRIBUTES = ["label", "shape", "xlabel", "headlabel", "taillabel", "color", "URL", "tooltip", "LABEL"];
const CLASSES = ["hot", "End", "_x1", "STYLE", "c"];
const STYLES = ["fill:#f96", "stroke:red,stroke-width:2px", "color:blue", "\u00a0x"];
const SHAPES = Object.values(Shape);
const DIRECTIONS = Object.values(Direction);

const JAVA_DIGEST = "5e47c000def27d762b5b274bf3eca7bb8d3655214c89b2f022a131fef061c800";
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
  // The DOT attributes, drawn as by the generator of the DOT package and not written here.
  for (let i = 0, k = r.nextInt(3); i < k; i++) {
    r.nextInt(GRAPH_ATTRIBUTES.length);
    text(r);
  }
  maybe(r, n, () => attributes(r));
  maybe(r, e, () => attributes(r));
  const direction = DIRECTIONS[r.nextInt(4)];
  const shapes = maybe(r, n, () => {
    const s = r.nextInt(11);
    return s < 9 ? SHAPES[s] : null;
  });
  const classDefs: [string, string][] = [];
  for (let i = 0, k = r.nextInt(3); i < k; i++) {
    const name = CLASSES[r.nextInt(CLASSES.length)];
    classDefs.push([name, STYLES[r.nextInt(STYLES.length)]]);
  }
  const nodeClasses = maybe(r, n, () => (r.nextInt(3) === 0 ? null : CLASSES[r.nextInt(CLASSES.length)]));
  const edgeStyles = maybe(r, e, () => (r.nextInt(3) === 0 ? null : STYLES[r.nextInt(STYLES.length)]));

  const mermaid = MermaidWriter.of(graph);
  if (undirected) mermaid.undirected();
  if (include !== null) mermaid.nodeFilter((v) => include[v]);
  if (partition !== null) mermaid.clusters(partition, (c) => clusterLabels[c]);
  if (nodeLabels !== null) mermaid.nodeLabel((v) => nodeLabels[v]);
  if (edgeLabels !== null) mermaid.edgeLabel((i) => edgeLabels[i]);
  mermaid.direction(direction);
  if (shapes !== null) mermaid.nodeShape((v) => shapes[v]);
  for (const [name, style] of classDefs) mermaid.classDef(name, style);
  if (nodeClasses !== null) mermaid.nodeClass((v) => nodeClasses[v]);
  if (edgeStyles !== null) mermaid.edgeStyle((i) => edgeStyles[i]);

  return `=== ${seed}\n${mermaid.writeToString()}`;
}

describe("Java conformance of the Mermaid writer", () => {
  it(`writes ${CASES} random cases exactly as graphity-mermaid does`, () => {
    const hash = createHash("sha256");
    for (let seed = 0; seed < CASES; seed++) hash.update(writeCase(seed), "utf8");
    expect(hash.digest("hex")).toBe(JAVA_DIGEST);
  });

  it("reaches every escaping rule", () => {
    let all = "";
    for (let seed = 0; seed < CASES; seed++) all += writeCase(seed);
    // prettier-ignore
    for (const piece of ["#12288;", "#65279;", "#160;", "#28;", "#9;", "#32;", "#quot;", "<br>", "#37;", "#58;",
      "#96;", "#lt;", "#gt;", "#35;", "#38;", "linkStyle", "class n", " --- ", "(((", "{{", '|" "|', "subgraph "]) {
      expect(all, piece).toContain(piece);
    }
  });
});
