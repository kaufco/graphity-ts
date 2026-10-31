import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { check, exampleBlocks } from "./testutils/regions.js";

/**
 * Checks that every TypeScript example in the README and on the start page of the API documentation
 * is a region of the examples in this package, so that it compiles and does what its comments say. A marker `<!-- example: file.ts#region -->`
 * names the region, or several separated by spaces, directly before the code block. The imports at
 * the top of a block must be imports of the named files; the rest equals the regions, without
 * their common indentation, separated by a blank line.
 */
describe("ReadmeExamplesTest", () => {
  it("everyTypeScriptBlockOfTheReadmeIsARegionOfTheExamples", () => {
    const readme = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");
    const blocks = exampleBlocks(readme.split("\n"), "README.md", (index) => index + 1);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.flatMap((block) => check(block, true))).toEqual([]);
  });

  it("everyTypeScriptBlockOfTheStartPageIsARegionOfTheExamples", () => {
    const page = readFileSync(new URL("../../../api-docs/overview.md", import.meta.url), "utf8");
    const blocks = exampleBlocks(page.split("\n"), "api-docs/overview.md", (index) => index + 1);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.flatMap((block) => check(block, true))).toEqual([]);
  });
});
