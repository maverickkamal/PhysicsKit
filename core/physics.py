import math
import numpy as np
from scipy.integrate import solve_ivp

G_CONST = 6.67430e-11
R_GAS = 8.314462
C_LIGHT = 299792458.0


def projectile_motion(velocity: float, angle: float, height: float = 0.0, gravity: float = 9.81) -> dict:
    angle_rad = math.radians(angle)
    vx = velocity * math.cos(angle_rad)
    vy = velocity * math.sin(angle_rad)

    discriminant = vy**2 + 2 * gravity * height
    t_flight = (vy + math.sqrt(max(discriminant, 0))) / gravity if gravity > 0 else 0.0

    max_h = height + vy**2 / (2 * gravity) if gravity > 0 else height
    rng = vx * t_flight

    num_points = 100
    trajectory = []
    for i in range(num_points):
        t = t_flight * i / (num_points - 1)
        x = vx * t
        y = height + vy * t - 0.5 * gravity * t**2
        trajectory.append({"x": round(x, 4), "y": round(max(y, 0), 4)})

    context = (
        f"A projectile launched at {velocity} m/s at {angle}° from {height} m height "
        f"reaches a peak of {max_h:.2f} m, travels {rng:.2f} m horizontally, "
        f"and lands after {t_flight:.2f} seconds. "
        f"That's roughly the distance of {rng / 100:.0f} football fields."
    )

    return {
        "max_height": round(max_h, 4),
        "range": round(rng, 4),
        "time_of_flight": round(t_flight, 4),
        "trajectory": trajectory,
        "context": context,
    }


def escape_velocity(mass: float, radius: float, body_name: str | None = None) -> dict:
    v_esc = math.sqrt(2 * G_CONST * mass / radius)
    v_kmh = v_esc * 3.6

    name = body_name or "this body"
    context = (
        f"To escape {name}'s gravitational pull, you need to reach {v_esc:.2f} m/s "
        f"({v_kmh:.0f} km/h). For comparison, Earth's escape velocity is about 11,186 m/s — "
        f"Voyager 1 exceeded this at launch and is now the farthest human-made object from Earth."
    )

    return {
        "escape_velocity_ms": round(v_esc, 4),
        "escape_velocity_kmh": round(v_kmh, 4),
        "context": context,
    }


def doppler_frequency(source_freq: float, source_vel: float, observer_vel: float, medium_speed: float = 343.0) -> dict:
    observed = source_freq * (medium_speed + observer_vel) / (medium_speed - source_vel)
    shift = observed - source_freq

    if shift > 0:
        effect = "blueshift"
    elif shift < 0:
        effect = "redshift"
    else:
        effect = "no shift"

    num_frames = 60
    scene_data = []
    for i in range(num_frames):
        t = i / num_frames
        source_x = t * source_vel * 2
        waves = []
        for j in range(5):
            emit_t = max(0, t - j * (1.0 / source_freq) * 0.2)
            emit_x = emit_t * source_vel * 2
            wave_radius = (t - emit_t) * medium_speed * 0.01
            if wave_radius > 0:
                waves.append({"cx": round(emit_x, 4), "cy": 0, "r": round(wave_radius, 4)})
        scene_data.append({"source_x": round(source_x, 4), "waves": waves})

    context = (
        f"When a {source_freq} Hz source moves at {source_vel} m/s "
        f"(observer at {observer_vel} m/s), the observed frequency is {observed:.2f} Hz — "
        f"a {abs(shift):.2f} Hz {effect}. "
        f"This is why an ambulance siren sounds higher-pitched as it approaches you "
        f"and lower-pitched as it drives away."
    )

    return {
        "observed_frequency": round(observed, 4),
        "frequency_shift": round(shift, 4),
        "effect": effect,
        "scene_data": scene_data,
        "context": context,
    }


