import { type Graph, GraphBuilder } from "@kobayami/graphity";
import { SmallProgram } from "./smallProgram.js";

const RULES: readonly string[] = [
  "program", "statement", "block", "ifStatement", "assignment",
  "expression", "term", "factor", "name", "number",
];

// A rule, then the rules it uses, in the order they appear in the rule.
const USES: readonly (readonly string[])[] = [
  ["program", "statement"],
  ["statement", "block", "ifStatement", "assignment"],
  ["block", "statement"],
  ["ifStatement", "expression", "statement"],
  ["assignment", "name", "expression"],
  ["expression", "term"],
  ["term", "factor"],
  ["factor", "number", "name", "expression"],
];

/**
 * The second example domain: the grammar of a small programming language, seen as a
 * graph.
 *
 * The grammar has a rule for each construct of the language, written in EBNF (extended
 * Backus-Naur form):
 *
 * ```text
 * program     = { statement } ;
 * statement   = block | ifStatement | assignment ;
 * block       = "{" { statement } "}" ;
 * ifStatement = "if" "(" expression ")" statement ;
 * assignment  = name "=" expression ";" ;
 * expression  = term { "+" term } ;
 * term        = factor { "*" factor } ;
 * factor      = number | name | "(" expression ")" ;
 * ```
 *
 * `name` and `number` are rules for single tokens and use no other rule.
 * {@link SmallGrammar.rules} gives an edge from each rule to each rule it uses, with the
 * names in {@link SmallGrammar.ruleNames}: statements nest in statements, expressions in
 * expressions.
 *
 * Node IDs follow the order of the names. The graph never changes: the comments of the
 * examples, and the documentation that shows them, depend on every node and edge.
 */
export const SmallGrammar = {
  /**
   * Returns the rules and the rules they use: an edge from each rule to each rule it
   * uses.
   *
   * @returns 10 nodes, 14 edges
   */
  rules(): Graph {
    const builder = new GraphBuilder();
    builder.addNodes(RULES.length);
    for (const row of USES) {
      const rule = SmallGrammar.ruleOf(row[0]);
      for (let i = 1; i < row.length; i++) {
        builder.addEdge(rule, SmallGrammar.ruleOf(row[i]));
      }
    }
    return builder.build();
  },

  /**
   * Returns the names of the rules, by node ID of {@link SmallGrammar.rules}.
   *
   * @returns program, statement, block, ifStatement, assignment, expression, term,
   *     factor, name, number
   */
  ruleNames(): string[] {
    return [...RULES];
  },

  /**
   * Returns the node ID of the rule named `name`.
   *
   * @param name the name of the rule
   * @returns the node ID
   * @throws Error if no rule has this name
   */
  ruleOf(name: string): number {
    return SmallProgram.nodeOf(RULES, name);
  },
} as const;
