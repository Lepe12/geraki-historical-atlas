#!/usr/bin/env python3
"""Build the isolated N7 · EVE preview (/n7-eve).

Reuses the reviewed N7 APEX build unchanged: tools/n7_apex_preview/build_apex_preview.py reconstructs
the pinned upstream source with the owner-approved guide Humanoid (production asset set). This script
only adds the new shell (components/eve) and points the page at it. Nothing is deployed from here.
"""
import argparse, json, os, pathlib, shutil, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
APEX = HERE.parent / "n7_apex_preview" / "build_apex_preview.py"


def patch_exact(path, old, new):
    text = path.read_text()
    if text.count(old) != 1:
        raise RuntimeError(f"anchor mismatch in {path}: {old[:80]!r}")
    path.write_text(text.replace(old, new, 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    out = pathlib.Path(args.out).resolve()
    base = (os.getenv("N7_EVE_BASE_PATH", "/n7-eve").rstrip("/") or "/n7-eve")
    if not base.startswith("/") or base in ("/n7-apex", "/n7-apex-step5", "/n7-apex-step5-visual"):
        raise RuntimeError("the EVE preview must use its own base path, never an existing N7 route")
    pct_api = os.getenv("N7_EVE_PCT_API", "https://pct-live.piratecartography.com/pct-api/live").rstrip("/")
    atlas = os.getenv("N7_EVE_ATLAS_BASE", "https://lepe12.github.io/geraki-historical-atlas/")
    nabou = os.getenv("N7_EVE_NABOU_URL", atlas + "jarvis-intelligence-chamber/?skip=1")

    # 1) The exact production N7 APEX source (guide Humanoid, voice, moods), built by the existing script.
    env = {**os.environ, "N7_APEX_BASE_PATH": "/n7-apex"}
    subprocess.run([sys.executable, str(APEX), "--out", str(out)], check=True, env=env)

    # 2) The new shell, as separate components.
    shutil.copytree(HERE / "components" / "eve", out / "components" / "eve")
    cfg = (HERE / "components" / "N7EveConfig.ts").read_text()
    for name, value in (("N7_EVE_BASE_PATH", base), ("N7_EVE_PCT_API", pct_api), ("N7_EVE_ATLAS_BASE", atlas), ("N7_EVE_NABOU_URL", nabou)):
        start = cfg.index(f"export const {name} = ")
        end = cfg.index(";\n", start)
        cfg = cfg[:start] + f"export const {name} = {json.dumps(value)}" + cfg[end:]
    (out / "components" / "N7EveConfig.ts").write_text(cfg)

    # 3) Same humanoid assets, served under the preview's own base path.
    (out / "components" / "N7HumanoidReference.ts").write_text(f'export const N7_HUMANOID_REFERENCE = "{base}/n7-humanoid-face-v4.webp";\n')
    (out / "components" / "N7BackdropReference.ts").write_text(f'export const N7_BACKDROP_REFERENCE = "{base}/n7-environment-v4.webp";\n')

    # 4) The page renders the EVE shell instead of the APEX world.
    (out / "app" / "page.tsx").write_text('import N7EveShell from "@/components/eve/N7EveShell";\n\nexport default function Home() {\n  return <N7EveShell />;\n}\n')
    patch_exact(out / "app" / "layout.tsx", 'title: "N7 — AI Workspace",', 'title: "NABOU · N7",')
    patch_exact(out / "app" / "layout.tsx", '<html lang="el">', '<html lang="el"><head><meta name="theme-color" content="#06080b" /><meta name="robots" content="noindex" /></head>')
    (out / "next.config.mjs").write_text(
        f'const nextConfig={{output:"export",trailingSlash:true,basePath:"{base}",assetPrefix:"{base}",images:{{unoptimized:true}}}}; export default nextConfig;\n')
    print("N7_EVE_SOURCE_READY", base, pct_api)


if __name__ == "__main__":
    main()
