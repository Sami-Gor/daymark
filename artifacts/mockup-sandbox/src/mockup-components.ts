/*
 * Lazy module map for the mockup sandbox, resolved statically by Vite through
 * `import.meta.glob`. No executable source is generated at build time: the
 * previous build-time discovery plugin (which string-built `import()` calls
 * from discovered paths) has been removed.
 *
 * The underscore-prefixed exclusions mirror the original discovery rules:
 * files and directories starting with `_` are not preview targets.
 */
type ModuleMap = Record<string, () => Promise<Record<string, unknown>>>;

const discovered = import.meta.glob([
  "./components/mockups/**/*.tsx",
  "!./components/mockups/**/_*/**",
  "!./components/mockups/**/_*.tsx",
]);

export const modules: ModuleMap = Object.fromEntries(
  Object.entries(discovered).map(([file, load]) => [
    file,
    load as () => Promise<Record<string, unknown>>,
  ]),
);
