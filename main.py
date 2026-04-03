from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import time

from routers import mechanics, waves, thermodynamics, relativity, chaos
from core import stats

_start_time: float = 0.0


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _start_time
    _start_time = time.time()
    stats.load()
    yield


app = FastAPI(
    title="PhysicsKit",
    description=(
        "A physics computation API with a built-in interactive visual playground. "
        "Models real physical phenomena — chaotic double pendulums, orbital escape "
        "velocities, relativistic time dilation, Doppler wave scenes — and returns "
        "structured JSON with a plain-English context field on every response."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(mechanics.router)
app.include_router(waves.router)
app.include_router(thermodynamics.router)
app.include_router(relativity.router)
app.include_router(chaos.router)

app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")


@app.get("/health", tags=["Meta"], summary="API health check")
async def health():
    uptime = time.time() - _start_time
    return {
        "status": "ok",
        "uptime_seconds": round(uptime, 2),
        "version": "1.0.0",
        "message": "PhysicsKit is running.",
    }


@app.get("/stats", tags=["Meta"], summary="Persisted usage statistics")
async def get_stats():
    return stats.get_stats()


@app.get("/playground", tags=["Playground"], summary="Interactive visual playground", include_in_schema=False)
async def playground(request: Request):
    return templates.TemplateResponse("playground.html", {"request": request})
