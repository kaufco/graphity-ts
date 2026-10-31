import { describe, expect, it } from "vitest";
import { Partitions } from "../src/partitions.js";
import { SmallProgram } from "../src/smallProgram.js";
import { edgesByName } from "./testutils/edges.js";

describe("PartitionsTest", () => {
  it("ofCondensesTheCallsToTheCallsBetweenPackages", () => {
    const packageCalls = Partitions.packageCalls();
    const packageNames = SmallProgram.packageNames();
    expect(packageCalls.nodeCount).toBe(packageNames.length);
    expect(edgesByName(packageCalls, packageNames)).toEqual([
      "app -> cli",
      "app -> ui",
      "app -> service",
      "ui -> model",
      "service -> model",
      "service -> storage",
    ]);
  });

  it("edgesOfListsTheCallsFromServiceToModel", () => {
    const names = SmallProgram.methodNames();
    const calls = SmallProgram.calls();
    expect(Partitions.callsFromServiceToModel().toString()).toBe("[5, 7]");
    const behind: string[] = [];
    Partitions.callsFromServiceToModel().forEach((edge) =>
      behind.push(`${names[calls.edgeSource(edge)]} -> ${names[calls.edgeTarget(edge)]}`),
    );
    expect(behind).toEqual(["load -> parse", "save -> format"]);
  });

  it("reduceSumsTheCallSitesPerCallBetweenPackages", () => {
    const packageCalls = Partitions.packageCalls();
    const packageNames = SmallProgram.packageNames();
    const packageSiteCount = Partitions.callSitesPerPackageCall();
    expect(packageSiteCount).toHaveLength(packageCalls.edgeCount);
    const counted: string[] = [];
    packageCalls.forEachEdge((source, target, edge) =>
      counted.push(`${packageNames[source]} -> ${packageNames[target]}: ${packageSiteCount[edge]}`),
    );
    expect(counted.sort()).toEqual(
      [
        "app -> ui: 2",
        "app -> service: 2",
        "service -> model: 2",
        "service -> storage: 2",
        "app -> cli: 1",
        "ui -> model: 1",
      ].sort(),
    );
  });
});
