import { describe, expect, it } from "vitest";
import { Graphs } from "@kobayami/graphity";
import { FindingDominators } from "../../src/guide/findingDominators.js";
import { textOf } from "../testutils/text.js";

/** The examples of the chapter "Dominance". */
describe("DominanceChapterTest", () => {
  it("immediateDominators", () => {
    const immediate = FindingDominators.immediate();
    expect(immediate.immediateDominatorOfNext).toBe(2);
    expect(immediate.immediateDominatorOfExit).toBe(1);
    expect(immediate.exitReachable).toBe(true);
    // The green blocks of the picture after: next, body, header, entry.
    expect(immediate.dominatorsOfNext).toEqual([4, 2, 1, 0]);
  });

  it("dominatorTree", () => {
    const tree = FindingDominators.tree();
    expect(Graphs.adjacencyListOf(tree.tree)).toBe(
      textOf("0 -> [1]", "1 -> [2, 5]", "2 -> [3, 4]", "3 -> []", "4 -> []", "5 -> []"),
    );
    expect(tree.bodyDominatesNext).toBe(true);
    expect(tree.thenDominatesNext).toBe(false);
    expect(tree.lowestCommonDominator).toBe(2);
  });

  it("postDominators", () => {
    const post = FindingDominators.post();
    expect(post.joinOfBody).toBe(4);
    expect(post.joinOfHeader).toBe(5);
    // header -> entry, header -> next, next -> body, next -> then, exit -> header
    expect(Graphs.adjacencyListOf(post.tree)).toBe(
      textOf("0 -> []", "1 -> [0, 4]", "2 -> []", "3 -> []", "4 -> [2, 3]", "5 -> [1]"),
    );
  });

  it("twoEntries", () => {
    const two = FindingDominators.twoEntries();
    expect(two.immediateDominatorOfLoad).toBe(-1);
    expect(two.immediateDominatorOfParse).toBe(3);
    expect(two.immediateDominatorOfFormat).toBe(2);
    // main -> parseArgs, main -> run, run -> save, run -> show, run -> format, load -> parse,
    // load -> read, save -> write
    expect(Graphs.adjacencyListOf(two.forest)).toBe(
      textOf(
        "0 -> [1, 2]",
        "1 -> []",
        "2 -> [4, 5, 7]",
        "3 -> [6, 8]",
        "4 -> [9]",
        "5 -> []",
        "6 -> []",
        "7 -> []",
        "8 -> []",
        "9 -> []",
      ),
    );
  });
});
