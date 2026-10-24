const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const chamber = __dirname;
const root = path.resolve(chamber, "..");

function load(file) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(chamber, file), "utf8"), context, { filename: file });
  return context.window;
}

function pySplitLines(text) {
  const parts = text.split(/\r\n|\n|\r|\v|\f|\u001c|\u001d|\u001e|\u0085|\u2028|\u2029/);
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

function fold(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function citations(data) {
  const items = [];
  for (const voyage of data.voyages) {
    for (const segment of voyage.segments) {
      items.push({ id: segment.id, citation: segment.citation, drawn: true });
      for (const extra of segment.also_cited || []) items.push({ id: segment.id + ":also", citation: extra, drawn: true });
    }
  }
  for (const item of data.excluded) items.push({ id: item.id, citation: item.citation, drawn: false });
  return items;
}

test("drawable voyages are only fully cited Alexandria–Constantinople segments", () => {
  const window = load("cited-voyage-routes.js");
  const data = window.NABOU_CITED_ROUTES;
  const drawn = window.NABOU_drawableVoyages(data);
  assert.equal(data.geometry_meaning, "SCHEMATIC_CONNECTION_NOT_RECONSTRUCTED_SAILING_TRACK");
  assert.equal(data.verification_status, "UNVERIFIED");
  assert.equal(data.original_inspected, false);
  assert.deepEqual(Array.from(drawn, (voyage) => voyage.id), [
    "convoy-alexandria-constantinople-1679",
    "hospitaller-alexandria-constantinople",
  ]);
  const gazetteer = JSON.parse(fs.readFileSync(path.join(root, "data/gazetteer/mediterranean_gazetteer.v1.json"), "utf8"));
  const places = new Map(gazetteer.places.map((place) => [place.id, place]));
  const seen = [];
  for (const voyage of drawn) {
    for (const segment of voyage.segments) {
      seen.push(segment.id);
      for (const end of [segment.from, segment.to]) {
        const record = places.get(end.place_id);
        assert.ok(record, end.place_id);
        assert.equal(end.lat, record.coordinates.lat);
        assert.equal(end.lon, record.coordinates.lon);
        assert.equal(end.coordinate_source, record.coordinates.source);
        assert.notEqual(end.place_id, "gz:Q406");
      }
      assert.equal(segment.from.place_id, "gz:Q87");
      assert.equal(segment.to.place_id, "gz:Q16869");
      assert.equal(typeof segment.direction_stated, "boolean");
      assert.ok(segment.citation.book && segment.citation.page && segment.citation.excerpt && segment.citation.evidence_path && segment.citation.url);
    }
  }
  const excludedIds = data.excluded.map((item) => item.id);
  for (const id of excludedIds) assert.equal(seen.includes(id), false);
  assert.ok(excludedIds.includes("kapsis-mytikas-aegean-ionian"));
  assert.ok(excludedIds.includes("creveliers-1673-toward-karpathos"));
  assert.ok(excludedIds.includes("manettas-1682-astypalaia-ikaria"));
  assert.ok(excludedIds.includes("grassetto-1511-astypalaia-amorgos"));
  assert.ok(excludedIds.includes("kemiski-novel"));
  assert.ok(excludedIds.includes("fournoi-manetas-bay"));

  const broken = JSON.parse(JSON.stringify(data));
  broken.voyages[0].segments[0].citation.excerpt = "";
  assert.equal(window.NABOU_drawableVoyages(broken).some((voyage) => voyage.id === broken.voyages[0].id), false);
});

test("every citation excerpt is a contiguous span of its declared lines", () => {
  const data = load("cited-voyage-routes.js").NABOU_CITED_ROUTES;
  let checked = 0;
  for (const item of citations(data)) {
    const file = path.join(root, item.citation.evidence_path);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file);
    if (item.citation.source_text_sha256) {
      assert.equal(crypto.createHash("sha256").update(raw).digest("hex"), item.citation.source_text_sha256, item.id);
    }
    const lines = pySplitLines(raw.toString("utf8"));
    const [start, end] = item.citation.lines;
    assert.ok(start >= 1 && end >= start && end <= lines.length, item.id);
    const span = fold(lines.slice(start - 1, end).join("\n"));
    assert.equal(span.includes(fold(item.citation.excerpt)), true, item.id + " lines " + start + "-" + end);
    checked += 1;
  }
  if (fs.existsSync(path.join(root, "evidence"))) assert.ok(checked >= 18);
});

test("coastline is clipped geography, not a route", () => {
  const coast = load("mediterranean-coast.js").NABOU_MED_COAST;
  assert.deepEqual(Array.from(coast.bbox), [20.5, 29.6, 36.8, 42.4]);
  assert.ok(coast.polygons.length > 0);
  for (const polygon of coast.polygons) {
    for (const ring of [polygon.outer].concat(polygon.holes || [])) {
      for (const [lon, lat] of ring) {
        assert.ok(lon >= 20.5 - 0.02 && lon <= 36.8 + 0.02);
        assert.ok(lat >= 29.6 - 0.02 && lat <= 42.4 + 0.02);
      }
    }
  }
});
