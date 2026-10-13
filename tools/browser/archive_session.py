#!/usr/bin/env python3
"""Restricted persistent browser sessions for historical archive research.

Inspired by general desktop-agent browser-session patterns, but purpose-built
for Piratecartography. It is domain-allowlisted, audit-logged, and cannot
promote historical claims to VERIFIED.
"""
from __future__ import annotations
import asyncio, json, re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ALLOWED_HOSTS={
    "asve.arianna4.cloud",
    "pares.cultura.gob.es",
    "sias-archivi.cultura.gov.it",
    "www.internetculturale.it",
    "internetculturale.it",
}

def _host_allowed(url:str)->bool:
    host=(urlparse(url).hostname or "").lower()
    return host in ALLOWED_HOSTS

def _safe_name(value:str)->str:
    value=re.sub(r"[^A-Za-z0-9_.-]+","_",value).strip("_")
    return value[:80] or "session"

@dataclass
class BrowserEvent:
    at_utc:str
    session:str
    action:str
    url:str=""
    detail:str=""
    success:bool=True

class ArchiveBrowserSession:
    def __init__(self, name:str, workspace:Path=Path("evidence/browser_sessions"), headless:bool=True):
        self.name=_safe_name(name)
        self.workspace=workspace/self.name
        self.profile=self.workspace/"profile"
        self.audit_path=self.workspace/"audit.jsonl"
        self.screenshot_dir=self.workspace/"screenshots"
        self.headless=headless
        self._pw=None; self._context=None; self._page=None

    def _audit(self, action:str, url:str="", detail:str="", success:bool=True):
        self.workspace.mkdir(parents=True,exist_ok=True)
        event=BrowserEvent(
            at_utc=datetime.now(timezone.utc).isoformat(),
            session=self.name, action=action, url=url, detail=detail[:500], success=success
        )
        with self.audit_path.open("a",encoding="utf-8") as fh:
            fh.write(json.dumps(event.__dict__,ensure_ascii=False)+"\n")

    async def start(self):
        from playwright.async_api import async_playwright
        if self._context is not None: return
        self.profile.mkdir(parents=True,exist_ok=True)
        self.screenshot_dir.mkdir(parents=True,exist_ok=True)
        self._pw=await async_playwright().start()
        self._context=await self._pw.chromium.launch_persistent_context(
            str(self.profile),
            headless=self.headless,
            viewport={"width":1440,"height":1000},
            args=["--disable-blink-features=AutomationControlled","--no-first-run"],
        )
        pages=self._context.pages
        self._page=pages[0] if pages else await self._context.new_page()
        self._audit("START")

    async def close(self):
        if self._context:
            try: await self._context.close()
            finally: self._context=None
        if self._pw:
            try: await self._pw.stop()
            finally: self._pw=None
        self._audit("CLOSE")

    async def go_to(self,url:str):
        if not _host_allowed(url):
            self._audit("GO_TO",url,"blocked by domain allowlist",False)
            raise ValueError("ARCHIVE_BROWSER_DOMAIN_NOT_ALLOWED")
        await self.start()
        try:
            await self._page.goto(url,wait_until="domcontentloaded",timeout=60000)
            self._audit("GO_TO",self._page.url,"loaded")
            return self._page.url
        except Exception as exc:
            self._audit("GO_TO",url,str(exc),False)
            raise

    async def body_text(self,limit:int=12000)->str:
        await self.start()
        text=await self._page.locator("body").inner_text()
        self._audit("BODY_TEXT",self._page.url,f"chars={len(text)}")
        return text[:limit]

    async def smart_click(self,description:str)->bool:
        await self.start()
        for role in ("button","link","tab","menuitem"):
            try:
                loc=self._page.get_by_role(role,name=description)
                if await loc.count():
                    await loc.first.click(timeout=8000)
                    self._audit("CLICK",self._page.url,f"{role}:{description}")
                    return True
            except Exception:
                pass
        try:
            await self._page.get_by_text(description,exact=False).first.click(timeout=8000)
            self._audit("CLICK",self._page.url,f"text:{description}")
            return True
        except Exception as exc:
            self._audit("CLICK",self._page.url,f"{description}: {exc}",False)
            return False

    async def smart_type(self,description:str,text:str)->bool:
        await self.start()
        candidates=[
            self._page.get_by_placeholder(description,exact=False),
            self._page.get_by_label(description,exact=False),
            self._page.get_by_role("searchbox"),
            self._page.get_by_role("textbox"),
        ]
        for loc in candidates:
            try:
                if await loc.count():
                    el=loc.first
                    await el.fill(text)
                    self._audit("TYPE",self._page.url,f"{description}: {text[:120]}")
                    return True
            except Exception:
                continue
        self._audit("TYPE",self._page.url,f"input not found: {description}",False)
        return False

    async def press(self,key:str):
        await self.start()
        await self._page.keyboard.press(key)
        self._audit("PRESS",self._page.url,key)

    async def screenshot(self,label:str)->str:
        await self.start()
        path=self.screenshot_dir/(f"{_safe_name(label)}.png")
        await self._page.screenshot(path=str(path),full_page=True)
        self._audit("SCREENSHOT",self._page.url,str(path))
        return str(path)

class ArchiveBrowserRegistry:
    def __init__(self,workspace:Path=Path("evidence/browser_sessions"),headless:bool=True):
        self.workspace=workspace; self.headless=headless; self.sessions={}
    def get(self,name:str)->ArchiveBrowserSession:
        if name not in self.sessions:
            self.sessions[name]=ArchiveBrowserSession(name,self.workspace,self.headless)
        return self.sessions[name]
    async def close_all(self):
        for session in list(self.sessions.values()):
            await session.close()

def run(coro):
    return asyncio.run(coro)
