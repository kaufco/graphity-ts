import type { Graph, NodePartition } from "@kobayami/graphity-core";
import { type Output, type TextSink, writeTo, writeToString } from "./output.js";
import { Selection, isIdentifier } from "./selection.js";

/**
 * The direction of a flowchart (Java: the enum `MermaidWriter.Direction`; here a constant object
 * with the ordinals of the enum as values, and a type of the same name for one of them).
 */
export const Direction = {
  /** Top to bottom, `TD`. */
  TOP_DOWN: 0,
  /** Bottom to top, `BT`. */
  BOTTOM_UP: 1,
  /** Left to right, `LR`. */
  LEFT_RIGHT: 2,
  /** Right to left, `RL`. */
  RIGHT_LEFT: 3,
} as const;

/** One of the four values of {@link Direction}. */
export type Direction = (typeof Direction)[keyof typeof Direction];

/** The Mermaid code of each {@link Direction}, by value. */
const DIRECTION_CODES: readonly string[] = ["TD", "BT", "LR", "RL"];

/**
 * The shape of a node, with the brackets Mermaid draws it with (Java: the enum
 * `MermaidWriter.Shape`; here a constant object with the ordinals of the enum as values, and a type
 * of the same name for one of them).
 */
export const Shape = {
  /** A rectangle, `[...]`. */
  RECTANGLE: 0,
  /** A rectangle with rounded corners, `(...)`. */
  ROUNDED: 1,
  /** A stadium, `([...])`. */
  STADIUM: 2,
  /** A subroutine box, `[[...]]`. */
  SUBROUTINE: 3,
  /** A cylinder, `[(...)]`. */
  CYLINDER: 4,
  /** A circle, `((...))`. */
  CIRCLE: 5,
  /** A double circle, `(((...)))`. */
  DOUBLE_CIRCLE: 6,
  /** A rhombus, `{...}`. */
  RHOMBUS: 7,
  /** A hexagon, `{{...}}`. */
  HEXAGON: 8,
} as const;

/** One of the nine values of {@link Shape}. */
export type Shape = (typeof Shape)[keyof typeof Shape];

/** The opening and closing bracket of each {@link Shape}, by value. */
const SHAPE_OPEN: readonly string[] = ["[", "(", "([", "[[", "[(", "((", "(((", "{", "{{"];
const SHAPE_CLOSE: readonly string[] = ["]", ")", "])", "]]", ")]", "))", ")))", "}", "}}"];

/** The words Mermaid's flowchart lexer reads as keywords, never as a class name. */
// prettier-ignore
const KEYWORDS: ReadonlySet<string> = new Set([
  "style", "linkStyle", "interpolate", "classDef", "class", "href", "click", "call", "graph",
  "flowchart", "subgraph", "end", "_self", "_blank", "_parent", "_top",
]);

/**
 * A writer of Mermaid flowcharts that labels and styles a graph with the caller's data by node ID
 * and edge index. Mermaid flowcharts render in Markdown.
 *
 * {@link MermaidWriter.of} returns a writer for a graph, the methods that configure it return the
 * writer again, and {@link MermaidWriter.write} or {@link MermaidWriter.writeToString} write the
 * text. The graph holds no data, so labels, shapes, classes and styles come from hooks that receive
 * a node ID or an edge index and read the caller's arrays. Here, the packages of a small program
 * get their names from `names`. The strongly connected components `sccs` tell which packages are in
 * a cycle, and these are drawn in red:
 *
 * <!-- example: writingMermaid.ts#nodeClass -->
 * ```ts
 * const mermaid = MermaidWriter.of(dependencies)
 *   .nodeLabel((node) => names[node])
 *   .classDef("cycle", "stroke:red")
 *   .nodeClass((node) => (sccs.containsCycle(sccs.sccOf(node)) ? "cycle" : null))
 *   .writeToString();
 * // model and storage, the cycle, in red:
 * //   classDef cycle stroke:red
 * //   class n4 cycle
 * //   class n5 cycle
 * ```
 *
 * Nodes are named by their node IDs after an `n`, such as `n4`. The text lists the class
 * definitions, the clusters in group order with their nodes, then the nodes in no cluster, then the
 * edges in edge index order, the classes of the nodes and the edge styles, so the same graph and
 * hooks always give the same text. Mermaid numbers the edges in the order they are written; the
 * writer translates edge indices into these numbers for `linkStyle`, also when a filter leaves
 * edges out.
 *
 * Labels are written as quoted strings: the writer turns quotes, `#`, `%`, `&`, `:`, `<`, `>` and
 * backticks into Mermaid entity codes and line breaks into `<br>`, so that no label reads as HTML,
 * as a Markdown string or as a directive. For the same reason, whitespace right after the word
 * `direction` becomes an entity code, and an empty label, which Mermaid rejects, is written as one
 * space.
 *
 * Mermaid's renderer still changes some labels. Mermaid 11 applies Markdown emphasis and backslash
 * escapes to every label, so `2*3*4` loses its asterisks; Mermaid 12 shows a backslash before `n`
 * as a line break. Both read `¶ß` and `ﬂ°`, which Mermaid uses internally for entity codes, as `;`
 * and `&`. Both also turn `fa:fa-`*name* into an icon in a node label with a line break. With
 * `htmlLabels` set to `false`, Mermaid shows some entity codes as written, such as `&#58;` for `:`.
 *
 * Class names must be identifiers - an ASCII letter or underscore, then ASCII letters, digits or
 * underscores - other than a Mermaid keyword: `style`, `linkStyle`, `interpolate`, `classDef`,
 * `class`, `href`, `click`, `call`, `graph`, `flowchart`, `subgraph`, `end`, `_self`, `_blank`,
 * `_parent` and `_top`. Keywords are case-sensitive, so `End` is a valid class name. Styles are
 * written as given and must not be blank or contain a line break or a semicolon.
 *
 * Mermaid renders graphs of a few hundred nodes well; for larger ones, `DotWriter` in the package
 * `@kobayami/graphity-dot` writes DOT (the language of Graphviz). A writer keeps its configuration
 * and can write any number of times.
 *
 * Instances are mutable.
 */
