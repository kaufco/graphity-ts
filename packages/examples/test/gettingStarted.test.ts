import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Graphs } from "@kobayami/graphity";
import { SmallProgram } from "../src/smallProgram.js";
import { printedBy } from "./testutils/console.js";

describe("GettingStartedTest", () => {
  it("programPrintsTheCycleOfModelAndStorage", async () => {
    // The program runs when its module is loaded, once per test file.
    expect(await printedBy(() => import("../src/gettingStarted.js"))).toEqual(["[ 'model', 'storage' ]"]);
  });

  // The program keeps its data to itself, so the source must hold the data of SmallProgram: the
  // examples that continue the program in the README work on SmallProgram.
  it("programBuildsTheDependenciesOfSmallProgram", () => {
    const dependencies = SmallProgram.dependencies();
    const names = `const names = [${SmallProgram.packageNames()
      .map((name) => `"${name}"`)
      .join(", ")}];`;
    const uses: string[] = [];
    for (let pkg = 0; pkg < dependencies.nodeCount; pkg++) uses.push(`[${Array.from(dependencies.outNodes(pkg)).join(", ")}]`);
    const source = readFileSync(new URL("../src/gettingStarted.ts", import.meta.url), "utf8");
    expect(source).toContain(names);
    expect(source).toContain(`const uses = [${uses.join(", ")}];`);
  });

  it("theCycleIsTheNodes4And5ModelAndStorage", () => {
    expect(Array.from(Graphs.findCycle(SmallProgram.dependencies()))).toEqual([4, 5]);
    expect(SmallProgram.packageNames()[4]).toBe("model");
    expect(SmallProgram.packageNames()[5]).toBe("storage");
  });
});
