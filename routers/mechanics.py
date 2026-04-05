from fastapi import APIRouter, Query, HTTPException

from core import stats
from core.physics import projectile_motion, escape_velocity, elastic_collision_2d, inelastic_collision_2d
from models.schemas import CollisionRequest

router = APIRouter(prefix="/mechanics", tags=["Mechanics"])

EP_PROJECTILE = "/mechanics/projectile"
EP_ESCAPE = "/mechanics/escape-velocity"
EP_COLLISION = "/mechanics/collision"


@router.get(
    "/projectile",
    summary="Projectile motion with trajectory",
    description=(
        "Computes full projectile motion for a given launch. Returns max height, horizontal range, "
        "time of flight, and a 100-point trajectory for visualization."
    ),
)
async def get_projectile(
    velocity: float = Query(..., gt=0, description="Launch speed in m/s", examples=[50.0]),
    angle: float = Query(..., gt=0, lt=180, description="Launch angle in degrees from horizontal (0-180)", examples=[45.0]),
    height: float = Query(0.0, ge=0, description="Initial height in m", examples=[0.0]),
    gravity: float = Query(9.81, gt=0, description="Gravitational acceleration in m/s²", examples=[9.81]),
):
    result = projectile_motion(velocity, angle, height, gravity)
    await stats.record(EP_PROJECTILE)
    return result


@router.get(
    "/escape-velocity",
    summary="Escape velocity from a spherical body",
    description=(
        "Computes escape velocity from any celestial body given mass and radius. "
        "Optional body_name is woven into the context narrative."
    ),
)
async def get_escape_velocity(
    mass: float = Query(..., gt=0, description="Body mass in kg", examples=[5.972e24]),
    radius: float = Query(..., gt=0, description="Body radius in m", examples=[6.371e6]),
    body_name: str | None = Query(None, description="Name used in context text", examples=["Earth"]),
):
    result = escape_velocity(mass, radius, body_name)
    await stats.record(EP_ESCAPE)
    return result


@router.post(
    "/collision",
    summary="2D elastic or inelastic collision",
    description=(
        "Computes post-collision velocities for two masses. "
        "Use collision_type 'elastic' for energy-conserving exchange or 'inelastic' with a restitution coefficient."
    ),
)
async def post_collision(body: CollisionRequest):
    ct = body.collision_type.strip().lower()
    if ct not in ("elastic", "inelastic"):
        raise HTTPException(status_code=400, detail="collision_type must be 'elastic' or 'inelastic'.")

    v1 = {"x": body.velocity1.x, "y": body.velocity1.y}
    v2 = {"x": body.velocity2.x, "y": body.velocity2.y}

    if ct == "elastic":
        result = elastic_collision_2d(body.mass1, body.mass2, v1, v2)
    else:
        result = inelastic_collision_2d(body.mass1, body.mass2, v1, v2, body.restitution)

    await stats.record(EP_COLLISION)
    return result
