# widget-jinja-editor

FortiSOAR widget that embeds the Jinja editor for writing, evaluating, and debugging templates from any dashboard or record detail page.

## Layout

```
widget/    widget source (info.json, controllers, view/edit html, widgetAssets)
tests/     jest tests (jsdom)
docs/      additional notes / screenshots
scripts/   packager + CLI
```

## Develop

Active development happens in the dev harness in `fsr_all_widgets`, which mounts this `widget/` directory directly. Edit files in `widget/`, run the harness, iterate.

## Test

```sh
npm install
npm test
```

## Package

Builds a SOAR-installable `.tgz` matching the dev harness output exactly.

```sh
npm run package
# -> dist/jinjaEditorWidget-<version>.tgz
```

## Release

Bump `widget/info.json` `version`, commit to `main`. The `auto-tag` workflow creates `v<version>`, which triggers the `release` workflow:

1. installs deps and runs tests
2. asserts tag matches `widget/info.json`
3. builds the `.tgz`
4. creates a GitHub Release with the `.tgz` attached (source zip/tar.gz are auto-attached by GitHub)

## Install in SOAR

Two-step install via the SOAR API:

1. `POST /api/3/solutionpacks/install` with the `.tgz`
2. `PUT /api/3/widgets/<uuid>` to publish

## License

MIT
