import { Components } from "@kobayami/graphity";
import { SmallGrammar } from "../smallGrammar.js";

/** The groups of rules that use each other, and the number of SCCs. */
export interface Groups {
  readonly sccCount: number;
  readonly recursive: string[][];
}

/** Whether two rules are in the SCC of the expressions. */
export interface SameGroup {
  readonly expressions: number;
  readonly factorInIt: boolean;
  readonly assignmentInIt: boolean;
}

/** The rules of a grammar that use each other, found as strongly connected components. */
export const FindingMutualDependencies = {
  /** Returns the groups of rules that use each other, by their names. */
  recursiveGroups(): Groups {
    const rules = SmallGrammar.rules();
    const names = SmallGrammar.ruleNames();
    // @start region="groups"
    // Group the rules into SCCs: rules in one SCC use each other, directly or through
    // others.
    const sccs = Components.sccsOf(rules);
    const sccCount = sccs.sccCount;   // 6

    // Keep the SCCs with a cycle: those are the rules that use themselves, through each
    // other.
    const recursive: string[][] = [];
    for (let scc = 0; scc < sccs.sccCount; scc++) {
      if (sccs.containsCycle(scc)) {
        recursive.push(Array.from(sccs.nodesOf(scc), (rule) => names[rule]));
      }
    }
    // recursive: [[expression, term, factor], [statement, block, ifStatement]]
    // @end
    return { sccCount, recursive };
  },

  /** Returns whether two pairs of rules are in the same SCC. */
  sameGroup(): SameGroup {
    const sccs = Components.sccsOf(SmallGrammar.rules());
    const factor = SmallGrammar.ruleOf("factor");
    const expression = SmallGrammar.ruleOf("expression");
    const assignment = SmallGrammar.ruleOf("assignment");
    // @start region="sameGroup"
    // Two rules reach each other if they are in the same SCC.
    const expressions = sccs.sccOf(expression);                      // 2
    const factorInIt = sccs.sccOf(factor) === expressions;           // true
    const assignmentInIt = sccs.sccOf(assignment) === expressions;   // false
    // assignment uses expression, but expression does not use assignment.
    // @end
    return { expressions, factorInIt, assignmentInIt };
  },
} as const;
