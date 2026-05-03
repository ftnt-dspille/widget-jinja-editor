"use strict";
// Controller tests — jsdom project (see jest.config.js).
//
// In jest-environment-jsdom, global === window, so browser globals set here
// (angular, document, window.JinjaEditorWidget) are visible to required
// modules. The controller file is a browser IIFE; requiring it here executes
// the IIFE and registers the controller on the cybersponse angular module,
// exactly as a <script> tag would in the browser.

// angular-mocks gates angular.mock.module/inject behind a
// `(function(jasmineOrMocha) { if (!jasmineOrMocha) return; ... })(window.jasmine || window.mocha)`
// guard. Jest uses neither Jasmine nor Mocha, so we must set a truthy stub
// before requiring angular-mocks. The block uses window.beforeEach /
// window.afterEach for lifecycle hooks (which are Jest's own globals), so
// no actual Jasmine API is called — only the truthiness check matters.
global.jasmine = global.jasmine || {};

// Bootstrap angular BEFORE registering cybersponse or loading the controller.
require("angular");
require("angular-mocks");

// Minimal Monaco stub. The controller gates editors behind ng-if="monacoReady"
// so only the surface area actually called in tests is needed.
global.monaco = {
  editor: {
    create: jest.fn(() => ({
      getValue: jest.fn(() => ""),
      setValue: jest.fn(),
      getModel: jest.fn(() => ({ getLanguageId: () => "json" })),
      getSelection: jest.fn(() => ({})),
      executeEdits: jest.fn(),
      getContribution: jest.fn(() => null),
      focus: jest.fn(),
      onDidChangeModelContent: jest.fn(() => ({ dispose: jest.fn() })),
      dispose: jest.fn(),
    })),
    defineTheme: jest.fn(),
    setTheme: jest.fn(),
    // Tracks the last marker set per owner so getModelMarkers can return it —
    // appendServerErrorMarker reads existing markers before re-applying.
    __markersByOwner: {},
    setModelMarkers: jest.fn(function (model, owner, markers) {
      this.__markersByOwner[owner] = markers.slice();
    }),
    getModelMarkers: jest.fn(function (filter) {
      const owner = (filter && filter.owner) || null;
      if (owner) return (this.__markersByOwner[owner] || []).slice();
      return Object.keys(this.__markersByOwner).reduce(
        (acc, k) => acc.concat(this.__markersByOwner[k]), []);
    }),
  },
  MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
  languages: {
    register: jest.fn(),
    setMonarchTokensProvider: jest.fn(),
    registerCompletionItemProvider: jest.fn(),
    registerHoverProvider: jest.fn(),
    CompletionItemKind: { Function: 2, Keyword: 17, Snippet: 27 },
  },
};

// Pre-populate JinjaEditorWidget so ensureWidgetModules() sees all modules as
// already loaded and returns Promise.resolve() instead of injecting <script>
// tags (which jsdom doesn't execute). The filterSignatures here are what the
// palette tests exercise.
global.JinjaEditorWidget = {
  monaco: {
    ensure: jest.fn(() => Promise.resolve(global.monaco)),
    enhanceEditor: jest.fn(),
    setInputContext: jest.fn(),
  },
  filterSignatures: {
    default: {
      category: "Value",
      documentation: "Returns a default value if the variable is undefined.",
      parameters: [{ name: "default_value", type: "any", description: "Fallback." }],
      returnValue: { type: "any", description: "Value or fallback." },
    },
    upper: {
      category: "String",
      documentation: "Converts a string to uppercase.",
      example: "{{ vars.input.records[0].name | upper }}",
      parameters: [],
      returnValue: { type: "string", description: "Uppercase string." },
    },
    lower: {
      category: "String",
      documentation: "Converts a string to lowercase.",
      example: "{{ vars.input.records[0].name | lower }}",
      parameters: [],
      returnValue: { type: "string", description: "Lowercase string." },
    },
    replace: {
      category: "String",
      documentation: "Replaces a substring.",
      parameters: [
        { name: "old", type: "string", description: "Substring to find." },
        { name: "new", type: "string", description: "Replacement." },
      ],
      returnValue: { type: "string", description: "Updated string." },
    },
    length: {
      category: "Collection",
      documentation: "Returns the length of a sequence.",
      parameters: [],
      returnValue: { type: "number", description: "Length." },
    },
    join: {
      category: "Collection",
      documentation: "Joins a list into a string.",
      parameters: [{ name: "separator", type: "string", description: "Separator." }],
      returnValue: { type: "string", description: "Joined string." },
    },
  },
  snippets: [{ label: "for loop", insertText: "{% for item in items %}$0{% endfor %}" }],
  templateExamples: [
    {
      id: "greeting",
      label: "Greeting",
      description: "Simple variable.",
      template: "Hello, {{ vars.input.records[0].name | default('stranger') }}!",
      input: { vars: { input: { records: [{ name: "Ada" }] } } },
    },
    {
      id: "loop",
      label: "Loop",
      description: "Iterate records.",
      template: "{% for r in vars.input.records %}- {{ r.name }}\n{% endfor %}",
      input: { vars: { input: { records: [{ name: "alpha" }, { name: "beta" }] } } },
    },
  ],
  filterCategoryOrder: ["String", "Collection", "Value", "Other"],
  languageDefinition: { tokenizer: {} },
};

// angular is now available as a global (set by require('angular') above).
// Register cybersponse before the controller IIFE runs.
angular.module("cybersponse", []); // eslint-disable-line no-undef

// Side-effect require: executes the controller IIFE, registering the
// versioned controller (e.g. jinjaEditorWidget1114DevCtrl for v1.1.14)
// against the cybersponse module.
require("../widget/view.controller.js");

// Derive controller name from info.json so a version bump doesn't drift
// the test out of sync with the registered controller. Pattern matches
// the harness's deriveViewControllerName: "<name><versionDigits>DevCtrl",
// where versionDigits strips dots from the semver string.
const widgetInfo = require("../widget/info.json");
const CTRL_NAME =
  widgetInfo.name + widgetInfo.version.replace(/\./g, "") + "DevCtrl";

// Capture angular after both require('angular') and require('angular-mocks')
// have run. angular-mocks adds .mock to window.angular in the same tick.
const ng = window.angular; // eslint-disable-line no-undef
const ngModule = window.angular.mock.module; // eslint-disable-line no-undef
const ngInject = window.angular.mock.inject; // eslint-disable-line no-undef

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------
let $rootScope, $controller, $timeout, $q;

beforeEach(() => {
  ngModule("cybersponse", ($provide) => {
    $provide.value("config", { title: "Test", defaultTemplate: "" });
    $provide.value("$state", { current: { name: "main.dashboard" }, params: {} });
    $provide.factory("toaster", () => ({
      success: jest.fn(),
      error: jest.fn(),
      warning: jest.fn(),
      info: jest.fn(),
    }));
    $provide.factory("CommonUtils", () => ({
      copyToClipboard: jest.fn(),
    }));
    $provide.factory("Modules", (_$q_) => {
      function Modules() {}
      Modules.prototype.get = jest.fn(() => ({ $promise: _$q_.defer().promise }));
      return Modules;
    });
    $provide.factory("dynamicValueService", (_$q_) => ({
      evaluateJinja: jest.fn(() => _$q_.defer().promise),
    }));
  });

  ngInject((_$rootScope_, _$controller_, _$timeout_, _$q_) => {
    $rootScope = _$rootScope_;
    $controller = _$controller_;
    $timeout = _$timeout_;
    $q = _$q_;
  });
});

afterEach(() => {
  try { $timeout.verifyNoPendingTasks(); } catch (_) {}
});

