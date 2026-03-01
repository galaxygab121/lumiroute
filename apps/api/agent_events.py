from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

EVENTS_PATH = Path(__file__).parent / "data" / "agent_events.jsonl"

def log_event(event: Dict[str, Any]) -> None:
    EVENTS_PATH.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        **event,
        "ts": event.get("ts") or (datetime.utcnow().isoformat() + "Z"),
    }

    with EVENTS_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(payload) + "\n")