def wave_interference(freq1: float, freq2: float, amp1: float, amp2: float, points: int = 200) -> dict:
    x = np.linspace(0, 2 * np.pi * 4, points)
    y1 = amp1 * np.sin(freq1 * x)
    y2 = amp2 * np.sin(freq2 * x)
    y_sum = y1 + y2

    pattern = [{"x": round(float(x[i]), 4), "y": round(float(y_sum[i]), 4)} for i in range(points)]

    max_amp = amp1 + amp2
    threshold = 0.05 * max_amp
    constructive = []
    destructive = []
    for i in range(points):
        val = abs(float(y_sum[i]))
        if val >= max_amp - threshold:
            constructive.append(round(float(x[i]), 4))
        elif val <= threshold:
            destructive.append(round(float(x[i]), 4))

    beat_freq = abs(freq1 - freq2)
    context = (
        f"Two waves at {freq1} Hz and {freq2} Hz interfere to create a beat pattern "
        f"at {beat_freq:.2f} Hz. There are {len(constructive)} points of constructive "
        f"interference (max amplitude {max_amp:.2f}) and {len(destructive)} points of "
        f"destructive interference. This is how noise-cancelling headphones work — "
        f"they generate a wave that destructively interferes with ambient noise."
    )

    return {
        "pattern": pattern,
        "constructive_points": constructive,
        "destructive_points": destructive,
        "context": context,
    }


def ideal_gas_law(solve_for: str, P: float | None = None, V: float | None = None,
                  n: float | None = None, T: float | None = None) -> dict:
    solve_for = solve_for.upper()
    units = {"P": "Pa", "V": "m³", "N": "mol", "T": "K"}

    if solve_for == "P":
        result = n * R_GAS * T / V
    elif solve_for == "V":
        result = n * R_GAS * T / P
    elif solve_for == "N":
        result = P * V / (R_GAS * T)
    elif solve_for == "T":
        result = P * V / (n * R_GAS)
    else:
        raise ValueError(f"solve_for must be one of P, V, n, T — got '{solve_for}'")

    labels = {"P": "pressure", "V": "volume", "N": "amount of substance", "T": "temperature"}
    context = (
        f"Using the ideal gas law PV = nRT, the {labels[solve_for]} is {result:.4g} {units[solve_for]}. "
        f"The ideal gas law assumes perfectly elastic collisions between gas molecules "
        f"and no intermolecular forces — a good approximation at everyday temperatures and pressures, "
        f"but it breaks down near a gas's condensation point."
    )

    return {
        "result": round(result, 6),
        "unit": units[solve_for],
        "equation_used": "PV = nRT",
        "context": context,
    }


def time_dilation(velocity: float | None = None, gravitational_potential: float | None = None,
                  proper_time: float = 1.0) -> dict:
    lorentz = 1.0
    dilated = proper_time
    method = ""

    if velocity is not None and velocity > 0:
        beta = velocity / C_LIGHT
        lorentz = 1.0 / math.sqrt(1 - beta**2)
        dilated = proper_time * lorentz
        method = "special relativity (velocity)"
        speed_frac = velocity / C_LIGHT

        if velocity < 100000:
            real_world = (
                f"At {velocity:.0f} m/s, time dilation is barely measurable — but it's real. "
                f"GPS satellites orbiting at ~3,874 m/s must correct their clocks by about "
                f"38 microseconds per day due to combined special and general relativistic effects."
            )
        elif speed_frac > 0.99:
            real_world = (
                f"At {speed_frac:.4f}c, time almost stops relative to a stationary observer. "
                f"A muon created in the upper atmosphere at this speed lives long enough to "
                f"reach Earth's surface — something impossible without time dilation."
            )
        else:
            real_world = (
                f"At {speed_frac:.4f}c ({velocity:.0f} m/s), one second for you equals "
                f"{dilated:.6f} seconds for a stationary observer. "
                f"Particles at the LHC routinely experience this level of time dilation."
            )
    elif gravitational_potential is not None:
        dilated = proper_time / math.sqrt(1 + 2 * gravitational_potential / C_LIGHT**2)
        lorentz = dilated / proper_time if proper_time != 0 else 1.0
        method = "general relativity (gravitational)"
        real_world = (
            f"In a gravitational potential of {gravitational_potential:.2e} J/kg, "
            f"time runs {'slower' if gravitational_potential < 0 else 'faster'} "
            f"relative to a distant observer. Near a neutron star surface, "
            f"one hour can equal years in flat spacetime."
        )
    else:
        real_world = "No velocity or gravitational potential provided."

    diff = abs(dilated - proper_time)
    pct = (diff / proper_time * 100) if proper_time != 0 else 0.0

    context = (
        f"Time dilation via {method}: {proper_time} s of proper time becomes "
        f"{dilated:.10f} s for the external observer — a difference of {diff:.10e} s "
        f"({pct:.8f}% slower). {real_world}"
    )

    return {
        "dilated_time": dilated,
        "lorentz_factor": lorentz,
        "time_difference": diff,
        "percentage_slower": round(pct, 10),
        "context": context,
    }


