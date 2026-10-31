import type { Graph, NodePartition } from "@kobayami/graphity-core";
import { type Output, type TextSink, writeTo, writeToString } from "./output.js";
import { Selection, isIdentifier } from "./selection.js";

/**
 * A hook that puts the attributes of one node or edge, by node ID or edge index, for
 * {@link DotWriter.nodeAttributes} and {@link DotWriter.edgeAttributes} (Java: a functional
 * interface with the method `accept`).
 *
 * The attributes, such as `color` or `shape`, are those of DOT (the language of Graphviz). The
 * writer passes a map from attribute name to value. It holds the label from
 * {@link DotWriter.nodeLabel} or {@link DotWriter.edgeLabel} as the attribute `label`, if there is
 * one, and nothing else; the hook can add attributes, and replace or remove the label. The writer
 * writes the attributes in the order they were put and escapes their values; a name that is not an
 * identifier or is a DOT keyword makes {@link DotWriter.write} throw an `Error`. The writer reuses
 * the map for every node and edge, so the hook must not keep it.
 *
 * Puts the attributes of the node or edge `id` into `attributes`.
 *
 * @param id node ID or edge index
 * @param attributes the attributes to write, by name
 */
export type AttributeHook = (id: number, attributes: Map<string, string>) => void;

const KEYWORDS: ReadonlySet<string> = new Set(["node", "edge", "graph", "digraph", "subgraph", "strict"]);

/** The attributes whose values Graphviz reads as labels, decoding HTML entities. */
const LABEL_ATTRIBUTES: ReadonlySet<string> = new Set(["label", "xlabel", "headlabel", "taillabel"]);

/**
 * A writer of DOT (the language of Graphviz) that labels and styles a graph with the caller's data
 * by node ID and edge index.
 *
 * {@link DotWriter.of} returns a writer for a graph, the methods that configure it return the
 * writer again, and {@link DotWriter.write} or {@link DotWriter.writeToString} write the text. The
 * graph holds no data, so labels and attributes come from hooks that receive a node ID or an edge
 * index and read the caller's arrays. Here, the packages of a small program get their names from
 * `names`. The strongly connected components `sccs` tell which packages are in a cycle, and these
 * are drawn in red:
 *
 * <!-- example: writingDot.ts#nodeAttributes -->
 * ```ts
 * const dot = DotWriter.of(dependencies)
 *   .nodeLabel((node) => names[node])
 *   .nodeAttributes((node, attributes) => {
 *     if (sccs.containsCycle(sccs.sccOf(node))) {
 *       attributes.set("color", "red");
 *     }
 *   })
 *   .writeToString();
 * // model and storage, the cycle, in red:
 * //   4 [label="model", color="red"];
 * //   5 [label="storage", color="red"];
 * ```
 *
 * Nodes are named by their node IDs. The text lists the graph attributes, the clusters in group
 * order with their nodes, then the nodes in no cluster, then the edges in edge index order, so the
 * same graph and hooks always give the same text. A node outside the clusters is listed only if it
 * has a label or attributes, or no edge in the text; Graphviz creates the other nodes from their
 * edges.
 *
 * Labels and attribute values are written as quoted strings: the writer escapes quotes and
 * backslashes and turns line breaks into DOT's `\n`. Graphviz decodes HTML entities such as `&lt;`
 * in the attributes `label`, `xlabel`, `headlabel` and `taillabel`. In these, the writer also turns
 * `&` into `&amp;`, so that a label shows exactly its text. Other values, such as a `URL`, keep
 * their `&`. NUL, which DOT cannot hold, is written as U+FFFD.
 *
 * Attribute names must be identifiers - an ASCII letter or underscore, then ASCII letters, digits
 * or underscores - other than the DOT keywords `node`, `edge`, `graph`, `digraph`, `subgraph` and
 * `strict`, in any letter case.
 *
 * A writer keeps its configuration and can write any number of times. For Markdown and
 * documentation, `MermaidWriter` in the package `@kobayami/graphity-mermaid` writes a Mermaid
 * flowchart.
 *
 * Instances are mutable.
 */
export class DotWriter {
  private readonly selection: Selection;
  private readonly graphAttributes = new Map<string, string>();
  private nodeLabelHook: ((node: number) => string | null | undefined) | null = null;
  private edgeLabelHook: ((edge: number) => string | null | undefined) | null = null;
  private nodeAttributesHook: AttributeHook | null = null;
  private edgeAttributesHook: AttributeHook | null = null;

  private constructor(graph: Graph) {
    this.selection = new Selection(graph);
  }

  /**
   * Returns a writer for `graph`, with no labels, attributes, clusters or filter yet.
   *
   * **Time:** O(1).
   *
   * @param graph the graph to write
   * @returns the writer
   */
  static of(graph: Graph): DotWriter {
    return new DotWriter(graph);
  }

  /**
   * Sets an attribute of the graph, such as `rankdir` to `LR`.
   *
   * **Time:** O(1).
   *
   * @param name attribute name, an identifier other than a DOT keyword
   * @param value attribute value
   * @returns this writer
   * @throws Error if `name` is not an identifier or is a DOT keyword
   */
  graphAttribute(name: string, value: string): this {
    this.graphAttributes.set(checkName(name), value);
    return this;
  }

