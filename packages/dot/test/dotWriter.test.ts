import { Components, NodePartition } from "@kobayami/graphity-core";
import { describe, expect, it } from "vitest";
import { expectArgumentError } from "../../core/test/testutils/assertions.js";
import { RandomGraphs } from "../../core/test/testutils/randomGraphs.js";
import { TestGraphs } from "../../core/test/testutils/testGraphs.js";
import { DotWriter, type TextSink } from "../src/index.js";

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

describe("DotWriterTest", () => {
  it("writesAPlainGraph", () => {
    // 0 -> 1, 0 -> 2, 2 -> 0, and 3 alone.
    const dot = DotWriter.of(TestGraphs.of(4, 0, 1, 0, 2, 2, 0)).writeToString();
    expect(dot).toBe(`digraph {
  3;
  0 -> 1;
  0 -> 2;
  2 -> 0;
}
`);
  });

  it("writesLabelsAndAttributesFromTheHooks", () => {
    const names = ["entry", "loop", "exit"];
    // Java's String.valueOf(double) writes 2.0; the caller formats the weights.
    const weights = ["1.5", "2.0", "0.25"];
    const dot = DotWriter.of(TestGraphs.of(3, 0, 1, 1, 1, 1, 2))
      .graphAttribute("rankdir", "LR")
      .nodeLabel((node) => names[node])
      .edgeLabel((edge) => weights[edge])
      .nodeAttributes((node, attributes) => {
        if (node === 0) attributes.set("shape", "doublecircle");
      })
      .edgeAttributes((edge, attributes) => {
        if (edge === 1) attributes.set("color", "red");
      })
      .writeToString();
    expect(dot).toBe(`digraph {
  rankdir="LR";
  0 [label="entry", shape="doublecircle"];
  1 [label="loop"];
  2 [label="exit"];
  0 -> 1 [label="1.5"];
  1 -> 1 [label="2.0", color="red"];
  1 -> 2 [label="0.25"];
}
`);
  });

  it("escapesQuotesBackslashesAndLineBreaks", () => {
    const dot = DotWriter.of(TestGraphs.isolated(1))
      .nodeLabel(() => 'say "hi"\\\nbye')
      .writeToString();
    expect(dot).toContain('0 [label="say \\"hi\\"\\\\\\nbye"];');
  });

  it("writesClustersInGroupOrderWithTheirLabels", () => {
    // 0 <-> 1 is one SCC, 2 and 3 are trivial; 1 -> 2 -> 3.
    const graph = TestGraphs.of(4, 0, 1, 1, 0, 1, 2, 2, 3);
    const sccs = Components.sccsOf(graph);
    const dot = DotWriter.of(graph)
      .clusters(sccs, (scc) => (sccs.sizeOf(scc) > 1 ? `SCC ${scc}` : null))
      .writeToString();
    const bigScc = sccs.sccOf(0);
    expect(dot).toContain(`  subgraph cluster_${bigScc} {\n    label="SCC ${bigScc}";\n    0;\n    1;\n  }\n`);
    expect(dot).toContain(`  subgraph cluster_${sccs.sccOf(3)} {\n    3;\n  }\n`);
    expect(dot.endsWith("  0 -> 1;\n  1 -> 0;\n  1 -> 2;\n  2 -> 3;\n}\n")).toBe(true);
  });

  it("nodesInNoGroupStayOutsideTheClusters", () => {
    const graph = TestGraphs.path(3);
    const partition = NodePartition.of(graph, [0, -1, 0], 1);
    const dot = DotWriter.of(graph)
      .clusters(partition, () => null)
      .writeToString();
    expect(dot).toBe(`digraph {
  subgraph cluster_0 {
    0;
    2;
  }
  0 -> 1;
  1 -> 2;
}
`);
  });

  it("theNodeFilterDropsNodesAndTheirEdgesButKeepsTheIds", () => {
    const dot = DotWriter.of(TestGraphs.path(4))
      .nodeFilter((node) => node !== 1)
      .nodeLabel((node) => `v${node}`)
      .writeToString();
    expect(dot).toBe(`digraph {
  0 [label="v0"];
  2 [label="v2"];
  3 [label="v3"];
  2 -> 3;
}
`);
  });

  it("theUndirectedReadingWritesEachReciprocalPairOnce", () => {
    // 0 <-> 1 stored both ways, 2 -> 1 stored from the higher node only, 2 -> 2 a self-loop.
    const graph = TestGraphs.of(3, 0, 1, 1, 0, 2, 1, 2, 2);
    const seen = [0, 0, 0, 0];
    const dot = DotWriter.of(graph)
      .undirected()
      .edgeLabel((edge) => {
        seen[edge]++;
        return null;
      })
      .writeToString();
    expect(dot).toBe(`graph {
  0 -- 1;
  2 -- 1;
  2 -- 2;
}
`);
    expect(seen).toEqual([1, 0, 1, 1]);
  });

  it("writingTwiceGivesTheSameText", () => {
    const graph = RandomGraphs.gnp(40, 0.1, 5);
    const writer = DotWriter.of(graph).nodeLabel((node) => `n${node}`);
    const first = collector();
    writer.write(first);
    expect(writer.writeToString()).toBe(first.text());
    expect(
      first
        .text()
        .split("\n")
        .filter((line) => line.includes(" -> ")).length,
    ).toBe(graph.edgeCount);
  });

  it("rejectsInvalidAttributeNamesAndForeignPartitions", () => {
    expectArgumentError(() => DotWriter.of(TestGraphs.path(2)).graphAttribute("rank dir", "LR"));
    const writer = DotWriter.of(TestGraphs.path(2)).nodeAttributes((_node, attributes) =>
      attributes.set("bad-name", "x"),
    );
    expectArgumentError(() => writer.writeToString(), "not a DOT attribute name: bad-name");
    const other = Components.sccsOf(TestGraphs.path(3));
    expectArgumentError(
      () => DotWriter.of(TestGraphs.path(2)).clusters(other, () => null),
      "the partition covers 3 nodes, the graph has 2",
    );
  });

  it("anEmptyGraph", () => {
    expect(DotWriter.of(TestGraphs.empty()).writeToString()).toBe("digraph {\n}\n");
  });

  it("filterAndClustersTogether", () => {
    // Groups {0, 1} and {2}; the filter drops 2, so its cluster disappears, and drops 1.
    const graph = TestGraphs.path(4);
    const partition = NodePartition.of(graph, [0, 0, 1, -1], 2);
    const dot = DotWriter.of(graph)
      .clusters(partition, (group) => `g${group}`)
      .nodeFilter((node) => node === 0 || node === 3)
      .writeToString();
    expect(dot).toBe(`digraph {
  subgraph cluster_0 {
    label="g0";
    0;
  }
  3;
}
`);
  });

  it("attributesReplaceTheLabel", () => {
    const dot = DotWriter.of(TestGraphs.path(2))
      .edgeLabel(() => "plain")
      .edgeAttributes((_edge, attributes) => attributes.set("label", "replaced"))
      .writeToString();
    expect(dot).toContain('  0 -> 1 [label="replaced"];\n');
  });

  it("attributesRemoveTheLabel", () => {
    const dot = DotWriter.of(TestGraphs.path(2))
      .edgeLabel(() => "plain")
      .edgeAttributes((_edge, attributes) => attributes.delete("label"))
      .writeToString();
    expect(dot).toContain("  0 -> 1;\n");
  });

  it("nodeHooksRunOncePerWrittenNode", () => {
    const graph = TestGraphs.of(3, 0, 1);
    const partition = NodePartition.of(graph, [0, -1, -1], 1);
    const labels = [0, 0, 0];
    const hooks = [0, 0, 0];
    DotWriter.of(graph)
      .clusters(partition, () => null)
      .nodeLabel((node) => {
        labels[node]++;
        return `v${node}`;
      })
      .nodeAttributes((node) => hooks[node]++)
      .writeToString();
    expect(labels).toEqual([1, 1, 1]);
    expect(hooks).toEqual([1, 1, 1]);
  });

  it("rejectsDotKeywordsAsAttributeNames", () => {
    for (const keyword of ["node", "Edge", "graph", "DIGRAPH", "subgraph", "strict"]) {
      expectArgumentError(
        () => DotWriter.of(TestGraphs.path(2)).graphAttribute(keyword, "x"),
        `not a DOT attribute name: ${keyword}`,
      );
    }
  });

  it("aLoneCarriageReturnIsALineBreak", () => {
    const dot = DotWriter.of(TestGraphs.isolated(1))
      .nodeLabel(() => "a\rb\r\nc")
      .writeToString();
    expect(dot).toContain('label="a\\nb\\nc"');
  });

  it("aClusterWithoutLabelDoesNotInheritTheGraphLabel", () => {
    const graph = TestGraphs.path(3);
    const partition = NodePartition.of(graph, [0, 1, -1], 2);
    const dot = DotWriter.of(graph)
      .graphAttribute("label", "TITLE")
      .clusters(partition, (group) => (group === 1 ? "own" : null))
      .writeToString();
    expect(dot).toBe(`digraph {
  label="TITLE";
  subgraph cluster_0 {
    label="";
    0;
  }
  subgraph cluster_1 {
    label="own";
    1;
  }
  0 -> 1;
  1 -> 2;
}
`);
  });

  it("labelsEscapeAmpersandsSinceGraphvizDecodesEntitiesThere", () => {
    const graph = TestGraphs.path(2);
    const partition = NodePartition.of(graph, [0, -1], 1);
    const dot = DotWriter.of(graph)
      .graphAttribute("label", "A & B")
      .graphAttribute("URL", "x?a=1&b=2")
      .clusters(partition, () => "&lt;")
      .nodeLabel(() => "p = &sum;")
      .edgeAttributes((_edge, attributes) => {
        attributes.set("xlabel", "&");
        attributes.set("headlabel", "&amp;");
        attributes.set("taillabel", "&#38;");
        attributes.set("URL", "y?c=3&d=4");
      })
      .writeToString();
    expect(dot).toBe(`digraph {
  label="A &amp; B";
  URL="x?a=1&b=2";
  subgraph cluster_0 {
    label="&amp;lt;";
    0 [label="p = &amp;sum;"];
  }
  1 [label="p = &amp;sum;"];
  0 -> 1 [xlabel="&amp;", headlabel="&amp;amp;", taillabel="&amp;#38;", URL="y?c=3&d=4"];
}
`);
  });

  it("aNulCharacterIsWrittenAsTheReplacementCharacter", () => {
    const dot = DotWriter.of(TestGraphs.isolated(1))
      .nodeLabel(() => "a\u0000b")
      .nodeAttributes((_node, attributes) => attributes.set("URL", "\u0000"))
      .writeToString();
    expect(dot).toContain('0 [label="a\uFFFDb", URL="\uFFFD"];');
  });
});