export class MermaidWriter {
  private readonly selection: Selection;
  private directionValue: Direction = Direction.TOP_DOWN;
  private readonly classDefs = new Map<string, string>();
  private nodeLabelHook: ((node: number) => string | null | undefined) | null = null;
  private edgeLabelHook: ((edge: number) => string | null | undefined) | null = null;
  private nodeShapeHook: ((node: number) => Shape | null | undefined) | null = null;
  private nodeClassHook: ((node: number) => string | null | undefined) | null = null;
  private edgeStyleHook: ((edge: number) => string | null | undefined) | null = null;

  private constructor(graph: Graph) {
    this.selection = new Selection(graph);
  }

  /**
   * Returns a writer for `graph`, top down, with no labels, shapes, classes, clusters or filter
   * yet.
   *
   * **Time:** O(1).
   *
   * @param graph the graph to write
   * @returns the writer
   */
  static of(graph: Graph): MermaidWriter {
    return new MermaidWriter(graph);
  }

  /**
   * Sets the direction of the flowchart; without a call, it is {@link Direction.TOP_DOWN}.
   *
   * **Time:** O(1).
   *
   * @param direction the direction
   * @returns this writer
   * @throws Error if `direction` is not a value of {@link Direction} (not in Java, where an enum
   *     value is always valid)
   */
  direction(direction: Direction): this {
    if (DIRECTION_CODES[direction] === undefined) throw new Error(`not a Mermaid direction: ${direction}`);
    this.directionValue = direction;
    return this;
  }

  /**
   * Sets the label of each node, by node ID; `null` or `undefined` shows the name of the node, such
   * as `n4`.
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
   * Sets the shape of each node, by node ID; `null` or `undefined` draws a rectangle.
   *
   * A value that is not one of {@link Shape} makes {@link MermaidWriter.write} throw an `Error`.
   *
   * **Time:** O(1).
   *
   * @param shape called with a node ID, returns the shape of the node, or `null` or `undefined`
   * @returns this writer
   */
  nodeShape(shape: (node: number) => Shape | null | undefined): this {
    this.nodeShapeHook = shape;
    return this;
  }

  /**
   * Defines a class for {@link MermaidWriter.nodeClass} to assign, written as `classDef name
   * style`.
   *
   * **Time:** O(1).
   *
   * @param name class name, an identifier other than a Mermaid keyword
   * @param style style of the class, such as `fill:#f96,stroke:#333`
   * @returns this writer
   * @throws Error if `name` is not an identifier or is a Mermaid keyword, or `style` is blank or
   *     contains a line break or a semicolon
   */
  classDef(name: string, style: string): this {
    this.classDefs.set(checkClass(name), checkStyle(style));
    return this;
  }

  /**
   * Sets the class of each node, by node ID; `null` or `undefined` assigns none.
   *
   * **Time:** O(1).
   *
   * @param className called with a node ID, returns the name of the class of the node, an
   *     identifier other than a Mermaid keyword, or `null` or `undefined`
   * @returns this writer
   */
  nodeClass(className: (node: number) => string | null | undefined): this {
    this.nodeClassHook = className;
    return this;
  }

