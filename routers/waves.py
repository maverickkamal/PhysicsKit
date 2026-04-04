from fastapi import APIRouter, Query, HTTPException

from core import stats
from core.physics import doppler_frequency, wave_interference

router = APIRouter(prefix="/waves", tags=["Waves"])

EP_DOPPLER = "/waves/doppler"
EP_INTERFERENCE = "/waves/interference"


@router.get(
    "/doppler",
    summary="Doppler effect with scene data",
    description=(
        "Observed frequency when source and observer move through a medium. "
        "Positive source_velocity means toward the observer; positive observer_velocity means toward the source. "
        "Returns scene_data for playground wave animation."
    ),
)
async def get_doppler(
    source_freq: float = Query(..., gt=0, description="Source frequency in Hz", examples=[440.0]),
    source_velocity: float = Query(..., description="Source velocity in m/s (positive = toward observer)", examples=[30.0]),
    observer_velocity: float = Query(0.0, description="Observer velocity in m/s (positive = toward source)", examples=[0.0]),
    medium_speed: float = Query(343.0, gt=0, description="Wave speed in medium (m/s)", examples=[343.0]),
):
    if abs(medium_speed - source_velocity) < 1e-9:
        raise HTTPException(status_code=400, detail="medium_speed must differ from source_velocity (avoid division by zero).")
    result = doppler_frequency(source_freq, source_velocity, observer_velocity, medium_speed)
    await stats.record(EP_DOPPLER)
    return result


@router.get(
    "/interference",
    summary="Two-source wave interference",
    description=(
        "Superposition of two sinusoidal waves. Returns the interference pattern, "
        "lists of x-positions near constructive and destructive interference, and context."
    ),
)
async def get_interference(
    freq1: float = Query(..., gt=0, description="First wave frequency (rad/m scaling in model)", examples=[5.0]),
    freq2: float = Query(..., gt=0, description="Second wave frequency", examples=[6.0]),
    amplitude1: float = Query(..., gt=0, description="First wave amplitude", examples=[1.0]),
    amplitude2: float = Query(..., gt=0, description="Second wave amplitude", examples=[1.0]),
    points: int = Query(200, ge=10, le=500, description="Number of sample points along the pattern", examples=[200]),
):
    result = wave_interference(freq1, freq2, amplitude1, amplitude2, points)
    await stats.record(EP_INTERFERENCE)
    return result
