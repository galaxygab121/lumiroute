# Agent events logging utility
from __future__ import annotations

# This module provides a simple utility to log agent events to a JSONL file.
# Each line is a JSON object with event details and a timestamp.
import json # for JSON serialization
from datetime import datetime # for timestamps
from pathlib import Path # for file paths
from typing import Any, Dict # for type annotations

# -----------------------
# Event structure
# -----------------------   
EVENTS_PATH = Path(__file__).parent / "data" / "agent_events.jsonl" # Path to the log file

def log_event(event: Dict[str, Any]) -> None: # Function to log an event
    EVENTS_PATH.parent.mkdir(parents=True, exist_ok=True) # Ensure the directory exists

    # Add a timestamp if not provided
    payload = { # Combine the event data with a timestamp
        **event, # Unpack the event dictionary
        "ts": event.get("ts") or (datetime.utcnow().isoformat() + "Z"), # Use provided timestamp or current UTC time in ISO format
    } 
    # Append the event as a JSON line to the log file
    with EVENTS_PATH.open("a", encoding="utf-8") as f: # Open the log file in append mode
        f.write(json.dumps(payload) + "\n") # Write the JSON-serialized event followed by a newline