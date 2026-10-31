import { describe, expect, it } from "vitest";
import { Dominance } from "../src/dominance.js";
import { SmallProgram } from "../src/smallProgram.js";
import { namesOf } from "./testutils/names.js";

describe("DominanceTest", () => {
  it("bodyIsTheImmediateDominatorOfNextAndDominatesItWhileThenDoesNot", () => {
    const names = SmallProgram.blockNames();
    const result = Dominance.dominatorsOfNext();
    expect(result.idom).toBe(2);
    expect(names[result.idom]).toBe("body");
    expect(result.bodyDominatesNext).toBe(true);
    expect(result.thenDominatesNext).toBe(false);
  });

  it("nextIsTheImmediatePostDominatorOfBody", () => {
    expect(Dominance.postDominatorOfBody()).toBe(4);
    expect(SmallProgram.blockNames()[Dominance.postDominatorOfBody()]).toBe("next");
  });

  it("bodyDominatesItselfThenAndNext", () => {
    expect(Array.from(Dominance.dominatedByBody())).toEqual([2, 3, 4]);
    expect(namesOf(Dominance.dominatedByBody(), SmallProgram.blockNames())).toEqual(["body", "then", "next"]);
  });
});