// Creates a fresh controller instance with injectable overrides.
function createCtrl({ config = {}, state = {}, services = {} } = {}) {
  const scope = $rootScope.$new();

  const toaster = Object.assign(
    { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() },
    services.toaster
  );
  const CommonUtils = Object.assign({ copyToClipboard: jest.fn() }, services.CommonUtils);

  let Modules, dynamicValueService;
  ngInject((_Modules_, _dynamicValueService_) => {
    Modules = services.Modules || _Modules_;
    dynamicValueService = services.dynamicValueService || _dynamicValueService_;
  });

  $controller(CTRL_NAME, {
    $scope: scope,
    config: Object.assign({ title: "Test", defaultTemplate: "" }, config),
    $state: Object.assign({ current: { name: "main.dashboard" }, params: {} }, state),
    toaster,
    CommonUtils,
    Modules,
    dynamicValueService,
  });

  return { scope, toaster, CommonUtils };
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
describe("controller initialization", () => {
  test("sets initial scope flags correctly", () => {
    const { scope } = createCtrl();
    expect(scope.processing).toBe(false);
    expect(scope.loadingRecord).toBe(false);
    expect(scope.isErrorOutput).toBe(false);
    expect(scope.monacoReady).toBe(false);
    expect(scope.filterPaletteOpen).toBe(false);
    expect(scope.output).toBeNull();
  });

  test("initializes inputJsonText with vars.input.records shape", () => {
    const { scope } = createCtrl();
    const parsed = JSON.parse(scope.inputJsonText);
    expect(parsed).toHaveProperty("vars.input.records");
    expect(Array.isArray(parsed.vars.input.records)).toBe(true);
  });

  test("sets templateText from config.defaultTemplate", () => {
    const { scope } = createCtrl({ config: { defaultTemplate: "Hello {{ name }}" } });
    expect(scope.templateText).toBe("Hello {{ name }}");
  });

  test("isViewPanel is false on dashboard state", () => {
    const { scope } = createCtrl({ state: { current: { name: "main.dashboard" }, params: {} } });
    expect(scope.isViewPanel).toBe(false);
  });

  test("isViewPanel is true when state name contains viewPanel", () => {
    const { scope } = createCtrl({ state: { current: { name: "main.viewPanel.detail" }, params: {} } });
    expect(scope.isViewPanel).toBe(true);
  });

  test("exposes fallback templateExamples before monaco resolves", () => {
    const { scope } = createCtrl();
    expect(Array.isArray(scope.templateExamples)).toBe(true);
    expect(scope.templateExamples.length).toBeGreaterThan(0);
  });

  test("exposes all required scope functions", () => {
    const { scope } = createCtrl();
    for (const fn of [
      "submit", "formatInput", "applyExample", "copyTemplate",
      "loadCurrentRecord", "toggleFilterPalette", "closeFilterPalette",
      "insertFilter", "rebuildFilterGroups", "paramSummary",
      "totalFilterCount", "handleFilterSearchKey",
    ]) {
      expect(typeof scope[fn]).toBe("function");
    }
  });
});

// ---------------------------------------------------------------------------
// submit()
// ---------------------------------------------------------------------------
describe("submit()", () => {
  test("shows warning toaster when template is empty", () => {
    const { scope, toaster } = createCtrl();
    scope.templateText = "";
    scope.submit();
    expect(toaster.warning).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("required") })
    );
    expect(scope.processing).toBe(false);
  });

  test("sets isErrorOutput when input JSON is malformed", () => {
    const { scope } = createCtrl();
    scope.templateText = "Hello {{ name }}";
    scope.inputJsonText = "{ bad json";
    scope.submit();
    expect(scope.isErrorOutput).toBe(true);
    expect(scope.output).toMatch(/malformed/i);
    expect(scope.processing).toBe(false);
  });

  test("calls evaluateJinja with parsed input values", () => {
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope } = createCtrl({ services: { dynamicValueService: { evaluateJinja } } });

    scope.templateText = "Hello {{ vars.input.records[0].name }}";
    scope.inputJsonText = JSON.stringify({ vars: { input: { records: [{ name: "Ada" }] } } });
    scope.submit();

    expect(evaluateJinja).toHaveBeenCalledWith({
      template: scope.templateText,
      values: { vars: { input: { records: [{ name: "Ada" }] } } },
    });
    expect(scope.processing).toBe(true);
  });

  test("sets output and clears error flag on success", () => {
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope } = createCtrl({ services: { dynamicValueService: { evaluateJinja } } });

    scope.templateText = "Hello Ada";
    scope.inputJsonText = "{}";
    scope.submit();
    d.resolve({ result: "Hello Ada" });
    $rootScope.$apply();

    expect(scope.output).toBe("Hello Ada");
    expect(scope.isErrorOutput).toBe(false);
    expect(scope.processing).toBe(false);
  });

  test("sets isErrorOutput with API error message on failure", () => {
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope } = createCtrl({ services: { dynamicValueService: { evaluateJinja } } });

    scope.templateText = "{{ bad | filter }}";
    scope.inputJsonText = "{}";
    scope.submit();
    d.reject({ statusText: "Bad Request", data: { message: "Jinja syntax error at line 1" } });
    $rootScope.$apply();

    expect(scope.isErrorOutput).toBe(true);
    expect(scope.output).toMatch(/Jinja syntax error/);
    expect(scope.processing).toBe(false);
  });

  test("falls back to statusText when data.message is absent", () => {
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope } = createCtrl({ services: { dynamicValueService: { evaluateJinja } } });

    scope.templateText = "{{ x }}";
    scope.inputJsonText = "{}";
    scope.submit();
    d.reject({ statusText: "Internal Server Error", data: {} });
    $rootScope.$apply();

    expect(scope.output).toMatch(/Internal Server Error/);
  });

  test("clears processing flag on resolve (finally)", () => {
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope } = createCtrl({ services: { dynamicValueService: { evaluateJinja } } });

    scope.templateText = "x";
    scope.inputJsonText = "{}";
    scope.submit();
    expect(scope.processing).toBe(true);
    d.resolve({ result: "x" });
    $rootScope.$apply();
    expect(scope.processing).toBe(false);
  });

  test("treats empty inputJsonText as an empty object", () => {
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope } = createCtrl({ services: { dynamicValueService: { evaluateJinja } } });

    scope.templateText = "Hello";
    scope.inputJsonText = "";
    scope.submit();

    expect(evaluateJinja).toHaveBeenCalledWith(
      expect.objectContaining({ values: {} })
    );
  });

  test("submit uses the editor's live content, not the stale scope value", () => {
    // Regression: insertFilter modifies the Monaco editor directly but never
    // updates $scope.templateText. submit() must read templateEditor.getValue()
    // so that filters inserted after applyExample() are included in the render.
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope } = createCtrl({ services: { dynamicValueService: { evaluateJinja } } });

    // Simulate applyExample setting $scope.templateText.
    scope.templateText = "Hello {{ vars.input.records[0].name }}";
    scope.inputJsonText = "{}";

    // Simulate insertFilter modifying the editor directly (editor drifts ahead
    // of $scope.templateText, which is the bug).
    const editorContent = "Hello {{ vars.input.records[0].name | upper }}";
    const mockEditor = {
      getValue: jest.fn(() => editorContent),
      setValue: jest.fn(),
      getModel: jest.fn(() => ({ getLanguageId: () => "jinja2" })),
      getSelection: jest.fn(() => ({})),
      executeEdits: jest.fn(),
      getContribution: jest.fn(() => null),
      focus: jest.fn(),
      onDidChangeModelContent: jest.fn(() => ({ dispose: jest.fn() })),
    };
    scope.onTemplateEditorReady(mockEditor);

    scope.submit();

    expect(evaluateJinja).toHaveBeenCalledWith(
      expect.objectContaining({ template: editorContent })
    );
  });
});

// ---------------------------------------------------------------------------
// formatInput()
// ---------------------------------------------------------------------------
describe("formatInput()", () => {
  test("pretty-prints valid compact JSON", () => {
    const { scope } = createCtrl();
    scope.inputJsonText = '{"a":1,"b":2}';
    scope.formatInput();
    const parsed = JSON.parse(scope.inputJsonText);
    expect(parsed).toEqual({ a: 1, b: 2 });
    expect(scope.inputJsonText).toContain("\n");
    expect(scope.inputJsonError).toBeNull();
  });

  test("sets inputJsonError and warns toaster on invalid JSON", () => {
    const { scope, toaster } = createCtrl();
    scope.inputJsonText = "{ bad json";
    scope.formatInput();
    expect(scope.inputJsonError).toBeTruthy();
    expect(toaster.warning).toHaveBeenCalled();
  });

  test("clears inputJsonError and returns early when input is empty", () => {
    const { scope } = createCtrl();
    scope.inputJsonText = "";
    scope.inputJsonError = "stale error";
    scope.formatInput();
    expect(scope.inputJsonError).toBeNull();
  });

  test("preserves nested objects through a format round-trip", () => {
    const { scope } = createCtrl();
    const obj = { vars: { input: { records: [{ name: "Ada", score: 42 }] } } };
    scope.inputJsonText = JSON.stringify(obj);
    scope.formatInput();
    expect(JSON.parse(scope.inputJsonText)).toEqual(obj);
  });
});

// ---------------------------------------------------------------------------
// applyExample()
// ---------------------------------------------------------------------------
describe("applyExample()", () => {
  function flushMonacoSetup() {
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}
  }

  test("sets templateText and inputJsonText from a known example", () => {
    const { scope } = createCtrl();
    flushMonacoSetup();

    const ex = scope.templateExamples[0];
    scope.applyExample(ex.id);

    expect(scope.templateText).toBe(ex.template);
    expect(JSON.parse(scope.inputJsonText)).toEqual(ex.input);
    expect(scope.output).toBeNull();
    expect(scope.isErrorOutput).toBe(false);
    expect(scope.inputJsonError).toBeNull();
  });

  test("resets the dropdown selection after applying", () => {
    const { scope } = createCtrl();
    flushMonacoSetup();

    const ex = scope.templateExamples[0];
    scope.selectedExampleId = ex.id;
    scope.applyExample(ex.id);
    $timeout.flush();
    expect(scope.selectedExampleId).toBe("");
  });

  test("does nothing when exampleId is empty string", () => {
    const { scope } = createCtrl();
    scope.templateText = "original";
    scope.applyExample("");
    expect(scope.templateText).toBe("original");
  });

  test("does nothing for an unknown exampleId", () => {
    const { scope } = createCtrl();
    scope.templateText = "original";
    scope.applyExample("no-such-example");
    expect(scope.templateText).toBe("original");
  });
});

