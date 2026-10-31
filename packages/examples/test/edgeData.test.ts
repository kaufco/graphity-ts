import { describe, expect, it } from "vitest";
import { EdgeData } from "../src/edgeData.js";
import { SmallProgram } from "../src/smallProgram.js";
import { printedBy } from "./testutils/console.js";

describe("EdgeDataTest", () => {
  it("edgeIndexOfCountsTwoCallSitesForRunToShowAndParseToParse", () => {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const siteCount = EdgeData.callSitesPerEdge();
    expect(siteCount).toHaveLength(calls.edgeCount);
    calls.forEachEdge((caller, callee, edge) => {
      const call = `${names[caller]} -> ${names[callee]}`;
      const expected = call === "run -> show" || call === "parse -> parse" ? 2 : 1;
      expect(siteCount[edge], call).toBe(expected);
    });
  });

  it("outEdgesPrintTheCalleesOfRunWithTheirCallSites", async () => {
    expect(await printedBy(() => EdgeData.calleesOfRun())).toEqual(["load: 1", "save: 1", "show: 2"]);
  });
});
