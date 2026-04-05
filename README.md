# PhysicsKit

A physics computation API with a built-in interactive playground. Every endpoint computes real physics — projectile arcs, chaotic double pendulums, relativistic time dilation, Doppler wave compression — and returns structured JSON with a plain-English `context` field explaining what the numbers actually mean. Built for the Hack Club RaspAPI YSWS, designed to run on a Raspberry Pi.

## The Four Coolest Things

**1. Chaos Lab** — Watch two double pendulums with nearly identical starting conditions diverge into completely different paths. Compare mode offsets theta by 0.001° and shows exactly when chaos takes over.

```bash
curl -X POST http://localhost:8000/chaos/double-pendulum \
  -H "Content-Type: application/json" \
  -d '{"theta1":120,"theta2":120,"duration":15,"compare_mode":true}'
```

**2. Time Dilation Clocks** — Two analog clocks tick side by side. Crank the velocity slider toward 0.999c and watch the dilated clock nearly freeze.

```bash
curl "http://localhost:8000/relativity/time-dilation?velocity=299492665.542&proper_time=1"
```

**3. Wave Interference** — Two sinusoidal waves with different frequencies produce a live animated beat pattern. Drag the frequency sliders and watch constructive and destructive interference shift in real time.

```bash
curl "http://localhost:8000/waves/interference?freq1=5&freq2=6&amplitude1=1&amplitude2=1"
```

**4. 2D Collisions** — Elastic and inelastic collisions animated as billiard balls with velocity arrows and kinetic energy bars. Change masses and watch energy transfer.

```bash
curl -X POST http://localhost:8000/mechanics/collision \
  -H "Content-Type: application/json" \
  -d '{"mass1":2,"mass2":1,"velocity1":{"x":3,"y":0},"velocity2":{"x":-1,"y":0},"collision_type":"elastic"}'
```

## Endpoints

| Method | Endpoint | What it does |
|--------|----------|-------------|
| GET | `/health` | Status and uptime |
| GET | `/stats` | Persisted request counts |
| GET | `/mechanics/projectile` | Projectile arc with trajectory |
| GET | `/mechanics/escape-velocity` | Escape velocity from any body |
| GET | `/waves/doppler` | Doppler shift with animation data |
| GET | `/waves/interference` | Two-wave superposition pattern |
| GET | `/thermo/gas-law` | PV=nRT solver |
| GET | `/relativity/time-dilation` | Special + general relativity |
| GET | `/chaos/double-pendulum-preview` | Fast preview trajectory |
| POST | `/chaos/double-pendulum` | Full ODE simulation (RK45) |
| POST | `/mechanics/collision` | 2D elastic/inelastic collision |

Interactive docs at `/docs`. Playground at `/playground`.

## Run Locally

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

Open `http://localhost:8000/playground` — the chaos lab animates immediately.

*AI contributed to the readme*
