import {
  Components,
  Direction,
  DotWriter,
  EdgeType,
  EdgeTypes,
  Graphs,
  MermaidWriter,
  NodePartition,
  Shape,
} from "@kobayami/graphity";
import { SmallGrammar } from "../smallGrammar.js";
import { SmallProgram } from "../smallProgram.js";

/** The two text forms of a graph. */
export interface Text {
  readonly full: string;
  readonly brief: string;
}

/** Graphs written as text, in DOT for Graphviz and as Mermaid flowcharts. */
export const ShowingGraphs = {
  /** Returns the steps of the build as an adjacency list and in their short form. */
  text(): Text {
    const steps = SmallProgram.buildSteps();
    // @start region="text"
    const full = Graphs.adjacencyListOf(steps);   // every node, one line each:
    // 0 -> [1]
    // 1 -> [3, 4, 6]
    // 2 -> [6]
    // 3 -> [5]
    // 4 -> [8]
    // 5 -> [6]
    // 6 -> [7]
    // 7 -> [8]
    // 8 -> []

    const brief = steps.toString();               // one line, for logs and debuggers:
    // Graph[nodes=9, edges=10] {0 -> [1], 1 -> [3, 4, 6], 2 -> [6], 3 -> [5], 4 -> [8],
    //   5 -> [6], 6 -> [7], 7 -> [8], 8 -> []}
    // @end
    return { full, brief };
  },

  /** Returns the packages in DOT, labeled, from left to right. */
  dot(): string {
    const dependencies = SmallProgram.dependencies();
    const names = SmallProgram.packageNames();
    // @start region="dot"
    const writer = DotWriter.of(dependencies)
      .graphAttribute("rankdir", "LR")
      .nodeLabel((node) => names[node]);
    const chunks: string[] = [];
    // or a file, through a WriteStream
    const out = { write: (text: string) => chunks.push(text) };
    writer.write(out);
    const dot = chunks.join("");
    // digraph {
    //   rankdir="LR";
    //   0 [label="app"];
    //   ...
    //   0 -> 1;
    //   ...
    // }
    // @end
    return dot;
  },

  /** Returns the packages in DOT, with the cycle framed and its back edge dashed. */
  dotStyled(): string {
    const dependencies = SmallProgram.dependencies();
    const names = SmallProgram.packageNames();
    // @start region="dotStyled"
    // Frame the SCCs with a cycle: a partition in which every other package is in no
    // group (-1).
    const sccs = Components.sccsOf(dependencies);
    const frameOf = new Int32Array(dependencies.nodeCount);
    for (let node = 0; node < frameOf.length; node++) {
      frameOf[node] = sccs.containsCycle(sccs.sccOf(node)) ? sccs.sccOf(node) : -1;
    }
    const frames = NodePartition.of(dependencies, frameOf, sccs.sccCount);
    const edgeTypes = EdgeTypes.of(dependencies);
    const dot = DotWriter.of(dependencies)
      .nodeLabel((node) => names[node])
      .clusters(frames, (scc) => `SCC ${scc}`)
      // Draw the edges that close a cycle dashed and red.
      .edgeAttributes((edge, attributes) => {
        if (edgeTypes.typeOf(edge) === EdgeType.BACK) {
          attributes.set("style", "dashed");
          attributes.set("color", "red");
        }
      })
      // Leave out util, the package of helpers: four packages use it, and its edges only
      // crowd the picture.
      .nodeFilter((node) => names[node] !== "util")
      .writeToString();
    // @end
    return dot;
  },

  /** Returns the steps of the build as a Mermaid flowchart. */
  mermaid(): string {
    const steps = SmallProgram.buildSteps();
    const names = SmallProgram.stepNames();
    // @start region="mermaid"
    const mermaid = MermaidWriter.of(steps)
      .direction(Direction.LEFT_RIGHT)
      .nodeLabel((step) => names[step])
      .nodeShape((step) => (names[step] === "publish" ? Shape.STADIUM : null))
      .writeToString();
    // flowchart LR
    //   n0["generate"]
    //   ...
    //   n8(["publish"])
    //   n0 --> n1
    //   ...
    // @end
    return mermaid;
  },

  /** Returns the rules of the grammar as a Mermaid flowchart with their SCCs framed. */
  mermaidStyled(): string {
    const rules = SmallGrammar.rules();
    const names = SmallGrammar.ruleNames();
    // @start region="mermaidStyled"
    // Frame the SCCs with a cycle: a partition in which every other rule is in no group
    // (-1).
    const sccs = Components.sccsOf(rules);
    const frameOf = new Int32Array(rules.nodeCount);
    for (let rule = 0; rule < frameOf.length; rule++) {
      frameOf[rule] = sccs.containsCycle(sccs.sccOf(rule)) ? sccs.sccOf(rule) : -1;
    }
    const frames = NodePartition.of(rules, frameOf, sccs.sccCount);
    const mermaid = MermaidWriter.of(rules)
      .nodeLabel((rule) => `${rule}: ${names[rule]}`)
      .clusters(frames, (scc) => `SCC ${scc}`)
      // Outline program, the rule where a parser starts.
      .classDef("focus", "stroke:#8b5cf6,stroke-width:3px")
      .nodeClass((rule) => (names[rule] === "program" ? "focus" : null))
      // Draw the edges within an SCC, the edges that lie on a cycle, in orange.
      .edgeStyle((edge) =>
        sccs.sccOf(rules.edgeSource(edge)) === sccs.sccOf(rules.edgeTarget(edge))
          ? "stroke:#f59e0b,stroke-width:3px" : null)
      .writeToString();
    // @end
    return mermaid;
  },
} as const;
