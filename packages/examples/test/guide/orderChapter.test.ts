import { describe, expect, it } from "vitest";
import { EdgeType, Edges, Graphs, TopOrder } from "@kobayami/graphity";
import { BreakingCycles } from "../../src/guide/breakingCycles.js";
import { ClassifyingEdges } from "../../src/guide/classifyingEdges.js";
import { FindingCycles } from "../../src/guide/findingCycles.js";
import { FindingLevels } from "../../src/guide/findingLevels.js";
import { FindingRoots } from "../../src/guide/findingRoots.js";
import { SortingTopologically } from "../../src/guide/sortingTopologically.js";
import { SmallProgram } from "../../src/smallProgram.js";
import { expectArgumentError } from "../testutils/assertions.js";
import { edgeListByName } from "../testutils/edges.js";

const { TREE, BACK, FORWARD, CROSS } = EdgeType;

/** The examples of the chapter "Order and cycles". */
describe("OrderChapterTest", () => {
  it("thePackagesHaveTheCycleOfModelAndStorage", () => {
    const found = FindingCycles.cycles();
    expect(found.dependenciesAcyclic).toBe(false);
    expect(Array.from(found.cycle)).toEqual([4, 5]);
  });

  it("topologicalOrderOfTheSteps", () => {
    expect(SortingTopologically.runOrder()).toEqual([
      "lint",
      "generate",
      "compile",
      "docs",
      "compileTests",
      "test",
      "package",
      "sign",
      "publish",
    ]);
    expectArgumentError(() => TopOrder.of(SmallProgram.dependencies()));
  });

  it("stagesOfTheSteps", () => {
    const stages = FindingLevels.stages();
    expect(stages.levelOfTest).toBe(3);
    expect(stages.levelCount).toBe(7);
    expect(stages.stages).toEqual([
      ["generate", "lint"],
      ["compile"],
      ["compileTests", "docs"],
      ["test"],
      ["package"],
      ["sign"],
      ["publish"],
    ]);
    // The text: no path connects docs (4), on level 2, and test (5), on level 3.
    expect(Graphs.reachableFrom(SmallProgram.buildSteps(), 4).contains(5)).toBe(false);
    expect(Graphs.reachableFrom(SmallProgram.buildSteps(), 5).contains(4)).toBe(false);
  });

  it("rootsOfTheSteps", () => {
    const roots = FindingRoots.roots();
    expect(roots.roots.toString()).toBe("[0, 2]");
    expect(roots.compileIsRoot).toBe(false);
  });

  it("edgeTypesOfThePackages", () => {
    const classified = ClassifyingEdges.classify();
    expect(classified.storageToModel).toBe(EdgeType.BACK);
    expect(classified.appToService).toBe(EdgeType.FORWARD);
    expect(edgeListByName(classified.crossEdges, SmallProgram.packageNames())).toEqual([
      "ui -> util",
      "storage -> util",
      "json -> util",
    ]);
    // The picture after: the type of every edge, by edge index from 0 to 13.
    const types = classified.types;
    expect(SmallProgram.dependencies().edgeCount).toBe(14);
    expect(Array.from({ length: 14 }, (_, edge) => types.typeOf(edge))).toEqual([
      TREE,
      TREE,
      FORWARD,
      TREE,
      TREE,
      FORWARD,
      CROSS,
      TREE,
      FORWARD,
      TREE,
      BACK,
      TREE,
      CROSS,
      CROSS,
    ]);
    const names = SmallProgram.packageNames();
    expect(edgeListByName(Edges.of(types, TREE), names)).toEqual([
      "app -> cli",
      "app -> ui",
      "cli -> util",
      "ui -> service",
      "service -> model",
      "model -> storage",
      "storage -> json",
    ]);
    expect(edgeListByName(Edges.of(types, FORWARD), names)).toEqual([
      "app -> service",
      "ui -> model",
      "service -> storage",
    ]);
    expect(edgeListByName(Edges.of(types, BACK), names)).toEqual(["storage -> model"]);
  });

  it("withoutBackEdgesThePackagesAreADag", () => {
    const broken = BreakingCycles.withoutBackEdges();
    expect(edgeListByName(broken.backEdges, SmallProgram.packageNames())).toEqual(["storage -> model"]);
    expect(broken.backEdges.edgeIndices[0]).toBe(10);
    expect(broken.isDag).toBe(true);
    expect(broken.acyclic.edgeCount).toBe(13);
    expect(Graphs.isDag(broken.acyclic)).toBe(true);
  });
});