// ---------------------------------------------------------------------------
// Filter palette
// ---------------------------------------------------------------------------
describe("filter palette", () => {
  test("toggleFilterPalette opens the palette and populates groups", () => {
    const { scope } = createCtrl();
    scope.toggleFilterPalette();
    // Group population is deferred via $timeout (see view.controller.js
    // toggleFilterPalette — it reads the live DOM input value after the
    // next digest cycle). Flush the timeout so assertions see the result.
    $timeout.flush();
    expect(scope.filterPaletteOpen).toBe(true);
    expect(scope.filterPaletteGroups.length).toBeGreaterThan(0);
  });

  test("toggleFilterPalette closes when already open", () => {
    const { scope } = createCtrl();
    scope.toggleFilterPalette();
    $timeout.flush();
    scope.toggleFilterPalette();
    expect(scope.filterPaletteOpen).toBe(false);
  });

  test("closeFilterPalette closes but preserves the query", () => {
    const { scope } = createCtrl();
    scope.toggleFilterPalette();
    $timeout.flush();
    scope.filterPaletteQuery = "upper";
    scope.closeFilterPalette();
    // Implementation deliberately preserves filterPaletteQuery so reopening
    // the palette restores the user's last search (see comment in
    // closeFilterPalette in view.controller.js).
    expect(scope.filterPaletteOpen).toBe(false);
    expect(scope.filterPaletteQuery).toBe("upper");
  });

  test("closeFilterPalette is a no-op when already closed", () => {
    const { scope } = createCtrl();
    expect(() => scope.closeFilterPalette()).not.toThrow();
    expect(scope.filterPaletteOpen).toBe(false);
  });

  test("rebuildFilterGroups narrows results by name substring", () => {
    const { scope } = createCtrl();
    scope.filterPaletteQuery = "upper";
    scope.rebuildFilterGroups();
    const names = scope.filterPaletteGroups.flatMap((g) => g.filters.map((f) => f.name));
    expect(names).toContain("upper");
    expect(names).not.toContain("lower");
  });

  test("rebuildFilterGroups with empty query returns all filters", () => {
    const { scope } = createCtrl();
    scope.filterPaletteQuery = "";
    scope.rebuildFilterGroups();
    const names = scope.filterPaletteGroups.flatMap((g) => g.filters.map((f) => f.name));
    expect(names).toContain("upper");
    expect(names).toContain("lower");
    expect(names).toContain("default");
    expect(names).toContain("replace");
  });

  test("filters within each group are sorted alphabetically", () => {
    const { scope } = createCtrl();
    scope.rebuildFilterGroups();
    for (const group of scope.filterPaletteGroups) {
      const names = group.filters.map((f) => f.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    }
  });

  test("String category appears before Collection in default order", () => {
    const { scope } = createCtrl();
    scope.rebuildFilterGroups();
    const cats = scope.filterPaletteGroups.map((g) => g.category);
    const si = cats.indexOf("String");
    const ci = cats.indexOf("Collection");
    if (si !== -1 && ci !== -1) expect(si).toBeLessThan(ci);
  });

  test("totalFilterCount sums all filters across groups", () => {
    const { scope } = createCtrl();
    scope.rebuildFilterGroups();
    const total = scope.totalFilterCount(scope.filterPaletteGroups);
    const manual = scope.filterPaletteGroups.reduce((sum, g) => sum + g.filters.length, 0);
    expect(total).toBe(manual);
    expect(total).toBeGreaterThan(0);
  });

  test("paramSummary formats params as name: type pairs", () => {
    const { scope } = createCtrl();
    expect(scope.paramSummary([
      { name: "sep", type: "string" },
      { name: "count", type: "number" },
    ])).toBe("sep: string, count: number");
  });

  test("paramSummary returns empty string for empty or null params", () => {
    const { scope } = createCtrl();
    expect(scope.paramSummary([])).toBe("");
    expect(scope.paramSummary(null)).toBe("");
  });

  test("handleFilterSearchKey ignores non-Enter keys", () => {
    const { scope } = createCtrl();
    scope.toggleFilterPalette();
    const insertFilter = jest.spyOn(scope, "insertFilter");
    scope.handleFilterSearchKey({ key: "ArrowDown", preventDefault: jest.fn() });
    expect(insertFilter).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// copyTemplate()
// ---------------------------------------------------------------------------
describe("copyTemplate()", () => {
  test("calls CommonUtils.copyToClipboard with the current template", () => {
    const copyToClipboard = jest.fn();
    const { scope, toaster } = createCtrl({ services: { CommonUtils: { copyToClipboard } } });
    scope.templateText = "Hello {{ name }}";
    scope.copyTemplate();
    expect(copyToClipboard).toHaveBeenCalledWith("Hello {{ name }}");
    expect(toaster.success).toHaveBeenCalled();
  });

  test("does nothing when templateText is empty", () => {
    const copyToClipboard = jest.fn();
    const { scope } = createCtrl({ services: { CommonUtils: { copyToClipboard } } });
    scope.templateText = "";
    scope.copyTemplate();
    expect(copyToClipboard).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// loadCurrentRecord()
// ---------------------------------------------------------------------------
describe("loadCurrentRecord()", () => {
  test("warns when no module/id params exist", () => {
    const { scope, toaster } = createCtrl({
      state: { current: { name: "main.viewPanel" }, params: {} },
    });
    scope.loadCurrentRecord();
    expect(toaster.warning).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("No record") })
    );
    expect(scope.loadingRecord).toBe(false);
  });

  test("sets loadingRecord=true while the request is in-flight", () => {
    const d = $q.defer();
    const ModulesClass = function () {};
    ModulesClass.get = jest.fn(() => ({ $promise: d.promise }));

    const { scope } = createCtrl({
      state: { current: { name: "main.viewPanel" }, params: { module: "alerts", id: "1" } },
      services: { Modules: ModulesClass },
    });

    scope.loadCurrentRecord();
    expect(scope.loadingRecord).toBe(true);
    d.resolve({ id: "1" });
    $rootScope.$apply();
    expect(scope.loadingRecord).toBe(false);
  });

  test("populates inputJsonText with the fetched record on success", () => {
    const d = $q.defer();
    const ModulesClass = function () {};
    ModulesClass.get = jest.fn(() => ({ $promise: d.promise }));

    const { scope } = createCtrl({
      state: { current: { name: "main.viewPanel" }, params: { module: "alerts", id: "42" } },
      services: { Modules: ModulesClass },
    });

    scope.loadCurrentRecord();
    d.resolve({ id: "42", severity: "High" });
    $rootScope.$apply();

    const payload = JSON.parse(scope.inputJsonText);
    expect(payload.vars.input.records[0].id).toBe("42");
    expect(payload.vars.input.records[0].severity).toBe("High");
  });

  test("clears inputJsonError after a successful load", () => {
    const d = $q.defer();
    const ModulesClass = function () {};
    ModulesClass.get = jest.fn(() => ({ $promise: d.promise }));

    const { scope } = createCtrl({
      state: { current: { name: "main.viewPanel" }, params: { module: "alerts", id: "1" } },
      services: { Modules: ModulesClass },
    });

    scope.inputJsonError = "stale error";
    scope.loadCurrentRecord();
    d.resolve({ id: "1" });
    $rootScope.$apply();
    expect(scope.inputJsonError).toBeNull();
  });

  test("shows error toaster and clears loadingRecord on failure", () => {
    const d = $q.defer();
    const ModulesClass = function () {};
    ModulesClass.get = jest.fn(() => ({ $promise: d.promise }));
    const toaster = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };

    const { scope } = createCtrl({
      state: { current: { name: "main.viewPanel" }, params: { module: "alerts", id: "1" } },
      services: { Modules: ModulesClass, toaster },
    });

    scope.loadCurrentRecord();
    d.reject({ status: 404, statusText: "Not Found" });
    $rootScope.$apply();

    expect(scope.loadingRecord).toBe(false);
    expect(toaster.error).toHaveBeenCalled();
  });

  test("merges config.jsonSourceField object into vars.input", () => {
    const d = $q.defer();
    const ModulesClass = function () {};
    ModulesClass.get = jest.fn(() => ({ $promise: d.promise }));

    const { scope } = createCtrl({
      config: { jsonSourceField: "sourcedata" },
      state: { current: { name: "main.viewPanel" }, params: { module: "alerts", id: "1" } },
      services: { Modules: ModulesClass },
    });

    scope.loadCurrentRecord();
    d.resolve({ id: "1", sourcedata: JSON.stringify({ origin: "siem", count: 5 }) });
    $rootScope.$apply();

    const payload = JSON.parse(scope.inputJsonText);
    expect(payload.vars.input.origin).toBe("siem");
    expect(payload.vars.input.count).toBe(5);
  });

  test("errors toaster when jsonSourceField value is invalid JSON", () => {
    const d = $q.defer();
    const ModulesClass = function () {};
    ModulesClass.get = jest.fn(() => ({ $promise: d.promise }));
    const toaster = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };

    const { scope } = createCtrl({
      config: { jsonSourceField: "sourcedata" },
      state: { current: { name: "main.viewPanel" }, params: { module: "alerts", id: "1" } },
      services: { Modules: ModulesClass, toaster },
    });

    scope.loadCurrentRecord();
    d.resolve({ id: "1", sourcedata: "{ bad json" });
    $rootScope.$apply();

    expect(toaster.error).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("not valid JSON") })
    );
  });
});

// ---------------------------------------------------------------------------
// applyExample() — input JSON seeding
// ---------------------------------------------------------------------------
describe("applyExample() input seeding", () => {
  function flushMonacoSetup() {
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}
  }

  test("sets inputJsonText to example.input when present", () => {
    const { scope } = createCtrl();
    flushMonacoSetup();

    const ex = scope.templateExamples[0]; // greeting — has input field
    scope.applyExample(ex.id);

    expect(JSON.parse(scope.inputJsonText)).toEqual(ex.input);
    expect(scope.inputJsonError).toBeNull();
  });

  test("clears inputJsonError when applying an example", () => {
    const { scope } = createCtrl();
    flushMonacoSetup();
    scope.inputJsonError = "stale error";
    scope.applyExample(scope.templateExamples[0].id);
    expect(scope.inputJsonError).toBeNull();
  });

  test("different examples load their own input payloads", () => {
    const { scope } = createCtrl();
    flushMonacoSetup();

    const [ex0, ex1] = scope.templateExamples;
    scope.applyExample(ex0.id);
    expect(JSON.parse(scope.inputJsonText)).toEqual(ex0.input);

    scope.applyExample(ex1.id);
    expect(JSON.parse(scope.inputJsonText)).toEqual(ex1.input);
  });

  test("clears savedInputJson so revert button is hidden after an example load", () => {
    const { scope } = createCtrl();
    flushMonacoSetup();
    scope.savedInputJson = '{"old":"data"}';
    scope.applyExample(scope.templateExamples[0].id);
    expect(scope.savedInputJson).toBeNull();
  });

  test("submit() uses the example input, not the prior inputJsonText", () => {
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope } = createCtrl({ services: { dynamicValueService: { evaluateJinja } } });
    flushMonacoSetup();

    scope.inputJsonText = JSON.stringify({ vars: { input: { records: [{ name: "OldName" }] } } });
    const ex = scope.templateExamples[0]; // greeting — input has name "Ada"
    scope.applyExample(ex.id);
    scope.submit();

    expect(evaluateJinja).toHaveBeenCalledWith(
      expect.objectContaining({ values: ex.input })
    );
  });
});