  /**
   * Sets the style of each edge, by edge index, written as a `linkStyle` statement; `null` or
   * `undefined` leaves an edge in the default style.
   *
   * **Time:** O(1).
   *
   * @param style called with an edge index, returns the style of the edge, such as
   *     `stroke:red,stroke-width:2px`, or `null` or `undefined`
   * @returns this writer
   */
  edgeStyle(style: (edge: number) => string | null | undefined): this {
    this.edgeStyleHook = style;
    return this;
  }

  /**
   * Draws each group of `partition` as a cluster (a Mermaid `subgraph`), with a label by group ID.
   *
   * Nodes in no group stay outside every cluster, and a group without a node to write has no
   * cluster. A label of `null` or `undefined` shows the name of the cluster: `c` and the group ID,
   * such as `c2`.
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
   * Switches to the undirected reading of the graph: edges without arrowheads.
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
   * Writes the graph to `out`, as the text of a Mermaid flowchart. `out` is anything with a method
   * `write(text)`, such as `process.stdout` or a file stream of Node.js (Java: an `Appendable`).
   *
   * The text goes to `out.write` in chunks of about 8 KiB characters, not piece by piece.
   *
   * **Time:** O(nodeCount + edgeCount + groupCount), plus the hooks, with groupCount the number of
   * groups of the partition drawn as clusters; in the undirected reading, O(log outDegree(target))
   * more per edge. **Memory:** up to twice the size of the `linkStyle` lines while it runs, as they
   * are written last, and a chunk of text.
   *
   * @param out where the text goes; not closed
   * @throws Error what `out.write` throws (Java: `IOException`), or if a hook returns a class name
   *     that is not an identifier or is a Mermaid keyword, an edge style that is blank or contains
   *     a line break or a semicolon, or a shape that is not one of {@link Shape}; the text written
   *     before the error has gone to `out`. Only a `write` that throws fails the call. A stream
   *     reports its errors through its own event or promise, which the caller must watch (see
   *     {@link TextSink})
   * @throws RangeError the engine's `Invalid string length`, if the `linkStyle` lines, which are
   *     collected before they are written, are longer than a JavaScript string can be (2^29 - 24
   *     characters in V8, where Java allows 2^31 - 9; Java: an `OutOfMemoryError`)
   */
  write(out: TextSink): void {
    writeTo(out, (output) => this.writeText(output));
  }