  /**
   * Sets the label of each node, by node ID; `null` or `undefined` leaves a node unlabeled, and
   * Graphviz then shows its node ID.
   *
   * **Time:** O(1).
   *
   * @param label called with a node ID, returns the label of the node, or `null` or `undefined`
   * @returns this writer
   */
  nodeLabel(label: (node: number) => string | null | undefined): this {
    this.nodeLabelHook = label;
    return this;
  }

  /**
   * Sets the label of each edge, by edge index; `null` or `undefined` leaves an edge unlabeled.
   *
   * **Time:** O(1).
   *
   * @param label called with an edge index, returns the label of the edge, or `null` or `undefined`
   * @returns this writer
   */
  edgeLabel(label: (edge: number) => string | null | undefined): this {
    this.edgeLabelHook = label;
    return this;
  }

  /**
   * Sets the hook that adds DOT attributes, such as `shape`, `color` or `style`, to each node, by
   * node ID.
   *
   * The hook receives the label from {@link DotWriter.nodeLabel} as the attribute `label`, which it
   * can replace or remove.
   *
   * **Time:** O(1).
   *
   * @param hook called with each node that is written, puts its attributes
   * @returns this writer
   */
  nodeAttributes(hook: AttributeHook): this {
    this.nodeAttributesHook = hook;
    return this;
  }

  /**
   * Sets the hook that adds DOT attributes, such as `color` or `style`, to each edge, by edge
   * index.
   *
   * The hook receives the label from {@link DotWriter.edgeLabel} as the attribute `label`, which it
   * can replace or remove.
   *
   * **Time:** O(1).
   *
   * @param hook called with each edge that is written, puts its attributes
   * @returns this writer
   */
  edgeAttributes(hook: AttributeHook): this {
    this.edgeAttributesHook = hook;
    return this;
  }

  /**
   * Draws each group of `partition` as a cluster, with a label by group ID.
   *
   * Nodes in no group stay outside every cluster, and a group without a node to write has no
   * cluster. A label of `null` or `undefined` leaves a cluster unlabeled, also when the graph has a
   * `label`, which Graphviz would otherwise repeat on every cluster.
   *
   * **Time:** O(1).
   *
   * @param partition the groups, over the nodes of the graph, such as an `Sccs`
   * @param label called with a group ID, returns the label of its cluster, or `null` or `undefined`
   * @returns this writer
   * @throws Error if `partition` has a different node count than the graph
   */
  clusters(partition: NodePartition, label: (group: number) => string | null | undefined): this {
    this.selection.setClusters(partition, label);
    return this;
  }

  /**
   * Restricts the text to the nodes that `include` accepts and the edges between them.
   *
   * Node IDs stay those of the graph, so the hooks keep reading the same arrays.
   *
   * **Time:** O(1).
   *
   * @param include called with a node ID, returns whether to write the node
   * @returns this writer
   */
  nodeFilter(include: (node: number) => boolean): this {
    this.selection.nodeFilter = include;
    return this;
  }

  /**
   * Switches to the undirected reading of the graph: a `graph` with `--` edges instead of a
   * `digraph`.
   *
   * The edges `a -> b` and `b -> a` become one, written as the edge from the lower node ID; the
   * edge hooks receive its edge index.
   *
   * **Time:** O(1).
   *
   * @returns this writer
   */
  undirected(): this {
    this.selection.undirected = true;
    return this;
  }

  /**
   * Writes the graph to `out`, as DOT text. `out` is anything with a method `write(text)`, such as
   * `process.stdout` or a file stream of Node.js (Java: an `Appendable`).
   *
   * The text goes to `out.write` in chunks of about 8 KiB characters, not piece by piece.
   *
   * **Time:** O(nodeCount + edgeCount + groupCount), plus the hooks, with groupCount the number of
   * groups of the partition drawn as clusters; in the undirected reading, O(log outDegree(target))
   * more per edge.
   * **Memory:** nodeCount bytes while it runs, and a chunk of text.
   *
   * @param out where the text goes; not closed
   * @throws Error what `out.write` throws (Java: `IOException`), or if an attribute hook puts a
   *     name that is not an identifier or is a DOT keyword; the text written before the error has
   *     gone to `out`. Only a `write` that throws fails the call. A stream reports its errors
   *     through its own event or promise, which the caller must watch (see {@link TextSink})
   */
  write(out: TextSink): void {
    writeTo(out, (output) => this.writeText(output));
  }

  /**
   * Returns the DOT text of the graph, as {@link DotWriter.write} writes it.
   *
   * **Time:** as for {@link DotWriter.write}. **Memory:** the text for the result; while it runs,
   * up to twice as much again and nodeCount bytes more.
   *
   * @returns the DOT text
   * @throws Error as for {@link DotWriter.write}
   * @throws RangeError the engine's `Invalid string length`, if the text is longer than a
   *     JavaScript string can be (2^29 - 24 characters in V8, where Java allows 2^31 - 9; Java: an
   *     `OutOfMemoryError`)
   */
  writeToString(): string {
    return writeToString((output) => this.writeText(output));
  }

