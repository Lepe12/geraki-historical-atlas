"""Resolve immutable official model revision and verify its LFS SHA-256."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import urllib.request

REPOSITORY='Qwen/Qwen2.5-3B-Instruct-GGUF'
FILENAME='qwen2.5-3b-instruct-q4_k_m.gguf'
REVISION='7dabda4d13d513e3e842b20f0d435c732f172cbe'

def prepare(destination):
    from huggingface_hub import HfApi,hf_hub_download
    api=HfApi()
    repository=os.getenv('PCT_LOCAL_MODEL_REPOSITORY',REPOSITORY)
    if repository not in (REPOSITORY,'Qwen/Qwen2.5-7B-Instruct-GGUF'):
        raise ValueError('UNAPPROVED_LOCAL_MODEL_REPOSITORY')
    revision=os.getenv('PCT_LOCAL_MODEL_REVISION') or (REVISION if repository==REPOSITORY else 'bb5d59e06d9551d752d08b292a50eb208b07ab1f')
    info=api.model_info(repository,revision=revision,files_metadata=True)
    filename='qwen2.5-3b-instruct-q4_k_m.gguf' if repository==REPOSITORY else 'qwen2.5-7b-instruct-q4_k_m.gguf'
    siblings=sorted([s for s in info.siblings if s.rfilename==filename or
                     (s.rfilename.startswith(filename[:-5]+'-000') and s.rfilename.endswith('.gguf'))],key=lambda s:s.rfilename)
    if not siblings:raise ValueError('MODEL_QUANTIZATION_NOT_FOUND')
    destination=Path(destination);destination.mkdir(parents=True,exist_ok=True)
    files=[]
    for sibling in siblings:
        expected=sibling.lfs.sha256 if sibling.lfs else None
        if not expected:raise ValueError('MODEL_LFS_CHECKSUM_REQUIRED')
        path=Path(hf_hub_download(repository,sibling.rfilename,revision=info.sha,local_dir=destination))
        with path.open('rb') as stream:actual=hashlib.file_digest(stream,'sha256').hexdigest()
        if actual!=expected:raise ValueError('MODEL_CHECKSUM_MISMATCH')
        files.append({'filename':path.name,'sha256':actual,'lfs_sha256':expected})
    path=destination/files[0]['filename']
    manifest={'repository':repository,'revision':info.sha,'filename':path.name,'sha256':files[0]['sha256'],
              'files':files,'provider':'local_llama_cpp','external_api_key_required':False,
              'model_url':f'https://huggingface.co/{repository}/tree/{info.sha}'}
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
