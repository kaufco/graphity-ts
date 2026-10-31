/**
 * All of Graphity in one package: everything that `@kobayami/graphity-core`,
 * `@kobayami/graphity-controlflow`, `@kobayami/graphity-dot` and `@kobayami/graphity-mermaid`
 * export, at the version of this package. It is the counterpart of the Java artifact `graphity`.
 *
 * It has no code of its own. To take only what you need, depend on those packages instead, at the
 * same version.
 *
 * @packageDocumentation
 */

export * from "@kobayami/graphity-core";
export * from "@kobayami/graphity-controlflow";
export * from "@kobayami/graphity-dot";
export * from "@kobayami/graphity-mermaid";
// Both writers define the same interface; one export of it resolves the ambiguity.
export type { TextSink } from "@kobayami/graphity-dot";
