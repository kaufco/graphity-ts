import { describe, expect, it } from "vitest";
import { Graphs } from "@kobayami/graphity";
import { TransformingGraphs } from "../../src/guide/transformingGraphs.js";
import { textOf } from "../testutils/text.js";

/** The examples of the chapter "Transforming graphs and carrying data along". */
describe("TransformingChapterTest", () => {
  it("subgraphs", () => {
    const subgraph = TransformingGraphs.subgraph();
    expect(Graphs.adjacencyListOf(subgraph.loading)).toBe(textOf("0 -> [1, 2]", "1 -> [1]", "2 -> []"));
    expect(subgraph.loadingNames).toEqual(["load", "parse", "read"]);
    expect(Graphs.adjacencyListOf(subgraph.savingAndShowing)).toBe(
      textOf("0 -> [2, 3]", "1 -> [2]", "2 -> [2]", "3 -> []"),
    );
  });

  it("renumbered", () => {
    const renumbered = TransformingGraphs.renumbered();
    let order = "";
    for (let i = 0; i < renumbered.searchOrder.indexCount; i++) {
      order += `${renumbered.searchOrder.get(i)} `;
    }
    expect(order).toBe("0 1 2 3 6 8 4 7 9 5 ");
    expect(Graphs.adjacencyListOf(renumbered.inSearchOrder)).toBe(
      textOf(
        "0 -> [1, 2]",
        "1 -> []",
        "2 -> [3, 6, 9]",
        "3 -> [4, 5]",
        "4 -> [4]",
        "5 -> []",
        "6 -> [7, 8]",
        "7 -> [7]",
        "8 -> []",
        "9 -> [7]",
      ),
    );
    let runOrder = "";
    for (let i = 0; i < renumbered.runOrder.indexCount; i++) {
      runOrder += `${renumbered.runOrder.get(i)} `;
    }
    expect(runOrder).toBe("2 0 1 4 3 5 6 7 8 ");
    expect(
      Graphs.adjacencyListOf(renumbered.inRunOrder).startsWith(
        textOf("0 -> [6]", "1 -> [2]", "2 -> [3, 4, 6]", "3 -> [8]", "4 -> [5]", "5 -> [6]", "6 -> [7]"),
      ),
    ).toBe(true);
    expect(Graphs.isDag(renumbered.inRunOrder)).toBe(true);
  });

  it("nodeData", () => {
    const data = TransformingGraphs.nodeData();
    expect(Array.from(data.loadingLines)).toEqual([25, 60, 10]);
    expect(data.newIdOfParse).toBe(1);
    expect(data.mainKept).toBe(false);
    expect(data.partial).toBe(true);
    expect(data.mappedCount).toBe(3);
    expect(data.indexCount).toBe(10);
    expect(data.secondToOriginal.indexCount).toBe(2);
    expect(data.secondToOriginal.get(0)).toBe(6);
    expect(data.secondToOriginal.get(1)).toBe(8);
    expect(Array.from(data.calleeLines)).toEqual([60, 10]);
  });

  it("edgeData", () => {
    expect(Array.from(TransformingGraphs.edgeData())).toEqual([1, 1, 2]);
  });

  it("transposed", () => {
    const transposed = TransformingGraphs.transposed();
    expect(Graphs.adjacencyListOf(transposed.calledBy)).toBe(
      textOf(
        "0 -> []",
        "1 -> [0]",
        "2 -> [0]",
        "3 -> [2]",
        "4 -> [2]",
        "5 -> [2]",
        "6 -> [3, 6]",
        "7 -> [4, 5, 7]",
        "8 -> [3]",
        "9 -> [4]",
      ),
    );
    expect(transposed.transposedIndexOfLoadToRead).toBe(10);
    expect(transposed.callersOfFormat).toEqual(["save: 1", "show: 1", "format: 1"]);
  });

  it("ownGroups", () => {
    const own = TransformingGraphs.ownGroups();
    expect(own.groupCount).toBe(8);
    expect(own.sizeOfService).toBe(2);
    expect(own.methodsOfService.toString()).toBe("[3, 4]");
    expect(Graphs.adjacencyListOf(own.packageCalls)).toBe(
      textOf("0 -> [1, 2, 3]", "1 -> []", "2 -> [4]", "3 -> [4, 5]", "4 -> []", "5 -> []", "6 -> []", "7 -> []"),
    );
  });

  it("combined", () => {
    const combined = TransformingGraphs.combined();
    expect(Array.from(combined.linesPerPackage)).toEqual([32, 30, 15, 43, 100, 20, 0, 0]);
    expect(combined.behind.toString()).toBe("[5, 7]");
    expect(Array.from(combined.sitesPerPackageCall)).toEqual([1, 2, 2, 1, 2, 2]);
  });
});
