#!/usr/bin/env python3
"""Optional OpenAI-compatible LLM execution boundary.

Disabled by default. Secrets are read only at call time and are never returned.
"""
from __future__ import annotations
import json,os,urllib.request,urllib.error
from urllib.parse import urlsplit
from llm_router import route

def call(role:str,prompt:str)->dict:
    r=route(role)
    if r.provider=="disabled" or not r.model:
        return {
          "status":"FALLBACK_REQUIRED","role":role,"fallback":r.fallback,
          "provider":"disabled","model":None,"verified_promotion_allowed":False
        }

    if r.provider=='local_llama_cpp':
        try:
            from local_model import call as local_call
            return local_call(role,prompt,r)
        except Exception as exc:
            return {'status':'FALLBACK_REQUIRED','role':role,'provider':r.provider,'model':r.model,
                    'error':type(exc).__name__,'verified_promotion_allowed':False}

    if r.provider!="openai_compatible":
        return {
          "status":"FALLBACK_REQUIRED","role":role,"fallback":r.fallback,
          "provider":r.provider,"model":r.model,
          "error":"UNSUPPORTED_PROVIDER","verified_promotion_allowed":False
        }

    base=os.environ.get("PCT_LLM_BASE_URL","").strip().rstrip("/")
    key=os.environ.get("PCT_LLM_API_KEY","").strip()
    if not base or not key:
        return {
          "status":"FALLBACK_REQUIRED","role":role,"fallback":r.fallback,
          "provider":r.provider,"model":r.model,
          "error":"LLM_EXECUTION_BOUNDARY_NOT_CONFIGURED",
          "verified_promotion_allowed":False
        }

    parsed=urlsplit(base)
    if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        return {"status":"FALLBACK_REQUIRED","role":role,"fallback":r.fallback,
                "provider":r.provider,"model":r.model,"error":"INVALID_LLM_BASE_URL","verified_promotion_allowed":False}
    body=json.dumps({
      "model":r.model,
      "messages":[{"role":"user","content":prompt}],
      "temperature":r.temperature,
      "max_tokens":r.max_output_tokens
    }).encode("utf-8")
    req=urllib.request.Request(
      base+"/chat/completions",data=body,method="POST",
      headers={"Authorization":"Bearer "+key,"Content-Type":"application/json"}
    )
    try:
        with urllib.request.urlopen(req,timeout=120) as resp:
            data=json.loads(resp.read().decode("utf-8"))
        content=data["choices"][0]["message"]["content"]
        return {
          "status":"COMPLETED","role":role,"provider":r.provider,"model":r.model,
          "content":content,"verified_promotion_allowed":False
        }
    except Exception as exc:
        return {
          "status":"FALLBACK_REQUIRED","role":role,"fallback":r.fallback,
          "provider":r.provider,"model":r.model,
          "error":type(exc).__name__,
          "verified_promotion_allowed":False
        }
