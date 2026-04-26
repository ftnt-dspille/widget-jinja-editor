# widget-jinja-editor

FortiSOAR widget that embeds a full Jinja editor on dashboards and record
detail pages — write, evaluate, and debug templates against real input data
without leaving SOAR.

## Features

- **Monaco editor with Jinja language support** — custom tokenizer, theme,
  bracket matching, and a 49-filter signature library powering hover docs and
  parameter hints. Two side-by-side panes: input JSON and template.
- **Live evaluation** — calls SOAR's `dynamicValueService` to render the
  template against the current input and shows the result inline; errors are
  surfaced with translated, human-readable messages instead of raw stack
  traces.
- **Inline error markers** — Monaco squiggles point at the offending line,
  including unclosed `{% %}` tags, unknown filters, missing input paths, and
  empty-record guards.
- **Variable-aware path checking** — collects names introduced by `{% set %}`,
  `{% for %}`, `{% with %}`, and `{% macro %}` so locally-bound variables
  don't get flagged as missing inputs.
- **Filter palette** — draggable, searchable browser of all available Jinja
  filters with documentation, parameters, return type, and one-click
  insertion at the cursor.
- **Example templates** — dropdown of preloaded examples (greeting, loop,
  records guard, etc.) that swap into the template pane while preserving the
  user's input JSON.
- **Record seeding for View Panel / Drawer** — a "Load record" button fetches
  the in-scope SOAR record (with `$relationships`) and exposes it under
  `vars.input.records[0]`, mirroring how SOAR widgets receive data in
  production.
- **Per-instance config via the edit form** — title, default template,
  module, and an optional `jsonSourceField` that auto-extracts a stringified
  JSON column from the record before merging.
- **Theme-aware** — picks `jinjaTheme` / `jinjaThemeLight` based on SOAR's
  active theme; re-applies on theme change.

## Layout

```
widget/        widget source (info.json, controllers, view/edit html, widgetAssets)
tests/         jest tests (run from the harness, not here)
docs/          notes / screenshots
scripts/       packager + CLI
```

## Develop

Active development happens in
[`fortisoar-widget-harness`](../fortisoar-widget-harness), which mounts this
`widget/` directory directly. Edit files in `widget/`, run the harness,
iterate. The harness picks up `info.json` version bumps without a restart.

## Test

Tests live in `tests/` here, but the **runtime is owned by the harness** —
`jest`, `jsdom`, `angular`, and `angular-mocks` are installed there, and the
harness's `jest.config.js` discovers this folder as a project automatically.

```sh
cd ../fortisoar-widget-harness
pnpm test
```

## Package

Builds a SOAR-installable `.tgz` matching the dev harness output exactly.

```sh
npm run package
# -> dist/jinjaEditorWidget-<version>.tgz
```

## Release

Bump `widget/info.json` `version` and rename the controller identifiers in
`view.controller.js` / `edit.controller.js` and the versioned `<link>` /
`<script>` paths in `view.html` to match (or use the harness's auto-fix
button). Commit to `main`. The `auto-tag` workflow creates `v<version>`,
which triggers the `release` workflow:

1. installs deps and runs tests
2. asserts tag matches `widget/info.json`
3. builds the `.tgz`
4. creates a GitHub Release with the `.tgz` attached

## Install in SOAR

Two-step install via the SOAR API:

1. `POST /api/3/solutionpacks/install` with the `.tgz`
2. `PUT /api/3/widgets/<uuid>` to publish

The harness's "Install" button does both.

## License

MIT
