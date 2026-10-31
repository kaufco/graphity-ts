import { describe, expect, it } from "vitest";
import { BiAdjacentGraph, Components, type Graph, Graphs } from "@kobayami/graphity";
import { SmallProgram } from "../src/smallProgram.js";
import { expectArgumentError } from "./testutils/assertions.js";
import { namesOf } from "./testutils/names.js";

/** The strongly connected components that contain a cycle, each as the names of its nodes. */
function cyclesOf(graph: Graph, names: readonly string[]): string[][] {
  const sccs = Components.sccsOf(graph);
  const cycles: string[][] = [];
  for (let scc = 0; scc < sccs.sccCount; scc++) {
    if (sccs.containsCycle(scc)) cycles.push(namesOf(sccs.nodesOf(scc), names));
  }
  return cycles;
}

/** Pins the graphs of the example domain, on which every example comment depends. */
describe("SmallProgramTest", () => {
  it("dependenciesHaveOneCycleBetweenModelAndStorage", () => {
    const dependencies = SmallProgram.dependencies();
    const names = SmallProgram.packageNames();
    expect(names).toEqual(["app", "cli", "ui", "service", "model", "storage", "json", "util"]);
    expect(dependencies.nodeCount).toBe(names.length);
    expect(dependencies.edgeCount).toBe(14);
    expect(Graphs.adjacencyListOf(dependencies)).toBe(
      "0 -> [1, 2, 3]\n1 -> [7]\n2 -> [3, 4, 7]\n3 -> [4, 5]\n4 -> [5]\n5 -> [4, 6, 7]\n6 -> [7]\n7 -> []\n",
    );
    expect(cyclesOf(dependencies, names)).toEqual([["model", "storage"]]);
  });

  it("callsMergeTheCallSitesAndHaveTwoRecursiveMethods", () => {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    expect(names).toEqual(["main", "parseArgs", "run", "load", "save", "show", "parse", "format", "read", "write"]);
    expect(calls.nodeCount).toBe(names.length);
    expect(calls.edgeCount).toBe(12);
    expect(SmallProgram.callSites()).toHaveLength(14);
    expect(Graphs.adjacencyListOf(calls)).toBe(
      "0 -> [1, 2]\n1 -> []\n2 -> [3, 4, 5]\n3 -> [6, 8]\n4 -> [7, 9]\n5 -> [7]\n6 -> [6]\n7 -> [7]\n8 -> []\n9 -> []\n",
    );
    for (const site of SmallProgram.callSites()) expect(calls.hasOutNode(site.caller, site.callee)).toBe(true);
    expect(cyclesOf(calls, names).sort()).toEqual([["format"], ["parse"]]);
  });

  it("cfgIsALoopWithABranchFromEntryToExit", () => {
    const cfg = SmallProgram.cfg();
    const names = SmallProgram.blockNames();
    expect(names).toEqual(["entry", "header", "body", "then", "next", "exit"]);
    expect(cfg.nodeCount).toBe(names.length);
    expect(Graphs.adjacencyListOf(cfg)).toBe("0 -> [1]\n1 -> [2, 5]\n2 -> [3, 4]\n3 -> [4]\n4 -> [1]\n5 -> []\n");
    expect(namesOf(Graphs.rootNodes(BiAdjacentGraph.of(cfg)), names)).toEqual(["entry"]);
    expect(cyclesOf(cfg, names)).toEqual([["header", "body", "then", "next"]]);
  });

  it("packageOfPutsEveryCallBetweenTwoPackagesOnADependency", () => {
    const calls = SmallProgram.calls();
    const dependencies = SmallProgram.dependencies();
    const packageNames = SmallProgram.packageNames();
    const packageOf = SmallProgram.packageOf();
    expect(packageOf).toHaveLength(calls.nodeCount);
    expect(namesOf(packageOf, packageNames)).toEqual([
      "app",
      "cli",
      "app",
      "service",
      "service",
      "ui",
      "model",
      "model",
      "storage",
      "storage",
    ]);
    calls.forEachEdge((caller, callee) => {
      if (packageOf[caller] !== packageOf[callee]) {
        expect(dependencies.hasOutNode(packageOf[caller], packageOf[callee])).toBe(true);
      }
    });
  });

  it("namesReturnCopiesAndLookUpNodes", () => {
    const names = SmallProgram.packageNames();
    names[0] = "changed";
    expect(SmallProgram.packageNames()[0]).toBe("app");
    expect(SmallProgram.nodeOf(SmallProgram.blockNames(), "exit")).toBe(5);
    expectArgumentError(() => SmallProgram.nodeOf(SmallProgram.blockNames(), "loop"));
  });
});
