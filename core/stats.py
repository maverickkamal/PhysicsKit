import json
import asyncio
from pathlib import Path
from datetime import datetime, timezone

STATS_FILE = Path(__file__).resolve().parent.parent / "stats.json"

_defaults = {
    "total_requests": 0,
    "requests_by_endpoint": {},
    "most_queried_domain": None,
    "uptime_start": datetime.now(timezone.utc).isoformat(),
}

_cache: dict | None = None


def _derive_most_queried(by_endpoint: dict[str, int]) -> str | None:
    if not by_endpoint:
        return None
    domain_counts: dict[str, int] = {}
    for ep, count in by_endpoint.items():
        domain = ep.split("/")[1] if "/" in ep else ep
        domain_counts[domain] = domain_counts.get(domain, 0) + count
    return max(domain_counts, key=domain_counts.get)


def load() -> dict:
    global _cache
    if STATS_FILE.exists():
        with open(STATS_FILE, "r") as f:
            _cache = json.load(f)
    else:
        _cache = {**_defaults}
        _write_sync(_cache)
    return _cache


def _write_sync(data: dict) -> None:
    with open(STATS_FILE, "w") as f:
        json.dump(data, f, indent=2)


async def _write_async(data: dict) -> None:
    await asyncio.to_thread(_write_sync, data)


async def record(endpoint_name: str) -> None:
    global _cache
    if _cache is None:
        load()
    _cache["total_requests"] += 1
    by_ep = _cache["requests_by_endpoint"]
    by_ep[endpoint_name] = by_ep.get(endpoint_name, 0) + 1
    _cache["most_queried_domain"] = _derive_most_queried(by_ep)
    try:
        await _write_async(_cache)
    except Exception:
        pass


def get_stats() -> dict:
    if _cache is None:
        load()
    return {**_cache}
