/* Copyright start
   MIT License
   Copyright (c) 2026 Dylan Spille
   Copyright end */
"use strict";
(function () {
  // Resolve the widget's own base URL from this script's src, so the same code
  // works both in the dev harness (served at /<widget-id>/) and in FortiSOAR
  // (served at widgets/installed/<widget-id>/).
  const WIDGET_BASE = (function () {
    const scriptEl =
      document.currentScript ||
      (function () {
        const scripts = document.getElementsByTagName("script");
        return scripts[scripts.length - 1];
      })();
    const src = (scriptEl && scriptEl.src) || "";
    return src.replace(/view\.controller\.js(?:\?.*)?$/, "");
  })();

  // Extract the X.Y.Z trailing on the widget folder name (e.g.
  // "jinjaEditorWidget-X.Y.Z/" -> "X.Y.Z"). Works in both the dev harness
  // and a live SOAR install because both serve the widget under a
  // versioned folder. Empty if the match fails — the view hides the badge.
  const WIDGET_VERSION = (function () {
    const m = WIDGET_BASE.match(/-(\d+(?:\.\d+)+)\/?$/);
    return m ? m[1] : "";
  })();

  angular
    .module("cybersponse")
    .controller("jinjaEditorWidget114DevCtrl", jinjaEditorWidget114DevCtrl)
    .directive("jinjaDraggable", jinjaDraggableDirective);

  function jinjaDraggableDirective() {
    return {
      restrict: "A",
      link: function (scope, element) {
        var el = element[0];
        var handle = el.querySelector(".jinja-filter-palette-header");
        if (!handle) return;

        handle.style.cursor = "grab";

        var startX, startY, origLeft, origTop;

        function onMouseDown(e) {
          if (e.target.closest("button")) return;
          e.preventDefault();
          var rect = el.getBoundingClientRect();
          startX = e.clientX;
          startY = e.clientY;
          origLeft = rect.left;
          origTop = rect.top;

          el.style.left = origLeft + "px";
          el.style.top = origTop + "px";
          el.style.right = "auto";
          el.style.bottom = "auto";

          handle.style.cursor = "grabbing";
          document.addEventListener("mousemove", onMouseMove);
          document.addEventListener("mouseup", onMouseUp);
        }

        function onMouseMove(e) {
          var dx = e.clientX - startX;
          var dy = e.clientY - startY;
          el.style.left = (origLeft + dx) + "px";
          el.style.top = (origTop + dy) + "px";
        }

        function onMouseUp() {
          handle.style.cursor = "grab";
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
        }

        handle.addEventListener("mousedown", onMouseDown);

        scope.$on("$destroy", function () {
          handle.removeEventListener("mousedown", onMouseDown);
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
        });
      }
    };
  }

  jinjaEditorWidget114DevCtrl.$inject = [
    "$scope",
    "$rootScope",
    "$state",
    "$window",
    "$timeout",
    "config",
    "dynamicValueService",
    "Modules",
    "toaster",
    "CommonUtils",
  ];

  const WIDGET_MODULES = [
    WIDGET_BASE + "widgetAssets/js/constants/jinjaFilters.constants.js",
    WIDGET_BASE + "widgetAssets/js/constants/jinjaSnippets.constants.js",
    WIDGET_BASE + "widgetAssets/js/constants/jinjaTemplates.constants.js",
    WIDGET_BASE + "widgetAssets/js/constants/jinjaLanguage.constants.js",
    WIDGET_BASE + "widgetAssets/js/jinjaMonaco.service.js",
  ];

  // Safety net for environments where constant modules fail to register
  // (e.g. stale cross-version cache or partial load). Keep this minimal:
  // enough to make the examples dropdown and filter palette usable.
  const FALLBACK_TEMPLATE_EXAMPLES = [
    {
      id: "greeting",
      label: "Greeting — simple variable",
      description: "Interpolate a single field with a fallback.",
      template: "Hello, {{ vars.input.records[0].name | default('stranger') }}!",
      input: { vars: { input: { records: [{ name: "Ada" }] } } },
    },
    {
      id: "loop",
      label: "Loop — records",
      description: "Iterate over vars.input.records.",
      template:
        "{% for record in vars.input.records %}\n" +
        "- {{ record.name | default('n/a') }}\n" +
        "{% endfor %}",
      input: {
        vars: { input: { records: [{ name: "alpha" }, { name: "beta" }] } },
      },
    },
  ];

  const FALLBACK_FILTER_SIGNATURES = {
    default: {
      category: "Value",
      documentation:
        "Returns a default value if the variable is undefined or empty.",
      parameters: [
        { name: "default_value", type: "any", description: "Fallback value." },
      ],
      returnValue: { type: "any", description: "The variable value or fallback." },
    },
    upper: {
      category: "String",
      documentation: "Converts a string to uppercase.",
      parameters: [],
      returnValue: { type: "string", description: "The uppercase string." },
    },
    lower: {
      category: "String",
      documentation: "Converts a string to lowercase.",
      parameters: [],
      returnValue: { type: "string", description: "The lowercase string." },
    },
    title: {
      category: "String",
      documentation: "Title-cases a string.",
      parameters: [],
      returnValue: { type: "string", description: "The title-cased string." },
    },
    replace: {
      category: "String",
      documentation: "Replaces a substring in a string.",
      parameters: [
        { name: "old", type: "string", description: "Substring to replace." },
        { name: "new", type: "string", description: "Replacement value." },
      ],
      returnValue: { type: "string", description: "The updated string." },
    },
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(
        'script[data-jinja-widget-module="' + src + '"]'
      );
      if (existing) {
        if (existing.dataset.loaded === "true") return resolve();
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () =>
          reject(new Error("failed to load " + src))
        );
        return;
      }
      const tag = document.createElement("script");
      tag.src = src;
      tag.dataset.jinjaWidgetModule = src;
      tag.onload = () => {
        tag.dataset.loaded = "true";
        resolve();
      };
      tag.onerror = () => reject(new Error("failed to load " + src));
      document.head.appendChild(tag);
    });
  }

  function ensureWidgetModules() {
    const ns = window.JinjaEditorWidget || {};
    const preloadCheck = {
      hasMonaco: !!(ns.monaco && typeof ns.monaco.ensure === "function"),
      hasLanguageDef: !!ns.languageDefinition,
      hasFilterSignatures: !!ns.filterSignatures,
      hasSnippets: !!ns.snippets,
      hasTemplateExamples: !!ns.templateExamples,
    };
    // Conventional path: scripts are preloaded from view.html.
    if (
      preloadCheck.hasMonaco &&
      preloadCheck.hasLanguageDef &&
      preloadCheck.hasFilterSignatures &&
      preloadCheck.hasSnippets &&
      preloadCheck.hasTemplateExamples
    ) {
      return Promise.resolve();
    }
    // Scope cache by widget base path so version upgrades in the same tab
    // don't reuse stale module promises from an older install.
    const cache =
      (window.__jinjaWidgetModulesReadyByBase =
        window.__jinjaWidgetModulesReadyByBase || {});
    if (cache[WIDGET_BASE]) {
      return cache[WIDGET_BASE];
    }
    // Load constants first (in parallel), then the monaco module which reads them.
    const constants = WIDGET_MODULES.slice(0, -1).map(loadScript);
    const service = WIDGET_MODULES[WIDGET_MODULES.length - 1];
    cache[WIDGET_BASE] = Promise.all(constants)
      .then(() => loadScript(service))
      .catch((e) => {
        console.warn("[JinjaWidget] ensureWidgetModules: dynamic load FAILED", {
          error: e && e.message,
          WIDGET_BASE: WIDGET_BASE,
        });
        delete cache[WIDGET_BASE]; // allow retry after transient load failures
        throw e;
      });
    return cache[WIDGET_BASE];
  }

  function jinjaEditorWidget114DevCtrl(
    $scope,
    $rootScope,
    $state,
    $window,
    $timeout,
    config,
    dynamicValueService,
    Modules,
    toaster,
    CommonUtils
  ) {
    $scope.config = config;
    $scope.angular = angular;
    $scope.widgetVersion = WIDGET_VERSION;

    $scope.processing = false;
    $scope.loadingRecord = false;
    $scope.isErrorOutput = false;
    $scope.output = null;
    $scope.inputJsonError = null;
    $scope.monacoReady = false;

    $scope.isViewPanel =
      $state &&
      $state.current &&
      typeof $state.current.name === "string" &&
      $state.current.name.indexOf("viewPanel") !== -1;

    $scope.templateText = (config && config.defaultTemplate) || "";
    $scope.inputJsonText = JSON.stringify(
      { vars: { input: { records: [{}] } } },
      null,
      2
    );

    $scope.outputEditorOptions = { mode: "view", modes: ["view", "code"] };

    $scope.templateExamples = FALLBACK_TEMPLATE_EXAMPLES;
    $scope.selectedExampleId = "";

    $scope.filterPaletteOpen = false;
    $scope.filterPaletteQuery = "";
    $scope.savedInputJson = null;
    $scope.filterPaletteGroups = [];

    $scope.submit = submit;
    $scope.loadCurrentRecord = loadCurrentRecord;
    $scope.copyTemplate = copyTemplate;
    $scope.formatInput = formatInput;
    $scope.applyExample = applyExample;
    $scope.toggleFilterPalette = toggleFilterPalette;
    $scope.closeFilterPalette = closeFilterPalette;
    $scope.insertFilter = insertFilter;
    $scope.handleFilterSearchKey = function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const groups = $scope.filterPaletteGroups || [];
      const first = groups[0] && groups[0].filters && groups[0].filters[0];
      if (first) insertFilter(first.name);
    };
    $scope.paramSummary = function (params) {
      return (params || [])
        .map(function (p) {
          return p.name + ": " + p.type;
        })
        .join(", ");
    };
    $scope.totalFilterCount = function (groups) {
      return (groups || []).reduce(function (acc, g) {
        return acc + g.filters.length;
      }, 0);
    };

    let inputEditor = null;
    let templateEditor = null;
    let templateContentDisposable = null;
    let markerReScanTimer = null;

    // Derive Monaco theme names from $rootScope.theme.id (set by SOAR).
    // 'light' → vs / jinjaThemeLight; everything else (dark, navy, …) → vs-dark / jinjaTheme.
    function isLightTheme() {
      return $rootScope.theme && $rootScope.theme.id === "light";
    }

    $scope.isDark = !isLightTheme();

    // monaco.editor.setTheme() is global — one call sets the theme for every
    // editor on the page. Both editor configs must use the same theme name so
    // whichever directive creates its editor last doesn't clobber the other.
    // jinjaTheme/jinjaThemeLight inherit from vs-dark/vs respectively, so the
    // JSON input editor looks correct even though it uses the jinja theme name.
    function currentMonacoTheme() {
      return isLightTheme() ? "jinjaThemeLight" : "jinjaTheme";
    }

    function applyMonacoTheme() {
      $scope.isDark = !isLightTheme();
      if (!$scope.monacoReady || !window.monaco) return;
      window.monaco.editor.setTheme(currentMonacoTheme());
    }

    // Config objects the SOAR monacoEditor directive passes to
    // monaco.editor.create. The directive mutates `.value` before create,
    // so these are not frozen. Both use the same theme name — see above.
    $scope.inputEditorConfig = {
      language: "json",
      theme: currentMonacoTheme(),
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 12,
      tabSize: 2,
    };
    $scope.templateEditorConfig = {
      language: "jinja",
      theme: currentMonacoTheme(),
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 12,
      tabSize: 2,
      autoClosingBrackets: "always",
      autoClosingQuotes: "always",
      autoSurround: "languageDefined",
      matchBrackets: "always",
      bracketPairColorization: { enabled: true },
      "semanticHighlighting.enabled": true,
      // Render hover/suggestion widgets in a fixed-position layer attached to
      // <body> so they aren't clipped by ancestors with overflow:hidden.
      fixedOverflowWidgets: true,
    };

    // React to the user switching SOAR themes at runtime.
    // Guard with monacoReady — themes aren't registered until ensure() resolves,
    // so setTheme calls before that silently fail. applyMonacoTheme() is also
    // called explicitly after monacoReady flips true to handle the initial state.
    $scope.$watch(
      function () { return $rootScope.theme && $rootScope.theme.id; },
      function () { applyMonacoTheme(); }
    );

    $scope.onInputEditorReady = function (editor) {
      inputEditor = editor;
    };
    $scope.onTemplateEditorReady = function (editor) {
      templateEditor = editor;
      const hasEnhance =
        window.JinjaEditorWidget &&
        window.JinjaEditorWidget.monaco &&
        typeof window.JinjaEditorWidget.monaco.enhanceEditor === "function";
      if (hasEnhance) {
        window.JinjaEditorWidget.monaco.enhanceEditor(templateEditor);
      }
      templateContentDisposable = editor.onDidChangeModelContent(function () {
        onTemplateContentChanged();
      });
      // Initial scan so squiggles appear without requiring a render or edit.
      scheduleTemplateScan(0);
    };

    ensureWidgetModules()
      .then(() => window.JinjaEditorWidget.monaco.ensure())
      .then(() => {
        $timeout(() => {
          $scope.templateExamples = getTemplateExamples();
          // Flip the flag *after* language/theme registration so the
          // monacoEditor directive's synchronous create() call sees them.
          $scope.monacoReady = true;
          // Themes are now registered — apply the correct one. The $watch
          // above may have fired before this point (before themes existed).
          applyMonacoTheme();
          pushInputContext($scope.inputJsonText);
        });
      })
      .catch((err) => {
        console.error("[JinjaWidget] Monaco load chain FAILED", {
          message: err && err.message,
          stack: err && err.stack,
        });
        toaster.error({ body: "Editor failed to load: " + err.message });
      });

    $scope.$watch("inputJsonText", (val) => {
      pushInputContext(val);
      // Path-existence warnings depend on input JSON — rescan when it changes.
      if (templateEditor) scheduleTemplateScan(600);
    });

    // Parse the Input pane silently and push the resulting object to the
    // Monaco completion provider. Invalid JSON is ignored here — we surface
    // parse errors only when the user clicks Render via parseInput().
    function pushInputContext(val) {
      const setter =
        window.JinjaEditorWidget &&
        window.JinjaEditorWidget.monaco &&
        window.JinjaEditorWidget.monaco.setInputContext;
      if (typeof setter !== "function") return;
      if (!val || !val.trim()) {
        setter(null);
        return;
      }
      try {
        setter(JSON.parse(val));
      } catch (e) {
        // Keep the last good context on parse errors so autocomplete doesn't
        // disappear every time the user is mid-edit.
      }
    }

    function parseInput() {
      if (!$scope.inputJsonText || !$scope.inputJsonText.trim()) {
        $scope.inputJsonError = null;
        return {};
      }
      try {
        const parsed = JSON.parse($scope.inputJsonText);
        $scope.inputJsonError = null;
        return parsed;
      } catch (e) {
        $scope.inputJsonError = e.message;
        return null;
      }
    }

    // --- Filter library palette ---------------------------------------------

    function getTemplateExamples() {
      const loaded =
        (window.JinjaEditorWidget &&
          window.JinjaEditorWidget.templateExamples) ||
        [];
      return Array.isArray(loaded) && loaded.length
        ? loaded
        : FALLBACK_TEMPLATE_EXAMPLES;
    }

    function getFilterSignatures() {
      return (
        (window.JinjaEditorWidget &&
          window.JinjaEditorWidget.filterSignatures) ||
        FALLBACK_FILTER_SIGNATURES
      );
    }

    function allFilterEntries() {
      const sigs = getFilterSignatures();
      return Object.keys(sigs).map(function (name) {
        const sig = sigs[name];
        const params = (sig.parameters || [])
          .map(function (p) {
            return p.name + ": " + p.type;
          })
          .join(", ");
        return {
          name: name,
          category: sig.category || "Other",
          documentation: sig.documentation || "",
          example: sig.example || "",
          parameters: sig.parameters || [],
          returnValue: sig.returnValue || { type: "any", description: "" },
          signature:
            params.length > 0
              ? name + "(" + params + ") → " + (sig.returnValue || {}).type
              : name + " → " + (sig.returnValue || {}).type,
        };
      });
    }

    function groupFiltersByCategory(entries) {
      const order =
        (window.JinjaEditorWidget &&
          window.JinjaEditorWidget.filterCategoryOrder) || [
          "String",
          "Collection",
          "Number",
          "Value",
          "Encoding",
          "Conversion",
          "Other",
        ];
      const buckets = {};
      entries.forEach(function (e) {
        const cat = e.category || "Other";
        (buckets[cat] = buckets[cat] || []).push(e);
      });
      Object.keys(buckets).forEach(function (cat) {
        buckets[cat].sort(function (a, b) {
          return a.name.localeCompare(b.name);
        });
      });
      const groups = [];
      order.forEach(function (cat) {
        if (buckets[cat] && buckets[cat].length) {
          groups.push({ category: cat, filters: buckets[cat] });
          delete buckets[cat];
        }
      });
      // Any unknown categories fall through the bottom.
      Object.keys(buckets).forEach(function (cat) {
        groups.push({ category: cat, filters: buckets[cat] });
      });
      return groups;
    }

    $scope.rebuildFilterGroups = rebuildFilterGroups;
    function rebuildFilterGroups(queryOverride) {
      // Accept query as an argument so ng-change can pass the child-scope value
      // directly (ng-include creates an extra scope layer where ng-model writes).
      const raw = typeof queryOverride === "string" ? queryOverride : ($scope.filterPaletteQuery || "");
      const query = raw.trim().toLowerCase();
      const all = allFilterEntries();
      const matching = query
        ? all.filter(function (e) {
            return (
              e.name.toLowerCase().indexOf(query) !== -1 ||
              e.documentation.toLowerCase().indexOf(query) !== -1 ||
              e.category.toLowerCase().indexOf(query) !== -1
            );
          })
        : all;
      $scope.filterPaletteGroups = groupFiltersByCategory(matching);
    }

    function toggleFilterPalette() {
      $scope.filterPaletteOpen = !$scope.filterPaletteOpen;
      if ($scope.filterPaletteOpen) {
        rebuildFilterGroups();
        // Focus the search box once the panel is rendered.
        $timeout(function () {
          const el = document.getElementById("jinja-widget-filter-search");
          if (el) el.focus();
        });
      }
    }

    function closeFilterPalette() {
      if (!$scope.filterPaletteOpen) return;
      $scope.filterPaletteOpen = false;
      $scope.filterPaletteQuery = "";
    }

    // Inserts a filter at the template editor's cursor. If text is selected,
    // the filter is appended after it. The insertion uses a snippet so
    // parameters become tab stops and the user can fill them in order.
    function insertFilter(filterName) {
      if (!templateEditor || !filterName) return;
      const sigs = getFilterSignatures();
      const sig = sigs[filterName];
      if (!sig) return;

      const params = sig.parameters || [];
      let snippet;
      if (params.length === 0) {
        snippet = " | " + filterName + "$0";
      } else {
        const placeholders = params
          .map(function (p, i) {
            return "${" + (i + 1) + ":" + p.name + "}";
          })
          .join(", ");
        snippet = " | " + filterName + "(" + placeholders + ")$0";
      }

      templateEditor.focus();

      // Inspect the text on the current line up to the cursor to decide whether
      // the user already typed a pipe. If the text before the cursor ends with
      // `|\s*` we omit the leading ` | ` from the snippet to avoid `| | filter`.
      const pos = templateEditor.getPosition();
      let alreadyHasPipe = false;
      if (pos) {
        const model = templateEditor.getModel();
        const lineUpToCursor = model && model.getValueInRange({
          startLineNumber: pos.lineNumber, startColumn: 1,
          endLineNumber: pos.lineNumber, endColumn: pos.column,
        });
        alreadyHasPipe = /\|\s*$/.test(lineUpToCursor || "");
      }

      if (alreadyHasPipe) {
        // Strip the leading " | " — keep only the filter name and params.
        snippet = snippet.replace(/^ \| /, "");
      } else if (pos && pos.column > 1) {
        // If there's no pipe but the char before is a space, drop just the
        // leading space so we don't double up whitespace.
        const model = templateEditor.getModel();
        const charBefore = model && model.getValueInRange({
          startLineNumber: pos.lineNumber, startColumn: pos.column - 1,
          endLineNumber: pos.lineNumber, endColumn: pos.column,
        });
        if (charBefore === " ") {
          snippet = snippet.replace(/^ /, "");
        }
      }

      const contribution = templateEditor.getContribution("snippetController2");
      if (contribution && typeof contribution.insert === "function") {
        contribution.insert(snippet);
      } else {
        // Fallback: plain text insertion at the cursor.
        const selection = templateEditor.getSelection();
        const basePlain =
          params.length === 0
            ? filterName
            : filterName + "(" + params.map(function (p) { return p.name; }).join(", ") + ")";
        const plain = alreadyHasPipe ? basePlain : " | " + basePlain;
        templateEditor.executeEdits("jinja-insert-filter", [
          { range: selection, text: plain, forceMoveMarkers: true },
        ]);
      }
      closeFilterPalette();
    }

    function applyExample(exampleId) {
      if (!exampleId) return;
      const examples = getTemplateExamples();
      const example = examples.find(function (e) {
        return e.id === exampleId;
      });
      if (!example) return;
      const nextTemplate = example.template || "";
      $scope.templateText = nextTemplate;
      $scope.output = null;
      $scope.isErrorOutput = false;
      if (templateEditor) templateEditor.setValue(nextTemplate);
      if (example.input) {
        $scope.savedInputJson = null;
        setInputJson(JSON.stringify(example.input, null, 2));
      }
      // Reset the dropdown so the same example can be re-selected later.
      $timeout(function () {
        $scope.selectedExampleId = "";
      });
    }

    // Rich input that satisfies all built-in filter examples.
    var FILTER_EXAMPLE_INPUT = JSON.stringify({
      vars: {
        input: {
          records: [
            {
              name: "  Ada Lovelace  ",
              description: "A pioneering computer scientist who wrote the first algorithm.",
              status: "open",
              tags: "python,jinja,automation",
              body: "Line one\nLine two\nLine three",
              htmlBody: "<p>Hello <b>world</b></p>",
              userInput: "<script>alert('xss')</script>",
              htmlContent: "<em>safe content</em>",
              query: "hello world",
              notes: "Visit https://example.com for more info.",
              count: 42,
              ratio: 3.14159,
              delta: -7,
              score: 98.765,
              severity: 3
            },
            {
              name: "Grace Hopper",
              description: "Rear Admiral known for COBOL and debugging.",
              status: "closed",
              tags: "cobol,navy,debugging",
              body: "First line\nSecond line",
              htmlBody: "<p>Another <b>record</b></p>",
              userInput: "safe input",
              htmlContent: "<strong>more content</strong>",
              query: "grace hopper",
              notes: "See https://navy.mil.",
              count: 17,
              ratio: 2.71828,
              delta: 5,
              score: 75.0,
              severity: 1
            },
            {
              name: "Alan Turing",
              description: "Mathematician and father of theoretical computer science.",
              status: "open",
              tags: "math,computing,ai",
              body: "Alpha\nBeta\nGamma",
              htmlBody: "<p>Third <b>entry</b></p>",
              userInput: "<b>bold</b>",
              htmlContent: "<i>italic content</i>",
              query: "turing test",
              notes: "No URL here.",
              count: 99,
              ratio: 1.41421,
              delta: 0,
              score: 100.0,
              severity: 5
            }
          ]
        }
      }
    }, null, 2);

    // Inserts the filter's usage example at the cursor in the template editor,
    // and seeds the input JSON with example data. The original input is saved
    // so the user can revert; subsequent tries keep the same saved original.
    function insertFilterExample(filterName) {
      if (!templateEditor || !filterName) return;
      const sigs = getFilterSignatures();
      const sig = sigs[filterName];
      if (!sig || !sig.example) return;

      templateEditor.focus();
      const contribution = templateEditor.getContribution("snippetController2");
      const text = sig.example + "$0";
      if (contribution && typeof contribution.insert === "function") {
        contribution.insert(text);
      } else {
        const selection = templateEditor.getSelection();
        templateEditor.executeEdits("jinja-insert-example", [
          { range: selection, text: sig.example, forceMoveMarkers: true },
        ]);
      }

      // Save original input only on the first "try" in this session.
      if ($scope.savedInputJson === null) {
        $scope.savedInputJson = inputEditor ? inputEditor.getValue() : $scope.inputJsonText;
      }
      setInputJson(FILTER_EXAMPLE_INPUT);
    }
    $scope.insertFilterExample = insertFilterExample;

    function revertFilterInput() {
      if ($scope.savedInputJson === null) return;
      const restored = $scope.savedInputJson;
      $scope.savedInputJson = null;
      setInputJson(restored);
    }
    $scope.revertFilterInput = revertFilterInput;

    function setInputJson(text) {
      $scope.inputJsonText = text;
      $scope.inputJsonError = null;
      if (inputEditor) inputEditor.setValue(text);
    }

    function formatInput() {
      // Pull the current buffer straight from the editor — the scope-bound
      // `inputJsonText` can lag behind keystrokes depending on how the SOAR
      // monacoEditor directive wires its model binding.
      const current = inputEditor ? inputEditor.getValue() : $scope.inputJsonText;
      if (!current || !current.trim()) {
        $scope.inputJsonError = null;
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(current);
      } catch (e) {
        $scope.inputJsonError = e.message;
        toaster.warning({ body: "Input JSON is malformed: " + e.message });
        return;
      }
      const pretty = JSON.stringify(parsed, null, 2);
      setInputJson(pretty);
    }

    // Parses a Jinja error message for a 1-based line number.
    // Handles patterns like "line 3", "line: 3", "(line 3)", "at line 3".
    function parseErrorLineNumber(msg) {
      if (!msg) return null;
      const m = msg.match(/(?:^|[\s(])line[:\s]+(\d+)/i);
      return m ? parseInt(m[1], 10) : null;
    }

    // Scans template text for the last line that has an unclosed `{%` or `{{`
    // tag (no corresponding `%}` / `}}`). Used when the API error message does
    // not contain an explicit line number (e.g. "unexpected end of template").
    // Returns a 1-based line number, or null if nothing suspicious is found.
    function findUnclosedTagLine(templateText) {
      if (!templateText) return null;
      const lines = templateText.split("\n");
      let lastUnclosed = null;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const hasBlockOpen = line.indexOf("{%") !== -1;
        const hasBlockClose = line.indexOf("%}") !== -1;
        const hasExprOpen = line.indexOf("{{") !== -1;
        const hasExprClose = line.indexOf("}}") !== -1;
        if ((hasBlockOpen && !hasBlockClose) || (hasExprOpen && !hasExprClose)) {
          lastUnclosed = i + 1; // 1-based
        }
      }
      return lastUnclosed;
    }

    // Pure function: resolveInputPath
    // Walks a dotted/bracket path string against a JS object.
    // Returns { found: true, value: any } or { found: false }
    function resolveInputPath(obj, pathStr) {
      if (!obj || !pathStr) return { found: false };
      const segments = [];
      let current = pathStr;
      while (current) {
        const dotIdx = current.indexOf(".");
        const bracketIdx = current.indexOf("[");
        let seg = "";
        if (dotIdx === -1 && bracketIdx === -1) {
          segments.push(current);
          break;
        }
        if (dotIdx !== -1 && (bracketIdx === -1 || dotIdx < bracketIdx)) {
          seg = current.slice(0, dotIdx);
          segments.push(seg);
          current = current.slice(dotIdx + 1);
        } else if (bracketIdx !== -1) {
          if (bracketIdx > 0) {
            seg = current.slice(0, bracketIdx);
            segments.push(seg);
          }
          const closeIdx = current.indexOf("]", bracketIdx);
          if (closeIdx === -1) return { found: false };
          const indexStr = current.slice(bracketIdx + 1, closeIdx);
          segments.push("[" + indexStr + "]");
          current = current.slice(closeIdx + 1);
          if (current.startsWith(".")) current = current.slice(1);
        }
      }
      let val = obj;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (seg.startsWith("[")) {
          const idx = parseInt(seg.slice(1, -1), 10);
          if (!Array.isArray(val) || idx < 0 || idx >= val.length) {
            return { found: false };
          }
          val = val[idx];
        } else {
          if (val == null || typeof val !== "object" || !(seg in val)) {
            return { found: false };
          }
          val = val[seg];
        }
      }
      return { found: true, value: val };
    }

    // Pure function: collectLocalNames
    // Scans {% set/for/with/macro %} tags and returns the set of names they
    // bind. These are template-local and won't be present in inputData, so
    // checkInputPaths must not flag expressions rooted at them.
    function collectLocalNames(templateText) {
      const names = new Set();
      if (!templateText) return names;
      const tagRegex = /\{%-?\s*([\s\S]*?)\s*-?%\}/g;
      let m;
      while ((m = tagRegex.exec(templateText)) !== null) {
        const body = m[1].trim();
        let sm;
        if ((sm = body.match(/^set\s+([A-Za-z_][\w]*(?:\s*,\s*[A-Za-z_][\w]*)*)\s*=/))) {
          sm[1].split(",").forEach(function (n) { names.add(n.trim()); });
        } else if ((sm = body.match(/^for\s+([A-Za-z_][\w]*(?:\s*,\s*[A-Za-z_][\w]*)*)\s+in\s+/))) {
          sm[1].split(",").forEach(function (n) { names.add(n.trim()); });
        } else if ((sm = body.match(/^with\s+([A-Za-z_][\w]*)\s*=/))) {
          names.add(sm[1]);
        } else if ((sm = body.match(/^macro\s+[A-Za-z_][\w]*\s*\(([^)]*)\)/))) {
          sm[1].split(",").forEach(function (p) {
            const name = p.split("=")[0].trim();
            if (name) names.add(name);
          });
        }
      }
      return names;
    }

    // Pure function: checkInputPaths
    // Extracts {{ expr }} blocks, strips filters, validates against inputData.
    // Returns array of { line, path, message }
    function checkInputPaths(templateText, inputData) {
      if (!templateText || !inputData) return [];
      const findings = [];
      const lines = templateText.split("\n");
      const pathsChecked = new Set();
      const localNames = collectLocalNames(templateText);
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        const exprRegex = /\{\{([^}]*)\}\}/g;
        let match;
        while ((match = exprRegex.exec(line)) !== null) {
          let expr = match[1].trim();
          const pipeIdx = expr.indexOf("|");
          if (pipeIdx !== -1) expr = expr.slice(0, pipeIdx).trim();
          if (!expr || expr.startsWith("loop.") || expr.startsWith("range(") ||
              expr.match(/^['"`]/) || expr.match(/^\d+(\.\d+)?$/) ||
              expr.match(/^(true|false|none)$/i) ||
              expr.match(/^(if|for|with|macro|call|set|block|extends|include)\s/i)) {
            continue;
          }
          const rootMatch = expr.match(/^([A-Za-z_][\w]*)/);
          if (rootMatch && localNames.has(rootMatch[1])) continue;
          if (pathsChecked.has(expr)) continue;
          pathsChecked.add(expr);
          const res = resolveInputPath(inputData, expr);
          if (!res.found) {
            findings.push({
              line: lineNum + 1,
              path: expr,
              message: '"' + expr + '" was not found in the test input — check the field name',
            });
          }
        }
      }
      return findings;
    }

    // Pure function: translateJinjaError
    // Maps known SOAR/Jinja error patterns to human-readable strings
    function translateJinjaError(msg) {
      if (!msg) return msg;
      const lower = msg.toLowerCase();
      if (lower.match(/list\s+(?:index\s+)?(?:out of range|object\s+)?has\s+no\s+attribute|'list'\s+object\s+has\s+no\s+attribute|list index out of range/)) {
        return "vars.input.records may be empty or doesn't have enough items — wrap with {% if vars.input.records %} to guard (original: " + msg + ")";
      }
      if (lower.match(/has\s+no\s+attribute/) && !lower.match(/list/)) {
        return "A field was not found — check the variable name and make sure it exists in the input (original: " + msg + ")";
      }
      if (lower.match(/no\s+filter\s+named|unknown\s+filter/)) {
        return "Unknown filter name — check spelling or browse the filter library (original: " + msg + ")";
      }
      if (lower.match(/expected token|unexpected|end of statement block|end of template/)) {
        return "Syntax error in template — check for unclosed {{ }}, {% %}, or mismatched tags (original: " + msg + ")";
      }
      if (lower.match(/division by zero|modulo by zero/)) {
        return "Division by zero — the divisor evaluated to 0 (original: " + msg + ")";
      }
      if (lower.match(/filter.*requires|takes.*argument|takes no arguments/)) {
        return "A filter was called with the wrong number of arguments — check the filter library for the correct signature (original: " + msg + ")";
      }
      if (lower.match(/cannot convert|int\(\)|float\(\)/)) {
        return "Type error — a filter or expression received the wrong data type (original: " + msg + ")";
      }
      return msg;
    }

    // Pure function: scanTemplate
    // Validates template structure: unclosed tags, block nesting, filters, records guard
    // Returns array of { line, message }
    function scanTemplate(templateText, inputData, knownFilters) {
      const findings = [];
      if (!templateText) return findings;
      const lines = templateText.split("\n");
      const blockStack = [];
      const openingTags = new Set(["if", "for", "block", "macro", "call", "filter", "set", "with"]);
      const closingTagMap = {
        endif: "if",
        endfor: "for",
        endblock: "block",
        endmacro: "macro",
        endcall: "call",
        endfilter: "filter",
        endset: "set",
        endwith: "with",
      };
      let recordsCheckLine = null;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;
        // Case 1: Unclosed {{ }}
        const exprOpenIdx = line.indexOf("{{");
        if (exprOpenIdx !== -1) {
          const exprCloseIdx = line.indexOf("}}", exprOpenIdx);
          if (exprCloseIdx === -1) {
            findings.push({
              line: lineNum,
              message: "Unclosed expression — did you mean {{ ... }}?",
            });
          } else {
            const expr = line.slice(exprOpenIdx + 2, exprCloseIdx);
            // Case: pipe followed by no filter name (e.g. `{{ x | }}`).
            if (/\|\s*$/.test(expr)) {
              findings.push({
                line: lineNum,
                message: "Missing filter name after `|` — add a filter (e.g. `| upper`) or remove the pipe",
              });
            }
            // Case 6: Unknown filters
            if (knownFilters) {
              const filterMatches = expr.match(/\|\s*(\w+)/g);
              if (filterMatches) {
                for (const fm of filterMatches) {
                  const filterName = fm.replace(/\|\s*/, "");
                  if (!knownFilters.has(filterName)) {
                    findings.push({
                      line: lineNum,
                      message: 'Unknown filter "' + filterName + '" — check spelling or see the filter library',
                    });
                    break;
                  }
                }
              }
            }
          }
        }
        // Cases 2 & 3: scan ALL {% %} blocks on this line
        let searchFrom = 0;
        while (true) {
          const blockOpenIdx = line.indexOf("{%", searchFrom);
          if (blockOpenIdx === -1) break;
          const blockCloseIdx = line.indexOf("%}", blockOpenIdx + 2);
          if (blockCloseIdx === -1) {
            findings.push({
              line: lineNum,
              message: "Unclosed block tag — did you mean {% ... %}?",
            });
            break; // rest of line is inside the unclosed tag
          }
          const content = line.slice(blockOpenIdx + 2, blockCloseIdx).trim();
          const tagMatch = content.match(/^-?\s*(\w+)/);
          const tagName = tagMatch ? tagMatch[1] : null;
          if (tagName && openingTags.has(tagName)) {
            blockStack.push({ tag: tagName, line: lineNum });
          } else if (tagName && closingTagMap[tagName]) {
            if (blockStack.length === 0 || blockStack[blockStack.length - 1].tag !== closingTagMap[tagName]) {
              findings.push({
                line: lineNum,
                message: "Unexpected {{% end" + closingTagMap[tagName] + " %}} — no matching {{% " + closingTagMap[tagName] + " %}} found",
              });
            } else {
              blockStack.pop();
            }
          }
          searchFrom = blockCloseIdx + 2;
        }
        // Case 5: Track vars.input.records first reference
        if (recordsCheckLine === null && line.match(/vars\.input\.records/) && inputData) {
          recordsCheckLine = lineNum;
        }
      }
      // Case 3 continued: Unclosed openers
      for (const opener of blockStack) {
        findings.push({
          line: opener.line,
          message: "{{% " + opener.tag + " %}} on line " + opener.line + " was never closed with {{% end" + opener.tag + " %}}",
        });
      }
      // Case 5: Empty vars.input.records
      if (recordsCheckLine !== null && inputData) {
        const records = (inputData && inputData.vars && inputData.vars.input && inputData.vars.input.records) || null;
        if (!records || !Array.isArray(records) || records.length === 0) {
          findings.push({
            line: recordsCheckLine,
            message: "vars.input.records is empty in the test input — template may fail at runtime",
          });
        }
      }
      return findings;
    }

    function clearTemplateMarkers() {
      if (markerReScanTimer) { clearTimeout(markerReScanTimer); markerReScanTimer = null; }
      if (!templateEditor || !window.monaco) return;
      const model = templateEditor.getModel();
      if (model) window.monaco.editor.setModelMarkers(model, "jinja-render", []);
    }

    function runTemplateScan() {
      if (!templateEditor || !window.monaco) return;
      const template = templateEditor.getValue();
      if (!template || !template.trim()) {
        clearTemplateMarkers();
        return;
      }
      const inputData = parseInput();
      const knownFilters = new Set(Object.keys(getFilterSignatures()));
      const findings = scanTemplate(template, inputData || {}, knownFilters);
      // Path-existence warnings only make sense when input JSON is valid.
      if (inputData) {
        const pathFindings = checkInputPaths(template, inputData);
        for (const pf of pathFindings) {
          findings.push({
            line: pf.line,
            message: pf.message,
            severity: window.monaco.MarkerSeverity ? window.monaco.MarkerSeverity.Warning : 4,
          });
        }
      }
      if (findings.length > 0) {
        applyMarkers(findings);
      } else {
        clearTemplateMarkers();
      }
    }

    function scheduleTemplateScan(delayMs) {
      if (markerReScanTimer) clearTimeout(markerReScanTimer);
      markerReScanTimer = setTimeout(function () {
        markerReScanTimer = null;
        runTemplateScan();
      }, typeof delayMs === "number" ? delayMs : 600);
    }

    // Narrow a squiggle to the offending {{ … }} or {% … %} on the line so the
    // hover tooltip is easy to trigger and visually attached to the right span.
    // Falls back to the line's non-whitespace range if no template markers found.
    function computeMarkerRange(lineContent, finding) {
      if (finding.startColumn && finding.endColumn) {
        return { startCol: finding.startColumn, endCol: finding.endColumn };
      }
      // Prefer the open marker mentioned in the message, else whichever appears.
      const msg = (finding.message || "").toLowerCase();
      let openIdx = -1;
      let close;
      if (msg.indexOf("block tag") !== -1 || msg.indexOf("end") !== -1 ||
          msg.indexOf("never closed") !== -1 || msg.indexOf("{%") !== -1) {
        openIdx = lineContent.indexOf("{%");
        close = "%}";
      }
      if (openIdx === -1) {
        openIdx = lineContent.indexOf("{{");
        close = "}}";
      }
      if (openIdx === -1) {
        openIdx = lineContent.indexOf("{%");
        close = "%}";
      }
      if (openIdx === -1) {
        const ws = lineContent.search(/\S/);
        return { startCol: (ws >= 0 ? ws + 1 : 1), endCol: lineContent.length + 1 };
      }
      const closeIdx = lineContent.indexOf(close, openIdx + 2);
      const endCol = closeIdx === -1 ? lineContent.length + 1 : closeIdx + close.length + 1;
      return { startCol: openIdx + 1, endCol: endCol };
    }

    function applyMarkers(findings) {
      if (!templateEditor || !window.monaco) return;
      const model = templateEditor.getModel();
      if (!model) return;
      const markers = [];
      for (const finding of findings) {
        const lineNumber = finding.line;
        const msg = finding.message;
        const severity = finding.severity || (window.monaco.MarkerSeverity ? window.monaco.MarkerSeverity.Error : 8);
        const lineContent = (model.getLineContent ? model.getLineContent(lineNumber) : null) || "";
        const range = computeMarkerRange(lineContent, finding);
        markers.push({
          severity: severity,
          message: msg,
          source: "jinja",
          startLineNumber: lineNumber,
          startColumn: range.startCol,
          endLineNumber: lineNumber,
          endColumn: range.endCol,
        });
      }
      window.monaco.editor.setModelMarkers(model, "jinja-render", markers);
    }

    function applyMarkerAtLine(lineNumber, msg) {
      applyMarkers([{ line: lineNumber, message: msg }]);
    }

    // Add a single error marker without dropping the existing markers (e.g.
    // scan findings) on the editor. Used for server-side render errors so the
    // server squiggle coexists with live-scan squiggles.
    function appendServerErrorMarker(lineNumber, msg) {
      if (!templateEditor || !window.monaco) return;
      const model = templateEditor.getModel();
      if (!model) return;
      const existing = (window.monaco.editor.getModelMarkers
        ? window.monaco.editor.getModelMarkers({ owner: "jinja-render", resource: model.uri })
        : []) || [];
      const lineContent = (model.getLineContent ? model.getLineContent(lineNumber) : null) || "";
      const range = computeMarkerRange(lineContent, { message: msg });
      const severity = window.monaco.MarkerSeverity ? window.monaco.MarkerSeverity.Error : 8;
      const merged = existing.concat([{
        severity: severity,
        message: msg,
        source: "jinja",
        startLineNumber: lineNumber,
        startColumn: range.startCol,
        endLineNumber: lineNumber,
        endColumn: range.endCol,
      }]);
      window.monaco.editor.setModelMarkers(model, "jinja-render", merged);
    }

    function setTemplateErrorMarker(msg) {
      if (!templateEditor || !window.monaco) return;
      const serverLine = parseErrorLineNumber(msg);
      if (serverLine) {
        appendServerErrorMarker(serverLine, msg);
        return;
      }
      // No server-provided line — let the live scan keep whatever findings
      // it already has. If the scan hasn't run yet (rare), fall back to the
      // unclosed-tag line scan.
      const scannedLine = findUnclosedTagLine(templateEditor.getValue());
      if (scannedLine) appendServerErrorMarker(scannedLine, msg);
    }

    // Called on every content-change. Always debounce a full live scan
    // (structural + path warnings) so squiggles update without requiring Render.
    function onTemplateContentChanged() {
      scheduleTemplateScan(600);
    }

    function submit() {
      // Always read from the live editor when available — insertFilter modifies
      // the editor directly without updating $scope.templateText.
      const templateToRender = templateEditor
        ? templateEditor.getValue()
        : $scope.templateText;

      if (!templateToRender || !templateToRender.trim()) {
        toaster.warning({ body: "Template is required." });
        return;
      }
      const values = parseInput();
      if (values === null) {
        $scope.isErrorOutput = true;
        $scope.output = "Input JSON is malformed: " + $scope.inputJsonError;
        return;
      }

      // Force a fresh live scan so warnings/errors are current when Render is
      // clicked, even if the debounced scan hasn't fired yet.
      runTemplateScan();

      $scope.processing = true;
      $scope.isErrorOutput = false;

      dynamicValueService
        .evaluateJinja({ template: templateToRender, values: values })
        .then(
          function (res) {
            $scope.output = res && res.result;
            $scope.isErrorOutput = false;
            // Refresh scan-based squiggles instead of clearing — render
            // succeeding doesn't mean the template is lint-clean.
            runTemplateScan();
          },
          function (err) {
            const msg =
              (err && err.data && (err.data.message || err.data.detail)) ||
              (err && err.statusText) ||
              "Unknown error";
            const translatedMsg = translateJinjaError(msg);
            $scope.isErrorOutput = true;
            $scope.output = "Error: " + translatedMsg;
            // Refresh scan markers, then overlay the server-side error marker
            // (if it has a line) on top so both kinds of squiggles coexist.
            runTemplateScan();
            setTemplateErrorMarker(translatedMsg);
          }
        )
        .finally(function () {
          $scope.processing = false;
        });
    }

    function applyRecordToInput(record) {
      const clone = angular.copy(record);
      delete clone.$promise;
      delete clone.$resolved;
      const fieldName = config && config.jsonSourceField;
      const input = { records: [clone] };
      if (fieldName) {
        let fieldValue = clone[fieldName];
        // SOAR often stores JSON payload fields (like sourcedata) as stringified
        // JSON. Parse strings so templates can index into them directly; surface
        // parse errors rather than silently falling back to an empty object.
        if (typeof fieldValue === "string" && fieldValue.trim()) {
          try {
            fieldValue = JSON.parse(fieldValue);
          } catch (e) {
            toaster.error({
              body:
                "Field '" +
                fieldName +
                "' is not valid JSON: " +
                e.message,
            });
            return;
          }
        }
        if (fieldValue && typeof fieldValue === "object" && !Array.isArray(fieldValue)) {
          // Merge the parsed field onto input, but keep records[0] = record so
          // templates can always reference vars.input.records[0].<any-field>.
          angular.extend(input, fieldValue, { records: [clone] });
        } else if (fieldValue != null) {
          input[fieldName] = fieldValue;
        }
      }
      const payload = { vars: { input: input } };

      const templateFieldName = config && config.templateSourceField;
      if (templateFieldName) {
        const raw = clone[templateFieldName];
        if (raw != null && raw !== "") {
          const nextTemplate = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
          $scope.templateText = nextTemplate;
          if (templateEditor) templateEditor.setValue(nextTemplate);
        }
      }
      const nextText = JSON.stringify(payload, null, 2);
      $scope.savedInputJson = null;
      setInputJson(nextText);
    }

    function loadCurrentRecord() {
      const module = $state.params && $state.params.module;
      const id = $state.params && $state.params.id;

      if (!module || !id) {
        toaster.warning({ body: "No record in scope." });
        return;
      }
      $scope.loadingRecord = true;
      Modules.get({ module: module, id: id })
        .$promise.then(
          function (record) {
            applyRecordToInput(record);
          },
          function (err) {
            toaster.error({
              body:
                "Failed to load record: " +
                ((err && err.statusText) || "unknown error"),
            });
          }
        )
        .finally(function () {
          $scope.loadingRecord = false;
        });
    }

    function copyTemplate() {
      if (!$scope.templateText) return;
      if (CommonUtils && typeof CommonUtils.copyToClipboard === "function") {
        CommonUtils.copyToClipboard($scope.templateText);
      } else if ($window.navigator && $window.navigator.clipboard) {
        $window.navigator.clipboard.writeText($scope.templateText);
      }
      toaster.success({ body: "Template copied to clipboard." });
    }


    function onPaletteKey(event) {
      if (event.key === "Escape" && $scope.filterPaletteOpen) {
        $scope.$applyAsync(function () {
          closeFilterPalette();
        });
      }
    }
    document.addEventListener("keydown", onPaletteKey);

    $scope.$on("$destroy", function () {
      document.removeEventListener("keydown", onPaletteKey);
      if (markerReScanTimer) { clearTimeout(markerReScanTimer); markerReScanTimer = null; }
      if (templateContentDisposable && typeof templateContentDisposable.dispose === "function") {
        templateContentDisposable.dispose();
        templateContentDisposable = null;
      }
    });
  }
})();
