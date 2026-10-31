import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MAX_LINE = 90;

/**
 * Checks that no line of the examples is longer than 90 characters, counted with its indentation.
 * Longer lines wrap in the guide at its standard width; see the README of this package. The format
 * check does not reach these files, so nothing else holds them to the limit.
 */
describe("LineLengthTest", () => {
  it("noLineOfTheExamplesIsLongerThanTheLimit", () => {
    const src = new URL("../src/", import.meta.url);
    const files = readdirSync(src, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    const failures: string[] = [];
    for (const file of files) {
      readFileSync(new URL(file, src), "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (line.length > MAX_LINE) failures.push(`src/${file}:${i + 1}`);
        });
    }
    expect(failures).toEqual([]);
  });
});