// ---------------------------------------------------------------------------
// insertFilterExample() and revertFilterInput()
// ---------------------------------------------------------------------------
describe("insertFilterExample() and revertFilterInput()", () => {
  // Returns a scope with monacoReady=true and both editors wired.
  function createReadyCtrl(services = {}) {
    const { scope, toaster, CommonUtils } = createCtrl({ services });
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}

    // Simulate the monacoEditor directive calling editorChanged for each editor.
    const mockInputEditor = {
      getValue: jest.fn(() => scope.inputJsonText),
      setValue: jest.fn((v) => { scope.inputJsonText = v; }),
      getModel: jest.fn(() => ({ getLanguageId: () => "json" })),
    };
    const mockTemplateEditor = {
      getValue: jest.fn(() => scope.templateText),
      setValue: jest.fn((v) => { scope.templateText = v; }),
      getModel: jest.fn(() => ({ getLanguageId: () => "jinja2" })),
      getSelection: jest.fn(() => ({})),
      executeEdits: jest.fn(),
      getContribution: jest.fn(() => null),
      focus: jest.fn(),
      onDidChangeModelContent: jest.fn(() => ({ dispose: jest.fn() })),
    };
    scope.onInputEditorReady(mockInputEditor);
    scope.onTemplateEditorReady(mockTemplateEditor);
    return { scope, toaster, CommonUtils, mockInputEditor, mockTemplateEditor };
  }

  test("insertFilterExample updates inputJsonText to FILTER_EXAMPLE_INPUT", () => {
    const { scope } = createReadyCtrl();
    const originalInput = scope.inputJsonText;
    scope.insertFilterExample("upper");

    expect(scope.inputJsonText).not.toBe(originalInput);
    const parsed = JSON.parse(scope.inputJsonText);
    expect(parsed).toHaveProperty("vars.input.records");
    expect(parsed.vars.input.records.length).toBeGreaterThan(0);
  });

  test("insertFilterExample calls setValue on the input editor", () => {
    const { scope, mockInputEditor } = createReadyCtrl();
    scope.insertFilterExample("upper");
    expect(mockInputEditor.setValue).toHaveBeenCalled();
    const setArg = mockInputEditor.setValue.mock.calls[0][0];
    expect(JSON.parse(setArg)).toHaveProperty("vars.input.records");
  });

  test("insertFilterExample saves the original inputJsonText as savedInputJson", () => {
    const { scope } = createReadyCtrl();
    const original = scope.inputJsonText;
    scope.insertFilterExample("upper");
    expect(scope.savedInputJson).toBe(original);
  });

  test("second insertFilterExample does not overwrite savedInputJson", () => {
    const { scope } = createReadyCtrl();
    const original = scope.inputJsonText;
    scope.insertFilterExample("upper");
    scope.insertFilterExample("lower");
    expect(scope.savedInputJson).toBe(original);
  });

  test("insertFilterExample clears inputJsonError", () => {
    const { scope } = createReadyCtrl();
    scope.inputJsonError = "stale error";
    scope.insertFilterExample("upper");
    expect(scope.inputJsonError).toBeNull();
  });

  test("insertFilterExample is a no-op for unknown filter names", () => {
    const { scope } = createReadyCtrl();
    const before = scope.inputJsonText;
    scope.insertFilterExample("no_such_filter");
    expect(scope.inputJsonText).toBe(before);
    expect(scope.savedInputJson).toBeNull();
  });

  test("revertFilterInput restores the original inputJsonText", () => {
    const { scope } = createReadyCtrl();
    const original = scope.inputJsonText;
    scope.insertFilterExample("upper");
    expect(scope.inputJsonText).not.toBe(original);
    scope.revertFilterInput();
    expect(scope.inputJsonText).toBe(original);
  });

  test("revertFilterInput clears savedInputJson after restoring", () => {
    const { scope } = createReadyCtrl();
    scope.insertFilterExample("upper");
    scope.revertFilterInput();
    expect(scope.savedInputJson).toBeNull();
  });

  test("revertFilterInput after two tries still restores the original", () => {
    const { scope } = createReadyCtrl();
    const original = scope.inputJsonText;
    scope.insertFilterExample("upper");
    scope.insertFilterExample("lower");
    scope.revertFilterInput();
    expect(scope.inputJsonText).toBe(original);
  });

  test("revertFilterInput is a no-op when nothing was saved", () => {
    const { scope } = createReadyCtrl();
    const before = scope.inputJsonText;
    scope.revertFilterInput();
    expect(scope.inputJsonText).toBe(before);
  });

  test("submit() after insertFilterExample sends the filter example input to the API", () => {
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope } = createReadyCtrl({ dynamicValueService: { evaluateJinja } });

    scope.templateText = "{{ vars.input.records[0].name | upper }}";
    scope.insertFilterExample("upper");
    scope.submit();

    expect(evaluateJinja).toHaveBeenCalled();
    const { values } = evaluateJinja.mock.calls[0][0];
    expect(values).toHaveProperty("vars.input.records");
    expect(values.vars.input.records.length).toBeGreaterThan(0);
  });

  test("loadCurrentRecord clears savedInputJson", () => {
    const d = $q.defer();
    const ModulesClass = function () {};
    ModulesClass.get = jest.fn(() => ({ $promise: d.promise }));

    const { scope } = createReadyCtrl({ Modules: ModulesClass });
    // Pretend we are in a viewPanel so loadCurrentRecord doesn't bail early.
    scope.isViewPanel = true;

    scope.insertFilterExample("upper");
    expect(scope.savedInputJson).not.toBeNull();

    // Hijack the state params that loadCurrentRecord reads.
    scope.$parent = scope.$parent || {};
    // Direct injection via the controller's captured $state reference isn't
    // straightforward, so test the end-state via the setter path instead.
    // Simulate what the success handler does: savedInputJson is cleared via setInputJson.
    const d2 = $q.defer();
    ModulesClass.get = jest.fn(() => ({ $promise: d2.promise }));

    // Create a fresh controller in viewPanel mode to properly test this path.
    const { scope: scope2 } = createCtrl({
      state: { current: { name: "main.viewPanel" }, params: { module: "alerts", id: "99" } },
      services: { Modules: ModulesClass },
    });
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}

    const mockInput2 = { getValue: jest.fn(() => scope2.inputJsonText), setValue: jest.fn((v) => { scope2.inputJsonText = v; }), getModel: jest.fn(() => ({ getLanguageId: () => "json" })) };
    const mockTemplate2 = { getValue: jest.fn(() => ""), setValue: jest.fn(), getModel: jest.fn(() => ({ getLanguageId: () => "jinja2" })), getSelection: jest.fn(() => ({})), executeEdits: jest.fn(), getContribution: jest.fn(() => null), focus: jest.fn(), onDidChangeModelContent: jest.fn(() => ({ dispose: jest.fn() })) };
    scope2.onInputEditorReady(mockInput2);
    scope2.onTemplateEditorReady(mockTemplate2);

    scope2.insertFilterExample("upper");
    expect(scope2.savedInputJson).not.toBeNull();

    scope2.loadCurrentRecord();
    d2.resolve({ id: "99", name: "TestAlert" });
    $rootScope.$apply();

    expect(scope2.savedInputJson).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// insertFilter() — duplicate-pipe prevention
// ---------------------------------------------------------------------------
describe("insertFilter() duplicate-pipe prevention", () => {
  function makeEditorAtCursor(lineContent, column) {
    // column is 1-based; getValueInRange returns text for arbitrary ranges.
    return {
      getValue: jest.fn(() => lineContent),
      setValue: jest.fn(),
      getModel: jest.fn(() => ({
        getLanguageId: () => "jinja2",
        getLineContent: jest.fn(() => lineContent),
        getValueInRange: jest.fn(({ startColumn, endColumn }) =>
          lineContent.slice(startColumn - 1, endColumn - 1)
        ),
      })),
      getPosition: jest.fn(() => ({ lineNumber: 1, column })),
      getSelection: jest.fn(() => ({ startLineNumber: 1, startColumn: column, endLineNumber: 1, endColumn: column })),
      executeEdits: jest.fn(),
      getContribution: jest.fn(() => null),
      focus: jest.fn(),
      onDidChangeModelContent: jest.fn(() => ({ dispose: jest.fn() })),
    };
  }

  test("inserts ' | filter' when cursor is not after a pipe", () => {
    const { scope } = createCtrl();
    // Cursor after "name" with no pipe present.
    const line = "{{ vars.input.records[0].name";
    const col = line.length + 1;
    const editor = makeEditorAtCursor(line, col);
    scope.onTemplateEditorReady(editor);

    scope.insertFilter("upper");

    const [call] = editor.executeEdits.mock.calls;
    expect(call[1][0].text).toMatch(/^\s*\|\s*upper/);
  });

  test("inserts only 'filter' (no pipe) when cursor is after '| '", () => {
    const { scope } = createCtrl();
    // User already typed "{{ vars.input.records[0].name | " — cursor at end.
    const line = "{{ vars.input.records[0].name | ";
    const col = line.length + 1;
    const editor = makeEditorAtCursor(line, col);
    scope.onTemplateEditorReady(editor);

    scope.insertFilter("upper");

    const [call] = editor.executeEdits.mock.calls;
    expect(call[1][0].text).not.toMatch(/\|/);
    expect(call[1][0].text).toContain("upper");
  });

  test("inserts only 'filter' (no pipe) when cursor is directly after '|'", () => {
    const { scope } = createCtrl();
    const line = "{{ vars.input.records[0].name |";
    const col = line.length + 1;
    const editor = makeEditorAtCursor(line, col);
    scope.onTemplateEditorReady(editor);

    scope.insertFilter("upper");

    const [call] = editor.executeEdits.mock.calls;
    expect(call[1][0].text).not.toMatch(/\|/);
    expect(call[1][0].text).toContain("upper");
  });
});

// ---------------------------------------------------------------------------
// Error markers
// ---------------------------------------------------------------------------
describe("error markers", () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });
  function createReadyCtrl(services = {}) {
    const { scope, toaster } = createCtrl({ services });
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}

    const mockModel = {
      getLanguageId: jest.fn(() => "jinja2"),
      getLineContent: jest.fn(() => "{{ bad | upper }}"),
      getValueInRange: jest.fn(() => ""),
    };
    const mockEditor = {
      getValue: jest.fn(() => "{{ bad | upper }}"),
      setValue: jest.fn(),
      getModel: jest.fn(() => mockModel),
      getPosition: jest.fn(() => ({ lineNumber: 1, column: 1 })),
      getSelection: jest.fn(() => ({})),
      executeEdits: jest.fn(),
      getContribution: jest.fn(() => null),
      focus: jest.fn(),
      onDidChangeModelContent: jest.fn(() => ({ dispose: jest.fn() })),
    };
    scope.onTemplateEditorReady(mockEditor);
    return { scope, toaster, mockEditor, mockModel };
  }

  beforeEach(() => {
    global.monaco.editor.setModelMarkers.mockClear();
  });

  test("setModelMarkers is called with an error marker when render fails", () => {
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope, mockModel } = createReadyCtrl({ dynamicValueService: { evaluateJinja } });

    scope.inputJsonText = "{}";
    scope.submit();
    d.reject({ statusText: "Bad Request", data: { message: "Jinja syntax error at line 2" } });
    $rootScope.$apply();

    expect(global.monaco.editor.setModelMarkers).toHaveBeenCalledWith(
      mockModel,
      "jinja-render",
      expect.arrayContaining([
        expect.objectContaining({ severity: 8, startLineNumber: 2 }),
      ])
    );
  });

  test("error marker message matches the API error text", () => {
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope } = createReadyCtrl({ dynamicValueService: { evaluateJinja } });

    scope.inputJsonText = "{}";
    scope.submit();
    d.reject({ statusText: "Bad Request", data: { message: "unexpected end of template at line 1" } });
    $rootScope.$apply();

    // Path warnings may be placed first; find the call containing an error-severity marker.
    const errorCall = global.monaco.editor.setModelMarkers.mock.calls.find(
      (c) => c[2].some((m) => m.severity === 8)
    );
    expect(errorCall).toBeDefined();
    const errorMarker = errorCall[2].find((m) => m.severity === 8);
    expect(errorMarker.message).toMatch(/unexpected end/i);
  });

  test("no marker is set when the error has no line number and no unclosed tag", () => {
    // The editor content here is a well-formed expression — no unclosed tags.
    // The API returned a generic error with no line info. We should skip the
    // marker rather than wrongly squiggling line 1.
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope } = createReadyCtrl({ dynamicValueService: { evaluateJinja } });

    scope.inputJsonText = "{}";
    scope.submit();
    d.reject({ statusText: "Internal Server Error", data: {} });
    $rootScope.$apply();

    // setModelMarkers should NOT have been called with any error-severity (8) marker.
    const errorCalls = global.monaco.editor.setModelMarkers.mock.calls.filter(
      (c) => c[2].some((m) => m.severity === 8)
    );
    expect(errorCalls).toHaveLength(0);
  });

  test("squiggles the last unclosed-tag line when no line number is in the error", () => {
    // Simulate the exact case from the bug report:
    //   {{ test }}
    //   {% if condition %}
    //     test
    //   {% endif  .        ← missing %}
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope } = createReadyCtrl({ dynamicValueService: { evaluateJinja } });

    const brokenTemplate = "{{ test }}\n{% if condition %}\n  test\n{% endif  .";
    const brokenModel = {
      getLanguageId: jest.fn(() => "jinja2"),
      getLineContent: jest.fn((n) => brokenTemplate.split("\n")[n - 1] || ""),
      getValueInRange: jest.fn(() => ""),
    };
    const brokenEditor = {
      getValue: jest.fn(() => brokenTemplate),
      setValue: jest.fn(),
      getModel: jest.fn(() => brokenModel),
      getPosition: jest.fn(() => ({ lineNumber: 1, column: 1 })),
      getSelection: jest.fn(() => ({})),
      executeEdits: jest.fn(),
      getContribution: jest.fn(() => null),
      focus: jest.fn(),
      onDidChangeModelContent: jest.fn(() => ({ dispose: jest.fn() })),
    };
    scope.onTemplateEditorReady(brokenEditor);

    scope.inputJsonText = "{}";
    scope.submit();
    d.reject({ statusText: "Bad Request", data: { message: "unexpected end of template, expected 'end of statement block'" } });
    $rootScope.$apply();

    expect(global.monaco.editor.setModelMarkers).toHaveBeenCalledWith(
      brokenModel,
      "jinja-render",
      expect.arrayContaining([
        expect.objectContaining({ startLineNumber: 4 }),
      ])
    );
  });

  test("markers are cleared on successful render when the live scan is clean", () => {
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope, mockModel } = createReadyCtrl({ dynamicValueService: { evaluateJinja } });

    // Input resolves the "bad" reference so the live scan finds nothing.
    scope.inputJsonText = '{"bad":"x"}';
    scope.submit();
    d.resolve({ result: "Ada" });
    $rootScope.$apply();

    expect(global.monaco.editor.setModelMarkers).toHaveBeenCalledWith(
      mockModel,
      "jinja-render",
      []
    );
  });

  test("scan-based markers persist after a successful render", () => {
    // Bug fix: render success used to wipe live-scan squiggles. Now the
    // live scan is rerun and its findings remain visible.
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope, mockModel } = createReadyCtrl({ dynamicValueService: { evaluateJinja } });

    // Empty input → "bad" path warning persists.
    scope.inputJsonText = "{}";
    scope.submit();
    d.resolve({ result: "" });
    $rootScope.$apply();

    const calls = global.monaco.editor.setModelMarkers.mock.calls;
    const lastForJinja = calls.filter((c) => c[1] === "jinja-render").slice(-1)[0];
    expect(lastForJinja).toBeDefined();
    expect(lastForJinja[2].length).toBeGreaterThan(0);
    expect(lastForJinja[2][0].message).toMatch(/not found/i);
  });

  test("server error marker is appended on top of scan markers, not replacing them", () => {
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope, mockModel } = createReadyCtrl({ dynamicValueService: { evaluateJinja } });

    scope.inputJsonText = "{}";
    scope.submit();
    d.reject({ statusText: "Bad Request", data: { message: "Jinja syntax error at line 1" } });
    $rootScope.$apply();

    const calls = global.monaco.editor.setModelMarkers.mock.calls;
    const lastForJinja = calls.filter((c) => c[1] === "jinja-render").slice(-1)[0];
    const markers = lastForJinja[2];
    // Expect both: the path-warning (severity 4) and the server-error (severity 8).
    expect(markers.some((m) => m.severity === 4)).toBe(true);
    expect(markers.some((m) => m.severity === 8)).toBe(true);
  });

  test("server-line marker is replaced by the live scan when the template content changes", () => {
    // After the live-scan refactor, a server-line marker is not cleared
    // immediately on keystroke — instead the debounced live scan replaces
    // markers with whatever it finds (or clears them if nothing is wrong).
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope, mockEditor, mockModel } = createReadyCtrl({ dynamicValueService: { evaluateJinja } });

    // Provide input that resolves "bad" so the live scan finds nothing.
    scope.inputJsonText = '{"bad":"x"}';
    scope.submit();
    d.reject({ statusText: "Bad Request", data: { message: "Jinja syntax error at line 1" } });
    $rootScope.$apply();

    global.monaco.editor.setModelMarkers.mockClear();

    const changeHandler = mockEditor.onDidChangeModelContent.mock.calls[0][0];
    changeHandler();
    jest.runAllTimers();

    expect(global.monaco.editor.setModelMarkers).toHaveBeenCalledWith(
      mockModel,
      "jinja-render",
      []
    );
  });

  test("scan-based marker persists when the edit does not fix the unclosed tag", () => {
    // Regression: editing the template with wrong chars should NOT clear a
    // scan-based marker — the squiggle should stay until the tag is actually closed.
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope } = createReadyCtrl({ dynamicValueService: { evaluateJinja } });

    const brokenTemplate = "{{ test }}\n{% if condition %}\n  test\n{% endif  .";
    let currentTemplate = brokenTemplate;
    const brokenModel = {
      getLanguageId: jest.fn(() => "jinja2"),
      getLineContent: jest.fn((n) => currentTemplate.split("\n")[n - 1] || ""),
      getValueInRange: jest.fn(() => ""),
    };
    let changeHandler;
    const brokenEditor = {
      getValue: jest.fn(() => currentTemplate),
      setValue: jest.fn(),
      getModel: jest.fn(() => brokenModel),
      getPosition: jest.fn(() => ({ lineNumber: 1, column: 1 })),
      getSelection: jest.fn(() => ({})),
      executeEdits: jest.fn(),
      getContribution: jest.fn(() => null),
      focus: jest.fn(),
      onDidChangeModelContent: jest.fn((fn) => { changeHandler = fn; return { dispose: jest.fn() }; }),
    };
    scope.onTemplateEditorReady(brokenEditor);

    scope.inputJsonText = "{}";
    scope.submit();
    d.reject({ statusText: "Bad Request", data: { message: "unexpected end of template, expected 'end of statement block'" } });
    $rootScope.$apply();

    global.monaco.editor.setModelMarkers.mockClear();

    // User types wrong chars — tag still not closed.
    currentTemplate = "{{ test }}\n{% if condition %}\n  test\n{% endif  xyz";
    changeHandler();
    jest.runAllTimers();

    // Marker should have been re-applied, not cleared.
    const calls = global.monaco.editor.setModelMarkers.mock.calls;
    const errorCalls = calls.filter((c) => c[2].length > 0);
    expect(errorCalls.length).toBeGreaterThan(0);
    expect(errorCalls[0][2][0].startLineNumber).toBe(4);
  });

  test("scan-based marker is cleared when the unclosed tag is fixed", () => {
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope } = createReadyCtrl({ dynamicValueService: { evaluateJinja } });

    const brokenTemplate = "{{ test }}\n{% if condition %}\n  test\n{% endif  .";
    let currentTemplate = brokenTemplate;
    const brokenModel = {
      getLanguageId: jest.fn(() => "jinja2"),
      getLineContent: jest.fn((n) => currentTemplate.split("\n")[n - 1] || ""),
      getValueInRange: jest.fn(() => ""),
    };
    let changeHandler;
    const brokenEditor = {
      getValue: jest.fn(() => currentTemplate),
      setValue: jest.fn(),
      getModel: jest.fn(() => brokenModel),
      getPosition: jest.fn(() => ({ lineNumber: 1, column: 1 })),
      getSelection: jest.fn(() => ({})),
      executeEdits: jest.fn(),
      getContribution: jest.fn(() => null),
      focus: jest.fn(),
      onDidChangeModelContent: jest.fn((fn) => { changeHandler = fn; return { dispose: jest.fn() }; }),
    };
    scope.onTemplateEditorReady(brokenEditor);

    // Provide input that resolves "test" so path warnings don't trip the assertion.
    scope.inputJsonText = '{"test":"x","condition":true}';
    scope.submit();
    d.reject({ statusText: "Bad Request", data: { message: "unexpected end of template, expected 'end of statement block'" } });
    $rootScope.$apply();

    global.monaco.editor.setModelMarkers.mockClear();

    // User fixes the tag.
    currentTemplate = "{{ test }}\n{% if condition %}\n  test\n{% endif %}";
    changeHandler();
    jest.runAllTimers();

    expect(global.monaco.editor.setModelMarkers).toHaveBeenCalledWith(
      brokenModel,
      "jinja-render",
      []
    );
  });
});

