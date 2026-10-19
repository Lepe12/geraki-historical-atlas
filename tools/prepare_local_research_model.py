"""Resolve immutable official model revision and verify its LFS SHA-256."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import urllib.request

REPOSITORY='Qwen/Qwen2.5-3B-Instruct-GGUF'
FILENAME='qwen2.5-3b-instruct-q4_k_m.gguf'

def prepare(destination):
    from huggingface_hub import HfApi,hf_hub_download
    api=HfApi()
    info=api.model_info(REPOSITORY,revision=os.getenv('PCT_LOCAL_MODEL_REVISION','main'),files_metadata=True)
    sibling=next(s for s in info.siblings if s.rfilename==FILENAME)
    expected=sibling.lfs.sha256 if sibling.lfs else None
    if not expected:raise ValueError('MODEL_LFS_CHECKSUM_REQUIRED')
    destination=Path(destination);destination.mkdir(parents=True,exist_ok=True)
    path=Path(hf_hub_download(REPOSITORY,FILENAME,revision=info.sha,local_dir=destination))
    with path.open('rb') as stream:actual=hashlib.file_digest(stream,'sha256').hexdigest()
    if actual!=expected:raise ValueError('MODEL_CHECKSUM_MISMATCH')
    manifest={'repository':REPOSITORY,'revision':info.sha,'filename':FILENAME,'sha256':actual,
              'lfs_sha256':expected,'provider':'local_llama_cpp','external_api_key_required':False,
              'model_url':f'https://huggingface.co/{REPOSITORY}/blob/{info.sha}/{FILENAME}'}
    path.with_suffix('.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    for output in [os.getenv('GITHUB_ENV')]:
        if output:
            with open(output,'a') as stream:
                stream.write('PCT_LOCAL_MODEL_PATH='+str(path.resolve())+'\n')
                stream.write('PCT_LOCAL_MODEL_REVISION='+info.sha+'\n')
    print(json.dumps(manifest));return manifest

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--destination',default=str(Path.home()/'.cache/nabou-models/qwen2.5-3b'));args=parser.parse_args()
    prepare(args.destination)
