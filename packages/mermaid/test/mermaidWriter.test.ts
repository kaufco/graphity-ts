import { Components, NodePartition } from "@kobayami/graphity-core";
import { describe, expect, it } from "vitest";
import { expectArgumentError } from "../../core/test/testutils/assertions.js";
import { RandomGraphs } from "../../core/test/testutils/randomGraphs.js";
import { TestGraphs } from "../../core/test/testutils/testGraphs.js";
import { Direction, MermaidWriter, Shape, type TextSink } from "../src/index.js";

describe("MermaidWriterTest", () => {
  it("writesAPlainFlowchart", () => {
    const text = MermaidWriter.of(TestGraphs.of(3, 0, 1, 0, 2, 2, 0)).writeToString();
    expect(text).toBe(`flowchart TD
  n0
  n1
  n2
  n0 --> n1
  n0 --> n2
  n2 --> n0
`);
  });

  it("writesLabelsShapesClassesAndEdgeStyles", () => {
    const names = ["entry", "loop", "exit"];
    const text = MermaidWriter.of(TestGraphs.of(3, 0, 1, 1, 1, 1, 2))
      .direction(Direction.LEFT_RIGHT)
      .nodeLabel((node) => names[node])
      .edgeLabel((edge) => (edge === 1 ? "again" : null))
      .nodeShape((node) => (node === 0 ? Shape.CIRCLE : null))
      .classDef("hot", "fill:#f96,stroke:#333")
      .nodeClass((node) => (node === 1 ? "hot" : null))
      .edgeStyle((edge) => (edge === 1 ? "stroke:red" : null))
      .writeToString();
    expect(text).toBe(`flowchart LR
  classDef hot fill:#f96,stroke:#333
  n0(("entry"))
  n1["loop"]
  n2["exit"]
  n0 --> n1
  n1 -->|"again"| n1
  n1 --> n2
  class n1 hot
  linkStyle 1 stroke:red
`);
  });

  it("edgeStylesFollowTheWrittenLinksWhenAFilterDropsEdges", () => {
    // 0 -> 1, 0 -> 2, 1 -> 2; without node 1 only 0 -> 2 (edge 1) remains, Mermaid's link 0.
    const text = MermaidWriter.of(TestGraphs.of(3, 0, 1, 0, 2, 1, 2))
      .nodeFilter((node) => node !== 1)
      .edgeStyle((edge) => `stroke-width:${edge + 1}px`)
      .writeToString();
    expect(text).toBe(`flowchart TD
  n0
  n2
  n0 --> n2
  linkStyle 0 stroke-width:2px
`);
  });

  it("escapesQuotesHashesAnglesAndLineBreaks", () => {
    const text = MermaidWriter.of(TestGraphs.isolated(1))
      .nodeLabel(() => 'a "b" #1 <c>\nd')
      .writeToString();
    expect(text).toContain('n0["a #quot;b#quot; #35;1 #lt;c#gt;<br>d"]');
  });

  it("writesSubgraphsAndTheUndirectedReading", () => {
    const graph = TestGraphs.of(3, 0, 1, 1, 0, 1, 2);
    const sccs = Components.sccsOf(graph);
    const text = MermaidWriter.of(graph)
      .undirected()
      .clusters(sccs, (scc) => (sccs.sizeOf(scc) > 1 ? "cycle" : null))
      .writeToString();
    const big = sccs.sccOf(0);
    expect(text).toContain(`  subgraph c${big}["cycle"]\n    n0\n    n1\n  end\n`);
    expect(text).toContain(`  subgraph c${sccs.sccOf(2)}\n    n2\n  end\n`);
    expect(text.endsWith("  n0 --- n1\n  n1 --- n2\n")).toBe(true);
  });

  it("rejectsInvalidClassNamesAndStyles", () => {
    const writer = MermaidWriter.of(TestGraphs.path(2));
    expectArgumentError(() => writer.classDef("1st", "fill:red"), "not a Mermaid class name: 1st");
    expectArgumentError(() => writer.classDef("ok", "fill:red; x"));
    const badClass = MermaidWriter.of(TestGraphs.path(2)).nodeClass(() => "a b");
    expectArgumentError(() => badClass.writeToString());
    const badStyle = MermaidWriter.of(TestGraphs.path(2)).edgeStyle(() => "a\nb");
    expectArgumentError(() => badStyle.writeToString());
  });

  it("anEmptyGraph", () => {
    expect(MermaidWriter.of(TestGraphs.empty()).writeToString()).toBe("flowchart TD\n");
  });

  it("everyShapeHasItsBrackets", () => {
    const shapes = Object.values(Shape);
    const text = MermaidWriter.of(TestGraphs.isolated(shapes.length))
      .nodeShape((node) => shapes[node])
      .writeToString();
    expect(text).toBe(`flowchart TD
  n0
  n1("n1")
  n2(["n2"])
  n3[["n3"]]
  n4[("n4")]
  n5(("n5"))
  n6((("n6")))
  n7{"n7"}
  n8{{"n8"}}
`);
  });

  it("undirectedLinksWithLabelsAndStylesCountOnlyWrittenLinks", () => {
    // 0 <-> 1 stored both ways (edges 0 and 1), 1 -> 2 (edge 2): two links are written.
    const text = MermaidWriter.of(TestGraphs.of(3, 0, 1, 1, 0, 1, 2))
      .undirected()
      .edgeLabel((edge) => `e${edge}`)
      .edgeStyle((edge) => (edge === 2 ? "stroke:blue" : null))
      .writeToString();
    expect(
      text.endsWith(`  n0 ---|"e0"| n1
  n1 ---|"e2"| n2
  linkStyle 1 stroke:blue
`),
    ).toBe(true);
  });

  it("filterAndClustersTogether", () => {
    const graph = TestGraphs.path(4);
    const partition = NodePartition.of(graph, [0, 0, 1, -1], 2);
    const text = MermaidWriter.of(graph)
      .clusters(partition, () => null)
      .nodeFilter((node) => node === 0 || node === 3)
      .nodeClass(() => "c")
      .classDef("c", "fill:red")
      .writeToString();
    expect(text).toBe(`flowchart TD
  classDef c fill:red
  subgraph c0
    n0
  end
  n3
  class n0 c
  class n3 c
`);
  });

  it("escapesAmpersandsAndBackticks", () => {
    const text = MermaidWriter.of(TestGraphs.isolated(1))
      .nodeLabel(() => "`**x**` &lt;")
      .writeToString();
    expect(text).toContain('n0["#96;**x**#96; #38;lt;"]');
  });

  it("rejectsReservedAndHyphenatedClassNamesEmptyStylesAndForeignPartitions", () => {
    const writer = MermaidWriter.of(TestGraphs.path(2));
    expectArgumentError(() => writer.classDef("end", "fill:red"));
    expectArgumentError(() => writer.classDef("a--b", "fill:red"));
    expectArgumentError(() => writer.classDef("ok", " "), "must not be blank");
    expectArgumentError(
      () => writer.clusters(Components.sccsOf(TestGraphs.path(3)), () => null),
      "the partition covers 3 nodes, the graph has 2",
    );
  });

  it("anEmptyLabelIsWrittenAsOneSpace", () => {
    const graph = TestGraphs.path(2);
    const partition = NodePartition.of(graph, [0, -1], 1);
    const text = MermaidWriter.of(graph)
      .nodeLabel(() => "")
      .nodeShape((node) => (node === 1 ? Shape.CIRCLE : null))
      .edgeLabel(() => "")
      .clusters(partition, () => "")
      .writeToString();
    expect(text).toBe(`flowchart TD
  subgraph c0[" "]
    n0[" "]
  end
  n1((" "))
  n0 -->|" "| n1
`);
  });

  it("rejectsEveryMermaidKeywordAsAClassName", () => {
    // prettier-ignore
    const keywords = ["style", "linkStyle", "interpolate", "classDef", "class", "href", "click",
      "call", "graph", "flowchart", "subgraph", "end", "_self", "_blank", "_parent", "_top"];
    for (const keyword of keywords) {
      expectArgumentError(
        () => MermaidWriter.of(TestGraphs.path(2)).classDef(keyword, "fill:red"),
        `not a Mermaid class name: ${keyword}`,
      );
      const writer = MermaidWriter.of(TestGraphs.path(2)).nodeClass(() => keyword);
      expectArgumentError(() => writer.writeToString(), `not a Mermaid class name: ${keyword}`);
    }
  });

  it("keywordsAreCaseSensitiveAndOnlyWhole", () => {
    const text = MermaidWriter.of(TestGraphs.isolated(1))
      .classDef("End", "fill:red")
      .classDef("STYLE", "fill:blue")
      .classDef("styled", "fill:green")
      .classDef("_topLevel", "fill:gray")
      .nodeClass(() => "End")
      .writeToString();
    expect(text).toBe(`flowchart TD
  classDef End fill:red
  classDef STYLE fill:blue
  classDef styled fill:green
  classDef _topLevel fill:gray
  n0
  class n0 End
`);
  });

  it("escapesPercentSignsAndColonsThatMermaidWouldPreprocess", () => {
    const text = MermaidWriter.of(TestGraphs.path(2))
      .nodeLabel((node) => (node === 0 ? "50%%{init: {'theme':'dark'}}%% done" : 'style:"bold";'))
      .edgeLabel(() => "100%")
      .writeToString();
    expect(text).toBe(`flowchart TD
  n0["50#37;#37;{init#58; {'theme'#58;'dark'}}#37;#37; done"]
  n1["style#58;#quot;bold#quot;;"]
  n0 -->|"100#37;"| n1
`);
  });

  it("escapesWhitespaceAfterTheWordDirection", () => {
    const labels = ["direction LR", "go direction\tTB", "Direction LR", "directions LR"];
    const text = MermaidWriter.of(TestGraphs.isolated(labels.length))
      .nodeLabel((node) => labels[node])
      .writeToString();
    expect(text).toBe(`flowchart TD
  n0["direction#32;LR"]
  n1["go direction#9;TB"]
  n2["Direction LR"]
  n3["directions LR"]
`);
  });
});