// ---------------------------------------------------------------------------
// Layout preset + output expand modal
// ---------------------------------------------------------------------------
describe("layout preset", () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch (_) {} });

  test("default layout is `equal` and maps to col-sm-4 across all panes", () => {
    const { scope } = createCtrl();
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}
    expect(scope.layoutPreset).toBe("equal");
    expect(scope.paneClasses()).toEqual({ input: "col-sm-4", template: "col-sm-4", output: "col-sm-4" });
  });

  test("setLayoutPreset('outputFocus') gives output the wider column", () => {
    const { scope } = createCtrl();
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}
    scope.setLayoutPreset("outputFocus");
    const c = scope.paneClasses();
    expect(c.output).toBe("col-sm-6");
    expect(c.input).toBe("col-sm-3");
    expect(c.template).toBe("col-sm-3");
  });

  test("setLayoutPreset persists to localStorage", () => {
    const { scope } = createCtrl();
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}
    scope.setLayoutPreset("stacked");
    expect(window.localStorage.getItem("jinjaEditorWidget.layoutPreset")).toBe("stacked");
  });

  test("invalid preset is ignored", () => {
    const { scope } = createCtrl();
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}
    scope.setLayoutPreset("bogus");
    expect(scope.layoutPreset).toBe("equal");
  });
});

