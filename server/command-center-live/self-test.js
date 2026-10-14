"use strict";
const assert=require("assert");
process.env.PCT_COMMAND_CENTER_PREFIX="/pct-api/live";
const {normalizePath,frameText}=require("./app");
assert.strictEqual(normalizePath("/pct-api/live/health"),"/health");
assert.strictEqual(normalizePath("/health"),"/health");
const a=frameText("ok");assert.strictEqual(a[0],0x81);assert.strictEqual(a[1],2);assert.strictEqual(a.slice(2).toString(),"ok");
const long=frameText("x".repeat(200));assert.strictEqual(long[1],126);assert.strictEqual(long.readUInt16BE(2),200);
console.log("COMMAND CENTER LIVE SERVICE SELF-TEST PASS");
