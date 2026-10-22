/* NABOU//X — hand-drawn 17th-century emblems for the research lanes (inline SVG, nautical ink/parchment palette).
   Every shape here is drawn from scratch; no external images. Exposes window.NABOU_EMBLEMS.svg(agentId). */
(() => {
  "use strict";
  const INK = "#2a190e", PARCH = "#efe3c4", RED = "#a3342a", OX = "#7b1c17", BLUE = "#2f4a7a", GOLD = "#c9a24e", GREEN = "#3f6b4c", ORANGE = "#c76a2a", SILVER = "#e4ddcc";
  const NS = "http://www.w3.org/2000/svg";

  // shared defs (one copy in the document; <use> references work across inline SVGs)
  const defs = `<svg xmlns="${NS}" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>
<linearGradient id="nxEmShade" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>
<radialGradient id="nxEmBrass" cx=".38" cy=".3"><stop offset="0" stop-color="#f4dc98"/><stop offset=".55" stop-color="#b48d45"/><stop offset="1" stop-color="#6e5222"/></radialGradient>
<radialGradient id="nxEmRust" cx=".38" cy=".3"><stop offset="0" stop-color="#c9624a"/><stop offset=".55" stop-color="#8e231b"/><stop offset="1" stop-color="#4f0f0b"/></radialGradient>
<symbol id="nxFleur" viewBox="0 0 10 10"><path d="M5 .2C6.4 1.6 6.5 3.5 5.6 5.3V6.3H4.4V5.3C3.5 3.5 3.6 1.6 5 .2Z"/><path d="M4.3 6.4C3.7 4.4 1.7 3.5.6 4.6-.3 5.6.6 7.2 1.9 6.6 1.7 7.9 3 8.3 4.3 7.4Z"/><path d="M5.7 6.4C6.3 4.4 8.3 3.5 9.4 4.6 10.3 5.6 9.4 7.2 8.1 6.6 8.3 7.9 7 8.3 5.7 7.4Z"/><rect x="2.9" y="6.2" width="4.2" height="1.2" rx=".3"/><path d="M4.4 7.4 5 9.9 5.6 7.4Z"/></symbol>
<symbol id="nxEagleHalf" viewBox="0 0 24 24"><path d="M12 7.2C12.9 5.6 14 4.6 15.1 4.3 15.4 3.1 16.6 2.6 17.5 3.2L19.4 3.3 17.9 4.3C18 5.4 17.2 6.1 16.3 6.1 15.3 6.4 14.5 7.5 14.1 9 15.7 8.1 17.6 7.2 19.6 6.6 21.1 6.2 22.7 6.4 23.7 7.2 22.7 7.6 22.9 8.4 23.7 8.9 22.5 9.4 22.5 10.2 23.3 10.8 22 11.2 21.7 12 22.3 12.7 20.7 12.9 20 13.6 20.1 14.5 18.5 14.3 16.7 14.4 15.1 15 14.7 16.2 14.7 17.3 15.3 18.4L17.7 21.6 15.5 21.2 15.3 23 13.5 20.6 12 22.8Z"/></symbol>
<symbol id="nxEagle" viewBox="0 0 24 24"><use href="#nxEagleHalf" width="24" height="24"/><use href="#nxEagleHalf" width="24" height="24" transform="translate(24 0) scale(-1 1)"/></symbol>
<symbol id="nxLion" viewBox="0 0 24 24"><circle cx="6.6" cy="6.2" r="3.6" fill="none" stroke="currentColor" stroke-width="1"/><path d="M11 10.4C10.4 6.6 12.6 3.4 17.6 2.2 16.6 3.5 17.2 3.9 18.5 3.7 17.5 4.9 17.9 5.5 19.2 5.6 18 6.8 18.2 7.4 19.4 7.9 17.6 8.8 14.4 9.9 12.4 10.6Z"/><path d="M4.4 7.4C4.2 5.6 5.4 4.6 6.8 4.6 8.4 4.6 9.3 5.9 9 7.4 10 8.6 10.6 9.6 11.6 10H16.4C18.2 9.6 19.5 9.8 20.1 10.8 21.1 10.6 21.7 9.6 21.5 8.6 22.6 9.4 22.4 11.4 20.6 12 20.4 13.2 19.6 14 18.6 14.4L19.3 19.4H17.8L17 15H11.6L11.5 19.4H10L9.6 14.4C8.2 13.8 7.4 12.4 7.2 10.8 6.4 10.8 5.4 10.6 4.8 9.6 4 9.7 3.4 9.2 3.6 8.6Z"/><path d="M11.2 19.4h1.8l.2 1.6h-2.6Zm6.4 0h1.8l.4 1.6h-2.6Z"/></symbol>
<symbol id="nxKey" viewBox="0 0 6 24"><circle cx="3" cy="19.6" r="2.3" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="2.35" y="2.2" width="1.3" height="15.2"/><rect x="3.4" y="2.4" width="2.3" height="1.3"/><rect x="3.4" y="4.8" width="2.3" height="1.3"/><rect x="4.6" y="3.4" width="1.1" height="1.6"/></symbol>
<symbol id="nxShip" viewBox="0 0 24 24"><path d="M2.6 15.2H21.6L19.4 19.4H5.6Z"/><path d="M16.2 12.8H21.4V15.2H16.2ZM2.6 13.6H6V15.2H2.6Z"/><path d="M8.4 3.2V15.2M13.2 2V15.2M18.2 5.2V12.8" stroke="currentColor" stroke-width=".8"/><path d="M5.4 5.4C7.4 5 9.4 5 11.4 5.4 11.8 7.4 11.6 9.4 11 11.4 9.2 11 7.2 11 5.2 11.4 5.8 9.4 5.8 7.4 5.4 5.4ZM10.2 3.8C12 3.4 14.4 3.4 16.2 3.8 16.6 6.4 16.4 9.2 15.8 11.8 14 11.4 12 11.4 10 11.8 10.6 9.2 10.6 6.4 10.2 3.8ZM16.4 6.6C17.6 6.4 19.2 6.4 20.4 6.6 20.6 8.2 20.4 9.8 20 11.2 18.8 11 17.6 11 16.2 11.2 16.8 9.8 16.8 8.2 16.4 6.6Z" fill="${PARCH}" stroke="currentColor" stroke-width=".6"/><path d="M13.2 2 15.8 1.2 13.2.6" fill="${RED}"/></symbol>
</defs></svg>`;
  const mountDefs = () => { if (!document.getElementById("nxEmDefs")) { const d = document.createElement("div"); d.id = "nxEmDefs"; d.innerHTML = defs; d.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"; document.body.prepend(d); } };
  if (document.body) mountDefs(); else document.addEventListener("DOMContentLoaded", mountDefs);

  /* ---------- frames ---------- */
  const SH = "M2.5 2.5H27.5V15.5C27.5 24.5 21 29.8 15 32 9 29.8 2.5 24.5 2.5 15.5Z";
  const shield = (field, charges) => ({ w: 30, h: 34, svg: `<svg class="em em-shield" viewBox="0 0 30 34" width="30" height="34" aria-hidden="true" focusable="false">` +
    `<path d="${SH}" transform="translate(.9 1.3)" fill="rgba(20,10,4,.38)"/><path d="${SH}" fill="${field}"/>${charges}` +
    `<path d="${SH}" fill="url(#nxEmShade)"/><path class="em-edge" d="${SH}" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<path d="M4.4 4.4H25.6V15.5C25.6 23.4 20 28 15 30" fill="none" stroke="rgba(255,240,205,.35)" stroke-width=".6"/></svg>` });
  const FL = "M1.5 1.5H34.5V24.5H1.5Z";
  const flag = (charges) => ({ w: 36, h: 26, svg: `<svg class="em em-flag" viewBox="0 0 36 26" width="36" height="26" aria-hidden="true" focusable="false">` +
    `<path d="${FL}" transform="translate(.9 1.3)" fill="rgba(20,10,4,.38)"/>${charges}` +
    `<path d="M1.5 1.5H34.5V24.5H1.5Z" fill="url(#nxEmShade)"/><path d="M12 1.5V24.5M24 1.5V24.5" stroke="rgba(0,0,0,.08)" stroke-width="5"/>` +
    `<path class="em-edge" d="${FL}" fill="none" stroke="${INK}" stroke-width="1.4"/></svg>` });
  const medal = (rim, icon, centre = PARCH) => ({ w: 32, h: 32, svg: `<svg class="em em-medal" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">` +
    `<circle cx="16.9" cy="17.3" r="14.6" fill="rgba(20,10,4,.38)"/><circle cx="16" cy="16" r="14.6" fill="${rim}"/><circle cx="16" cy="16" r="11.4" fill="${centre}" stroke="${INK}" stroke-width=".9"/>` +
    `<g fill="${INK}" stroke="${INK}" stroke-width="0" color="${INK}">${icon}</g><circle cx="16" cy="16" r="14.6" fill="url(#nxEmShade)"/>` +
    `<circle class="em-edge" cx="16" cy="16" r="14.6" fill="none" stroke="${INK}" stroke-width="1.3"/></svg>` });

  /* ---------- charges ---------- */
  // Cross of Burgundy: red ragged saltire on white (Spanish Habsburg ensign)
  const ragged = (x1, y1, x2, y2) => {
    let s = `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${RED}" stroke-width="3.6" stroke-linecap="square"/>`;
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    for (let t = 0.14; t < 0.95; t += 0.155) {
      const px = x1 + dx * t, py = y1 + dy * t, side = Math.round(t * 20) % 2 ? 1 : -1;
      s += `<path d="M${(px + nx * 1.4 * side).toFixed(1)} ${(py + ny * 1.4 * side).toFixed(1)}l${(nx * 2.2 * side - ux * 1).toFixed(1)} ${(ny * 2.2 * side - uy * 1).toFixed(1)}" stroke="${RED}" stroke-width="1.7" stroke-linecap="round"/>`;
    }
    return s;
  };
  const burgundy = flag(`<path d="${FL}" fill="${PARCH}"/>` + ragged(4, 3.6, 32, 22.4) + ragged(32, 3.6, 4, 22.4));
  // 1606 Union Flag: St Andrew's white saltire on blue, St George's red cross fimbriated white (no red saltire before 1801)
  const union = flag(`<path d="${FL}" fill="${BLUE}"/><path d="M1.5 1.5 34.5 24.5M34.5 1.5 1.5 24.5" stroke="${PARCH}" stroke-width="4.6"/>` +
    `<path d="M18 1.5V24.5M1.5 13H34.5" stroke="${PARCH}" stroke-width="7.4"/><path d="M18 1.5V24.5M1.5 13H34.5" stroke="${RED}" stroke-width="4.2"/>`);
  // Prinsenvlag of the Dutch Republic: orange, white, blue
  const prinsen = flag(`<path d="M1.5 1.5H34.5V9.2H1.5Z" fill="${ORANGE}"/><path d="M1.5 9.2H34.5V16.8H1.5Z" fill="${PARCH}"/><path d="M1.5 16.8H34.5V24.5H1.5Z" fill="${BLUE}"/>`);
  // Ottoman naval flag as drawn on 17th-c. charts: white crescents on red
  const cres = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${PARCH}"/><circle cx="${x + r * 0.42}" cy="${y - r * 0.08}" r="${r * 0.8}" fill="${RED}"/>`;
  const ottoman = flag(`<path d="${FL}" fill="${RED}"/>` + cres(11, 8.4, 4.4) + cres(25, 8.4, 4.4) + cres(18, 17.8, 4.4));
  // Barbary corsair banner style: two-pointed sword (Zulfiqar) on green within a red border — a motif of Ottoman/Maghrebi naval banners
  const barbary = flag(`<path d="${FL}" fill="${RED}"/><path d="M4 4H32V22H4Z" fill="${GREEN}"/>` +
    `<path d="M10.5 12.2 28 11.4 31.4 9.2 29.2 13 31.4 16.8 28 14.6 10.5 13.8Z" fill="${PARCH}" stroke="${INK}" stroke-width=".5"/><rect x="8.8" y="9.4" width="1.7" height="7.2" rx=".5" fill="${GOLD}"/><rect x="5.6" y="12.1" width="3.3" height="1.8" rx=".7" fill="${GOLD}"/>`);
  // Lion of St Mark (winged, haloed) in gold on red
  const venice = shield(RED, `<use href="#nxLion" x="3" y="5" width="24" height="24" fill="${GOLD}" color="${GOLD}"/>`);
  // Royal arms of France: three gold fleurs-de-lis on blue (2 and 1)
  const france = shield(BLUE, [[6, 5.5], [16, 5.5], [11, 16]].map(([x, y]) => `<use href="#nxFleur" x="${x}" y="${y}" width="8" height="8" fill="${GOLD}"/>`).join(""));
  // Holy Roman Empire: black double-headed eagle on gold
  const hre = shield(GOLD, `<use href="#nxEagle" x="3" y="6" width="24" height="22" fill="${INK}"/>`);
  // Papal States / Rome: crossed keys, gold and silver, on red
  const papal = shield(RED, `<g transform="rotate(38 15 16)"><use href="#nxKey" x="12" y="4" width="6" height="24" fill="${GOLD}" color="${GOLD}"/></g>` +
    `<g transform="rotate(-38 15 16)"><use href="#nxKey" x="12" y="4" width="6" height="24" fill="${SILVER}" color="${SILVER}"/></g>`);
  // Greek lane: double-headed eagle of the Ecumenical Patriarchate (Byzantine tradition) — gold on dark red; no state is invented
  const greek = shield(OX, `<use href="#nxEagle" x="3" y="6" width="24" height="22" fill="${GOLD}"/>`);
  const ship = medal("url(#nxEmRust)", `<use href="#nxShip" x="5" y="5" width="22" height="22"/><path d="M6 22.6C9 21.6 11 23.6 14 22.6S19 21.6 26 22.6" fill="none" stroke-width=".8"/>`);

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
  for (const [k, v] of Object.entries(ic)) map[k] = medal("url(#nxEmBrass)", v);
  window.NABOU_EMBLEMS = { get: (id) => map[id] || medal("url(#nxEmBrass)", `<circle cx="16" cy="16" r="3"/>`), ids: Object.keys(map) };
})();
