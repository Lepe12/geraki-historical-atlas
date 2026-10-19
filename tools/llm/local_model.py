"""In-process open-weight inference for the existing research engine.

No hosted service, API key or second database. Outputs pass the same evidence
validators as external models and can never promote historical verification.
"""
import hashlib
import json
import os
from pathlib import Path
import time

_model=None
_identity=None

def identity():
    global _identity
    if _identity is None:
        path=Path(os.environ['PCT_LOCAL_MODEL_PATH'])
        manifest=path.with_suffix('.manifest.json')
        _identity=json.loads(manifest.read_text()) if manifest.exists() else {}
        for part in _identity.get('files',[]):
            with path.with_name(part['filename']).open('rb') as stream:
                if hashlib.file_digest(stream,'sha256').hexdigest()!=part['sha256']:
                    raise ValueError('MODEL_SHARD_CHECKSUM_MISMATCH')
        with path.open('rb') as stream:actual=hashlib.file_digest(stream,'sha256').hexdigest()
        if _identity.get('sha256') and _identity['sha256']!=actual:
            raise ValueError('MODEL_CHECKSUM_MISMATCH')
        _identity.update(sha256=actual,file=path.name)
    return _identity

def call(role,prompt,route):
    global _model
    model_identity=identity()
    if model_identity.get("repository")!=route.model:raise ValueError("MODEL_ROUTE_IDENTITY_MISMATCH")
    if _model is None:
        from llama_cpp import Llama
        _model=Llama(model_path=os.environ['PCT_LOCAL_MODEL_PATH'],n_ctx=8192,
                     n_threads=max(1,min(4,os.cpu_count() or 1)),verbose=False,seed=42)
    started=time.monotonic()
    prompt_tokens=len(_model.tokenize(prompt.encode()))+32
    maximum=min(route.max_output_tokens,1800,8192-prompt_tokens-64)
    if maximum<128:raise ValueError('MODEL_CONTEXT_BUDGET_EXCEEDED')
    result=_model.create_chat_completion(messages=[{'role':'user','content':prompt}],
        temperature=route.temperature,max_tokens=maximum,
        response_format={'type':'json_object'})
    return {'status':'COMPLETED','role':role,'provider':'local_llama_cpp','model':route.model,
            'model_identity':model_identity,'runtime':'llama-cpp-python',
            'content':result['choices'][0]['message']['content'],
            'finish_reason':result['choices'][0].get('finish_reason'),
            'usage':result.get('usage'),'elapsed_seconds':round(time.monotonic()-started,2),
            'verified_promotion_allowed':False}
