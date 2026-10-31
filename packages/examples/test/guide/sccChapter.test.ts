import { describe, expect, it } from "vitest";
import { CheckingStrongConnectivity } from "../../src/guide/checkingStrongConnectivity.js";
import { OrderingDespiteCycles } from "../../src/guide/orderingDespiteCycles.js";
import { SplittingGroups } from "../../src/guide/splittingGroups.js";
import { SmallProgram } from "../../src/smallProgram.js";
import { edgeListByName } from "../testutils/edges.js";

/** The examples of the chapter "Strongly connected components" added after the pilot. */
describe("SccChapterTest", () => {
  it("buildOrderOfThePackages", () => {
    const order = OrderingDespiteCycles.buildOrder();
    expect(order.buildOrder).toEqual([
      ["util"],
      ["cli"],
      ["json"],
      ["model", "storage"],
      ["service"],
      ["ui"],
      ["app"],
    ]);
    expect(order.jsonBeforeUi).toBe(true);
  });

  it("theControlFlowOfLoadIsStronglyConnectedOnlyWithTheEdgeFromExitToEntry", () => {
    const answers = CheckingStrongConnectivity.check();
    expect(answers.cfgStronglyConnected).toBe(false);
    expect(answers.loadWellFormed).toBe(true);
  });

  it("strongBridgesAndArticulationPointsOfLoad", () => {
    const splitters = SplittingGroups.ofLoad();
    expect(edgeListByName(splitters.strongBridges, SmallProgram.blockNames())).toEqual([
      "header -> body",
      "body -> then",
      "then -> next",
      "next -> header",
    ]);
    expect(splitters.strongArticulationPoints.toString()).toBe("[1, 2, 4]");
  });
});
