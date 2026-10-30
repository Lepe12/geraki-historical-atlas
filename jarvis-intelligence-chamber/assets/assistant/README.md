# Voice assistant — the holographic head

`athena-hope-points.bin` is a point cloud (53,784 points: horizontal contour lines plus surface points)
made from a 3D scan of an ancient statue head:

- **Object:** Head from the statue "Athena Hope", with helmet decorated with a sphinx and griffins (cast), KAS275.
- **Owner / scan:** Statens Museum for Kunst (SMK), Copenhagen, Royal Cast Collection. Artist unknown.
- **Licence:** Public domain (as stated on Wikimedia Commons and by SMK Open).
- **File:** https://commons.wikimedia.org/wiki/File:Ubekendt,_Hoved_fra_statuen_Athena_Hope_med_hjelm_med_sfinks_og_griffe,_,_KAS275,_Statens_Museum_for_Kunst,_3D_model.stl

How it was made: `python3 tools/build-assistant-points.py <the STL> assets/assistant/athena-hope-points.bin`.
The script drops the round foot of the scan, scales the head to 2 units high, cuts it with horizontal
planes every 1.15 mm of the original (the gold "line-work") and adds 26,000 surface points. Nothing was added to the sculpture.

Binary layout (little-endian): uint32 N; int16 x,y,z × N (÷32767); int8 normal x,y,z × N (÷127); uint8 kind × N (0 = line, 1 = surface).

Loaded only by `assistant/assistant-scene.js`, after the user presses the small assistant button.