describe("output expand modal", () => {
  test("openOutputModal / closeOutputModal toggle the flag", () => {
    const { scope } = createCtrl();
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}
    expect(scope.outputModalOpen).toBe(false);
    scope.openOutputModal();
    expect(scope.outputModalOpen).toBe(true);
    scope.closeOutputModal();
    expect(scope.outputModalOpen).toBe(false);
  });

  test("Escape key closes the modal when open", () => {
    const { scope } = createCtrl();
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}
    scope.openOutputModal();
    $rootScope.$apply();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    $rootScope.$apply();
    expect(scope.outputModalOpen).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Output tab detection (detectOutputKind via $scope side effects)
// ---------------------------------------------------------------------------
describe("output tab detection", () => {
  function setOutputAndDigest(scope, value) {
    scope.$apply(() => { scope.output = value; });
  }

  test("object output -> json tab", () => {
    const { scope } = createCtrl();
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}
    setOutputAndDigest(scope, { name: "Ada" });
    expect(scope.detectedOutputKind).toBe("json");
    expect(scope.resolveOutputTab()).toBe("json");
  });

  test("array output -> json tab", () => {
    const { scope } = createCtrl();
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}
    setOutputAndDigest(scope, [1, 2, 3]);
    expect(scope.detectedOutputKind).toBe("json");
  });

  test("JSON-shaped string output -> json tab and pretty-printed in outputJsonText", () => {
    const { scope } = createCtrl();
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}
    setOutputAndDigest(scope, '[{"a":1},{"a":2}]');
    expect(scope.detectedOutputKind).toBe("json");
    expect(scope.outputJsonText).toContain("\n");
    expect(scope.outputJsonText).toContain('"a": 1');
  });

  test("HTML string output -> html tab", () => {
    const { scope } = createCtrl();
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}
    setOutputAndDigest(scope, '<table class="cs-data-table"><tr><td>a</td></tr></table>');
    expect(scope.detectedOutputKind).toBe("html");
  });

  test("HTML fragment output (bare <tr>) -> html tab", () => {
    const { scope } = createCtrl();
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}
    setOutputAndDigest(scope, "<tr><td>a</td><td>b</td></tr>");
    expect(scope.detectedOutputKind).toBe("html");
  });

  test("plain text -> raw tab", () => {
    const { scope } = createCtrl();
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}
    setOutputAndDigest(scope, "Hello, Ada");
    expect(scope.detectedOutputKind).toBe("raw");
  });

  test("explicit user pick overrides auto detection", () => {
    const { scope } = createCtrl();
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}
    setOutputAndDigest(scope, { name: "Ada" });
    expect(scope.resolveOutputTab()).toBe("json");
    scope.setOutputTab("raw");
    expect(scope.resolveOutputTab()).toBe("raw");
  });

  test("new output resets the tab pick to auto", () => {
    const { scope } = createCtrl();
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}
    setOutputAndDigest(scope, { name: "Ada" });
    scope.setOutputTab("raw");
    expect(scope.outputTabPick).toBe("raw");
    setOutputAndDigest(scope, "<table><tr><td>x</td></tr></table>");
    expect(scope.outputTabPick).toBe("auto");
    expect(scope.resolveOutputTab()).toBe("html");
  });
});