def double_pendulum_ode(t, state, L1, L2, m1, m2, g=9.81):
    th1, th2, w1, w2 = state
    delta = th2 - th1
    den1 = (m1 + m2) * L1 - m2 * L1 * math.cos(delta)**2
    den2 = (L2 / L1) * den1

    dw1 = (
        m2 * L1 * w1**2 * math.sin(delta) * math.cos(delta)
        + m2 * g * math.sin(th2) * math.cos(delta)
        + m2 * L2 * w2**2 * math.sin(delta)
        - (m1 + m2) * g * math.sin(th1)
    ) / den1

    dw2 = (
        -m2 * L2 * w2**2 * math.sin(delta) * math.cos(delta)
        + (m1 + m2) * g * math.sin(th1) * math.cos(delta)
        - (m1 + m2) * L1 * w1**2 * math.sin(delta)
        - (m1 + m2) * g * math.sin(th2)
    ) / den2

    return [w1, w2, dw1, dw2]


def _pendulum_positions(sol_y, L1, L2):
    th1 = sol_y[0]
    th2 = sol_y[1]
    x1 = L1 * np.sin(th1)
    y1 = -L1 * np.cos(th1)
    x2 = x1 + L2 * np.sin(th2)
    y2 = y1 - L2 * np.cos(th2)
    return x1, y1, x2, y2


def run_double_pendulum(theta1: float, theta2: float, omega1: float = 0.0, omega2: float = 0.0,
                        L1: float = 1.0, L2: float = 1.0, m1: float = 1.0, m2: float = 1.0,
                        duration: float = 10.0) -> dict:
    th1_rad = math.radians(theta1)
    th2_rad = math.radians(theta2)
    state0 = [th1_rad, th2_rad, omega1, omega2]

    num_points = min(int(duration * 100), 3000)
    t_eval = np.linspace(0, duration, num_points)

    max_step = duration / num_points * 2 if num_points > 0 else 0.05

    sol = solve_ivp(
        double_pendulum_ode,
        [0, duration],
        state0,
        args=(L1, L2, m1, m2),
        method="RK45",
        t_eval=t_eval,
        rtol=1e-8,
        atol=1e-10,
        max_step=max_step,
    )

    x1, y1, x2, y2 = _pendulum_positions(sol.y, L1, L2)

    trajectory1 = [
        {"x": round(float(x1[i]), 6), "y": round(float(y1[i]), 6), "t": round(float(sol.t[i]), 4)}
        for i in range(len(sol.t))
    ]
    trajectory2 = [
        {"x": round(float(x2[i]), 6), "y": round(float(y2[i]), 6), "t": round(float(sol.t[i]), 4)}
        for i in range(len(sol.t))
    ]

    total_energy_start = _pendulum_energy(sol.y[:, 0], L1, L2, m1, m2)
    total_energy_end = _pendulum_energy(sol.y[:, -1], L1, L2, m1, m2)
    is_chaotic = abs(theta1) > 30 or abs(theta2) > 30

    context = (
        f"Double pendulum simulation: theta1={theta1} deg, theta2={theta2} deg, duration={duration}s, "
        f"{len(trajectory1)} trajectory points. "
        f"Energy drift: {abs(total_energy_end - total_energy_start):.2e} J — "
        f"{'negligible (good numerical accuracy)' if abs(total_energy_end - total_energy_start) < 0.01 else 'noticeable — longer durations amplify numerical error'}. "
        f"{'The system is in a chaotic regime — tiny changes in initial conditions lead to wildly different outcomes.' if is_chaotic else 'The system is in a near-linear regime — small oscillations, predictable motion.'}"
    )

    return {
        "trajectory1": trajectory1,
        "trajectory2": trajectory2,
        "is_chaotic": is_chaotic,
        "context": context,
    }


