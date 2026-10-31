import { describe, expect, it } from "vitest";
import { Building } from "../src/building.js";
import { SmallProgram } from "../src/smallProgram.js";

describe("BuildingTest", () => {
  it("ofBuildsTheControlFlowOfLoad", () => {
    expect(Building.cfgFromArrays().equals(SmallProgram.cfg())).toBe(true);
  });

  it("toStringGivesTheTextInTheComment", () => {
    expect(Building.cfgAsText()).toBe(
      "Graph[nodes=6, edges=7] {0 -> [1], 1 -> [2, 5], 2 -> [3, 4], 3 -> [4], 4 -> [1], 5 -> []}",
    );
  });
});
