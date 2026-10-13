#!/usr/bin/env python3
"""Uniform connector contract for Piratecartography research tools.

A connector result is an operational record, not historical verification.
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any

class ConnectorStatus(str, Enum):
    EXECUTED="EXECUTED"
    PARTIAL="PARTIAL"
    BLOCKED="BLOCKED"
    FAILED="FAILED"
    UNAVAILABLE="UNAVAILABLE"

class AccessClass(str, Enum):
    READ_ONLY="READ_ONLY"
    BROWSER="BROWSER"
    AUTH_REQUIRED="AUTH_REQUIRED"

@dataclass
class ConnectorCapabilities:
    search: bool = False
    fetch_record: bool = False
    fetch_page: bool = False
    verify_record: bool = False
    fulltext: bool = False
    images: bool = False
    iiif: bool = False
    browser: bool = False
    auth_required: bool = False

@dataclass
class ConnectorResult:
    connector_id: str
    repository: str
    operation: str
    status: ConnectorStatus
    query: str | None = None
    records: list[dict[str, Any]] = field(default_factory=list)
    provenance: dict[str, Any] = field(default_factory=dict)
    blockers: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    next_best_route: str | None = None
    evidence_level: str = "DISCOVERY_ONLY"
    retrieved_utc: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict[str, Any]:
        data=asdict(self)
        data["status"]=self.status.value
        return data

def validate_result(data: dict[str, Any]) -> list[str]:
    errors=[]
    required=("connector_id","repository","operation","status","records","provenance","blockers","warnings","evidence_level","retrieved_utc")
    for key in required:
        if key not in data:
            errors.append("MISSING_"+key.upper())
    if data.get("status") not in {x.value for x in ConnectorStatus}:
        errors.append("INVALID_STATUS")
    if not isinstance(data.get("records",[]),list):
        errors.append("RECORDS_NOT_LIST")
    if not isinstance(data.get("provenance",{}),dict):
        errors.append("PROVENANCE_NOT_OBJECT")
    if data.get("evidence_level") == "VERIFIED":
        errors.append("CONNECTOR_MAY_NOT_OUTPUT_VERIFIED")
    return errors
