import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { check, exampleBlocks } from "./testutils/regions.js";

/** The packages whose documentation comments show examples. */
const PACKAGES = ["core", "controlflow", "dot", "mermaid", "graphity"];

/**
 * Checks that every TypeScript example in the documentation comments of the packages is a region of
 * the examples in this package, as Java's Javadoc embeds them with `{@snippet}`, so that it
 * compiles and does what its comments say. A marker `<!-- example: file.ts#region -->` names the
 * region directly before the code block, which equals the region without its indentation.
 */
describe("DocumentationExamplesTest", () => {
  it("everyTypeScriptBlockOfADocumentationCommentIsARegionOfTheExamples", () => {
    const failures: string[] = [];
    let count = 0;
    for (const pkg of PACKAGES) {
      const dir = new URL(`../../${pkg}/src/`, import.meta.url);
      for (const file of readdirSync(dir).filter((name) => name.endsWith(".ts"))) {
        const source = readFileSync(new URL(file, dir), "utf8");
        for (const comment of source.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
          const firstLine = source.slice(0, comment.index).split("\n").length;
          const lines = comment[0].split("\n").map((line) => line.replace(/^\s*\/?\*\*?\/? ?/, ""));
          for (const block of exampleBlocks(lines, `${pkg}/src/${file}`, (index) => firstLine + index)) {
            count++;
            failures.push(...check(block, false));
          }
        }
      }
    }
    expect(count).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });
});
