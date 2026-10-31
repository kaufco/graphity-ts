import { describe, expect, it } from "vitest";
import { Graphs } from "@kobayami/graphity";
import { CheckingUndirectedShapes } from "../../src/guide/checkingUndirectedShapes.js";
import { FindingBridges } from "../../src/guide/findingBridges.js";
import { FindingParts } from "../../src/guide/findingParts.js";
import { SmallProgram } from "../../src/smallProgram.js";
import { edgeListByName } from "../testutils/edges.js";
import { textOf } from "../testutils/text.js";

/** The examples of the chapter "Connectivity when direction does not matter". */
describe("UndirectedChapterTest", () => {
  it("withoutMainAndRunTheCallsFallIntoFiveComponents", () => {
    const wccs = FindingParts.wccs();
    expect(Graphs.adjacencyListOf(wccs.rest)).toBe(
      textOf(
        "0 -> []",
        "1 -> []",
        "2 -> []",
        "3 -> [6, 8]",
        "4 -> [7, 9]",
        "5 -> [7]",
        "6 -> [6]",
        "7 -> [7]",
        "8 -> []",
        "9 -> []",
      ),
    );
    expect(wccs.componentCount).toBe(5);
    expect(wccs.components).toEqual([
      ["main"],
      ["parseArgs"],
      ["run"],
      ["load", "parse", "read"],
      ["save", "show", "format", "write"],
    ]);
    expect(wccs.callsConnected).toBe(true);
    expect(wccs.restConnected).toBe(false);
  });

  it("bridgesAndArticulationPointsOfTheCalls", () => {
    const splitters = FindingBridges.splitters();
    expect(edgeListByName(splitters.bridges, SmallProgram.methodNames())).toEqual([
      "main -> parseArgs",
      "main -> run",
      "run -> load",
      "load -> parse",
      "load -> read",
      "save -> write",
    ]);
    expect(splitters.articulationPoints.toString()).toBe("[0, 2, 3, 4]");
  });

  it("blocksOfTheCalls", () => {
    const blocks = FindingBridges.blocks();
    expect(blocks.blockCount).toBe(7);
    expect(blocks.largeBlock).toEqual(["run -> save", "run -> show", "save -> format", "show -> format"]);
    expect(blocks.inNoBlock).toEqual(["parse -> parse", "format -> format"]);
  });

  it("bipartite", () => {
    const bipartite = CheckingUndirectedShapes.bipartite();
    expect(bipartite.family).toBe(true);
    expect(bipartite.dependencies).toBe(false);
  });

  it("treesAndForests", () => {
    const shapes = CheckingUndirectedShapes.shapes();
    expect(shapes.familyTree).toBe(true);
    expect(shapes.restForest).toBe(true);
    expect(shapes.restTree).toBe(false);
    expect(shapes.callsForest).toBe(false);
  });
});