def bob2_divergence_time_seconds(trajectory2_a: list, trajectory2_b: list, threshold_m: float = 0.1) -> float | None:
    n = min(len(trajectory2_a), len(trajectory2_b))
    for i in range(n):
        a = trajectory2_a[i]
        b = trajectory2_b[i]
        dx = float(a["x"]) - float(b["x"])
        dy = float(a["y"]) - float(b["y"])
        if math.hypot(dx, dy) > threshold_m:
            return float(a["t"])
    return None


def _pendulum_energy(state, L1, L2, m1, m2, g=9.81):
    th1, th2, w1, w2 = state
    T = (0.5 * (m1 + m2) * L1**2 * w1**2
         + 0.5 * m2 * L2**2 * w2**2
         + m2 * L1 * L2 * w1 * w2 * math.cos(th1 - th2))
    V = -(m1 + m2) * g * L1 * math.cos(th1) - m2 * g * L2 * math.cos(th2)
    return T + V


def elastic_collision_2d(m1: float, m2: float, v1: dict, v2: dict) -> dict:
    v1x, v1y = v1["x"], v1["y"]
    v2x, v2y = v2["x"], v2["y"]
    M = m1 + m2

    f1x = ((m1 - m2) * v1x + 2 * m2 * v2x) / M
    f1y = ((m1 - m2) * v1y + 2 * m2 * v2y) / M
    f2x = ((m2 - m1) * v2x + 2 * m1 * v1x) / M
    f2y = ((m2 - m1) * v2y + 2 * m1 * v1y) / M

    ke_before = 0.5 * m1 * (v1x**2 + v1y**2) + 0.5 * m2 * (v2x**2 + v2y**2)
    ke_after = 0.5 * m1 * (f1x**2 + f1y**2) + 0.5 * m2 * (f2x**2 + f2y**2)
    energy_lost = ke_before - ke_after

    px_before = m1 * v1x + m2 * v2x
    px_after = m1 * f1x + m2 * f2x
    py_before = m1 * v1y + m2 * v2y
    py_after = m1 * f1y + m2 * f2y
    momentum_conserved = (abs(px_before - px_after) < 1e-6 and abs(py_before - py_after) < 1e-6)

    context = (
        f"Elastic collision between {m1} kg and {m2} kg objects. "
        f"Kinetic energy is conserved: {ke_before:.4f} J before, {ke_after:.4f} J after "
        f"(difference: {abs(energy_lost):.2e} J). "
        f"Think of billiard balls — in a perfect elastic collision, no energy is lost to "
        f"deformation or heat."
    )

    return {
        "final_velocity1": {"x": round(f1x, 6), "y": round(f1y, 6)},
        "final_velocity2": {"x": round(f2x, 6), "y": round(f2y, 6)},
        "kinetic_energy_before": round(ke_before, 6),
        "kinetic_energy_after": round(ke_after, 6),
        "energy_lost": round(energy_lost, 6),
        "momentum_conserved": momentum_conserved,
        "context": context,
    }


