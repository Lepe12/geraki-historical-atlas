/* NABOU//X — heraldic banners (gonfalons) for the research lanes, used by BOTH the 2D chart and the 3D map
   (map-3d-emblems.js rasterises the same SVG). Each lane's symbol is drawn on a vertical cloth hanging from a
   crossbar with gilded finials, cut at the bottom into three swallow-tail points with a gold fringe, in the
   state's own period colours. All shapes are drawn here, except the Ottoman tughra of Murad III, loaded once from
   assets/nautical/emblems/tughra_murad_iii.svg (public domain, see CREDITS.md there) into the shared <defs>.
   Exposes window.NABOU_EMBLEMS = { get(agentId) -> {w,h,svg}, ids, ready }. */
(() => {
  "use strict";
  const INK = "#2a190e", WHITE = "#f4efe2", PARCH = "#efe3c4", RED = "#a3342a", OX = "#7b1c17", BLUE = "#2f4a7a", GOLD = "#c9a24e", GREEN = "#3f6b4c", ORANGE = "#c76a2a";
  const NS = "http://www.w3.org/2000/svg";

  // shared defs (one copy in the document; <use> references work across inline SVGs)
  const defs = `<svg xmlns="${NS}" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>
<linearGradient id="nxEmShade" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>
<linearGradient id="nxBnFold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".26"/><stop offset=".12" stop-color="#fff" stop-opacity=".1"/><stop offset=".3" stop-color="#000" stop-opacity=".13"/><stop offset=".5" stop-color="#fff" stop-opacity=".12"/><stop offset=".7" stop-color="#000" stop-opacity=".14"/><stop offset=".86" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>
<linearGradient id="nxBnDrop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".1" stop-color="#000" stop-opacity="0"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>
<linearGradient id="nxBnWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5a32"/><stop offset=".45" stop-color="#5a3519"/><stop offset="1" stop-color="#2a170a"/></linearGradient>
<linearGradient id="nxBnWoodV" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a170a"/><stop offset=".4" stop-color="#7a4d2a"/><stop offset="1" stop-color="#2a170a"/></linearGradient>
<linearGradient id="nxBnGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe7a6"/><stop offset=".5" stop-color="#d0a447"/><stop offset="1" stop-color="#7c5a1c"/></linearGradient>
<linearGradient id="nxBnSilver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2f3f4"/><stop offset=".5" stop-color="#b4b8be"/><stop offset="1" stop-color="#6f747b"/></linearGradient>
<clipPath id="nxBnClip"><path d="M6.2 9.2Q9.6 10.5 13 9.4Q16.5 10.5 20 9.4Q23.5 10.5 27 9.4Q30.4 10.5 33.8 9.2C34.7 20 33.3 32 34.4 44.2L31.8 55.2 27 47.6 20 56.8 13 47.6 8.2 55.2 5.6 44.2C6.7 32 5.3 20 6.2 9.2Z"/></clipPath>
<radialGradient id="nxEmBrass" cx=".38" cy=".3"><stop offset="0" stop-color="#f4dc98"/><stop offset=".55" stop-color="#b48d45"/><stop offset="1" stop-color="#6e5222"/></radialGradient>
<radialGradient id="nxEmRust" cx=".38" cy=".3"><stop offset="0" stop-color="#c9624a"/><stop offset=".55" stop-color="#8e231b"/><stop offset="1" stop-color="#4f0f0b"/></radialGradient>
<symbol id="nxFleur" viewBox="0 0 10 10"><path d="M5 .2C6.4 1.6 6.5 3.5 5.6 5.3V6.3H4.4V5.3C3.5 3.5 3.6 1.6 5 .2Z"/><path d="M4.3 6.4C3.7 4.4 1.7 3.5.6 4.6-.3 5.6.6 7.2 1.9 6.6 1.7 7.9 3 8.3 4.3 7.4Z"/><path d="M5.7 6.4C6.3 4.4 8.3 3.5 9.4 4.6 10.3 5.6 9.4 7.2 8.1 6.6 8.3 7.9 7 8.3 5.7 7.4Z"/><rect x="2.9" y="6.2" width="4.2" height="1.2" rx=".3"/><path d="M4.4 7.4 5 9.9 5.6 7.4Z"/></symbol>
<symbol id="nxKey" viewBox="0 0 6 24"><circle cx="3" cy="19.6" r="2.3" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="2.35" y="2.2" width="1.3" height="15.2"/><rect x="3.4" y="2.4" width="2.3" height="1.3"/><rect x="3.4" y="4.8" width="2.3" height="1.3"/><rect x="4.6" y="3.4" width="1.1" height="1.6"/></symbol>
<symbol id="nxShip" viewBox="0 0 24 24"><path d="M2.6 15.2H21.6L19.4 19.4H5.6Z"/><path d="M16.2 12.8H21.4V15.2H16.2ZM2.6 13.6H6V15.2H2.6Z"/><path d="M8.4 3.2V15.2M13.2 2V15.2M18.2 5.2V12.8" stroke="currentColor" stroke-width=".8"/><path d="M5.4 5.4C7.4 5 9.4 5 11.4 5.4 11.8 7.4 11.6 9.4 11 11.4 9.2 11 7.2 11 5.2 11.4 5.8 9.4 5.8 7.4 5.4 5.4ZM10.2 3.8C12 3.4 14.4 3.4 16.2 3.8 16.6 6.4 16.4 9.2 15.8 11.8 14 11.4 12 11.4 10 11.8 10.6 9.2 10.6 6.4 10.2 3.8ZM16.4 6.6C17.6 6.4 19.2 6.4 20.4 6.6 20.6 8.2 20.4 9.8 20 11.2 18.8 11 17.6 11 16.2 11.2 16.8 9.8 16.8 8.2 16.4 6.6Z" fill="${PARCH}" stroke="currentColor" stroke-width=".6"/><path d="M13.2 2 15.8 1.2 13.2.6" fill="${RED}"/></symbol>
</defs></svg>`;
  const mountDefs = () => { if (!document.getElementById("nxEmDefs")) { const d = document.createElement("div"); d.id = "nxEmDefs"; d.innerHTML = defs; d.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"; document.body.prepend(d); } };
  if (document.body) mountDefs(); else document.addEventListener("DOMContentLoaded", mountDefs);

  /* ---------- the banner (gonfalon) ---------- */
  // viewBox 40 x 58: central staff with a gilded bud finial, crossbar with gilded finials and five rings,
  // cloth sagging between the rings, gently waved sides, three swallow-tail points edged with a gold fringe.
  const CLOTH = "M6.2 9.2Q9.6 10.5 13 9.4Q16.5 10.5 20 9.4Q23.5 10.5 27 9.4Q30.4 10.5 33.8 9.2C34.7 20 33.3 32 34.4 44.2L31.8 55.2 27 47.6 20 56.8 13 47.6 8.2 55.2 5.6 44.2C6.7 32 5.3 20 6.2 9.2Z";
  const HEM = "M5.6 44.2L8.2 55.2 13 47.6 20 56.8 27 47.6 31.8 55.2 34.4 44.2";
  const fin = (x, dir) => `<g transform="translate(${x} 7.6) scale(${dir} 1)"><rect x="-.2" y="-1.75" width="1.1" height="3.5" rx=".4" fill="url(#nxBnGold)" stroke="${INK}" stroke-width=".25"/>` +
    `<ellipse cx="-1.9" cy="0" rx="1.9" ry="1.65" fill="url(#nxBnGold)" stroke="${INK}" stroke-width=".25"/><path d="M-1.9 -1.6V1.6M-3 -1.2V1.2M-.8 -1.2V1.2" stroke="#7c5a1c" stroke-width=".22"/>` +
    `<path d="M-3.75 -.55-4.9 0-3.75 .55Z" fill="#d0a447" stroke="${INK}" stroke-width=".2"/></g>`;
  const BAR = `<rect x="19.25" y="2.6" width="1.5" height="8" fill="url(#nxBnWoodV)"/>` +
    `<path d="M18.1 3.5C18 2 19.1 .9 20 .2 20.9.9 22 2 21.9 3.5Z" fill="url(#nxBnGold)" stroke="${INK}" stroke-width=".25"/><path d="M18.7 3.2 20 .7 21.3 3.2M20 .7V3.3" fill="none" stroke="#7c5a1c" stroke-width=".2"/>` +
    `<rect x="17.9" y="3.3" width="4.2" height="1.1" rx=".4" fill="url(#nxBnGold)" stroke="${INK}" stroke-width=".2"/>` +
    `<rect x="4.2" y="6.65" width="31.6" height="1.9" rx=".9" fill="url(#nxBnWood)" stroke="${INK}" stroke-width=".3"/>` + fin(4.3, 1) + fin(35.7, -1);
  const RINGS = [7.6, 13, 20, 27, 32.4].map((x) => `<rect x="${x - .5}" y="6.2" width="1" height="3.6" rx=".45" fill="url(#nxBnGold)" stroke="${INK}" stroke-width=".2"/>`).join("");
  // field: background colour; cloth: extra full-cloth painting (stripes, crosses), clipped to the cloth; charge: drawn on top
  const banner = ({ field, cloth = "", charge = "" }) => ({ w: 40, h: 58, svg: `<svg class="em em-banner" viewBox="0 0 40 58" width="40" height="58" aria-hidden="true" focusable="false">` +
    `<path d="${CLOTH}" transform="translate(.9 1.2)" fill="rgba(20,10,4,.4)"/><path d="${HEM}" transform="translate(.9 1.2)" fill="none" stroke="rgba(20,10,4,.4)" stroke-width="2.6"/>` +
    `<path d="${HEM}" fill="none" stroke="#c99a3e" stroke-width="3.2" stroke-dasharray=".5 .32"/>` + BAR +
    `<path d="${CLOTH}" fill="${field}"/><g clip-path="url(#nxBnClip)">${cloth}</g>${charge}` +
    `<path d="${CLOTH}" fill="url(#nxBnFold)"/><path d="${CLOTH}" fill="url(#nxBnDrop)"/>` +
    `<path class="em-edge" d="${CLOTH}" fill="none" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>` +
    `<path d="${HEM}" fill="none" stroke="#e2b85a" stroke-width="1.1" stroke-linejoin="round"/><path d="${HEM}" fill="none" stroke="${INK}" stroke-width=".25" stroke-linejoin="round" transform="translate(0 -.6)"/>` +
    RINGS + `</svg>` });
  // a charge drawn in the 30x34 frame of the former 2D shields, placed in the middle of the cloth
  const inShield = (charges, s = 1) => `<svg x="${20 - 13 * s}" y="${30.5 - 15.5 * s}" width="${26 * s}" height="${31 * s}" viewBox="0 3 30 30">${charges}</svg>`;
  // a former 2D medallion, whole, on the cloth
  const medal = (rim, icon, centre = PARCH) => `<svg x="8" y="17" width="24" height="24" viewBox="0 0 32 32">` +
    `<circle cx="16.9" cy="17.3" r="14.6" fill="rgba(20,10,4,.38)"/><circle cx="16" cy="16" r="14.6" fill="${rim}"/><circle cx="16" cy="16" r="11.4" fill="${centre}" stroke="${INK}" stroke-width=".9"/>` +
    `<g fill="${INK}" stroke="${INK}" stroke-width="0" color="${INK}">${icon}</g><circle cx="16" cy="16" r="14.6" fill="url(#nxEmShade)"/>` +
    `<circle cx="16" cy="16" r="14.6" fill="none" stroke="${INK}" stroke-width="1.3"/></svg>`;

  /* ---------- charges ---------- */
  // Cross of Burgundy: red ragged saltire on white (Spanish Habsburg ensign)
  const ragged = (x1, y1, x2, y2) => {
    let s = `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${RED}" stroke-width="4" stroke-linecap="square"/>`;
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    for (let t = 0.1; t < 0.95; t += 0.12) {
      const px = x1 + dx * t, py = y1 + dy * t, side = Math.round(t * 25) % 2 ? 1 : -1;
      s += `<path d="M${(px + nx * 1.6 * side).toFixed(1)} ${(py + ny * 1.6 * side).toFixed(1)}l${(nx * 2.4 * side - ux * 1).toFixed(1)} ${(ny * 2.4 * side - uy * 1).toFixed(1)}" stroke="${RED}" stroke-width="1.8" stroke-linecap="round"/>`;
    }
    return s;
  };
  const burgundy = banner({ field: WHITE, cloth: ragged(9, 14, 31, 45) + ragged(31, 14, 9, 45) });
  // England: St George's cross, red on white (the English flag before the 1606 union)
  const union = banner({ field: WHITE, cloth: `<path d="M20 8V58M4 28.5H36" stroke="${RED}" stroke-width="6"/>` });
  // Prinsenvlag of the Dutch Republic: orange, white, blue (top to bottom on the hanging cloth)
  const prinsen = banner({ field: WHITE, cloth: `<path d="M0 0H40V24.4H0Z" fill="${ORANGE}"/><path d="M0 40.6H40V58H0Z" fill="${BLUE}"/>` });
  // Ottoman lane: the tughra of Sultan Murad III (r. 1574–1595) in gold on Ottoman red (symbol nxTughra, loaded below)
  const ottoman = banner({ field: RED, charge: `<svg x="6.4" y="16.5" width="27.2" height="24" viewBox="0 0 357 252" preserveAspectRatio="xMidYMid meet"><use href="#nxTughra" width="357" height="252" fill="${GOLD}" stroke="${GOLD}" stroke-width="5" stroke-linejoin="round"/></svg>` });
  // Barbary corsair banner style: two-pointed sword (Zulfiqar) on green within a red border — a motif of Ottoman/Maghrebi naval banners
  const barbary = banner({ field: RED, cloth: `<path d="${CLOTH}" transform="translate(20 31) scale(.8 .84) translate(-20 -31)" fill="${GREEN}"/>`,
    charge: `<g transform="translate(20 31.5) rotate(-90) scale(1.25) translate(-18 -13)"><path d="M10.5 12.2 28 11.4 31.4 9.2 29.2 13 31.4 16.8 28 14.6 10.5 13.8Z" fill="${WHITE}" stroke="${INK}" stroke-width=".5"/>` +
    `<rect x="8.8" y="9.4" width="1.7" height="7.2" rx=".5" fill="${GOLD}" stroke="${INK}" stroke-width=".3"/><rect x="5.6" y="12.1" width="3.3" height="1.8" rx=".7" fill="${GOLD}" stroke="${INK}" stroke-width=".3"/></g>` });
  // Lion of St Mark: the winged, haloed lion with the open book, cut out of the approved generated Venice banner sample
  // (assets/nautical/emblems/venice_lion_st_mark.webp, see CREDITS.md), in gold on Venetian red
  const RASTER = {
    lion: "./assets/nautical/emblems/venice_lion_st_mark.webp",
    eagleGold: "./assets/nautical/emblems/double_eagle_gold.webp",
    eagleBlack: "./assets/nautical/emblems/double_eagle_black.webp",
  };
  const raster = (key, x, y, w, h) => `<image href="${RASTER[key]}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
  const venice = banner({ field: RED, charge: raster("lion", 6.4, 15.2, 27.2, 25.2) });
  // Royal arms of France: three gold fleurs-de-lis on blue (2 and 1)
  const france = banner({ field: BLUE, charge: inShield([[6, 5.5], [16, 5.5], [11, 16]].map(([x, y]) => `<use href="#nxFleur" x="${x}" y="${y}" width="8" height="8" fill="${GOLD}"/>`).join(""), 1.32) });
  // Holy Roman Empire: black double-headed eagle (crowned) on gold — generated eagle artwork recoloured black, crown kept gold
  const hre = banner({ field: "#d9ad4a", charge: raster("eagleBlack", 6.6, 11.6, 26.8, 26.8) });
  // Papal States / Rome: crossed keys, gold and silver, on white; each key outlined in ink so the silver one reads on white
  const key = (rot, fill) => `<g transform="rotate(${rot} 20 28.4)"><g transform="translate(20 28.4) scale(.98) translate(-20 -29.7)">` +
    `<path d="M18.6 13.4H21.4V38.6H18.6ZM21.4 13.8H25.6V16.2H21.4ZM21.4 18.2H25.6V20.6H21.4ZM23.4 16.2H25.6V18.2H23.4Z" fill="${fill}" stroke="${INK}" stroke-width=".55" stroke-linejoin="round"/>` +
    `<path d="M20 37.2A4.4 4.4 0 1 1 20 46 4.4 4.4 0 1 1 20 37.2ZM20 39.6A2 2 0 1 0 20 43.6 2 2 0 1 0 20 39.6Z" fill="${fill}" fill-rule="evenodd" stroke="${INK}" stroke-width=".55"/></g></g>`;
  const papal = banner({ field: WHITE, charge: key(32, "url(#nxBnGold)") + key(-32, "url(#nxBnSilver)") });
  // Greek lane: crowned double-headed eagle (Byzantine tradition, Ecumenical Patriarchate) — gold on dark red; no state is invented
  const greek = banner({ field: OX, charge: raster("eagleGold", 6.6, 11.6, 26.8, 26.8) });
  // non-state lanes keep their 2D medallion, on a deep sea-green cloth
  const SEA = "#2c5446";
  const ship = banner({ field: SEA, charge: medal("url(#nxEmRust)", `<use href="#nxShip" x="5" y="5" width="22" height="22"/><path d="M6 22.6C9 21.6 11 23.6 14 22.6S19 21.6 26 22.6" fill="none" stroke-width=".8"/>`) });

  // analysis medallions (brass rim, parchment centre, ink icon)
  const ic = {
    source_genealogy: `<path d="M16 25V14.5M16 19 11 13.6M16 16.6 21 11.4M11 13.6 9.2 10.2M11 13.6 12.8 9.6M21 11.4 19.4 8.2M21 11.4 23.6 9.4" fill="none" stroke-width="1.5" stroke-linecap="round"/><circle cx="9.2" cy="9.6" r="1.6"/><circle cx="12.8" cy="9" r="1.6"/><circle cx="19.4" cy="7.6" r="1.6"/><circle cx="23.8" cy="8.8" r="1.6"/><path d="M12.6 25H19.4" stroke-width="1.4"/>`,
    identity_resolution: `<ellipse cx="12.6" cy="17" rx="5.2" ry="3.2" transform="rotate(-32 12.6 17)" fill="none" stroke-width="2"/><ellipse cx="19.4" cy="15" rx="5.2" ry="3.2" transform="rotate(-32 19.4 15)" fill="none" stroke-width="2"/>`,
    contradiction: `<path d="M9.4 9.2 20.6 20.4M22.6 9.2 11.4 20.4" fill="none" stroke-width="1.9" stroke-linecap="round"/><path d="M17.4 21.6 21.8 17.2M14.6 21.6 10.2 17.2" fill="none" stroke-width="1.6" stroke-linecap="round"/><path d="M21.2 21 23 22.8M10.8 21 9 22.8" fill="none" stroke-width="1.6" stroke-linecap="round"/><circle cx="23.6" cy="23.4" r="1.2"/><circle cx="8.4" cy="23.4" r="1.2"/>`,
    relationship_network: `<path d="M10.6 11 21.4 10.6 16 21.4ZM10.6 11 9.6 21M16 21.4 9.6 21" fill="none" stroke-width="1.1"/><circle cx="10.6" cy="11" r="2.4"/><circle cx="21.4" cy="10.6" r="2.4"/><circle cx="16" cy="21.4" r="2.4"/><circle cx="9.6" cy="21" r="1.6"/>`,
    timeline: `<rect x="10.6" y="9.6" width="10.8" height="12.8" fill="${PARCH}" stroke-width=".9"/><rect x="9.4" y="7.6" width="13.2" height="3" rx="1.5" stroke-width=".6" fill="${GOLD}"/><rect x="9.4" y="21.4" width="13.2" height="3" rx="1.5" stroke-width=".6" fill="${GOLD}"/><path d="M12.6 13.2H19.4M12.6 15.8H19.4M12.6 18.4H17.4" fill="none" stroke-width=".9"/>`,
    pirate_biography: `<path d="M23 7.4C17 8.4 12.4 13.4 10.6 21.4L11.6 21.9C13.8 15.9 17.3 12.4 21.8 10.9 19.8 10.7 19.1 10.3 19.5 9.7 20.9 9.7 22.3 8.9 23 7.4Z"/><path d="M10.6 21.4 8.8 24.6" fill="none" stroke-width="1.2" stroke-linecap="round"/><path d="M14 24.6H23" fill="none" stroke-width=".9" stroke-dasharray="1.6 1.2"/>`,
    pirate_base: `<circle cx="16" cy="8.4" r="1.9" fill="none" stroke-width="1.3"/><path d="M16 10.3V23.6M12 12.6H20M9.6 18.2C10 21.8 12.8 23.8 16 23.8S22 21.8 22.4 18.2" fill="none" stroke-width="1.6" stroke-linecap="round"/><path d="M8.4 19.6 9.6 17.4 11.2 19.2ZM23.6 19.6 22.4 17.4 20.8 19.2Z"/>`,
  };
  const map = { spanish_simancas: burgundy, venetian: venice, french: france, british: union, dutch: prinsen, german: hre, italian_states: papal, greek, ottoman, north_african: barbary, travellers: ship };
  for (const [k, v] of Object.entries(ic)) map[k] = banner({ field: SEA, charge: medal("url(#nxEmBrass)", v) });
  const fallback = banner({ field: SEA, charge: medal("url(#nxEmBrass)", `<circle cx="16" cy="16" r="3"/>`) });

  // the tughra of Murad III (public domain vector, assets/nautical/emblems/), added once to the shared <defs> as
  // <symbol id="nxTughra"> so the 2D banner and the 3D texture use the very same drawing; `ready` resolves when it is in
  const ready = new Promise((done) => {
    const add = (txt) => {
      try {
        const doc = new DOMParser().parseFromString(txt, "image/svg+xml"), root = doc.documentElement;
        const vb = root.getAttribute("viewBox") || "0 0 357 252";
        const paths = [...root.querySelectorAll("path")].map((p) => `<path d="${p.getAttribute("d")}"/>`).join("");
        const host = document.querySelector("#nxEmDefs defs");
        if (host && paths && !document.getElementById("nxTughra")) {
          const s = document.createElementNS(NS, "symbol"); s.id = "nxTughra"; s.setAttribute("viewBox", vb);
          s.innerHTML = paths; host.appendChild(s);
        }
      } catch (e) { console.warn("emblems: tughra", e); }
      done();
    };
    // the raster charges are inlined as data: URLs once loaded, so the SVG stays self-contained (the 3D map draws it
    // as an <img>, which cannot fetch external files); until then the 2D map shows them from their file
    const toData = (url) => fetch(url).then((r) => r.ok ? r.blob() : null).then((b) => b && new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => ok(null); fr.readAsDataURL(b); })).catch(() => null);
    const inline = () => Promise.all(Object.values(RASTER).map((url) => toData(url).then((data) => {
      if (!data) return;
      for (const em of new Set([...Object.values(map), fallback])) em.svg = em.svg.split(`href="${url}"`).join(`href="${data}"`);
    })));
    const go = () => { mountDefs(); Promise.all([fetch("./assets/nautical/emblems/tughra_murad_iii.svg").then((r) => r.ok ? r.text() : "").catch(() => ""), inline()]).then(([t]) => add(t), () => done()); };
    if (document.body) go(); else document.addEventListener("DOMContentLoaded", go);
  });
  window.NABOU_EMBLEMS = { get: (id) => map[id] || fallback, ids: Object.keys(map), ready };
})();