// ---------------------------------------------------------------------------
// Live scan — debounced scan that runs on edits/input changes without Render
// ---------------------------------------------------------------------------
describe("live scan (no prior Render)", () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  function makeReadyCtrl(template, inputJson) {
    const { scope } = createCtrl();
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}
    let currentTemplate = template;
    const model = {
      getLanguageId: jest.fn(() => "jinja2"),
      getLineContent: jest.fn((n) => currentTemplate.split("\n")[n - 1] || ""),
      getValueInRange: jest.fn(() => ""),
    };
    let changeHandler;
    const disposeFn = jest.fn();
    const editor = {
      getValue: jest.fn(() => currentTemplate),
      setValue: jest.fn(),
      getModel: jest.fn(() => model),
      getPosition: jest.fn(() => ({ lineNumber: 1, column: 1 })),
      getSelection: jest.fn(() => ({})),
      executeEdits: jest.fn(),
      getContribution: jest.fn(() => null),
      focus: jest.fn(),
      onDidChangeModelContent: jest.fn((fn) => { changeHandler = fn; return { dispose: disposeFn }; }),
    };
    if (inputJson !== undefined) scope.inputJsonText = inputJson;
    scope.onTemplateEditorReady(editor);
    return { scope, model, editor, disposeFn,
      changeTo: function (t) { currentTemplate = t; changeHandler(); jest.runAllTimers(); } };
  }

  test("structural error squiggles appear on edit without clicking Render", () => {
    const { changeTo, model } = makeReadyCtrl("Hello", '{"name":"Ada"}');
    global.monaco.editor.setModelMarkers.mockClear();
    changeTo("{% if x ");
    const calls = global.monaco.editor.setModelMarkers.mock.calls.filter((c) => c[2].length > 0);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][1]).toBe("jinja-render");
    expect(calls[0][2].some((m) => /unclosed block tag/i.test(m.message))).toBe(true);
  });

  test("path-existence warnings appear on edit without clicking Render", () => {
    const { changeTo } = makeReadyCtrl("hello", '{"foo":1}');
    global.monaco.editor.setModelMarkers.mockClear();
    changeTo("{{ vars.bogus }}");
    const warningCalls = global.monaco.editor.setModelMarkers.mock.calls
      .filter((c) => c[2].some((m) => m.severity === 4));
    expect(warningCalls.length).toBeGreaterThan(0);
  });

  test("changing the input JSON reruns the scan and clears stale path warnings", () => {
    const { scope, changeTo } = makeReadyCtrl("hello", '{}');
    changeTo("{{ vars.x }}");
    expect(global.monaco.editor.setModelMarkers.mock.calls
      .some((c) => c[2].some((m) => m.severity === 4))).toBe(true);

    global.monaco.editor.setModelMarkers.mockClear();
    scope.inputJsonText = '{"vars":{"x":1}}';
    $rootScope.$apply();
    jest.runAllTimers();

    const lastCall = global.monaco.editor.setModelMarkers.mock.calls.slice(-1)[0];
    expect(lastCall[2]).toEqual([]);
  });

  test("squiggle is narrowed to the {{ … span instead of the whole line", () => {
    const { changeTo, model } = makeReadyCtrl("hello", '{}');
    global.monaco.editor.setModelMarkers.mockClear();
    // Leading whitespace + literal text before the unclosed expression.
    changeTo("Name:    {{ vars.input.records[0].name");
    const calls = global.monaco.editor.setModelMarkers.mock.calls.filter((c) => c[2].length > 0);
    expect(calls.length).toBeGreaterThan(0);
    const marker = calls[0][2].find((m) => /unclosed expression/i.test(m.message));
    expect(marker).toBeDefined();
    // "{{" starts at column 10 (1-indexed).
    expect(marker.startColumn).toBe(10);
    // No closing }}, so span runs to end of line.
    expect(marker.endColumn).toBe("Name:    {{ vars.input.records[0].name".length + 1);
  });

  test("$destroy disposes the onDidChangeModelContent listener", () => {
    const { scope, disposeFn } = makeReadyCtrl("hello", '{}');
    scope.$destroy();
    expect(disposeFn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// scanTemplate() — structural linting (cases 1–4, 6, 9)
// ---------------------------------------------------------------------------
describe("scanTemplate()", () => {
  // scanTemplate is private. We reach it via submit() → reject with no line
  // number → setTemplateErrorMarker runs scanTemplate as its fallback.

  // Helper: wire an editor with the given template, submit, reject with a
  // generic (no-line-number) error, and return all setModelMarkers calls.
  function scanViaSubmit(templateText, inputJson, knownFilterNames) {
    const origSigs = global.JinjaEditorWidget.filterSignatures;
    if (knownFilterNames) {
      global.JinjaEditorWidget.filterSignatures = {};
      for (const n of knownFilterNames) {
        global.JinjaEditorWidget.filterSignatures[n] = {
          category: "Test", documentation: "", parameters: [], returnValue: { type: "any" },
        };
      }
    }

    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope } = createCtrl({ services: { dynamicValueService: { evaluateJinja } } });
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}

    const lines = templateText.split("\n");
    const model = {
      getLanguageId: jest.fn(() => "jinja2"),
      getLineContent: jest.fn((n) => lines[n - 1] || ""),
      getValueInRange: jest.fn(() => ""),
    };
    const editor = {
      getValue: jest.fn(() => templateText),
      setValue: jest.fn(),
      getModel: jest.fn(() => model),
      getPosition: jest.fn(() => ({ lineNumber: 1, column: 1 })),
      getSelection: jest.fn(() => ({})),
      executeEdits: jest.fn(),
      getContribution: jest.fn(() => null),
      focus: jest.fn(),
      onDidChangeModelContent: jest.fn(() => ({ dispose: jest.fn() })),
    };
    scope.onTemplateEditorReady(editor);
    if (inputJson !== undefined) scope.inputJsonText = inputJson;

    global.monaco.editor.setModelMarkers.mockClear();
    scope.submit();
    // Generic error with no line number → setTemplateErrorMarker runs scanTemplate
    d.reject({ data: { message: "unexpected end of template" } });
    $rootScope.$apply();

    global.JinjaEditorWidget.filterSignatures = origSigs;
    return global.monaco.editor.setModelMarkers.mock.calls;
  }

  function errorMessages(calls) {
    return calls
      .filter((c) => c[2].some((m) => m.severity === 8))
      .flatMap((c) => c[2].filter((m) => m.severity === 8).map((m) => m.message));
  }

  beforeEach(() => { global.monaco.editor.setModelMarkers.mockClear(); });

  // Case 1: unclosed {{ expression
  test("case 1 — flags unclosed {{ expression", () => {
    const msgs = errorMessages(scanViaSubmit(
      "Hello {{ vars.input.records[0].name",
      JSON.stringify({ vars: { input: { records: [{ name: "Ada" }] } } })
    ));
    expect(msgs.some((m) => /unclosed expression/i.test(m))).toBe(true);
  });

  // Case 2: unclosed {% block tag
  test("case 2 — flags unclosed {% block tag", () => {
    const msgs = errorMessages(scanViaSubmit(
      "{% if condition\n  hello\n{% endif %}",
      undefined,
      ["upper"]
    ));
    expect(msgs.some((m) => /unclosed block tag/i.test(m))).toBe(true);
  });

  // Case 3: orphan closing tag
  test("case 3 — flags orphan endfor with no matching for", () => {
    const msgs = errorMessages(scanViaSubmit("{{ hello }}\n{% endfor %}", undefined, ["upper"]));
    expect(msgs.some((m) => /unexpected.*endfor|no matching/i.test(m))).toBe(true);
  });

  // Case 3: unclosed opening tag
  test("case 3 — flags if block never closed with endif", () => {
    const msgs = errorMessages(scanViaSubmit("{% if condition %}\n  hello", undefined, ["upper"]));
    expect(msgs.some((m) => /never closed|endif/i.test(m))).toBe(true);
  });

  // Single-line `{% set foo = bar %}` is NOT a block opener — should not
  // trip the "never closed with endset" finding.
  test("single-line `{% set foo = bar %}` is not flagged as missing endset", () => {
    const calls = scanViaSubmit(
      "{% set score = vars.input.records[0].risk_score %}",
      JSON.stringify({ vars: { input: { records: [{ risk_score: 5 }] } } }),
      ["upper"]
    );
    const msgs = calls.flatMap((c) => c[2].map((m) => m.message));
    expect(msgs.some((m) => /endset|never closed/i.test(m))).toBe(false);
  });

  test("block-form `{% set foo %}…{% endset %}` still validated correctly", () => {
    // Block form (no `=`) without a matching endset SHOULD be flagged.
    const calls = scanViaSubmit(
      "{% set summary %}\nhello\n",
      JSON.stringify({}),
      ["upper"]
    );
    const msgs = calls.flatMap((c) => c[2].map((m) => m.message));
    expect(msgs.some((m) => /endset|never closed/i.test(m))).toBe(true);
  });

  // Missing filter name after a pipe
  test("flags `{{ x | }}` (pipe with no filter name)", () => {
    const msgs = errorMessages(scanViaSubmit(
      "{{ vars.input.records[0].name | }}",
      JSON.stringify({ vars: { input: { records: [{ name: "Ada" }] } } }),
      ["upper"]
    ));
    expect(msgs.some((m) => /missing filter name/i.test(m))).toBe(true);
  });

  test("does not flag `{{ x | upper }}` as missing filter", () => {
    const calls = scanViaSubmit(
      "{{ vars.input.records[0].name | upper }}",
      JSON.stringify({ vars: { input: { records: [{ name: "Ada" }] } } }),
      ["upper"]
    );
    const msgs = calls
      .filter((c) => c[2].some((m) => /missing filter name/i.test(m.message)))
      .flatMap((c) => c[2].map((m) => m.message));
    expect(msgs).toHaveLength(0);
  });

  // Case 6: empty vars.input.records
  test("case 6 — flags when vars.input.records is empty in test input", () => {
    const msgs = errorMessages(scanViaSubmit(
      "{% for r in vars.input.records %}{{ r.name }}{% endfor %}",
      JSON.stringify({ vars: { input: { records: [] } } }),
      ["upper"]
    ));
    expect(msgs.some((m) => /vars\.input\.records is empty/i.test(m))).toBe(true);
  });

  // Case 9: unknown filter name
  test("case 9 — flags unknown filter name", () => {
    const msgs = errorMessages(scanViaSubmit(
      "{{ vars.input.records[0].name | typofilter }}",
      JSON.stringify({ vars: { input: { records: [{ name: "Ada" }] } } }),
      ["upper", "lower", "default"]
    ));
    expect(msgs.some((m) => /unknown filter.*typofilter/i.test(m))).toBe(true);
  });

  // No false positives
  test("no error markers for a well-formed template", () => {
    const calls = scanViaSubmit(
      "{% for r in vars.input.records %}{{ r.name | upper }}{% endfor %}",
      JSON.stringify({ vars: { input: { records: [{ name: "Ada" }] } } }),
      ["upper", "lower", "default"]
    );
    const errorCalls = calls.filter((c) => c[2].some((m) => m.severity === 8));
    expect(errorCalls).toHaveLength(0);
  });

  // Re-scan keeps marker while broken, clears when fixed
  test("re-scan keeps marker while tag is still unclosed, clears when fixed", () => {
    jest.useFakeTimers();
    let currentTemplate = "Hello {{ vars.input.records[0].name";
    const lines = () => currentTemplate.split("\n");
    const model = {
      getLanguageId: jest.fn(() => "jinja2"),
      getLineContent: jest.fn((n) => lines()[n - 1] || ""),
      getValueInRange: jest.fn(() => ""),
    };
    let changeHandler;
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope } = createCtrl({ services: { dynamicValueService: { evaluateJinja } } });
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}
    const editor = {
      getValue: jest.fn(() => currentTemplate),
      setValue: jest.fn(),
      getModel: jest.fn(() => model),
      getPosition: jest.fn(() => ({ lineNumber: 1, column: 1 })),
      getSelection: jest.fn(() => ({})),
      executeEdits: jest.fn(),
      getContribution: jest.fn(() => null),
      focus: jest.fn(),
      onDidChangeModelContent: jest.fn((fn) => { changeHandler = fn; return { dispose: jest.fn() }; }),
    };
    scope.onTemplateEditorReady(editor);
    scope.inputJsonText = JSON.stringify({ vars: { input: { records: [{ name: "Ada" }] } } });

    scope.submit();
    d.reject({ data: { message: "unexpected end of template" } });
    $rootScope.$apply();

    // Still broken — re-scan should keep a marker
    global.monaco.editor.setModelMarkers.mockClear();
    changeHandler();
    jest.runAllTimers();
    expect(global.monaco.editor.setModelMarkers.mock.calls.some((c) => c[2].length > 0)).toBe(true);

    // Fix the template — re-scan should clear
    currentTemplate = "Hello {{ vars.input.records[0].name }}";
    global.monaco.editor.setModelMarkers.mockClear();
    changeHandler();
    jest.runAllTimers();
    expect(global.monaco.editor.setModelMarkers).toHaveBeenCalledWith(model, "jinja-render", []);

    jest.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// checkInputPaths() — field path validation (case 5)
// ---------------------------------------------------------------------------
describe("checkInputPaths() — field path warnings", () => {
  beforeEach(() => { global.monaco.editor.setModelMarkers.mockClear(); });

  function submitAndGetWarnings(scope, templateText, inputJson) {
    scope.inputJsonText = inputJson;
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    let injectedDvs;
    ngInject((_dynamicValueService_) => { injectedDvs = _dynamicValueService_; });
    injectedDvs.evaluateJinja = evaluateJinja;

    const lines = templateText.split("\n");
    const model = {
      getLanguageId: jest.fn(() => "jinja2"),
      getLineContent: jest.fn((n) => lines[n - 1] || ""),
      getValueInRange: jest.fn(() => ""),
    };
    const editor = {
      getValue: jest.fn(() => templateText),
      setValue: jest.fn(),
      getModel: jest.fn(() => model),
      getPosition: jest.fn(() => ({ lineNumber: 1, column: 1 })),
      getSelection: jest.fn(() => ({})),
      executeEdits: jest.fn(),
      getContribution: jest.fn(() => null),
      focus: jest.fn(),
      onDidChangeModelContent: jest.fn(() => ({ dispose: jest.fn() })),
    };
    scope.onTemplateEditorReady(editor);
    scope.submit();

    return global.monaco.editor.setModelMarkers.mock.calls
      .filter((c) => c[2].some((m) => m.severity === 4))
      .flatMap((c) => c[2].filter((m) => m.severity === 4));
  }

  test("places warning when template references a field not in input JSON", () => {
    const { scope } = createCtrl();
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}

    const warnings = submitAndGetWarnings(
      scope,
      "{{ vars.input.records[0].typoField }}",
      JSON.stringify({ vars: { input: { records: [{ name: "Ada" }] } } })
    );
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].message).toMatch(/typoField.*not found/i);
  });

  test("no warning when all paths resolve correctly", () => {
    const { scope } = createCtrl();
    $rootScope.$apply();
    try { $timeout.flush(); } catch (_) {}

    const warnings = submitAndGetWarnings(
      scope,
      "{{ vars.input.records[0].name }}",
      JSON.stringify({ vars: { input: { records: [{ name: "Ada" }] } } })
    );
    expect(warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// translateJinjaError() — human-readable error messages (cases 7, 8)
// ---------------------------------------------------------------------------
describe("translateJinjaError() via submit error output", () => {
  function submitAndGetOutput(errorMsg) {
    const d = $q.defer();
    const evaluateJinja = jest.fn(() => d.promise);
    const { scope } = createCtrl({ services: { dynamicValueService: { evaluateJinja } } });
    scope.templateText = "{{ x }}";
    scope.inputJsonText = "{}";
    scope.submit();
    d.reject({ statusText: "Bad Request", data: { message: errorMsg } });
    $rootScope.$apply();
    return scope.output;
  }

  test("list index out of range → records-guard suggestion", () => {
    const out = submitAndGetOutput("list index out of range");
    expect(out).toMatch(/vars\.input\.records may be empty/i);
    expect(out).toMatch(/original:/i);
  });

  test("has no attribute (non-list) → field-not-found message", () => {
    const out = submitAndGetOutput("'str' object has no attribute 'name'");
    expect(out).toMatch(/field was not found/i);
    expect(out).toMatch(/original:/i);
  });

  test("no filter named → filter spelling message", () => {
    const out = submitAndGetOutput("no filter named 'typofilter'");
    expect(out).toMatch(/unknown filter name/i);
    expect(out).toMatch(/original:/i);
  });

  test("expected token → syntax error message", () => {
    const out = submitAndGetOutput("expected token '}'");
    expect(out).toMatch(/syntax error in template/i);
    expect(out).toMatch(/original:/i);
  });

  test("unexpected → syntax error message", () => {
    const out = submitAndGetOutput("unexpected end of template");
    expect(out).toMatch(/syntax error in template/i);
  });

  test("division by zero → division message", () => {
    const out = submitAndGetOutput("integer division or modulo by zero");
    expect(out).toMatch(/division by zero/i);
  });

  test("cannot convert → type error message", () => {
    const out = submitAndGetOutput("cannot convert 'int' to string");
    expect(out).toMatch(/type error/i);
  });

  test("unknown error passes through unchanged", () => {
    const out = submitAndGetOutput("some completely unknown server error");
    expect(out).toContain("some completely unknown server error");
  });
});
