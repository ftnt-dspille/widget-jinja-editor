"use strict";

module.exports = {
  testEnvironment: "jsdom",
  testEnvironmentOptions: {
    url: "http://localhost/jinjaEditorWidget-dev/",
  },
  testMatch: ["<rootDir>/tests/**/*.test.js"],
};
