import { expect, test } from "vitest";
import { normalizeRecapLines } from "../normalizeRecapLines";

test("splits text into trimmed non-empty lines", () => {
  expect(normalizeRecapLines("hello\n  world  \n")).toEqual(["hello", "world"]);
});

test("removes blank and whitespace-only lines", () => {
  expect(normalizeRecapLines("a\n\n  \nb")).toEqual(["a", "b"]);
});

test("strips leading dashes from markdown-style list items", () => {
  expect(normalizeRecapLines("- first\n-- second\n--- third")).toEqual([
    "first",
    "second",
    "third",
  ]);
});

test("strips dashes with extra whitespace", () => {
  expect(normalizeRecapLines("-  spaced\n-\ttabbed")).toEqual(["spaced", "tabbed"]);
});

test("preserves lines without dashes", () => {
  expect(normalizeRecapLines("no dashes here\nalso plain")).toEqual([
    "no dashes here",
    "also plain",
  ]);
});

test("filters out lines that become empty after dash removal", () => {
  expect(normalizeRecapLines("- \n--\ngood line")).toEqual(["good line"]);
});

test("handles empty input", () => {
  expect(normalizeRecapLines("")).toEqual([]);
});