/** Beyond the Java tests: the sink, `undefined` for none, and edge cases of names and escaping (checked against Java). */
describe("DotWriter (TypeScript)", () => {
  it("passes a large text to the sink in chunks that join to writeToString", () => {
    const graph = RandomGraphs.gnp(300, 0.05, 7);
    const writer = DotWriter.of(graph).edgeLabel((edge) => `edge ${edge}`);
    const sink = collector();
    writer.write(sink);
    expect(sink.chunks.length).toBeGreaterThan(1);
    expect(sink.text()).toBe(writer.writeToString());
  });

  it("passes what was written before an invalid attribute name on to the sink", () => {
    const sink = collector();
    const writer = DotWriter.of(TestGraphs.path(2))
      .nodeLabel(() => "x")
      .nodeAttributes((node, attributes) => {
        if (node === 1) attributes.set("node", "y");
      });
    expectArgumentError(() => writer.write(sink), "not a DOT attribute name: node");
    expect(sink.text()).toBe('digraph {\n  0 [label="x"];\n  1 [label="x"');
  });

  it("lets the error of the sink propagate", () => {
    const failing: TextSink = {
      write() {
        throw new Error("disk full");
      },
    };
    expect(() => DotWriter.of(TestGraphs.path(2)).write(failing)).toThrow("disk full");
  });

  it("accepts a Node.js stream as its sink", () => {
    // Type check only: a Writable fits TextSink.
    const sink: TextSink = process.stdout;
    expect(typeof sink.write).toBe("function");
  });

  it("treats undefined from a hook as none", () => {
    const graph = TestGraphs.path(3);
    const partition = NodePartition.of(graph, [0, -1, -1], 1);
    const dot = DotWriter.of(graph)
      .graphAttribute("label", "T")
      .nodeLabel(() => undefined)
      .edgeLabel(() => undefined)
      .clusters(partition, () => undefined)
      .writeToString();
    expect(dot).toBe(
      'digraph {\n  label="T";\n  subgraph cluster_0 {\n    label="";\n    0;\n  }\n  0 -> 1;\n  1 -> 2;\n}\n',
    );
  });

  it("checks names on write, keeps the order of the first setting and escapes only lower-case label names", () => {
    const dot = DotWriter.of(TestGraphs.isolated(1))
      .graphAttribute("rankdir", "LR")
      .graphAttribute("Label", "a&b")
      .graphAttribute("_x9", "\\")
      .graphAttribute("rankdir", "TB")
      .nodeAttributes((_node, attributes) => {
        attributes.set("XLABEL", "&");
        attributes.set("taillabel", "&");
      })
      .writeToString();
    expect(dot).toBe(
      'digraph {\n  rankdir="TB";\n  Label="a&b";\n  _x9="\\\\";\n  0 [XLABEL="&", taillabel="&amp;"];\n}\n',
    );
    for (const name of ["", "9a", "a.b", "Strict", "SubGraph", "nod\u00e9"]) {
      expectArgumentError(() => DotWriter.of(TestGraphs.path(1)).graphAttribute(name, "x"));
    }
    expect(() =>
      DotWriter.of(TestGraphs.path(1)).graphAttribute("nodes", "x").graphAttribute("strict_", "y"),
    ).not.toThrow();
  });

  it("writes a trailing carriage return, an empty value and supplementary characters as Java does", () => {
    const dot = DotWriter.of(TestGraphs.isolated(1))
      .nodeLabel(() => "a\r")
      .nodeAttributes((_node, attributes) => {
        attributes.set("tooltip", "");
        attributes.set("comment", "\u{1F600}\n\r\r\n\t");
      })
      .writeToString();
    expect(dot).toBe('digraph {\n  0 [label="a\\n", tooltip="", comment="\u{1F600}\\n\\n\\n\t"];\n}\n');
  });

  it("writes a self-loop and an isolated node in the undirected reading with filter and clusters", () => {
    const graph = TestGraphs.of(5, 0, 1, 1, 0, 1, 1, 3, 1, 1, 3, 4, 2);
    const partition = NodePartition.of(graph, [-1, 0, -1, 0, -1], 1);
    const dot = DotWriter.of(graph)
      .undirected()
      .nodeFilter((node) => node !== 4)
      .clusters(partition, () => "c")
      .writeToString();
    expect(dot).toBe(
      'graph {\n  subgraph cluster_0 {\n    label="c";\n    1;\n    3;\n  }\n  2;\n  0 -- 1;\n  1 -- 1;\n  1 -- 3;\n}\n',
    );
  });
});
