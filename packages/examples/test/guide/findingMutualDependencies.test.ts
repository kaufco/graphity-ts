import { describe, expect, it } from "vitest";
import { FindingMutualDependencies } from "../../src/guide/findingMutualDependencies.js";

describe("FindingMutualDependenciesTest", () => {
  it("theStatementsAndTheExpressionsAreTheRecursiveGroups", () => {
    const groups = FindingMutualDependencies.recursiveGroups();
    expect(groups.sccCount).toBe(6);
    expect(groups.recursive).toEqual([
      ["expression", "term", "factor"],
      ["statement", "block", "ifStatement"],
    ]);
  });

  it("factorAndExpressionUseEachOtherButAssignmentOnlyUsesExpression", () => {
    const sameGroup = FindingMutualDependencies.sameGroup();
    expect(sameGroup.expressions).toBe(2);
    expect(sameGroup.factorInIt).toBe(true);
    expect(sameGroup.assignmentInIt).toBe(false);
  });
});
