from fastapi import APIRouter, Query, HTTPException

from core import stats
from core.physics import time_dilation

router = APIRouter(prefix="/relativity", tags=["Relativity"])

EP_TIME = "/relativity/time-dilation"


@router.get(
    "/time-dilation",
    summary="Special and general relativistic time dilation",
    description=(
        "Computes dilated time from either relative velocity (special relativity) or "
        "gravitational potential (general relativity). At least one of velocity or "
        "gravitational_potential must be provided; velocity must be positive when used alone."
    ),
)
async def get_time_dilation(
    velocity: float | None = Query(None, ge=0, description="Relative speed in m/s (optional)", examples=[7660.0]),
    gravitational_potential: float | None = Query(
        None,
        description="Gravitational potential in J/kg (optional, negative near massive bodies)",
        examples=[-6.26e7],
    ),
    proper_time: float = Query(1.0, gt=0, description="Proper time interval in seconds", examples=[1.0]),
):
    if velocity is None and gravitational_potential is None:
        raise HTTPException(
            status_code=400,
            detail="Provide at least one of velocity or gravitational_potential.",
        )
    if (velocity is None or velocity == 0) and gravitational_potential is None:
        raise HTTPException(
            status_code=400,
            detail="Provide a positive velocity or a gravitational_potential.",
        )

    v = velocity if velocity and velocity > 0 else None
    gp = gravitational_potential

    result = time_dilation(velocity=v, gravitational_potential=gp, proper_time=proper_time)
    await stats.record(EP_TIME)
    return result