  private writeText(out: Output): void {
    const selection = this.selection;
    const n = selection.graph.nodeCount;
    const arrow = selection.undirected ? " -- " : " -> ";
    out.append(selection.undirected ? "graph {\n" : "digraph {\n");
    for (const [name, value] of this.graphAttributes) {
      out.append(`  ${name}=${quote(value, LABEL_ATTRIBUTES.has(name))};\n`);
    }
    const graphLabeled = this.graphAttributes.has("label");

    const hasEdge = new Uint8Array(n);
    selection.forEachWrittenEdge((source, target) => {
      hasEdge[source] = 1;
      hasEdge[target] = 1;
    });

    const attributes = new Map<string, string>();
    const clusters = selection.clusters;
    if (clusters !== null) {
      const partition = clusters.partition;
      for (let group = 0, groupCount = partition.groupCount; group < groupCount; group++) {
        const nodes = partition.nodesOf(group);
        let opened = false;
        for (let i = 0, size = nodes.size; i < size; i++) {
          const node = nodes.get(i);
          if (!selection.isIncluded(node)) continue;
          if (!opened) {
            out.append(`  subgraph cluster_${group} {\n`);
            const label = clusters.label(group);
            if (label != null) {
              out.append(`    label=${quote(label, true)};\n`);
            } else if (graphLabeled) {
              out.append('    label="";\n');
            }
            opened = true;
          }
          this.putNodeAttributes(node, attributes);
          writeNode(node, attributes, "    ", out);
        }
        if (opened) out.append("  }\n");
      }
    }
    for (let node = 0; node < n; node++) {
      if (!selection.isIncluded(node) || selection.clusterOf(node) >= 0) continue;
      this.putNodeAttributes(node, attributes);
      if (attributes.size !== 0 || hasEdge[node] === 0) writeNode(node, attributes, "  ", out);
    }
    selection.forEachWrittenEdge((source, target, edgeIndex) => {
      out.append(`  ${source}${arrow}${target}`);
      this.putEdgeAttributes(edgeIndex, attributes);
      writeAttributes(attributes, out);
      out.append(";\n");
    });
    out.append("}\n");
  }

  private putNodeAttributes(node: number, attributes: Map<string, string>): void {
    attributes.clear();
    const label = this.nodeLabelHook === null ? null : this.nodeLabelHook(node);
    if (label != null) attributes.set("label", label);
    if (this.nodeAttributesHook !== null) this.nodeAttributesHook(node, attributes);
  }

  private putEdgeAttributes(edgeIndex: number, attributes: Map<string, string>): void {
    attributes.clear();
    const label = this.edgeLabelHook === null ? null : this.edgeLabelHook(edgeIndex);
    if (label != null) attributes.set("label", label);
    if (this.edgeAttributesHook !== null) this.edgeAttributesHook(edgeIndex, attributes);
  }
}

function writeNode(node: number, attributes: Map<string, string>, indent: string, out: Output): void {
  out.append(`${indent}${node}`);
  writeAttributes(attributes, out);
  out.append(";\n");
}

function writeAttributes(attributes: Map<string, string>, out: Output): void {
  let first = true;
  for (const [key, value] of attributes) {
    const name = checkName(key);
    out.append(`${first ? " [" : ", "}${name}=${quote(value, LABEL_ATTRIBUTES.has(name))}`);
    first = false;
  }
  if (!first) out.append("]");
}

function checkName(name: string): string {
  // An identifier is ASCII, so toLowerCase is Java's toLowerCase(Locale.ROOT) here.
  if (!isIdentifier(name) || KEYWORDS.has(name.toLowerCase())) {
    throw new Error(`not a DOT attribute name: ${name}`);
  }
  return name;
}

/**
 * Returns `text` as a DOT quoted string that shows exactly that text, NUL aside, which DOT cannot
 * hold. For an attribute in which Graphviz decodes HTML entities, the labels, `decodesEntities`
 * turns `&` into `&amp;`.
 */
function quote(text: string, decodesEntities: boolean): string {
  let quoted = '"';
  let start = 0;
  for (let i = 0, length = text.length; i < length; i++) {
    let escaped: string;
    switch (text.charCodeAt(i)) {
      case 0x22: // "
        escaped = '\\"';
        break;
      case 0x5c: // \
        escaped = "\\\\";
        break;
      case 0x0a: // \n
        escaped = "\\n";
        break;
      case 0x0d: // \r, alone a line break, before \n part of one
        escaped = i + 1 < length && text.charCodeAt(i + 1) === 0x0a ? "" : "\\n";
        break;
      case 0x26: // &
        if (!decodesEntities) continue;
        escaped = "&amp;";
        break;
      case 0x00:
        escaped = "\uFFFD";
        break;
      default:
        continue;
    }
    quoted += text.slice(start, i) + escaped;
    start = i + 1;
  }
  return `${quoted}${text.slice(start)}"`;
}
