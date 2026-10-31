import { describe, expect, it } from "vitest";
import type { Edges } from "@kobayami/graphity";
import { Connectivity } from "../src/connectivity.js";
import { SmallProgram } from "../src/smallProgram.js";
import { namesOf } from "./testutils/names.js";

/** The edges as the comments of the examples write them, in their order. */
function edgesOf(edges: Edges, names: readonly string[]): string[] {
  const result: string[] = [];
  for (let p = 0; p < edges.count; p++) result.push(`${names[edges.sourceNodes[p]]} -> ${names[edges.targetNodes[p]]}`);
  return result;
}

describe("ConnectivityTest", () => {
  it("sccsOfGivesThePackagesInBuildOrder", () => {
    expect(Connectivity.buildOrder()).toEqual([
      ["util"],
      ["cli"],
      ["json"],
      ["model", "storage"],
      ["service"],
      ["ui"],
      ["app"],
    ]);
  });

  it("biconnectivityOfLoadHasTheEdgesOutsideTheLoopAsBridgesAndHeaderAsArticulationPoint", () => {
    const names = SmallProgram.blockNames();
    const splitters = Connectivity.bridgesOfLoad();
    expect(edgesOf(splitters.edges, names)).toEqual(["entry -> header", "header -> exit"]);
    expect(splitters.nodes.toString()).toBe("[1]");
    expect(namesOf(splitters.nodes, names)).toEqual(["header"]);
  });

  it("strongConnectivityOfLoadSparesOnlyTheBranchThroughThen", () => {
    const names = SmallProgram.blockNames();
    const splitters = Connectivity.strongBridgesOfLoad();
    expect(edgesOf(splitters.edges, names)).toEqual([
      "header -> body",
      "body -> then",
      "then -> next",
      "next -> header",
    ]);
    expect(splitters.nodes.toString()).toBe("[1, 2, 4]");
    expect(namesOf(splitters.nodes, names)).toEqual(["header", "body", "next"]);
  });
});
