import { describe, expect, it } from "vitest";
import { BiAdjacentGraph, GraphBuilder, Graphs } from "@kobayami/graphity";
import { BuildingFromEdges } from "../../src/guide/buildingFromEdges.js";
import { BuildingFromObjects } from "../../src/guide/buildingFromObjects.js";
import { BuildingTreesAndPaths } from "../../src/guide/buildingTreesAndPaths.js";
import { CombiningGraphs } from "../../src/guide/combiningGraphs.js";
import { FindingNeighbors } from "../../src/guide/findingNeighbors.js";
import { KeepingData } from "../../src/guide/keepingData.js";
import { ReadingResultLists } from "../../src/guide/readingResultLists.js";
import { UsingCsrArrays } from "../../src/guide/usingCsrArrays.js";
import { SmallFamily } from "../../src/smallFamily.js";
import { SmallProgram } from "../../src/smallProgram.js";
import { textOf } from "../testutils/text.js";

/** The examples of the chapter "Building and reading graphs". */
describe("BuildingChapterTest", () => {
  it("fromEdgesBuildsThePackagesOfTheSmallProgramAndMergesTheDuplicate", () => {
    const built = BuildingFromEdges.dependencies();
    expect(built.nodeCount).toBe(8);
    expect(built.edgeCount).toBe(14);
    expect(built.dependencies.equals(SmallProgram.dependencies())).toBe(true);
  });

  it("fromObjectsBuildsTheSameGraphAndKeepsThePackageOfEachNode", () => {
    const built = BuildingFromObjects.fromObjects();
    expect(built.dependencies.equals(SmallProgram.dependencies())).toBe(true);
    expect(built.packageOf[5].name).toBe("storage");
    expect(built.usedByApp).toBe("ui");
    // The comment: an unknown name gives -1, which the builder rejects.
    const builder = new GraphBuilder();
    builder.addNodes(8);
    expect(() => builder.addEdge(0, -1)).toThrow(RangeError);
  });

  it("andNodesAddsTheNodesUpToTheHighestNodeId", () => {
    const graph = BuildingFromObjects.fromNumberedInput();
    expect(graph.nodeCount).toBe(8);
    expect(Graphs.adjacencyListOf(graph)).toBe(
      textOf("0 -> [3]", "1 -> []", "2 -> []", "3 -> [4]", "4 -> [0]", "5 -> []", "6 -> []", "7 -> [3]"),
    );
  });

  it("addChildBuildsTheFamilyTreeOfTheDomain", () => {
    expect(BuildingTreesAndPaths.familyTree().equals(SmallFamily.tree())).toBe(true);
  });

  it("pathsAndBatchesBuildTheStepsOfTheDomain", () => {
    const steps = BuildingTreesAndPaths.steps();
    expect(Graphs.adjacencyListOf(steps)).toBe(
      textOf(
        "0 -> [1]",
        "1 -> [3, 4, 6]",
        "2 -> [6]",
        "3 -> [5]",
        "4 -> [8]",
        "5 -> [6]",
        "6 -> [7]",
        "7 -> [8]",
        "8 -> []",
      ),
    );
    expect(steps.equals(SmallProgram.buildSteps())).toBe(true);
  });

  it("addGraphPutsTheLibraryAfterTheProgram", () => {
    const combined = CombiningGraphs.programWithLibrary();
    expect(combined.programOffset).toBe(0);
    expect(combined.libraryOffset).toBe(8);
    expect(combined.graph.nodeCount).toBe(11);
    expect(combined.graph.edgeCount).toBe(17);
    expect(combined.graph.outNodes(6).toString()).toBe("[7, 8]");
    expect(combined.graph.outNodes(8).toString()).toBe("[9, 10]");
    // The picture after: the program as it was, the library after it, and json -> api.
    const program = Graphs.adjacencyListOf(SmallProgram.dependencies());
    expect(Graphs.adjacencyListOf(combined.graph)).toBe(
      program.replace("6 -> [7]", "6 -> [7, 8]") + "8 -> [9, 10]\n9 -> []\n10 -> []\n",
    );
  });

  it("addGraphExtendsAGraph", () => {
    const next = CombiningGraphs.nextVersion();
    expect(next.nodeCount).toBe(8);
    expect(next.edgeCount).toBe(15);
    expect(next.hasOutNode(2, 5)).toBe(true);
    // The text: ui -> storage gets the edge index 6, and ui -> util moves up from 6 to 7.
    expect(next.edgeIndexOf(2, 5)).toBe(6);
    expect(SmallProgram.dependencies().edgeIndexOf(2, 7)).toBe(6);
    expect(next.edgeIndexOf(2, 7)).toBe(7);
  });

  it("dataOnNodesAndEdgesGivesTheCallsBetweenPackages", () => {
    const data = KeepingData.callData();
    expect(data.packageOf).toHaveLength(10);
    expect(data.siteCount.reduce((sum, sites) => sum + sites, 0)).toBe(14);
    expect(data.lines).toEqual([
      "main -> parseArgs: 1",
      "run -> load: 1",
      "run -> save: 1",
      "run -> show: 2",
      "load -> parse: 1",
      "load -> read: 1",
      "save -> format: 1",
      "save -> write: 1",
      "show -> format: 1",
    ]);
  });

  it("outNodesOfRun", () => {
    const out = FindingNeighbors.outNodes();
    expect(out.calledByRun.toString()).toBe("[3, 4, 5]");
    expect(out.outDegree).toBe(3);
    expect(out.runCallsSave).toBe(true);
    expect(out.recursive).toBe(true);
  });

  it("inNodesOfFormat", () => {
    const inNodes = FindingNeighbors.inNodes();
    expect(inNodes.callersOfFormat.toString()).toBe("[4, 5, 7]");
    expect(inNodes.inDegree).toBe(3);
    expect(inNodes.saveCallsFormat).toBe(true);
    expect(inNodes.neighborsOfSave.toString()).toBe("[2, 7, 9]");
    expect(inNodes.degreeOfSave).toBe(3);
    expect(inNodes.mainIsRoot).toBe(true);
    // The text: degree counts edges, not neighbors - format has 3 neighbors but degree 4.
    const both = BiAdjacentGraph.of(SmallProgram.calls());
    expect(both.neighbors(7).size).toBe(3);
    expect(both.degree(7)).toBe(4);
  });

  it("sortedLists", () => {
    const sorted = ReadingResultLists.sortedLists();
    expect(sorted.size).toBe(3);
    expect(sorted.first).toBe(3);
    expect(sorted.last).toBe(5);
    expect(sorted.position).toBe(1);
    expect(sorted.hasFormat).toBe(false);
    expect(sorted.both.toString()).toBe("[7, 9]");
    expect(Array.from(sorted.copy)).toEqual([3, 4, 5]);
  });

  it("edgeLists", () => {
    expect(ReadingResultLists.edgeLists()).toEqual(["parse -> parse (edge 10)", "format -> format (edge 11)"]);
  });

  it("csrArraysMakeTheControlFlowOfLoad", () => {
    const fromArrays = UsingCsrArrays.load();
    expect(fromArrays.graph.nodeCount).toBe(6);
    expect(fromArrays.graph.edgeCount).toBe(7);
    expect(fromArrays.graph.equals(SmallProgram.cfg())).toBe(true);
    expect(Array.from(fromArrays.start)).toEqual([0, 1, 3, 5, 6, 7, 7]);
    expect(Array.from(fromArrays.adjacency)).toEqual([1, 2, 5, 3, 4, 4, 1]);
  });
});
