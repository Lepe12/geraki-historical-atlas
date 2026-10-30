# Voice assistant — the holographic figure

`cartographer-points.bin` (91,842 points) is the gold line portrait of a 16th-century cartographer
(beard and moustache, flat beret, pleated ruff, gown; head and shoulders, three-quarter view) turned into glowing points.

**Where the picture comes from.** It is not a museum object and not a 3D scan. The owner of this project chose a concept
image made for him with the Grok Bot image tool (the middle, gold panel of three). The same tool redrew that panel alone,
at higher resolution and without the compass rose and armillary sphere behind the figure, as the owner asked.
That picture is `source/cartographer-gold.jpg`. It is project-owned artwork made for NABOU//X; no third-party
licence applies and nobody else's work is copied into it. It shows no real, named person.

**Why not a 3D model.** The owner asked for exactly this figure. No free (CC0 / CC-BY / public domain) 3D bust with
beret, ruff and this face was found, and a different scanned bust would only be an approximation.

**How it was made.** `python3 tools/build-assistant-figure.py assets/assistant/source/cartographer-gold.jpg assets/assistant/cartographer-points.bin`
(numpy + Pillow). Each bright pixel of the drawing may become one point, so the lines are the drawing's own lines.
The drawing has no depth; the script adds a smooth made-up relief (rounded body, rounder head) so the figure can turn a
little. The head above the ruff has a weight so it can turn and nod on its own.

Binary layout (little-endian): uint32 N; int16 x,y,z × N (÷32767); uint8 brightness × N; uint8 head weight × N.

Loaded only by `assistant/assistant-scene.js`, after the user presses the small assistant button.
