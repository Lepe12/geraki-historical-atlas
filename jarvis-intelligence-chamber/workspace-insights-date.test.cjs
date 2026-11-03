"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const target = path.join(__dirname, "workspace-insights.js");
const source = fs.readFileSync(target, "utf8");
const initializer = source.match(/^const sharedFormatter = new Intl\.DateTimeFormat\([^\n]+\);$/m);
const functionSource = source.match(/^function dateLabel\(value\) \{[\s\S]*?^\}/m);

test("history dates use exactly one shared Greek DateTimeFormat", () => {
  assert.ok(initializer, "missing shared formatter initialization");
  assert.ok(functionSource, "missing dateLabel function");
  let created = 0;
  const IntlSpy = {
    DateTimeFormat: class {
      constructor(...args) {
        created++;
        this.delegate = new Intl.DateTimeFormat(...args);
      }
      format(date) {
        return this.delegate.format(date);
      }
    },
  };
  const runtime = { module: { exports: null }, Intl: IntlSpy, Date, Number };
  vm.runInNewContext(initializer[0] + "\n" + functionSource[0] +
    "\nmodule.exports = dateLabel;", runtime);
  const dateLabel = runtime.module.exports;
  const expectedFormatter = new Intl.DateTimeFormat("el-GR", {
    dateStyle: "medium", timeStyle: "short",
  });
  const input = [null, "", undefined, "invalid",
    "2026-11-03T12:20:00Z", "1582-07-26T10:00:00Z",
    "2024-02-29T11:05:00Z"];
  for (let n = 0; n < 300; n++) {
    input.push(new Date(Date.UTC(2026, 0, 1 + n, 13, 5)).toISOString());
  }
  for (const value of input) {
    const parsed = new Date(value);
    const expected = !value || Number.isNaN(parsed.valueOf())
      ? "Ημερομηνία μη διαθέσιμη"
      : expectedFormatter.format(parsed);
    assert.equal(dateLabel(value), expected, "Greek date label changed for: " + value);
  }
  assert.equal(created, 1, "date formatter should not be reconstructed per row");
});
