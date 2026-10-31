// The API documentation of the five published packages, as one site: `npm run docs` in the
// repository root, after `npm run build`, writes it to api-docs/dist, and deploy-api-docs.yml
// publishes it. Each package is read on its own, from its sources with its tsconfig.json and with
// its README, and the packages it imports from their declarations in dist, as a user sees them.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { version } = JSON.parse(readFileSync(new URL("../packages/graphity/package.json", import.meta.url), "utf8"));

// Every check that TypeDoc has, on each package and again on the merged site, where the links
// between the packages and those of overview.md resolve. Each finding is a warning, and every
// warning fails the build (treatWarningsAsErrors).
const validation = {
  notExported: true,
  notDocumented: true,
  invalidLink: true,
  invalidPath: true,
  rewrittenLink: true,
  unusedMergeModuleWith: true,
};

/** @type {Partial<import("typedoc").TypeDocOptions>} */
export default {
  entryPointStrategy: "packages",
  entryPoints: [
    "../packages/core",
    "../packages/controlflow",
    "../packages/dot",
    "../packages/mermaid",
    "../packages/graphity",
  ],
  packageOptions: {
    // What a package re-exports from another package is documented there, not again: this keeps
    // @kobayami/graphity, which re-exports the other four, to its own page.
    excludeExternals: true,
    externalPattern: ["**/node_modules/**", "**/packages/*/dist/**"],
    excludePrivate: true,
    excludeInternal: true,
    // "Defined in" links to the source on GitHub, at the tag of the release, which is named like
    // the version: the same links wherever the documentation is built.
    disableGit: true,
    displayBasePath: fileURLToPath(new URL("..", import.meta.url)),
    sourceLinkTemplate: "https://github.com/kaufco/graphity-ts/blob/{gitRevision}/{path}#L{line}",
    gitRevision: version,
    validation,
  },
  validation,
  treatWarningsAsErrors: true,

  name: `Graphity for TypeScript ${version}`,
  // The packages directly in the sidebar, not in a folder named after their scope.
  navigation: { includeFolders: false },
  readme: "overview.md",
  out: "dist",
  customFooterHtml: `Copyright &#169; 2025&#x2013;${new Date().getFullYear()} Marco Kaufmann. Apache License 2.0.`,
};
