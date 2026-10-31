import { describe, expect, it } from "vitest";
import { Graphs } from "@kobayami/graphity";
import { CheckingTrees } from "../../src/guide/checkingTrees.js";
import { ReadingAncestry } from "../../src/guide/readingAncestry.js";
import { textOf } from "../testutils/text.js";

/** The examples of the chapter "Trees and hierarchies". */
describe("TreesChapterTest", () => {
  it("shapes", () => {
    const shapes = CheckingTrees.shapes();
    expect(shapes.familyTree).toBe(true);
    expect(shapes.familyPath).toBe(false);
    expect(Graphs.adjacencyListOf(shapes.line)).toBe(textOf("0 -> [1]", "1 -> [2]", "2 -> [3]", "3 -> []"));
    expect(shapes.lineTree).toBe(true);
    expect(shapes.linePath).toBe(true);
    expect(shapes.dependenciesForest).toBe(false);
  });

  it("parentsAndGenerations", () => {
    const parents = ReadingAncestry.parents();
    expect(parents.parentOfGreta).toBe(3);
    expect(parents.generationOfGreta).toBe(3);
    expect(parents.parentOfAda).toBe(-1);
    expect(Array.from(parents.generations)).toEqual([0, 1, 1, 2, 2, 2, 3, 3, 3, 3]);
  });

  it("lowestCommonAncestors", () => {
    const common = ReadingAncestry.common();
    expect(common.gretaAndIda).toBe(0);
    expect(common.gretaAndEmil).toBe(1);
    expect(common.hugoAndGreta).toBe(3);
    expect(common.doraAndHugo).toBe(3);
  });

  it("ancestorTests", () => {
    const tests = ReadingAncestry.tests();
    expect(tests.benIsAncestor).toBe(true);
    expect(tests.cleoIsAncestor).toBe(false);
    expect(tests.hugoIsAncestor).toBe(true);
    expect(tests.fastBenIsAncestor).toBe(true);
  });

  it("subtrees", () => {
    const subtrees = ReadingAncestry.subtrees();
    expect(Array.from(subtrees.subtreeOfBen)).toEqual([1, 3, 6, 7, 4]);
    expect(subtrees.subtreeSizeOfBen).toBe(5);
    expect(Array.from(subtrees.preorder)).toEqual([0, 1, 3, 6, 7, 4, 2, 5, 8, 9]);
    expect(subtrees.positionOfCleo).toBe(6);
  });
});
