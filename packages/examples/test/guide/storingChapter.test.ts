import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StoringAndComparing } from "../../src/guide/storingAndComparing.js";
import { SmallProgram } from "../../src/smallProgram.js";
import { edgeListByName } from "../testutils/edges.js";

/** The examples of the chapter "Storing and comparing graphs". */
describe("StoringChapterTest", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "graphity-storing-chapter-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("roundTrip", () => {
    const stored = StoringAndComparing.roundTrip(join(dir, "deps.bin"));
    expect(stored.same).toBe(true);
    expect(stored.size).toBe(100);
  });

  it("hashes", () => {
    const hashes = StoringAndComparing.hashes();
    expect(hashes.rebuilt.equals(SmallProgram.dependencies())).toBe(true);
    expect(hashes.sameForEqualGraphs).toBe(true);
    expect(hashes.differentForNextVersion).toBe(true);
  });

  it("diff", () => {
    const diff = StoringAndComparing.diff();
    const names = SmallProgram.packageNames();
    expect(edgeListByName(diff.addedEdges, names)).toEqual(["ui -> storage"]);
    expect(diff.addedEdges.edgeIndices[0]).toBe(6);
    expect(edgeListByName(diff.removedEdges, names)).toEqual(["storage -> model"]);
    expect(diff.removedEdges.edgeIndices[0]).toBe(10);
    expect(diff.isEmpty).toBe(false);
  });
});
