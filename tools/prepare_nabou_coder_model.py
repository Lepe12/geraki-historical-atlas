#!/usr/bin/env python3
"""Fetch only the pinned official Qwen coder GGUF with an exact SHA-256 check.

This is separate from NABOU's established research inference provider.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

REPO = "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF"
# Visible official upload commit for the merged q4_k_m model, not floating main.
REVISION = "13fb94b"
FILENAME = "qwen2.5-coder-7b-instruct-q4_k_m.gguf"
EXPECTED_SHA256 = "509287f78cb4d4cf6b3843734733b914b2c158e43e22a7f4bf5e963800894d3c"


def prepare(destination: Path, *, api=None, downloader=None) -> dict:
    from huggingface_hub import HfApi, hf_hub_download

    api = api or HfApi()
    downloader = downloader or hf_hub_download
    info = api.model_info(REPO, revision=REVISION, files_metadata=True)
    sha = info.sha
    if not isinstance(sha, str) or len(sha) != 40 or not all(c in "0123456789abcdef" for c in sha):
        raise ValueError("MODEL_REVISION_NOT_IMMUTABLE")
    exact = [item for item in info.siblings if item.rfilename == FILENAME]
    if len(exact) != 1:
        raise ValueError("OFFICIAL_MERGED_CODER_Q4_MODEL_NOT_FOUND")

    metadata = exact[0]
    lfs = getattr(metadata, "lfs", None)
    if lfs is not None:
        announced = getattr(lfs, "sha256", None) if not isinstance(lfs, dict) else lfs.get("sha256")
        if announced is not None and announced != EXPECTED_SHA256:
            raise ValueError("PUBLISHER_MODEL_CHECKSUM_MISMATCH")

    destination.mkdir(parents=True, exist_ok=True)
    file_path = Path(downloader(REPO, FILENAME, revision=sha, local_dir=str(destination)))
    if file_path.name != FILENAME or not file_path.is_file():
        raise ValueError("MODEL_FILE_NOT_FOUND")
    with file_path.open("rb") as model:
        digest = hashlib.file_digest(model, "sha256").hexdigest()
    if digest != EXPECTED_SHA256:
        raise ValueError("MODEL_CHECKSUM_MISMATCH")

    manifest = {
        "repository": REPO,
        "revision": sha,
        "filename": FILENAME,
        "sha256": digest,
        "files": [{"filename": FILENAME, "sha256": digest}],
        "provider": "local_llama_cpp",
        "external_api_key_required": False,
        "quantization": "Q4_K_M",
    }
    file_path.with_suffix(".manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    github_env = os.environ.get("GITHUB_ENV")
    if github_env:
        with open(github_env, "a", encoding="utf-8") as output:
            output.write("PCT_LOCAL_MODEL_PATH=" + str(file_path.resolve()) + "\n")
            output.write("NABOU_CODE_MODEL=" + REPO + "\n")
            output.write("PCT_LOCAL_MODEL_REPOSITORY=" + REPO + "\n")
    print(json.dumps({"status": "VERIFIED", "repository": REPO, "revision": sha,
                      "sha256": digest, "path": str(file_path.resolve())}))
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--destination", type=Path, default=Path.home() / ".cache/nabou-models/qwen-coder-7b")
    args = parser.parse_args()
    prepare(args.destination)
