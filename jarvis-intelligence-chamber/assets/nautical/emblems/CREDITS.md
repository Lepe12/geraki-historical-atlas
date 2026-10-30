# Emblem artwork (2D and 3D lane banners)

Every lane symbol is drawn as a gonfalon banner in `nautical-emblems.js`. The same SVG is shown on the 2D chart and
rasterised by `map-3d-emblems.js` as the 3D banner texture.

| Lane | Local file | Commons file | Author | Licence | What it shows |
|---|---|---|---|---|---|
| `ottoman` | `tughra_murad_iii.svg` | [File:Tughra of Murad III.svg](https://commons.wikimedia.org/wiki/File:Tughra_of_Murad_III.svg) | SAİT71 (vector, 2018), after the tughra used on documents and coins of Murad III | Public domain | Tughra (monogram) of Sultan Murad III, r. 1574–1595. Vendored unchanged (downloaded 2026-10-30); recoloured gold on a red banner at runtime. The tughra was a chancery monogram, not a flag device; showing it on a banner is a design choice. |

## Generated artwork (not historical originals)

These three raster charges are **AI-generated images** made with the bot's image generator for this project (2026-10-30).
They are not copies of any historical banner or museum object, and no third-party licence applies.

| Lane | Local file | Source | What it shows |
|---|---|---|---|
| `venetian` | `venice_lion_st_mark.webp` | Cut out of the generated Venice banner sample the owner approved (white banner with a gold lion) | Winged lion of St Mark with halo and open book, gold. The background cloth was removed; the lion is shown on a red banner. |
| `greek` | `double_eagle_gold.webp` | Generated sample: crowned double-headed eagle on plain white, background removed | Crowned double-headed eagle (Byzantine tradition), gold, on dark red. |
| `german` | `double_eagle_black.webp` | The same generated eagle, recoloured black in code; the crown is kept gold | Crowned double-headed eagle of the Holy Roman Empire, black on gold. |

`nautical-emblems.js` places them as `<image>` charges and inlines them as data URLs once loaded, so the 3D texture
(drawn from the SVG as an image) includes them.

`north_african` uses no file: the banner keeps the original 2D design drawn in code (a two-pointed Zulfiqar sword on a
green field inside a red border). The earlier 3D-only red flag with three crescents is no longer used.
