from fastapi import APIRouter, Query, HTTPException

from core import stats
from core.physics import double_pendulum_preview, run_double_pendulum, bob2_divergence_time_seconds
from models.schemas import DoublePendulumRequest

router = APIRouter(prefix="/chaos", tags=["Chaos"])

EP_PREVIEW = "/chaos/double-pendulum-preview"
EP_DOUBLE_POST = "/chaos/double-pendulum"


@router.get(
    "/double-pendulum-preview",
    summary="Fast double pendulum preview (no full ODE)",
    description=(
        "Returns a short approximate trajectory using lightweight stepping — intended for live "
        "slider previews in the playground before running the full RK45 simulation via POST."
    ),
)
async def get_double_pendulum_preview(
    theta1: float = Query(..., description="First arm angle in degrees", examples=[120.0]),
    theta2: float = Query(..., description="Second arm angle in degrees", examples=[120.0]),
    steps: int = Query(300, ge=1, le=500, description="Number of preview steps (max 500)", examples=[300]),
):
    result = double_pendulum_preview(theta1, theta2, steps)
    await stats.record(EP_PREVIEW)
    return result


@router.post(
    "/double-pendulum",
    summary="Full double pendulum simulation (RK45)",
    description=(
        "Integrates the coupled double-pendulum ODE with scipy RK45. "
        "Optional compare_mode runs a twin simulation with theta1 increased by 0.001 degrees "
        "and reports divergence_time when the second bob positions differ by more than 0.1 m."
    ),
    response_description="Trajectory arrays include x, y, and t at each sample.",
)
async def post_double_pendulum(body: DoublePendulumRequest):
    if body.duration > 30.0:
        raise HTTPException(status_code=400, detail="duration must not exceed 30.0 seconds.")

    base = run_double_pendulum(
        body.theta1,
        body.theta2,
        body.omega1,
        body.omega2,
        body.length1,
        body.length2,
        body.mass1,
        body.mass2,
        body.duration,
    )
    out = {
        "trajectory1": base["trajectory1"],
        "trajectory2": base["trajectory2"],
        "is_chaotic": base["is_chaotic"],
        "context": base["context"],
    }

    if body.compare_mode:
        cmp_run = run_double_pendulum(
            body.theta1 + 0.001,
            body.theta2,
            body.omega1,
            body.omega2,
            body.length1,
            body.length2,
            body.mass1,
            body.mass2,
            body.duration,
        )
        div_t = bob2_divergence_time_seconds(base["trajectory2"], cmp_run["trajectory2"])
        out["comparison_trajectory1"] = cmp_run["trajectory1"]
        out["comparison_trajectory2"] = cmp_run["trajectory2"]
        out["divergence_time"] = div_t
        div_note = (
            f" Compare mode: twin run with theta1 offset by 0.001 deg diverges at bob2 "
            f"after {div_t:.4f} s."
            if div_t is not None
            else " Compare mode: bob2 trajectories stayed within 0.1 m for the full duration."
        )
        out["context"] = base["context"] + div_note

    await stats.record(EP_DOUBLE_POST)
    return out
