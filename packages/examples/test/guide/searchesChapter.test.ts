import { describe, expect, it } from "vitest";
import { WritingSearches } from "../../src/guide/writingSearches.js";
import { SmallProgram } from "../../src/smallProgram.js";

/** The examples of the chapter "Writing searches of your own". */
describe("SearchesChapterTest", () => {
  it("descendantsBottomUp", () => {
    expect(Array.from(WritingSearches.descendants())).toEqual([9, 4, 3, 2, 0, 2, 0, 0, 0, 0]);
  });

  it("withoutStorage", () => {
    const search = WritingSearches.withoutStorage();
    expect(search.reached).toEqual(["main", "parseArgs", "run", "load", "parse", "save", "format", "show"]);
    expect(search.recursive).toEqual(["parse -> parse", "format -> format"]);
    // The pictures: the grey frame of the package storage holds read and write.
    const names = SmallProgram.methodNames();
    const packageOf = SmallProgram.packageOf();
    const storage = SmallProgram.nodeOf(SmallProgram.packageNames(), "storage");
    expect(names.filter((_, method) => packageOf[method] === storage)).toEqual(["read", "write"]);
  });

  it("byDepth", () => {
    expect(WritingSearches.byDepth()).toEqual([
      ["main"],
      ["parseArgs", "run"],
      ["load", "save", "show"],
      ["parse", "read", "format", "write"],
    ]);
  });

  it("fromArrays", () => {
    const fromArrays = WritingSearches.fromArrays();
    expect(Array.from(fromArrays.sitesIn)).toEqual([2, 0, 4, 2, 2, 1, 2, 1, 0, 0]);
    expect(Array.from(fromArrays.callerCount)).toEqual([0, 1, 1, 1, 1, 1, 2, 3, 1, 1]);
    expect(Array.from(fromArrays.sitesFromOthers)).toEqual([0, 1, 1, 1, 1, 2, 1, 2, 1, 1]);
  });
});