def inelastic_collision_2d(m1: float, m2: float, v1: dict, v2: dict, restitution: float = 0.5) -> dict:
    v1x, v1y = v1["x"], v1["y"]
    v2x, v2y = v2["x"], v2["y"]
    M = m1 + m2

    f1x = (m1 * v1x + m2 * v2x + m2 * restitution * (v2x - v1x)) / M
    f1y = (m1 * v1y + m2 * v2y + m2 * restitution * (v2y - v1y)) / M
    f2x = (m1 * v1x + m2 * v2x + m1 * restitution * (v1x - v2x)) / M
    f2y = (m1 * v1y + m2 * v2y + m1 * restitution * (v1y - v2y)) / M

    ke_before = 0.5 * m1 * (v1x**2 + v1y**2) + 0.5 * m2 * (v2x**2 + v2y**2)
    ke_after = 0.5 * m1 * (f1x**2 + f1y**2) + 0.5 * m2 * (f2x**2 + f2y**2)
    energy_lost = ke_before - ke_after

    px_before = m1 * v1x + m2 * v2x
    px_after = m1 * f1x + m2 * f2x
    py_before = m1 * v1y + m2 * v2y
    py_after = m1 * f1y + m2 * f2y
    momentum_conserved = (abs(px_before - px_after) < 1e-6 and abs(py_before - py_after) < 1e-6)

    pct_lost = (energy_lost / ke_before * 100) if ke_before > 0 else 0.0
    context = (
        f"Inelastic collision (restitution={restitution}) between {m1} kg and {m2} kg objects. "
        f"{energy_lost:.4f} J ({pct_lost:.1f}%) of kinetic energy lost to deformation, heat, or sound. "
        f"{'This is a perfectly inelastic collision — the objects stick together.' if restitution == 0 else ''}"
        f"Car crashes are inelastic — crumple zones are designed to maximize energy absorption."
    )

    return {
        "final_velocity1": {"x": round(f1x, 6), "y": round(f1y, 6)},
        "final_velocity2": {"x": round(f2x, 6), "y": round(f2y, 6)},
        "kinetic_energy_before": round(ke_before, 6),
        "kinetic_energy_after": round(ke_after, 6),
        "energy_lost": round(energy_lost, 6),
        "momentum_conserved": momentum_conserved,
        "context": context,
    }


def double_pendulum_preview(theta1: float, theta2: float, steps: int = 300,
                            L1: float = 1.0, L2: float = 1.0) -> dict:
    th1 = math.radians(theta1)
    th2 = math.radians(theta2)
    dt = 0.02
    w1, w2 = 0.0, 0.0
    g = 9.81

    traj1 = []
    traj2 = []

    for _ in range(steps):
        x1 = L1 * math.sin(th1)
        y1 = -L1 * math.cos(th1)
        x2 = x1 + L2 * math.sin(th2)
        y2 = y1 - L2 * math.cos(th2)
        traj1.append({"x": round(x1, 6), "y": round(y1, 6)})
        traj2.append({"x": round(x2, 6), "y": round(y2, 6)})

        delta = th2 - th1
        den = 2 - math.cos(delta)**2
        dw1 = (g * math.sin(th2) * math.cos(delta) - g * math.sin(th1)
               - math.sin(delta) * (w2**2 + w1**2 * math.cos(delta))) / (L1 * den)
        dw2 = (g * math.sin(th1) * math.cos(delta) - g * math.sin(th2)
               + math.sin(delta) * (w1**2 + w2**2 * math.cos(delta))) / (L2 * den)

        w1 += dw1 * dt
        w2 += dw2 * dt
        th1 += w1 * dt
        th2 += w2 * dt

    is_chaotic = abs(theta1) > 30 or abs(theta2) > 30
    context = (
        f"Preview of double pendulum at theta1={theta1} deg, theta2={theta2} deg -- "
        f"{steps} steps using simple Euler integration (fast but approximate). "
        f"Use the full POST endpoint for accurate RK45 simulation."
    )

    return {
        "trajectory1": traj1,
        "trajectory2": traj2,
        "is_chaotic_preview": is_chaotic,
        "context": context,
    }
