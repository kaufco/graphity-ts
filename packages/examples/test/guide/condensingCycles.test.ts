import { describe, expect, it } from "vitest";
import { Graphs } from "@kobayami/graphity";
import { CondensingCycles } from "../../src/guide/condensingCycles.js";
import { textOf } from "../testutils/text.js";

describe("CondensingCyclesTest", () => {
  it("theCondensedRulesAreAcyclicAndNamedInBuildOrder", () => {
    const condensed = CondensingCycles.condense();
    expect(condensed.acyclic).toBe(true);
    expect(condensed.groupNames).toEqual([
      "name",
      "number",
      "expression/term/factor",
      "assignment",
      "statement/block/ifStatement",
      "program",
    ]);
  });

  // The guide draws the condensed graph; its edges must be the ones drawn there.
  it("theCondensedGraphHasTheEdgesOfTheDiagram", () => {
    expect(Graphs.adjacencyListOf(CondensingCycles.condense().graph)).toBe(
      textOf("0 -> []", "1 -> []", "2 -> [0, 1]", "3 -> [0, 2]", "4 -> [2, 3]", "5 -> [4]"),
    );
  });

  it("theStatementsUseTheExpressionsAndAssignment", () => {
    expect(CondensingCycles.condense().usedByStatements.toString()).toBe("[2, 3]");
  });
});
