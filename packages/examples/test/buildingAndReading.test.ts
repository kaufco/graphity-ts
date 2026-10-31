import { describe, expect, it } from "vitest";
import { Graphs } from "@kobayami/graphity";
import { BuildingAndReading } from "../src/buildingAndReading.js";
import { SmallProgram } from "../src/smallProgram.js";
import { printedBy } from "./testutils/console.js";

describe("BuildingAndReadingTest", () => {
  it("buildMergesTheCallSitesOfRunToShowAndOfParseToParse", () => {
    const names = SmallProgram.methodNames();
    const callSites = SmallProgram.callSites();
    const calls = BuildingAndReading.callsFromCallSites();

    expect(calls.equals(SmallProgram.calls())).toBe(true);
    expect(calls.nodeCount).toBe(names.length);
    expect(callSites).toHaveLength(14);
    expect(calls.edgeCount).toBe(12);

    const timesAdded = new Map<string, number>();
    for (const site of callSites) {
      const call = `${names[site.caller]} -> ${names[site.callee]}`;
      timesAdded.set(call, (timesAdded.get(call) ?? 0) + 1);
    }
    const repeated = [...timesAdded].filter(([, times]) => times !== 1);
    expect(repeated).toEqual([
      ["run -> show", 2],
      ["parse -> parse", 2],
    ]);
  });

  it("argumentFormsAddTheOutEdgesOfAppUiAndService", () => {
    // TypeScript only: the forms of the batch methods that Java's overloads take.
    expect(Graphs.adjacencyListOf(BuildingAndReading.argumentForms())).toBe(
      "0 -> [1, 2, 3]\n1 -> []\n2 -> [3, 4, 7]\n3 -> [4, 5]\n4 -> []\n5 -> []\n6 -> []\n7 -> []\n",
    );
  });

  it("addGraphKeepsTheNodeIdsAndTheEdgeFromUiToStorageIsAdded", () => {
    const dependencies = SmallProgram.dependencies();
    const names = SmallProgram.packageNames();
    const ui = SmallProgram.nodeOf(names, "ui");
    const storage = SmallProgram.nodeOf(names, "storage");
    const nextVersion = BuildingAndReading.nextVersion();

    expect(dependencies.hasOutNode(ui, storage)).toBe(false);
    expect(nextVersion.nodeCount).toBe(dependencies.nodeCount);
    expect(nextVersion.edgeCount).toBe(dependencies.edgeCount + 1);
    dependencies.forEachEdge((source, target) => expect(nextVersion.hasOutNode(source, target)).toBe(true));
    expect(nextVersion.hasOutNode(ui, storage)).toBe(true);
  });

  it("loopCountsTheCallersOfEachMethod", () => {
    const names = SmallProgram.methodNames();
    const callerCount = BuildingAndReading.callerCounts();

    expect(callerCount).toHaveLength(names.length);
    for (let method = 0; method < names.length; method++) {
      const expected = names[method] === "format" ? 3 : names[method] === "parse" ? 2 : names[method] === "main" ? 0 : 1;
      expect(callerCount[method], names[method]).toBe(expected);
    }
  });

  it("edgesPrintTheRecursiveCallsWithTheirCallSites", async () => {
    expect(await printedBy(() => BuildingAndReading.recursiveCalls())).toEqual([
      "parse -> parse: 2",
      "format -> format: 1",
    ]);
  });
});
