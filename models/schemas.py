from pydantic import BaseModel, Field
from typing import Optional


class Vector2D(BaseModel):
    x: float
    y: float


class DoublePendulumRequest(BaseModel):
    theta1: float = Field(..., description="Initial angle of first pendulum in degrees", examples=[120.0])
    theta2: float = Field(..., description="Initial angle of second pendulum in degrees", examples=[120.0])
    omega1: float = Field(0.0, description="Initial angular velocity of first pendulum (rad/s)")
    omega2: float = Field(0.0, description="Initial angular velocity of second pendulum (rad/s)")
    length1: float = Field(1.0, description="Length of first pendulum arm (m)", gt=0)
    length2: float = Field(1.0, description="Length of second pendulum arm (m)", gt=0)
    mass1: float = Field(1.0, description="Mass of first bob (kg)", gt=0)
    mass2: float = Field(1.0, description="Mass of second bob (kg)", gt=0)
    duration: float = Field(10.0, description="Simulation duration (s)", gt=0, le=30.0)
    compare_mode: bool = Field(False, description="Run a second simulation with theta1 offset by 0.001 degrees")


class CollisionRequest(BaseModel):
    mass1: float = Field(..., description="Mass of first object (kg)", gt=0, examples=[2.0])
    mass2: float = Field(..., description="Mass of second object (kg)", gt=0, examples=[1.0])
    velocity1: Vector2D = Field(..., description="Velocity of first object (m/s)")
    velocity2: Vector2D = Field(..., description="Velocity of second object (m/s)")
    collision_type: str = Field("elastic", description="Type of collision: 'elastic' or 'inelastic'")
    restitution: float = Field(1.0, description="Coefficient of restitution (1.0 = perfectly elastic)", ge=0, le=1)