/** A sink that keeps every chunk it is handed. */
function collector(): TextSink & { chunks: string[]; text(): string } {
  const chunks: string[] = [];
  return {
    chunks,
    write(text: string) {
      chunks.push(text);
    },
    text: () => chunks.join(""),
  };
}

/** Beyond the Java tests: the sink, `undefined` for none, enum values, and the whitespace of Java's character classes (checked against Java). */
describe("MermaidWriter (TypeScript)", () => {
  it("writes every direction with its code", () => {
    const codes = Object.values(Direction).map((direction) =>
      MermaidWriter.of(TestGraphs.empty()).direction(direction).writeToString(),
    );
    expect(codes).toEqual(["flowchart TD\n", "flowchart BT\n", "flowchart LR\n", "flowchart RL\n"]);
  });

  it("rejects values outside Direction and Shape", () => {
    expectArgumentError(
      () => MermaidWriter.of(TestGraphs.empty()).direction(4 as Direction),
      "not a Mermaid direction: 4",
    );
    const writer = MermaidWriter.of(TestGraphs.isolated(1)).nodeShape(() => 9 as Shape);
    expectArgumentError(() => writer.writeToString(), "not a Mermaid shape: 9");
  });

  it("passes a large text to the sink in chunks that join to writeToString", () => {
    const graph = RandomGraphs.gnp(300, 0.05, 7);
    const writer = MermaidWriter.of(graph)
      .edgeLabel((edge) => `edge ${edge}`)
      .edgeStyle((edge) => (edge % 7 === 0 ? "stroke:red" : null));
    const sink = collector();
    writer.write(sink);
    expect(sink.chunks.length).toBeGreaterThan(1);
    expect(sink.text()).toBe(writer.writeToString());
  });

  it("passes what was written before an invalid class name or style on to the sink", () => {
    const classSink = collector();
    expectArgumentError(() =>
      MermaidWriter.of(TestGraphs.path(2))
        .nodeClass((node) => (node === 1 ? "end" : "ok"))
        .write(classSink),
    );
    expect(classSink.text()).toBe("flowchart TD\n  n0\n  n1\n  n0 --> n1\n  class n0 ok\n  class n1 ");
    const styleSink = collector();
    expectArgumentError(() =>
      MermaidWriter.of(TestGraphs.path(3))
        .edgeStyle((edge) => (edge === 1 ? ";" : "stroke:red"))
        .write(styleSink),
    );
    expect(styleSink.text()).toBe("flowchart TD\n  n0\n  n1\n  n2\n  n0 --> n1\n  n1 --> n2\n");
  });

  it("treats undefined from a hook as none", () => {
    const graph = TestGraphs.path(2);
    const partition = NodePartition.of(graph, [0, -1], 1);
    const text = MermaidWriter.of(graph)
      .nodeLabel(() => undefined)
      .nodeShape(() => undefined)
      .edgeLabel(() => undefined)
      .nodeClass(() => undefined)
      .edgeStyle(() => undefined)
      .clusters(partition, () => undefined)
      .writeToString();
    expect(text).toBe("flowchart TD\n  subgraph c0\n    n0\n  end\n  n1\n  n0 --> n1\n");
  });

  it("escapes every whitespace of Java's character classes after direction, and only those", () => {
    const spaces = [
      0x09, 0x0b, 0x0c, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0xa0, 0x1680, 0x2000, 0x2007, 0x200a, 0x2028, 0x2029, 0x202f,
      0x205f, 0x3000, 0xfeff,
    ];
    const others = [0x08, 0x0e, 0x1b, 0x21, 0x85, 0x180e, 0x200b, 0x2060];
    const label = (c: number) => `direction${String.fromCharCode(c)}x`;
    const all = [...spaces, ...others];
    const text = MermaidWriter.of(TestGraphs.isolated(all.length))
      .nodeLabel((node) => label(all[node]))
      .writeToString();
    const expected = all
      .map((c, node) => `  n${node}["direction${spaces.includes(c) ? `#${c};` : String.fromCharCode(c)}x"]\n`)
      .join("");
    expect(text).toBe(`flowchart TD\n${expected}`);
  });

  it("writes line breaks after direction as <br>, and whitespace only right after the word", () => {
    const labels = [
      "direction\nLR",
      "direction\r\nLR",
      "direction\rLR",
      "direction  LR",
      "xdirection LR",
      "direction",
      " direction",
    ];
    const text = MermaidWriter.of(TestGraphs.isolated(labels.length))
      .nodeLabel((node) => labels[node])
      .writeToString();
    expect(text).toBe(`flowchart TD
  n0["direction<br>LR"]
  n1["direction<br>LR"]
  n2["direction<br>LR"]
  n3["direction#32; LR"]
  n4["xdirection#32;LR"]
  n5["direction"]
  n6[" direction"]
`);
  });

  it("takes a style as blank as Java's isBlank does", () => {
    for (const blank of ["", " ", "\t", "\u2003", "\u3000 \u1680", "\u001f"]) {
      expectArgumentError(() => MermaidWriter.of(TestGraphs.empty()).classDef("c", blank), "must not be blank");
    }
    for (const style of ["\u00a0", "\u2007", "\u202f", "\ufeff", "\u0085", "\u200b"]) {
      expect(MermaidWriter.of(TestGraphs.empty()).classDef("c", style).writeToString()).toBe(
        `flowchart TD\n  classDef c ${style}\n`,
      );
    }
    expectArgumentError(() => MermaidWriter.of(TestGraphs.empty()).classDef("c", "a\rb"));
  });

  it("writes a node name for a shape without label, and none for an explicit rectangle", () => {
    const text = MermaidWriter.of(TestGraphs.isolated(3))
      .nodeShape((node) => (node === 0 ? Shape.RECTANGLE : node === 1 ? Shape.HEXAGON : null))
      .nodeLabel((node) => (node === 2 ? "\u{1F600}\r" : null))
      .writeToString();
    expect(text).toBe('flowchart TD\n  n0\n  n1{{"n1"}}\n  n2["\u{1F600}<br>"]\n');
  });
});
