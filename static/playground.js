(function () {
    var chaosRafId = null;
    var chaosPlayback = null;
    var dopplerRafId = null;
    var dopplerAnim = null;
    var timeRafId = null;
    var timeClock = { accumL: 0, accumR: 0, rateR: 1, lastNow: null };
    var projRafId = null;
    var projAnim = null;

    var C_LIGHT = 299792458;
    var TIME_SPEED = 3;

    function qs(id) {
        return document.getElementById(id);
    }

    function debounce(fn, ms) {
        var t = null;
        return function () {
            var args = arguments;
            var ctx = this;
            clearTimeout(t);
            t = setTimeout(function () {
                fn.apply(ctx, args);
            }, ms);
        };
    }

    function fmtNum(n, decimals) {
        if (n == null) return "\u2014";
        var v = Number(n);
        if (isNaN(v)) return String(n);
        if (Math.abs(v) >= 1e6 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(decimals != null ? decimals : 3);
        return v.toFixed(decimals != null ? decimals : 2);
    }

    function prettyJson(data) {
        var clone = {};
        for (var k in data) {
            if (!data.hasOwnProperty(k)) continue;
            var val = data[k];
            if (Array.isArray(val) && val.length > 6) {
                clone[k] = "[" + val.length + " items]  first: " + JSON.stringify(val[0]) + "  last: " + JSON.stringify(val[val.length - 1]);
            } else {
                clone[k] = val;
            }
        }
        return JSON.stringify(clone, null, 2);
    }

    function escapeHtml(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function formatContext(text) {
        if (!text) return "";
        var s = escapeHtml(text);
        s = s.replace(/theta1\s*=/g, "\u03B8\u2081 = ")
             .replace(/theta2\s*=/g, "\u03B8\u2082 = ")
             .replace(/theta1/g, "\u03B8\u2081")
             .replace(/theta2/g, "\u03B8\u2082")
             .replace(/ deg\b/g, "\u00B0")
             .replace(/ deg,/g, "\u00B0,")
             .replace(/ deg\./g, "\u00B0.");
        s = s.replace(/\.\s+/g, ".<br>");
        return s;
    }

    function stopChaosAnimation() {
        if (chaosRafId != null) { cancelAnimationFrame(chaosRafId); chaosRafId = null; }
        chaosPlayback = null;
    }
    function stopDopplerAnimation() {
        if (dopplerRafId != null) { cancelAnimationFrame(dopplerRafId); dopplerRafId = null; }
        dopplerAnim = null;
    }
    function stopProjAnimation() {
        if (projRafId != null) { cancelAnimationFrame(projRafId); projRafId = null; }
        projAnim = null;
    }

    function initTabs() {
        var tabs = document.querySelectorAll(".tab");
        var panels = document.querySelectorAll(".panel");
        tabs.forEach(function (tab) {
            tab.addEventListener("click", function () {
                var target = tab.getAttribute("data-panel");
                tabs.forEach(function (t) { t.classList.remove("tab-active"); t.setAttribute("aria-selected", "false"); });
                tab.classList.add("tab-active");
                tab.setAttribute("aria-selected", "true");
                panels.forEach(function (p) { p.classList.remove("panel-active"); p.setAttribute("aria-hidden", "true"); });
                var panel = document.getElementById("panel-" + target);
                if (panel) { panel.classList.add("panel-active"); panel.setAttribute("aria-hidden", "false"); }
            });
        });
    }

    function syncChaosLabels() {
        var t1 = qs("chaos-theta1"), t2 = qs("chaos-theta2"), dur = qs("chaos-duration");
        if (t1 && qs("chaos-theta1-val")) qs("chaos-theta1-val").textContent = t1.value + "\u00B0";
        if (t2 && qs("chaos-theta2-val")) qs("chaos-theta2-val").textContent = t2.value + "\u00B0";
        if (dur && qs("chaos-duration-val")) qs("chaos-duration-val").textContent = dur.value + " s";
    }

    function paintPlaceholder(canvas, message) {
        if (!canvas || !canvas.getContext) return;
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#a89888";
        ctx.font = "14px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(message || "", canvas.width / 2, canvas.height / 2);
    }

    function configureChaosCanvases(compare) {
        var row = qs("chaos-canvas-row"), ca = qs("canvas-chaos-a"), cb = qs("canvas-chaos-b");
        if (!row || !ca || !cb) return;
        if (compare) {
            row.classList.add("chaos-compare");
            ca.width = 300; ca.height = 500; cb.width = 300; cb.height = 500;
            cb.setAttribute("aria-hidden", "false");
        } else {
            row.classList.remove("chaos-compare");
            ca.width = 600; ca.height = 500; cb.width = 600; cb.height = 500;
            cb.setAttribute("aria-hidden", "true");
        }
    }

    function indexForTime(traj, t) {
        if (!traj || traj.length === 0) return 0;
        for (var i = 0; i < traj.length; i++) { if (traj[i].t > t) return i > 0 ? i - 1 : 0; }
        return traj.length - 1;
    }

    function toScreen(x, y, cw, ch) {
        var scale = Math.min(cw, ch) * 0.165;
        return { sx: cw / 2 + x * scale, sy: ch * 0.32 - y * scale };
    }

    function drawTrail(ctx, traj, idx, rgb, cw, ch) {
        if (idx < 1) return;
        for (var i = 1; i <= idx; i++) {
            var p0 = toScreen(traj[i - 1].x, traj[i - 1].y, cw, ch);
            var p1 = toScreen(traj[i].x, traj[i].y, cw, ch);
            var alpha = (i / idx) * 0.42 + 0.04;
            ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(p1.sx, p1.sy);
            ctx.strokeStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + alpha + ")";
            ctx.lineWidth = 2; ctx.stroke();
        }
    }

    function drawPendulumState(ctx, cw, ch, t1, t2, idx) {
        var b1 = t1[idx], b2 = t2[idx];
        if (!b1 || !b2) return;
        var p0 = toScreen(0, 0, cw, ch), p1 = toScreen(b1.x, b1.y, cw, ch), p2 = toScreen(b2.x, b2.y, cw, ch);
        ctx.strokeStyle = "rgba(247,241,232,0.55)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.stroke();
        ctx.fillStyle = "rgba(255,200,150,0.95)"; ctx.beginPath(); ctx.arc(p1.sx, p1.sy, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,140,80,0.98)"; ctx.beginPath(); ctx.arc(p2.sx, p2.sy, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(247,241,232,0.9)"; ctx.beginPath(); ctx.arc(p0.sx, p0.sy, 4, 0, Math.PI * 2); ctx.fill();
    }

    function drawDivergenceLabel(ctx, cw, ch, divTime, simT, nowMs) {
        if (divTime == null || simT + 1e-6 < divTime) return;
        var pulse = 0.65 + 0.35 * Math.sin(nowMs / 180);
        ctx.save();
        ctx.font = "bold 13px Inter, system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillStyle = "rgba(220,60,40," + pulse + ")";
        ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 6;
        ctx.fillText("CHAOS BEGINS AT " + Number(divTime).toFixed(2) + "s", cw / 2, ch - 14);
        ctx.restore();
    }

    function drawChaosFrame(canvas, traj1, traj2, simT, divTime, nowMs) {
        if (!canvas || !traj1 || !traj2) return;
        var ctx = canvas.getContext("2d"), cw = canvas.width, ch = canvas.height;
        ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, cw, ch);
        var idx = indexForTime(traj2, simT);
        drawTrail(ctx, traj1, idx, [255, 184, 112], cw, ch);
        drawTrail(ctx, traj2, idx, [255, 120, 64], cw, ch);
        drawPendulumState(ctx, cw, ch, traj1, traj2, idx);
        drawDivergenceLabel(ctx, cw, ch, divTime, simT, nowMs);
    }

    function startChaosAnimation(data) {
        stopChaosAnimation();
        var compare = !!data.compare_mode && data.comparison_trajectory2 && data.comparison_trajectory1;
        configureChaosCanvases(compare);
        var traj1 = data.trajectory1, traj2 = data.trajectory2;
        var c1 = data.comparison_trajectory1, c2 = data.comparison_trajectory2;
        var divTime = data.divergence_time != null ? Number(data.divergence_time) : null;
        var lastT = traj2.length ? traj2[traj2.length - 1].t : 1;
        chaosPlayback = { compare: compare, divTime: divTime, lastT: lastT, traj1: traj1, traj2: traj2, c1: c1, c2: c2 };
        var startMs = null;
        function tick(now) {
            if (!chaosPlayback) return;
            if (startMs == null) startMs = now;
            var simT = ((now - startMs) / 1000) % (chaosPlayback.lastT || 1);
            drawChaosFrame(qs("canvas-chaos-a"), chaosPlayback.traj1, chaosPlayback.traj2, simT, chaosPlayback.divTime, now);
            if (chaosPlayback.compare) drawChaosFrame(qs("canvas-chaos-b"), chaosPlayback.c1, chaosPlayback.c2, simT, chaosPlayback.divTime, now);
            chaosRafId = requestAnimationFrame(tick);
        }
        chaosRafId = requestAnimationFrame(tick);
    }

    function renderStatPills(containerId, pairs) {
        var el = qs(containerId);
        if (!el) return;
        el.innerHTML = "";
        pairs.forEach(function (p) {
            var span = document.createElement("span");
            span.className = "stat-pill";
            span.innerHTML = escapeHtml(p.label) + ' <span class="mono">' + escapeHtml(p.value) + "</span>";
            el.appendChild(span);
        });
    }

    function formatDetail(data) {
        var d = data && data.detail;
        if (typeof d === "string") return d;
        if (Array.isArray(d)) return d.map(function (e) { return e.msg || JSON.stringify(e); }).join("; ");
        return d != null ? JSON.stringify(d) : "Request failed.";
    }

    function fetchChaosSimulation(opts) {
        opts = opts || {};
        var compare = !!opts.compare;
        var theta1 = opts.theta1 != null ? Number(opts.theta1) : 120;
        var theta2 = opts.theta2 != null ? Number(opts.theta2) : 120;
        var duration = opts.duration != null ? Number(opts.duration) : 15;
        var statusEl = qs("chaos-status"), ctxEl = qs("chaos-context"), jsonEl = qs("chaos-json");
        stopChaosAnimation();
        configureChaosCanvases(compare);
        paintPlaceholder(qs("canvas-chaos-a"), "Fetching physics\u2026");
        if (statusEl) statusEl.textContent = compare ? "Loading compare\u2026" : "Loading\u2026";
        var body = { theta1: theta1, theta2: theta2, omega1: 0, omega2: 0, length1: 1, length2: 1, mass1: 1, mass2: 1, duration: duration, compare_mode: compare };
        return fetch("/chaos/double-pendulum", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
            .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, status: res.status, data: d }; }); })
            .then(function (out) {
                if (!out.ok) {
                    if (statusEl) statusEl.textContent = "Error " + out.status;
                    if (ctxEl) ctxEl.innerHTML = formatContext(formatDetail(out.data));
                    if (jsonEl) jsonEl.textContent = JSON.stringify(out.data, null, 2);
                    configureChaosCanvases(false);
                    paintPlaceholder(qs("canvas-chaos-a"), "API error");
                    return null;
                }
                var data = out.data; data.compare_mode = compare;
                if (statusEl) statusEl.textContent = "Playing";
                if (ctxEl) ctxEl.innerHTML = formatContext(data.context);
                if (jsonEl) jsonEl.textContent = prettyJson(data);
                renderStatPills("chaos-key-stats", [
                    { label: "Points", value: String(data.trajectory2 ? data.trajectory2.length : "?") },
                    { label: "Chaotic", value: data.is_chaotic ? "Yes" : "No" },
                    compare && data.divergence_time != null ? { label: "Diverges at", value: fmtNum(data.divergence_time, 2) + " s" } : null,
                ].filter(Boolean));
                startChaosAnimation(data);
                return data;
            })
            .catch(function () {
                if (statusEl) statusEl.textContent = "Network error";
                if (ctxEl) ctxEl.textContent = "Could not reach the API.";
                paintPlaceholder(qs("canvas-chaos-a"), "Offline");
            });
    }

    function bindChaosControls() {
        ["chaos-theta1", "chaos-theta2", "chaos-duration"].forEach(function (id) { var el = qs(id); if (el) el.addEventListener("input", syncChaosLabels); });
        syncChaosLabels();
        var runBtn = qs("chaos-run");
        if (runBtn) {
            runBtn.addEventListener("click", function () {
                fetchChaosSimulation({
                    theta1: qs("chaos-theta1") ? qs("chaos-theta1").value : 120,
                    theta2: qs("chaos-theta2") ? qs("chaos-theta2").value : 120,
                    duration: qs("chaos-duration") ? qs("chaos-duration").value : 15,
                    compare: qs("chaos-compare") && qs("chaos-compare").checked,
                });
            });
        }
    }

    /* ---- PROJECTILE ---- */

    var planetNames = { "9.81": "Earth", "1.62": "Moon", "3.71": "Mars", "24.79": "Jupiter" };

    function projTransforms(data, cw, ch) {
        var traj = data.trajectory, pad = 50;
        var maxX = 0, maxY = 0;
        for (var i = 0; i < traj.length; i++) {
            maxX = Math.max(maxX, traj[i].x);
            maxY = Math.max(maxY, traj[i].y);
        }
        var dx = maxX || 1, dy = maxY || 1;
        var sx = (cw - 2 * pad) / dx;
        var sy = (ch - 2 * pad) / dy;
        return {
            pad: pad, minX: 0, minY: 0, maxX: maxX, maxY: maxY,
            tx: function (x) { return pad + x * sx; },
            ty: function (y) { return (ch - pad) - y * sy; }
        };
    }

    function drawProjectileFrame(canvas, data, progress) {
        if (!canvas || !data || !data.trajectory || data.trajectory.length === 0) return;
        var ctx = canvas.getContext("2d"), cw = canvas.width, ch = canvas.height;
        var traj = data.trajectory;
        var tr = projTransforms(data, cw, ch);
        var pad = tr.pad;

        ctx.fillStyle = "#0d0a08"; ctx.fillRect(0, 0, cw, ch);

        ctx.strokeStyle = "rgba(200,190,175,0.12)"; ctx.lineWidth = 1;
        for (var gx = 0; gx <= 10; gx++) { var lx = pad + (gx / 10) * (cw - 2 * pad); ctx.beginPath(); ctx.moveTo(lx, pad); ctx.lineTo(lx, ch - pad); ctx.stroke(); }
        for (var gy = 0; gy <= 8; gy++) { var ly = pad + (gy / 8) * (ch - 2 * pad); ctx.beginPath(); ctx.moveTo(pad, ly); ctx.lineTo(cw - pad, ly); ctx.stroke(); }

        ctx.fillStyle = "rgba(247,241,232,0.4)"; ctx.font = "10px JetBrains Mono, monospace"; ctx.textAlign = "center";
        for (gx = 0; gx <= 10; gx += 2) {
            var val = tr.minX + (gx / 10) * (tr.maxX - tr.minX);
            ctx.fillText(fmtNum(val, 0) + " m", pad + (gx / 10) * (cw - 2 * pad), ch - pad + 16);
        }
        ctx.textAlign = "right";
        for (gy = 0; gy <= 8; gy += 2) {
            var valY = tr.minY + ((8 - gy) / 8) * (tr.maxY - tr.minY);
            ctx.fillText(fmtNum(valY, 0) + " m", pad - 6, pad + (gy / 8) * (ch - 2 * pad) + 4);
        }

        var planetVal = qs("proj-planet") ? qs("proj-planet").value : "9.81";
        var planetName = planetNames[planetVal] || planetVal;
        ctx.fillStyle = "rgba(255,184,112,0.65)"; ctx.font = "bold 12px Inter, sans-serif"; ctx.textAlign = "right";
        ctx.fillText(planetName + "  g = " + planetVal + " m/s\u00B2", cw - pad, pad - 8);

        ctx.fillStyle = "rgba(247,241,232,0.3)"; ctx.font = "10px Inter, sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Range (m)", cw / 2, ch - 6);
        ctx.save(); ctx.translate(12, ch / 2); ctx.rotate(-Math.PI / 2);
        ctx.fillText("Height (m)", 0, 0);
        ctx.restore();

        var peakI = 0;
        for (var i = 1; i < traj.length; i++) { if (traj[i].y > traj[peakI].y) peakI = i; }

        var drawUpTo = Math.min(Math.floor(progress * traj.length), traj.length - 1);

        ctx.save();
        ctx.shadowColor = "rgba(255,180,90,0.5)"; ctx.shadowBlur = 12;
        ctx.strokeStyle = "#ffaa44"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(tr.tx(traj[0].x), tr.ty(traj[0].y));
        for (i = 1; i <= drawUpTo; i++) { ctx.lineTo(tr.tx(traj[i].x), tr.ty(traj[i].y)); }
        ctx.stroke();
        ctx.restore();

        if (drawUpTo < traj.length - 1) {
            ctx.strokeStyle = "rgba(255,170,68,0.2)"; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
            ctx.beginPath(); ctx.moveTo(tr.tx(traj[drawUpTo].x), tr.ty(traj[drawUpTo].y));
            for (i = drawUpTo + 1; i < traj.length; i++) { ctx.lineTo(tr.tx(traj[i].x), tr.ty(traj[i].y)); }
            ctx.stroke(); ctx.setLineDash([]);
        }

        if (peakI <= drawUpTo) {
            ctx.strokeStyle = "rgba(247,241,232,0.35)"; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(tr.tx(traj[peakI].x), tr.ty(traj[peakI].y)); ctx.lineTo(tr.tx(traj[peakI].x), tr.ty(0));
            ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = "#ffb870"; ctx.beginPath(); ctx.arc(tr.tx(traj[peakI].x), tr.ty(traj[peakI].y), 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "rgba(247,241,232,0.7)"; ctx.font = "10px Inter, sans-serif"; ctx.textAlign = "left";
            ctx.fillText("peak " + fmtNum(traj[peakI].y, 1) + " m", tr.tx(traj[peakI].x) + 8, tr.ty(traj[peakI].y) - 6);
        }

        ctx.fillStyle = "#ffcc88"; ctx.beginPath(); ctx.arc(tr.tx(traj[0].x), tr.ty(traj[0].y), 5, 0, Math.PI * 2); ctx.fill();

        var cur = traj[drawUpTo];
        ctx.fillStyle = "#e86a24"; ctx.beginPath(); ctx.arc(tr.tx(cur.x), tr.ty(cur.y), 7, 0, Math.PI * 2); ctx.fill();

        if (drawUpTo >= traj.length - 1) {
            ctx.strokeStyle = "#e86a24"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(tr.tx(traj[traj.length - 1].x), tr.ty(traj[traj.length - 1].y), 9, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = "rgba(247,241,232,0.7)"; ctx.font = "10px Inter, sans-serif"; ctx.textAlign = "right";
            ctx.fillText(fmtNum(data.range, 1) + " m", tr.tx(traj[traj.length - 1].x) - 6, tr.ty(traj[traj.length - 1].y) - 10);
        }
    }

    function startProjAnimation(data) {
        stopProjAnimation();
        projAnim = { data: data, startMs: null };
        var totalMs = Math.max(1200, Math.min(3000, data.time_of_flight * 250));
        function tick(now) {
            if (!projAnim) return;
            if (projAnim.startMs == null) projAnim.startMs = now;
            var elapsed = now - projAnim.startMs;
            var progress = Math.min(elapsed / totalMs, 1);
            drawProjectileFrame(qs("canvas-projectile"), projAnim.data, progress);
            if (progress < 1) {
                projRafId = requestAnimationFrame(tick);
            } else {
                projRafId = null;
            }
        }
        projRafId = requestAnimationFrame(tick);
    }

    function fetchProjectile() {
        var vel = qs("proj-velocity"), ang = qs("proj-angle"), ht = qs("proj-height"), planet = qs("proj-planet");
        var v = vel ? Number(vel.value) : 50, a = ang ? Number(ang.value) : 45, h = ht ? Number(ht.value) : 0, g = planet ? Number(planet.value) : 9.81;
        var url = "/mechanics/projectile?velocity=" + v + "&angle=" + a + "&height=" + h + "&gravity=" + g;
        var st = qs("proj-status"), cx = qs("proj-context"), js = qs("proj-json");
        if (st) st.textContent = "Loading\u2026";
        return fetch(url)
            .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, status: res.status, data: d }; }); })
            .then(function (out) {
                if (!out.ok) {
                    stopProjAnimation();
                    if (st) st.textContent = "Error " + out.status;
                    if (cx) cx.innerHTML = formatContext(formatDetail(out.data));
                    if (js) js.textContent = JSON.stringify(out.data, null, 2);
                    paintPlaceholder(qs("canvas-projectile"), "API error");
                    return;
                }
                var d = out.data;
                if (st) st.textContent = "Playing";
                if (cx) cx.innerHTML = formatContext(d.context);
                if (js) js.textContent = prettyJson(d);
                renderStatPills("proj-key-stats", [
                    { label: "Max height", value: fmtNum(d.max_height, 1) + " m" },
                    { label: "Range", value: fmtNum(d.range, 1) + " m" },
                    { label: "Flight time", value: fmtNum(d.time_of_flight, 2) + " s" },
                ]);
                startProjAnimation(d);
            })
            .catch(function () {
                stopProjAnimation();
                if (st) st.textContent = "Network error";
                paintPlaceholder(qs("canvas-projectile"), "Offline");
            });
    }

    function syncProjLabels() {
        var vel = qs("proj-velocity"), ang = qs("proj-angle"), ht = qs("proj-height");
        if (vel && qs("proj-velocity-val")) qs("proj-velocity-val").textContent = vel.value + " m/s";
        if (ang && qs("proj-angle-val")) qs("proj-angle-val").textContent = ang.value + "\u00B0";
        if (ht && qs("proj-height-val")) qs("proj-height-val").textContent = ht.value + " m";
    }

    /* ---- DOPPLER (client-side animation) ---- */

    function drawDopplerClientFrame(canvas, anim) {
        if (!canvas) return;
        var ctx = canvas.getContext("2d"), cw = canvas.width, ch = canvas.height;
        var cy = ch / 2;

        ctx.fillStyle = "#0d0a08"; ctx.fillRect(0, 0, cw, ch);

        ctx.strokeStyle = "rgba(255,180,120,0.25)"; ctx.lineWidth = 1;
        ctx.setLineDash([4, 8]);
        ctx.beginPath(); ctx.moveTo(anim.observerX, 40); ctx.lineTo(anim.observerX, ch - 30); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(247,241,232,0.6)"; ctx.font = "11px Inter, sans-serif"; ctx.textAlign = "right";
        ctx.fillText("observer", anim.observerX - 8, cy - 14);

        for (var i = 0; i < anim.waves.length; i++) {
            var w = anim.waves[i];
            var radius = (anim.simTime - w.emitTime) * anim.wavePxSec;
            if (radius <= 0) continue;
            var age = anim.simTime - w.emitTime;
            var alpha = Math.max(0.05, 0.45 - age * 0.1);
            ctx.strokeStyle = "rgba(255,180,120," + alpha + ")";
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(w.cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
        }

        ctx.fillStyle = "#ffb870"; ctx.beginPath(); ctx.arc(anim.sourceX, cy, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#0d0a08"; ctx.font = "bold 10px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("S", anim.sourceX, cy);

        if (anim.sourceVel > 0) {
            ctx.fillStyle = "rgba(100,160,255,0.6)"; ctx.font = "10px Inter, sans-serif"; ctx.textAlign = "center";
            ctx.fillText("compressed", (anim.sourceX + cw) / 2, ch - 24);
            ctx.fillStyle = "rgba(255,100,80,0.6)";
            ctx.fillText("expanded", anim.sourceX / 2, ch - 24);
        } else if (anim.sourceVel < 0) {
            ctx.fillStyle = "rgba(255,100,80,0.6)"; ctx.font = "10px Inter, sans-serif"; ctx.textAlign = "center";
            ctx.fillText("expanded", (anim.sourceX + cw) / 2, ch - 24);
            ctx.fillStyle = "rgba(100,160,255,0.6)";
            ctx.fillText("compressed", anim.sourceX / 2, ch - 24);
        }

        if (anim.effect) {
            ctx.fillStyle = anim.effect === "blueshift" ? "rgba(100,160,255,0.85)" : anim.effect === "redshift" ? "rgba(255,100,80,0.85)" : "rgba(247,241,232,0.6)";
            ctx.font = "bold 13px JetBrains Mono, monospace"; ctx.textAlign = "center";
            ctx.fillText(anim.effect.toUpperCase(), cw / 2, 28);
        }

        var mach = Math.abs(anim.sourceVel) / anim.mediumSpeed;
        ctx.fillStyle = "rgba(247,241,232,0.35)"; ctx.font = "10px JetBrains Mono, monospace"; ctx.textAlign = "left";
        ctx.fillText("Mach " + mach.toFixed(3), 10, ch - 10);
    }

    function startDopplerClientAnim(sourceVel, mediumSpeed, sourceFreq, effect) {
        stopDopplerAnimation();
        var canvas = qs("canvas-doppler");
        if (!canvas) return;
        var cw = canvas.width, ch = canvas.height;

        var wavePxSec = 120;
        var srcPxSec = wavePxSec * (sourceVel / mediumSpeed);
        var emitInterval = Math.max(0.03, Math.min(0.4, 30 / sourceFreq));
        var observerX = cw - 60;
        var startX = cw / 3;

        dopplerAnim = {
            srcPxSec: srcPxSec, wavePxSec: wavePxSec, emitInterval: emitInterval,
            sourceX: startX, waves: [], simTime: 0, lastEmit: 0, lastNow: null,
            effect: effect, sourceVel: sourceVel, mediumSpeed: mediumSpeed,
            observerX: observerX, cw: cw, ch: ch
        };

        function tick(now) {
            if (!dopplerAnim) return;
            if (dopplerAnim.lastNow == null) dopplerAnim.lastNow = now;
            var dt = Math.min((now - dopplerAnim.lastNow) / 1000, 0.05);
            dopplerAnim.lastNow = now;
            dopplerAnim.simTime += dt;

            dopplerAnim.sourceX += dopplerAnim.srcPxSec * dt;

            if (dopplerAnim.simTime - dopplerAnim.lastEmit >= dopplerAnim.emitInterval) {
                dopplerAnim.lastEmit = dopplerAnim.simTime;
                dopplerAnim.waves.push({ cx: dopplerAnim.sourceX, emitTime: dopplerAnim.simTime });
            }

            var maxRadius = cw * 0.9;
            dopplerAnim.waves = dopplerAnim.waves.filter(function (w) {
                return (dopplerAnim.simTime - w.emitTime) * dopplerAnim.wavePxSec < maxRadius;
            });

            if (dopplerAnim.sourceX > cw + 80 || dopplerAnim.sourceX < -80) {
                dopplerAnim.sourceX = startX;
                dopplerAnim.waves = [];
                dopplerAnim.lastEmit = dopplerAnim.simTime;
            }

            drawDopplerClientFrame(canvas, dopplerAnim);
            dopplerRafId = requestAnimationFrame(tick);
        }
        dopplerRafId = requestAnimationFrame(tick);
    }

    function fetchDoppler() {
        var freq = qs("dop-freq"), sv = qs("dop-src-vel"), med = qs("dop-medium");
        var f = freq ? Number(freq.value) : 440, v = sv ? Number(sv.value) : 30, m = med ? Number(med.value) : 343;
        if (Math.abs(m - v) < 1e-6) v += 0.01;
        var url = "/waves/doppler?source_freq=" + f + "&source_velocity=" + v + "&observer_velocity=0&medium_speed=" + m;
        var st = qs("dop-status"), cx = qs("dop-context"), js = qs("dop-json");
        if (st) st.textContent = "Loading\u2026";
        return fetch(url)
            .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, status: res.status, data: d }; }); })
            .then(function (out) {
                if (!out.ok) {
                    stopDopplerAnimation();
                    if (st) st.textContent = "Error " + out.status;
                    if (cx) cx.innerHTML = formatContext(formatDetail(out.data));
                    if (js) js.textContent = JSON.stringify(out.data, null, 2);
                    paintPlaceholder(qs("canvas-doppler"), "API error");
                    return;
                }
                var d = out.data;
                if (st) st.textContent = "Animating";
                if (cx) cx.innerHTML = formatContext(d.context);
                if (js) js.textContent = prettyJson(d);
                var shiftSign = d.frequency_shift > 0 ? "+" : "";
                renderStatPills("dop-key-stats", [
                    { label: "Observed", value: fmtNum(d.observed_frequency, 1) + " Hz" },
                    { label: "Shift", value: shiftSign + fmtNum(d.frequency_shift, 1) + " Hz" },
                    { label: "Effect", value: d.effect === "blueshift" ? "Blueshift \u2191" : d.effect === "redshift" ? "Redshift \u2193" : "None" },
                ]);
                startDopplerClientAnim(v, m, f, d.effect);
            })
            .catch(function () {
                stopDopplerAnimation();
                if (st) st.textContent = "Network error";
                paintPlaceholder(qs("canvas-doppler"), "Offline");
            });
    }

    function syncDopLabels() {
        var f = qs("dop-freq"), v = qs("dop-src-vel");
        if (f && qs("dop-freq-val")) qs("dop-freq-val").textContent = f.value + " Hz";
        if (v && qs("dop-src-vel-val")) qs("dop-src-vel-val").textContent = v.value + " m/s";
    }

    /* ---- TIME DILATION ---- */

    function syncTimeBetaLabel() {
        var b = qs("time-beta");
        if (b && qs("time-beta-val")) {
            var x = Number(b.value) / 1000;
            qs("time-beta-val").textContent = x.toFixed(3) + " c";
        }
    }

    function syncTimeModeUI() {
        var grav = qs("time-mode-grav"), velCtr = qs("time-vel-controls"), grCtr = qs("time-grav-controls");
        var useGrav = grav && grav.checked;
        if (velCtr) velCtr.classList.toggle("time-grav-hidden", useGrav);
        if (grCtr) grCtr.classList.toggle("time-grav-hidden", !useGrav);
    }

    function resetTimeClocks() {
        timeClock.accumL = 0;
        timeClock.accumR = 0;
        timeClock.lastNow = null;
    }

    function fetchTimeDilation() {
        var grav = qs("time-mode-grav"), useGrav = grav && grav.checked;
        var url = "/relativity/time-dilation?proper_time=1";
        if (useGrav) {
            var bodyEl = qs("time-body");
            url += "&gravitational_potential=" + encodeURIComponent(bodyEl ? Number(bodyEl.value) : -62600000);
        } else {
            var beta = qs("time-beta");
            var v = ((beta ? Number(beta.value) : 500) / 1000) * C_LIGHT;
            if (v < 1) v = 1;
            url += "&velocity=" + encodeURIComponent(v);
        }
        var st = qs("time-status"), cx = qs("time-context"), js = qs("time-json");
        if (st) st.textContent = "Loading\u2026";
        resetTimeClocks();
        return fetch(url)
            .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, status: res.status, data: d }; }); })
            .then(function (out) {
                if (!out.ok) {
                    if (st) st.textContent = "Error " + out.status;
                    if (cx) cx.innerHTML = formatContext(formatDetail(out.data));
                    if (js) js.textContent = JSON.stringify(out.data, null, 2);
                    paintPlaceholder(qs("canvas-time"), "API error");
                    return;
                }
                var d = out.data;
                var dil = Number(d.dilated_time);
                timeClock.rateR = dil > 0 ? 1 / dil : 1;
                if (st) st.textContent = "Live";
                if (cx) cx.innerHTML = formatContext(d.context);
                if (js) js.textContent = prettyJson(d);
                var gammaStr = Number(d.lorentz_factor) > 1.001 ? fmtNum(d.lorentz_factor, 4) : fmtNum(d.lorentz_factor, 10);
                renderStatPills("time-key-stats", [
                    { label: "\u03B3 (Lorentz)", value: gammaStr },
                    { label: "Dilated", value: fmtNum(d.dilated_time, 6) + " s" },
                    { label: "Slower by", value: d.percentage_slower < 0.001 ? fmtNum(d.percentage_slower) + " %" : fmtNum(d.percentage_slower, 4) + " %" },
                ]);
                if (timeRafId == null) startTimeClockLoop();
            })
            .catch(function () {
                if (st) st.textContent = "Network error";
                paintPlaceholder(qs("canvas-time"), "Offline");
            });
    }

    var clockNums = ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];

    function drawClockFace(ctx, cx, cy, r, label) {
        ctx.strokeStyle = "rgba(247,241,232,0.3)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        for (var i = 0; i < 60; i++) {
            var ang = (i / 60) * 2 * Math.PI - Math.PI / 2;
            var isMajor = i % 5 === 0;
            var inner = isMajor ? r - 12 : r - 5;
            ctx.strokeStyle = isMajor ? "rgba(247,241,232,0.55)" : "rgba(247,241,232,0.15)";
            ctx.lineWidth = isMajor ? 2 : 1;
            ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
            ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r); ctx.stroke();
        }
        ctx.fillStyle = "rgba(247,241,232,0.55)"; ctx.font = "11px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        for (i = 0; i < 12; i++) {
            var a2 = (i / 12) * 2 * Math.PI - Math.PI / 2;
            ctx.fillText(clockNums[i], cx + Math.cos(a2) * (r - 24), cy + Math.sin(a2) * (r - 24));
        }
        ctx.fillStyle = "rgba(255,184,112,0.85)"; ctx.font = "12px Inter, sans-serif";
        ctx.fillText(label, cx, cy - r - 14);
    }

    function drawClockHands(ctx, cx, cy, r, tSec) {
        var sec = tSec % 60, m = (tSec / 60) % 60, h = (tSec / 3600) % 12;
        var hourA = ((h + m / 60) / 12) * 2 * Math.PI - Math.PI / 2;
        var minuteA = (m / 60) * 2 * Math.PI - Math.PI / 2;
        var secondA = (sec / 60) * 2 * Math.PI - Math.PI / 2;
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(247,241,232,0.9)"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(hourA) * r * 0.48, cy + Math.sin(hourA) * r * 0.48); ctx.stroke();
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(minuteA) * r * 0.7, cy + Math.sin(minuteA) * r * 0.7); ctx.stroke();
        ctx.strokeStyle = "#e86a24"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(secondA) * r * 0.8, cy + Math.sin(secondA) * r * 0.8); ctx.stroke();
        ctx.lineCap = "butt";
        ctx.fillStyle = "#ffb870"; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    }

    function drawTimeCanvas() {
        var canvas = qs("canvas-time");
        if (!canvas) return;
        var ctx = canvas.getContext("2d"), cw = canvas.width, ch = canvas.height;
        ctx.fillStyle = "#0d0a08"; ctx.fillRect(0, 0, cw, ch);
        var r = 95, c1x = cw * 0.27, c2x = cw * 0.73, cy = ch * 0.52;
        drawClockFace(ctx, c1x, cy, r, "PROPER TIME");
        drawClockHands(ctx, c1x, cy, r, timeClock.accumL);
        drawClockFace(ctx, c2x, cy, r, "DILATED VIEW");
        drawClockHands(ctx, c2x, cy, r, timeClock.accumR);

        var ratio = timeClock.rateR;
        var ratioLabel = ratio < 0.01 ? "near-frozen" : ratio < 0.5 ? (ratio * 100).toFixed(1) + "% speed" : ratio < 0.999 ? (ratio * 100).toFixed(2) + "% speed" : "~same rate";
        ctx.fillStyle = "rgba(232,106,36,0.8)"; ctx.font = "bold 13px JetBrains Mono, monospace"; ctx.textAlign = "center";
        ctx.fillText(ratioLabel, c2x, cy + r + 30);

        ctx.fillStyle = "rgba(247,241,232,0.3)"; ctx.font = "10px JetBrains Mono, monospace";
        ctx.fillText(TIME_SPEED + "\u00D7 speed", cw / 2, ch - 16);
    }

    function startTimeClockLoop() {
        function tick(now) {
            if (timeClock.lastNow == null) timeClock.lastNow = now;
            var dt = (now - timeClock.lastNow) / 1000; timeClock.lastNow = now;
            timeClock.accumL += dt * TIME_SPEED;
            timeClock.accumR += dt * TIME_SPEED * timeClock.rateR;
            drawTimeCanvas();
            timeRafId = requestAnimationFrame(tick);
        }
        timeRafId = requestAnimationFrame(tick);
    }

    /* ---- BINDINGS ---- */

    function bindProjectile() {
        syncProjLabels();
        var deb = debounce(fetchProjectile, 150);
        ["proj-velocity", "proj-angle", "proj-height"].forEach(function (id) {
            var el = qs(id);
            if (el) el.addEventListener("input", function () { syncProjLabels(); deb(); });
        });
        var pl = qs("proj-planet");
        if (pl) pl.addEventListener("change", deb);
    }

    function bindDoppler() {
        syncDopLabels();
        var deb = debounce(fetchDoppler, 150);
        ["dop-freq", "dop-src-vel"].forEach(function (id) {
            var el = qs(id);
            if (el) el.addEventListener("input", function () { syncDopLabels(); deb(); });
        });
        var med = qs("dop-medium");
        if (med) med.addEventListener("change", deb);
    }

    function bindTime() {
        syncTimeBetaLabel(); syncTimeModeUI();
        var deb = debounce(fetchTimeDilation, 120);
        var beta = qs("time-beta");
        if (beta) beta.addEventListener("input", function () { syncTimeBetaLabel(); deb(); });
        var bodyEl = qs("time-body");
        if (bodyEl) bodyEl.addEventListener("change", deb);
        ["time-mode-vel", "time-mode-grav"].forEach(function (id) {
            var el = qs(id);
            if (el) el.addEventListener("change", function () { syncTimeModeUI(); deb(); });
        });
    }

    document.addEventListener("DOMContentLoaded", function () {
        initTabs(); bindChaosControls(); bindProjectile(); bindDoppler(); bindTime();
        fetchChaosSimulation({ compare: false }); fetchProjectile(); fetchDoppler(); fetchTimeDilation();
    });
})();
