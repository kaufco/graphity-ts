import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Csr } from "@kobayami/graphity";
import { SmallProgram } from "../src/smallProgram.js";
import { Storing } from "../src/storing.js";

describe("StoringTest", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "graphity-storing-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("loadGivesTheGraphWithItsEdgeIndicesAndTheNames", () => {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const file = join(dir, "calls.bin");

    Storing.store(calls, names, file);
    const loaded = Storing.load(file);

    expect(loaded.graph.equals(calls)).toBe(true);
    expect(Array.from(Csr.outAdjacency(loaded.graph))).toEqual(Array.from(Csr.outAdjacency(calls)));
    expect(loaded.names).toEqual(names);
  });
});
