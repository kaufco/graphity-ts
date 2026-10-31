import { Components, type Graph, Graphs, type SortedIntView } from "@kobayami/graphity";
import { SmallGrammar } from "../smallGrammar.js";

/**
 * The condensed graph of the rules, a name for each of its nodes, and what statement
 * uses.
 */
export interface Condensed {
  readonly graph: Graph;
  readonly acyclic: boolean;
  readonly groupNames: string[];
  readonly usedByStatements: SortedIntView;
}

/**
 * The rules of a grammar, each group of rules that use each other condensed into one
 * node.
 */
export const CondensingCycles = {
  /** Returns the condensed graph of the rules and the names of its nodes. */
  condense(): Condensed {
    const rules = SmallGrammar.rules();
    const names = SmallGrammar.ruleNames();
    const statement = SmallGrammar.ruleOf("statement");
    // @start region="condense"
    // Condense each group of rules that use each other into one node.
    const sccs = Components.sccsOf(rules);
    const condensed = sccs.condense();
    const acyclic = Graphs.isDag(condensed);   // true
    // condensed: 0 -> [], 1 -> [], 2 -> [0, 1], 3 -> [0, 2], 4 -> [2, 3], 5 -> [4]

    // Name each node of the condensed graph after the rules in it.
    const groupNames = new Array<string>(sccs.sccCount);
    for (let scc = 0; scc < sccs.sccCount; scc++) {
      groupNames[scc] = Array.from(sccs.nodesOf(scc), (rule) => names[rule]).join("/");
    }
    // groupNames: [name, number, expression/term/factor, assignment,
    //              statement/block/ifStatement, program]

    // Which groups does the group of statement use? The out-nodes of its node.
    const usedByStatements = condensed.outNodes(sccs.sccOf(statement));
    // usedByStatements: [2, 3] - expression/term/factor and assignment
    // @end
    return { graph: condensed, acyclic, groupNames, usedByStatements };
  },
} as const;
