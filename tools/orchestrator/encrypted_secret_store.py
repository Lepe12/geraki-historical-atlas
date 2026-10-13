#!/usr/bin/env python3
"""Host-local encrypted secret store for connector credentials.

No secret file is created unless explicitly configured with PCT_SECRET_STORE_PATH.
The configured store path must be outside the repository checkout.
"""
from __future__ import annotations
import json,os
from pathlib import Path

class EncryptedSecretStore:
    def __init__(self,path:Path|None=None,master_secret:str|None=None):
        raw_path=str(path or os.environ.get("PCT_SECRET_STORE_PATH","")).strip()
        if not raw_path: raise RuntimeError("PCT_SECRET_STORE_PATH_NOT_CONFIGURED")
        self.path=Path(raw_path).expanduser().resolve()
        repo=Path.cwd().resolve()
        if self.path==repo or repo in self.path.parents:
            raise ValueError("SECRET_STORE_MUST_BE_OUTSIDE_REPOSITORY")
        secret=master_secret or os.environ.get("PCT_SECRET_MASTER_KEY","")
        if len(secret)<24: raise RuntimeError("PCT_SECRET_MASTER_KEY_TOO_SHORT")
        try:
            from cryptography.fernet import Fernet
        except ImportError as exc:
            raise RuntimeError("CRYPTOGRAPHY_PACKAGE_REQUIRED") from exc
        import base64,hashlib
        key=base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
        self.fernet=Fernet(key)

    def _load(self)->dict:
        if not self.path.exists(): return {}
        raw=self.path.read_bytes()
        if not raw: return {}
        return json.loads(self.fernet.decrypt(raw).decode("utf-8"))

    def _save(self,data:dict):
        self.path.parent.mkdir(parents=True,exist_ok=True)
        self.path.write_bytes(self.fernet.encrypt(json.dumps(data,ensure_ascii=False).encode("utf-8")))
        try: os.chmod(self.path,0o600)
        except OSError: pass

    def set(self,name:str,value:str):
        if not name or not value: raise ValueError("SECRET_NAME_AND_VALUE_REQUIRED")
        data=self._load();data[name]=value;self._save(data)

    def get(self,name:str)->str|None:
        return self._load().get(name)

    def delete(self,name:str):
        data=self._load();data.pop(name,None);self._save(data)

    def names(self)->list[str]:
        return sorted(self._load().keys())
