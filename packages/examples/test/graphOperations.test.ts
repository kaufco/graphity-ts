import { describe, expect, it } from "vitest";
import { GraphOperations } from "../src/graphOperations.js";
import { SmallProgram } from "../src/smallProgram.js";
import { namesOf } from "./testutils/names.js";

describe("GraphOperationsTest", () => {
  it("findCycleReturnsModelAndStorageClosedByStorageToModel", () => {
    const dependencies = SmallProgram.dependencies();
    const names = SmallProgram.packageNames();
    const cycle = GraphOperations.cycleInDependencies();
    expect(Array.from(cycle)).toEqual([4, 5]);
    expect(namesOf(cycle, names)).toEqual(["model", "storage"]);
    expect(dependencies.hasOutNode(cycle[1], cycle[0])).toBe(true);
  });

  it("adjacencyListOfListsTheWholeControlFlowOfLoad", () => {
    expect(GraphOperations.cfgAsAdjacencyList()).toBe("0 -> [1]\n1 -> [2, 5]\n2 -> [3, 4]\n3 -> [4]\n4 -> [1]\n5 -> []\n");
  });
});
