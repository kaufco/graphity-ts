import { TopOrderAndLevels } from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** The stages and two values read on the way. */
export interface Stages {
  readonly stages: string[][];
  readonly levelOfTest: number;
  readonly levelCount: number;
}

/** The build steps in stages: the steps of one stage can run at the same time. */
export const FindingLevels = {
  /** Returns the build steps grouped by level. */
  stages(): Stages {
    const steps = SmallProgram.buildSteps();
    const names = SmallProgram.stepNames();
    const test = SmallProgram.nodeOf(names, "test");
    // @start region="levels"
    const levels = TopOrderAndLevels.of(steps);
    // 3 - three steps run before it, one after the other
    const levelOfTest = levels.levelOf(test);
    const levelCount = levels.levelCount;       // 7

    // One stage per level: the steps of a stage have no edge between them.
    const stages: string[][] = [];
    for (let level = 0; level < levelCount; level++) {
      stages.push([]);
    }
    for (const step of levels.order) {
      stages[levels.levelOf(step)].push(names[step]);
    }
    // stages: [[generate, lint], [compile], [compileTests, docs], [test], [package],
    //          [sign], [publish]]
    // @end
    return { stages, levelOfTest, levelCount };
  },
} as const;