  /**
   * Returns the text of the Mermaid flowchart, as {@link MermaidWriter.write} writes it.
   *
   * **Time:** as for {@link MermaidWriter.write}. **Memory:** the text for the result; while it
   * runs, up to twice as much again, and the `linkStyle` lines as for {@link MermaidWriter.write}.
   *
   * @returns the Mermaid text
   * @throws Error as for {@link MermaidWriter.write}
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
    out.append(`flowchart ${DIRECTION_CODES[this.directionValue]}\n`);
    for (const [name, style] of this.classDefs) out.append(`  classDef ${name} ${style}\n`);

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
            out.append(`  subgraph c${group}`);
            const label = clusters.label(group);
            if (label != null) out.append(`[${quote(label)}]`);
            out.append("\n");
            opened = true;
          }
          this.writeNode(node, "    ", out);
        }
        if (opened) out.append("  end\n");
      }
    }
    for (let node = 0; node < n; node++) {
      if (selection.isIncluded(node) && selection.clusterOf(node) < 0) this.writeNode(node, "  ", out);
    }

    const link = selection.undirected ? " ---" : " -->";
    let styles = "";
    let ordinal = 0;
    selection.forEachWrittenEdge((source, target, edgeIndex) => {
      out.append(`  n${source}${link}`);
      const label = this.edgeLabelHook === null ? null : this.edgeLabelHook(edgeIndex);
      if (label != null) out.append(`|${quote(label)}|`);
      out.append(` n${target}\n`);
      const style = this.edgeStyleHook === null ? null : this.edgeStyleHook(edgeIndex);
      if (style != null) styles += `  linkStyle ${ordinal} ${checkStyle(style)}\n`;
      ordinal++;
    });

    const nodeClass = this.nodeClassHook;
    if (nodeClass !== null) {
      for (let node = 0; node < n; node++) {
        if (!selection.isIncluded(node)) continue;
        const className = nodeClass(node);
        if (className != null) {
          out.append(`  class n${node} `);
          out.append(`${checkClass(className)}\n`);
        }
      }
    }
    out.append(styles);
  }

  private writeNode(node: number, indent: string, out: Output): void {
    out.append(`${indent}n${node}`);
    const label = this.nodeLabelHook === null ? null : this.nodeLabelHook(node);
    const shape = this.nodeShapeHook === null ? null : this.nodeShapeHook(node);
    if (label != null || (shape != null && shape !== Shape.RECTANGLE)) {
      const drawn = shape ?? Shape.RECTANGLE;
      const open = SHAPE_OPEN[drawn];
      if (open === undefined) throw new Error(`not a Mermaid shape: ${drawn}`);
      out.append(`${open}${quote(label ?? `n${node}`)}${SHAPE_CLOSE[drawn]}`);
    }
    out.append("\n");
  }
}

function checkClass(name: string): string {
  if (!isIdentifier(name) || KEYWORDS.has(name)) {
    throw new Error(`not a Mermaid class name: ${name}`);
  }
  return name;
}

function checkStyle(style: string): string {
  if (isBlank(style) || style.includes("\n") || style.includes("\r") || style.includes(";")) {
    throw new Error(`a Mermaid style must not be blank, nor contain a line break or semicolon: ${style}`);
  }
  return style;
}

/** The word that starts a direction statement; whitespace after it is encoded in labels. */
const DIRECTION_WORD = "direction";

/**
 * Returns `text` as a Mermaid quoted string.
 *
 * Mermaid applies regular expressions to the whole text before parsing, strings included: `%%`
 * starts a directive or a comment, and on a line with `style` and `:` the last `;` is dropped,
 * which ends an entity code. Its lexer takes any line with `direction`, whitespace and a direction
 * code for a direction statement. So `%`, `:` and whitespace right after `direction` are written
 * as entity codes too, and an empty text, which Mermaid rejects, as one space.
 */
function quote(text: string): string {
  if (text.length === 0) return '" "';
  let quoted = '"';
  let start = 0;
  for (let i = 0, length = text.length; i < length; i++) {
    const c = text.charCodeAt(i);
    let escaped: string;
    switch (c) {
      case 0x22: // "
        escaped = "#quot;";
        break;
      case 0x23: // #
        escaped = "#35;";
        break;
      case 0x25: // %
        escaped = "#37;";
        break;
      case 0x26: // &
        escaped = "#38;";
        break;
      case 0x3a: // :
        escaped = "#58;";
        break;
      case 0x60: // `
        escaped = "#96;";
        break;
      case 0x3c: // <
        escaped = "#lt;";
        break;
      case 0x3e: // >
        escaped = "#gt;";
        break;
      case 0x0a: // \n
        escaped = "<br>";
        break;
      case 0x0d: // \r, alone a line break, before \n part of one
        escaped = i + 1 < length && text.charCodeAt(i + 1) === 0x0a ? "" : "<br>";
        break;
      default:
        if (!(isSpace(c) && i >= DIRECTION_WORD.length && text.startsWith(DIRECTION_WORD, i - DIRECTION_WORD.length))) {
          continue;
        }
        escaped = `#${c};`;
    }
    quoted += text.slice(start, i) + escaped;
    start = i + 1;
  }
  return `${quoted}${text.slice(start)}"`;
}

/**
 * Whether the UTF-16 code unit `c` is whitespace, at least everything JavaScript's `\s` matches:
 * Java's `Character.isWhitespace(c) || Character.isSpaceChar(c) || c == '\uFEFF'`, that is `\s`
 * plus U+001C..U+001F.
 */
function isSpace(c: number): boolean {
  if (c <= 0x20) return (c >= 0x09 && c <= 0x0d) || c >= 0x1c;
  return (
    c === 0xa0 ||
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 ||
    c === 0x2029 ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000 ||
    c === 0xfeff
  );
}

/**
 * Java's `String.isBlank()`: empty, or only code points for which `Character.isWhitespace` holds -
 * the whitespace of {@link isSpace} without the no-break spaces U+00A0, U+2007, U+202F and without
 * U+FEFF. No supplementary code point is whitespace, so code units suffice.
 */
function isBlank(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const whitespace =
      c <= 0x20
        ? (c >= 0x09 && c <= 0x0d) || c >= 0x1c
        : c === 0x1680 ||
          (c >= 0x2000 && c <= 0x200a && c !== 0x2007) ||
          c === 0x2028 ||
          c === 0x2029 ||
          c === 0x205f ||
          c === 0x3000;
    if (!whitespace) return false;
  }
  return true;
}
