(function () {
    var chaosRafId = null;
    var chaosPlayback = null;
    var dopplerRafId = null;
    var dopplerAnim = null;
    var timeRafId = null;
    var timeClock = { accumL: 0, accumR: 0, rateR: 1, lastNow: null };
    var projRafId = null;
    var projAnim = null;
    var intRafId = null;
    var intAnim = null;
    var gasRafId = null;
    var gasState = null;

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
    function stopIntAnimation() {
        if (intRafId != null) { cancelAnimationFrame(intRafId); intRafId = null; }
        intAnim = null;
    }
    function stopGasAnimation() {
        if (gasRafId != null) { cancelAnimationFrame(gasRafId); gasRafId = null; }
        gasState = null;
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

    var escBodies = {
        earth:   { mass: 5.972e24, radius: 6.371e6, name: "Earth" },
        moon:    { mass: 7.342e22, radius: 1.737e6, name: "Moon" },
        mars:    { mass: 6.39e23,  radius: 3.389e6, name: "Mars" },
        jupiter: { mass: 1.898e27, radius: 6.991e7, name: "Jupiter" },
        sun:     { mass: 1.989e30, radius: 6.957e8, name: "Sun" }
    };

    function drawEscapeCanvas(canvas, escVel) {
        if (!canvas) return;
        var ctx = canvas.getContext("2d"), cw = canvas.width, ch = canvas.height;
        ctx.fillStyle = "#0d0a08"; ctx.fillRect(0, 0, cw, ch);

        var items = [
            { label: "Walking",        speed: 1.4 },
            { label: "Car (highway)",   speed: 30 },
            { label: "Commercial jet",  speed: 250 },
            { label: "Sound in air",    speed: 343 },
            { label: "Rifle bullet",    speed: 1000 },
            { label: "ISS orbital",     speed: 7660 }
        ];
        items.push({ label: "\u25b8 RESULT", speed: escVel, highlight: true });
        items.sort(function (a, b) { return a.speed - b.speed; });

        var maxSpeed = items[items.length - 1].speed * 1.15;
        var labelW = 130, rightPad = 50, barAreaW = cw - labelW - rightPad;
        var barH = 20, gap = 14;
        var totalH = items.length * (barH + gap);
        var startY = (ch - totalH) / 2 + 10;

        ctx.fillStyle = "rgba(255,184,112,0.65)"; ctx.font = "bold 13px Inter, sans-serif"; ctx.textAlign = "center";
        ctx.fillText("SPEED COMPARISON", cw / 2, 28);

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var y = startY + i * (barH + gap);
            var barW = Math.max(3, (item.speed / maxSpeed) * barAreaW);
            var isHl = !!item.highlight;

            ctx.fillStyle = isHl ? "rgba(255,184,112,0.8)" : "rgba(200,190,175,0.4)";
            ctx.font = (isHl ? "bold " : "") + "11px Inter, sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(item.label, labelW - 10, y + barH / 2 + 4);

            ctx.fillStyle = isHl ? "rgba(232,106,36,0.85)" : "rgba(200,190,175,0.25)";
            ctx.fillRect(labelW, y, barW, barH);

            ctx.fillStyle = isHl ? "#ffe8cc" : "rgba(247,241,232,0.45)";
            ctx.font = "10px JetBrains Mono, monospace"; ctx.textAlign = "left";
            ctx.fillText(fmtNum(item.speed, 0) + " m/s", labelW + barW + 8, y + barH / 2 + 4);
        }
    }

    function fetchEscape() {
        var bodyKey = qs("esc-body") ? qs("esc-body").value : "earth";
        var body = escBodies[bodyKey];
        if (!body) return;
        var url = "/mechanics/escape-velocity?mass=" + encodeURIComponent(body.mass) + "&radius=" + encodeURIComponent(body.radius) + "&body_name=" + encodeURIComponent(body.name);
        var st = qs("esc-status"), cx = qs("esc-context"), js = qs("esc-json");
        if (st) st.textContent = "Loading\u2026";
        return fetch(url)
            .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, status: res.status, data: d }; }); })
            .then(function (out) {
                if (!out.ok) {
                    if (st) st.textContent = "Error " + out.status;
                    if (cx) cx.innerHTML = formatContext(formatDetail(out.data));
                    if (js) js.textContent = JSON.stringify(out.data, null, 2);
                    paintPlaceholder(qs("canvas-escape"), "API error");
                    return;
                }
                var d = out.data;
                if (st) st.textContent = "Ready";
                if (cx) cx.innerHTML = formatContext(d.context);
                if (js) js.textContent = prettyJson(d);
                renderStatPills("esc-key-stats", [
                    { label: "Escape vel", value: fmtNum(d.escape_velocity_ms, 2) + " m/s" },
                    { label: "km/h", value: fmtNum(d.escape_velocity_kmh, 0) + " km/h" }
                ]);
                drawEscapeCanvas(qs("canvas-escape"), d.escape_velocity_ms);
            })
            .catch(function () {
                if (st) st.textContent = "Network error";
                paintPlaceholder(qs("canvas-escape"), "Offline");
            });
    }

    function bindEscape() {
        var sel = qs("esc-body");
        if (sel) sel.addEventListener("change", fetchEscape);
    }

    function drawIntFrame(canvas, anim, nowSec) {
        if (!canvas) return;
        var ctx = canvas.getContext("2d"), cw = canvas.width, ch = canvas.height;
        ctx.fillStyle = "#0d0a08"; ctx.fillRect(0, 0, cw, ch);

        var f1 = anim.freq1, f2 = anim.freq2, a1 = anim.amp1, a2 = anim.amp2;
        var maxAmp = a1 + a2;
        var xPts = anim.xPoints;
        var pad = 40, gapH = 20;
        var plotW = cw - 2 * pad;
        var plotH = (ch - 2 * pad - 3 * gapH) / 3;
        var xMin = xPts[0], xMax = xPts[xPts.length - 1];
        var xRange = xMax - xMin || 1;
        var phaseSpeed = 2.5;

        function txX(x) { return pad + (x - xMin) / xRange * plotW; }

        function drawWave(yOff, waveFn, yMaxA, color, label) {
            var cy = yOff + plotH / 2;
            ctx.strokeStyle = "rgba(247,241,232,0.08)"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(pad, cy); ctx.lineTo(cw - pad, cy); ctx.stroke();
            ctx.strokeStyle = color; ctx.lineWidth = 2;
            ctx.beginPath();
            for (var j = 0; j < xPts.length; j++) {
                var px = txX(xPts[j]);
                var py = cy - (waveFn(xPts[j]) / (yMaxA || 1)) * (plotH * 0.42);
                if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
            ctx.fillStyle = color; ctx.font = "bold 11px Inter, sans-serif"; ctx.textAlign = "left";
            ctx.fillText(label, pad + 4, yOff + 14);
        }

        var w1 = function (x) { return a1 * Math.sin(f1 * x - phaseSpeed * nowSec); };
        var w2 = function (x) { return a2 * Math.sin(f2 * x - phaseSpeed * nowSec); };
        var wSum = function (x) { return w1(x) + w2(x); };

        var y0 = pad;
        var y1 = pad + plotH + gapH;
        var y2 = pad + 2 * (plotH + gapH);

        drawWave(y0, w1, maxAmp, "rgba(255,184,112,0.8)", "Wave 1 (f=" + f1 + ")");
        drawWave(y1, w2, maxAmp, "rgba(255,120,64,0.8)", "Wave 2 (f=" + f2 + ")");
        drawWave(y2, wSum, maxAmp, "#f7f1e8", "Superposition");

        var supCy = y2 + plotH / 2;
        var envelope = Math.abs(f1 - f2) > 0.01;
        if (envelope) {
            ctx.strokeStyle = "rgba(100,220,100,0.2)"; ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
            ctx.beginPath();
            for (var ei = 0; ei < xPts.length; ei++) {
                var ex = txX(xPts[ei]);
                var env = a1 + a2;
                var beatVal = Math.abs(2 * Math.min(a1, a2) * Math.cos((f1 - f2) / 2 * xPts[ei]));
                var ey = supCy - (beatVal / maxAmp) * (plotH * 0.42);
                if (ei === 0) ctx.moveTo(ex, ey); else ctx.lineTo(ex, ey);
            }
            ctx.stroke();
            ctx.beginPath();
            for (ei = 0; ei < xPts.length; ei++) {
                ex = txX(xPts[ei]);
                beatVal = Math.abs(2 * Math.min(a1, a2) * Math.cos((f1 - f2) / 2 * xPts[ei]));
                ey = supCy + (beatVal / maxAmp) * (plotH * 0.42);
                if (ei === 0) ctx.moveTo(ex, ey); else ctx.lineTo(ex, ey);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }

        var beatFreq = Math.abs(f1 - f2);
        ctx.fillStyle = "rgba(100,220,100,0.5)"; ctx.font = "10px Inter, sans-serif"; ctx.textAlign = "right";
        ctx.fillText("beat envelope  \u0394f = " + beatFreq.toFixed(1), cw - pad, y2 + 14);

        ctx.fillStyle = "rgba(247,241,232,0.25)"; ctx.font = "10px JetBrains Mono, monospace"; ctx.textAlign = "center";
        ctx.fillText("waves propagating \u2192", cw / 2, ch - 8);
    }

    function startIntAnimation(data) {
        stopIntAnimation();
        var f1 = Number(qs("int-freq1") ? qs("int-freq1").value : 5);
        var f2 = Number(qs("int-freq2") ? qs("int-freq2").value : 6);
        var a1 = Number(qs("int-amp1") ? qs("int-amp1").value : 1);
        var a2 = Number(qs("int-amp2") ? qs("int-amp2").value : 1);
        var xPts = [];
        for (var i = 0; i < data.pattern.length; i++) xPts.push(data.pattern[i].x);
        intAnim = { freq1: f1, freq2: f2, amp1: a1, amp2: a2, xPoints: xPts, data: data };
        var startMs = null;
        function tick(now) {
            if (!intAnim) return;
            if (startMs == null) startMs = now;
            drawIntFrame(qs("canvas-interference"), intAnim, (now - startMs) / 1000);
            intRafId = requestAnimationFrame(tick);
        }
        intRafId = requestAnimationFrame(tick);
    }

    function fetchInterference() {
        var f1 = qs("int-freq1") ? Number(qs("int-freq1").value) : 5;
        var f2 = qs("int-freq2") ? Number(qs("int-freq2").value) : 6;
        var a1 = qs("int-amp1") ? Number(qs("int-amp1").value) : 1;
        var a2 = qs("int-amp2") ? Number(qs("int-amp2").value) : 1;
        var url = "/waves/interference?freq1=" + f1 + "&freq2=" + f2 + "&amplitude1=" + a1 + "&amplitude2=" + a2;
        var st = qs("int-status"), cx = qs("int-context"), js = qs("int-json");
        if (st) st.textContent = "Loading\u2026";
        return fetch(url)
            .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, status: res.status, data: d }; }); })
            .then(function (out) {
                if (!out.ok) {
                    stopIntAnimation();
                    if (st) st.textContent = "Error " + out.status;
                    if (cx) cx.innerHTML = formatContext(formatDetail(out.data));
                    if (js) js.textContent = JSON.stringify(out.data, null, 2);
                    paintPlaceholder(qs("canvas-interference"), "API error");
                    return;
                }
                var d = out.data;
                if (st) st.textContent = "Animating";
                if (cx) cx.innerHTML = formatContext(d.context);
                if (js) js.textContent = prettyJson(d);
                renderStatPills("int-key-stats", [
                    { label: "Constructive", value: (d.constructive_points ? d.constructive_points.length : 0) + " pts" },
                    { label: "Destructive", value: (d.destructive_points ? d.destructive_points.length : 0) + " pts" },
                    { label: "Beat freq", value: fmtNum(Math.abs(f1 - f2), 1) }
                ]);
                startIntAnimation(d);
            })
            .catch(function () {
                stopIntAnimation();
                if (st) st.textContent = "Network error";
                paintPlaceholder(qs("canvas-interference"), "Offline");
            });
    }

    function syncIntLabels() {
        var f1 = qs("int-freq1"), f2 = qs("int-freq2"), a1 = qs("int-amp1"), a2 = qs("int-amp2");
        if (f1 && qs("int-freq1-val")) qs("int-freq1-val").textContent = Number(f1.value).toFixed(1);
        if (f2 && qs("int-freq2-val")) qs("int-freq2-val").textContent = Number(f2.value).toFixed(1);
        if (a1 && qs("int-amp1-val")) qs("int-amp1-val").textContent = Number(a1.value).toFixed(1);
        if (a2 && qs("int-amp2-val")) qs("int-amp2-val").textContent = Number(a2.value).toFixed(1);
    }

    function bindInterference() {
        syncIntLabels();
        var deb = debounce(fetchInterference, 200);
        ["int-freq1", "int-freq2", "int-amp1", "int-amp2"].forEach(function (id) {
            var el = qs(id);
            if (el) el.addEventListener("input", function () { syncIntLabels(); deb(); });
        });
    }

    function syncGasLawUI() {
        var sel = qs("gas-solve");
        if (!sel) return;
        var solving = sel.value;
        var fields = { P: "gas-pressure", V: "gas-volume", n: "gas-moles", T: "gas-temp" };
        for (var k in fields) {
            if (!fields.hasOwnProperty(k)) continue;
            var el = qs(fields[k]);
            if (!el) continue;
            if (k === solving) {
                el.disabled = true;
                el.value = "";
                el.placeholder = "solving\u2026";
            } else {
                el.disabled = false;
                if (!el.value) el.placeholder = "required";
            }
        }
    }

    function initGasParticles(count, bounds, temp) {
        var particles = [];
        var baseSpeed = Math.sqrt(Math.max(temp, 50) / 273) * 80;
        for (var i = 0; i < count; i++) {
            var angle = Math.PI * 2 * ((i * 0.618 + 0.3) % 1);
            var spd = baseSpeed * (0.4 + 1.2 * ((i * 137.5 + 17) % 97) / 97);
            particles.push({
                x: bounds.x1 + 8 + ((i * 73.7) % (bounds.x2 - bounds.x1 - 16)),
                y: bounds.y1 + 8 + (((i * 51.3 + 7) % 83) / 83) * (bounds.y2 - bounds.y1 - 16),
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd
            });
        }
        return particles;
    }

    function updateGasParticles(particles, bounds, dt) {
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.x < bounds.x1 + 4) { p.x = bounds.x1 + 4; p.vx = Math.abs(p.vx); }
            if (p.x > bounds.x2 - 4) { p.x = bounds.x2 - 4; p.vx = -Math.abs(p.vx); }
            if (p.y < bounds.y1 + 4) { p.y = bounds.y1 + 4; p.vy = Math.abs(p.vy); }
            if (p.y > bounds.y2 - 4) { p.y = bounds.y2 - 4; p.vy = -Math.abs(p.vy); }
        }
    }

    function drawGasFrame(canvas, gs, nowMs) {
        if (!canvas || !gs) return;
        var ctx = canvas.getContext("2d"), cw = canvas.width, ch = canvas.height;
        ctx.fillStyle = "#0d0a08"; ctx.fillRect(0, 0, cw, ch);

        var solveFor = gs.solveFor, allVals = gs.allVals;

        ctx.fillStyle = "rgba(247,241,232,0.7)"; ctx.font = "bold 28px JetBrains Mono, monospace"; ctx.textAlign = "center";
        ctx.fillText("PV = nRT", cw / 2, 50);

        var labels = [
            { key: "P", label: "P", unit: "Pa" },
            { key: "V", label: "V", unit: "m\u00b3" },
            { key: "n", label: "n", unit: "mol" },
            { key: "T", label: "T", unit: "K" }
        ];
        var boxW = 110, boxH = 60, gp = 16;
        var totalW = labels.length * boxW + (labels.length - 1) * gp;
        var startX = (cw - totalW) / 2;
        var boxY = 80;

        for (var i = 0; i < labels.length; i++) {
            var lb = labels[i];
            var bx = startX + i * (boxW + gp);
            var isSolved = lb.key === solveFor;
            ctx.strokeStyle = isSolved ? "#e86a24" : "rgba(255,160,90,0.2)";
            ctx.lineWidth = isSolved ? 2 : 1;
            ctx.strokeRect(bx, boxY, boxW, boxH);
            if (isSolved) {
                ctx.fillStyle = "rgba(232,106,36,0.1)";
                ctx.fillRect(bx, boxY, boxW, boxH);
            }
            ctx.fillStyle = isSolved ? "#ffb870" : "rgba(247,241,232,0.5)";
            ctx.font = "bold 14px Inter, sans-serif"; ctx.textAlign = "center";
            ctx.fillText(lb.label, bx + boxW / 2, boxY + 20);
            ctx.fillStyle = isSolved ? "#ffe8cc" : "rgba(247,241,232,0.4)";
            ctx.font = "11px JetBrains Mono, monospace";
            var val = allVals[lb.key];
            ctx.fillText(val != null ? fmtNum(val, 4) : "?", bx + boxW / 2, boxY + 38);
            ctx.fillStyle = "rgba(200,190,175,0.35)"; ctx.font = "9px Inter, sans-serif";
            ctx.fillText(lb.unit, bx + boxW / 2, boxY + 52);
        }

        var containerX = cw * 0.15, containerW = cw * 0.7;
        var containerY = 170, containerBotY = ch - 35;
        var containerH = containerBotY - containerY;
        ctx.strokeStyle = "rgba(255,160,90,0.2)"; ctx.lineWidth = 1.5;
        ctx.strokeRect(containerX, containerY, containerW, containerH);

        var vol = allVals.V || 0.0224;
        var normalizedV = Math.min(Math.max(vol / 0.1, 0.1), 1);
        var pistonY = containerY + containerH * (1 - normalizedV);

        ctx.fillStyle = "rgba(200,190,175,0.06)";
        ctx.fillRect(containerX + 1, pistonY, containerW - 2, containerBotY - pistonY);

        var temp = allVals.T || 273;
        var pressure = allVals.P || 101325;
        var wallGlow = Math.min(pressure / 200000, 1);
        ctx.strokeStyle = "rgba(232,106,36," + (0.15 + wallGlow * 0.4) + ")"; ctx.lineWidth = 2;
        ctx.strokeRect(containerX, pistonY, containerW, containerBotY - pistonY);

        ctx.fillStyle = "rgba(255,184,112,0.45)"; ctx.fillRect(containerX - 2, pistonY - 4, containerW + 4, 8);
        ctx.fillStyle = "rgba(255,184,112,0.6)"; ctx.font = "10px Inter, sans-serif"; ctx.textAlign = "left";
        ctx.fillText("\u25b2 piston", containerX + containerW + 8, pistonY + 4);

        var particles = gs.particles;
        var tempColor;
        if (temp < 200) { tempColor = [100, 150, 255]; }
        else if (temp < 500) { var t01 = (temp - 200) / 300; tempColor = [Math.floor(100 + 155 * t01), Math.floor(150 + 30 * t01), Math.floor(255 - 135 * t01)]; }
        else { tempColor = [255, 100, 80]; }

        for (i = 0; i < particles.length; i++) {
            var p = particles[i];
            var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            var alpha = Math.min(0.9, 0.35 + speed / 200);
            var r = 3 + Math.min(speed / 100, 2);
            ctx.fillStyle = "rgba(" + tempColor[0] + "," + tempColor[1] + "," + tempColor[2] + "," + alpha + ")";
            ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        }

        var pulse = 0.5 + 0.5 * Math.sin(nowMs / 300);
        if (wallGlow > 0.3) {
            ctx.fillStyle = "rgba(232,106,36," + (wallGlow * 0.08 * pulse) + ")";
            ctx.fillRect(containerX + 1, pistonY + 1, containerW - 2, containerBotY - pistonY - 2);
        }

        ctx.fillStyle = "rgba(200,190,175,0.3)"; ctx.font = "10px JetBrains Mono, monospace"; ctx.textAlign = "center";
        ctx.fillText("R = 8.314 J/(mol\u00b7K)", cw / 2, ch - 14);
    }

    function startGasAnimation(solveFor, allVals) {
        stopGasAnimation();
        var canvas = qs("canvas-gaslaw");
        if (!canvas) return;
        var cw = canvas.width, ch = canvas.height;
        var containerX = cw * 0.15, containerW = cw * 0.7;
        var containerY = 170, containerBotY = ch - 35;
        var containerH = containerBotY - containerY;
        var vol = allVals.V || 0.0224;
        var normalizedV = Math.min(Math.max(vol / 0.1, 0.1), 1);
        var pistonY = containerY + containerH * (1 - normalizedV);

        var bounds = { x1: containerX, x2: containerX + containerW, y1: pistonY, y2: containerBotY };
        var numP = Math.min(60, Math.max(6, Math.floor((allVals.n || 1) * 18)));
        var particles = initGasParticles(numP, bounds, allVals.T || 273);

        gasState = { solveFor: solveFor, allVals: allVals, particles: particles, bounds: bounds, lastNow: null };

        function tick(now) {
            if (!gasState) return;
            if (gasState.lastNow == null) gasState.lastNow = now;
            var dt = Math.min((now - gasState.lastNow) / 1000, 0.04);
            gasState.lastNow = now;
            updateGasParticles(gasState.particles, gasState.bounds, dt);
            drawGasFrame(canvas, gasState, now);
            gasRafId = requestAnimationFrame(tick);
        }
        gasRafId = requestAnimationFrame(tick);
    }

    function fetchGasLaw() {
        var sel = qs("gas-solve");
        if (!sel) return;
        var solveFor = sel.value;
        var params = "solve_for=" + encodeURIComponent(solveFor);
        var fieldMap = { P: "gas-pressure", V: "gas-volume", n: "gas-moles", T: "gas-temp" };
        var allVals = {};
        for (var k in fieldMap) {
            if (!fieldMap.hasOwnProperty(k)) continue;
            if (k === solveFor) continue;
            var el = qs(fieldMap[k]);
            var v = el ? Number(el.value) : 0;
            if (!v || v <= 0) {
                var st0 = qs("gas-status");
                if (st0) st0.textContent = "Enter valid positive values for all knowns.";
                return;
            }
            allVals[k] = v;
        }
        if (allVals.P != null) params += "&pressure=" + allVals.P;
        if (allVals.V != null) params += "&volume=" + allVals.V;
        if (allVals.n != null) params += "&moles=" + allVals.n;
        if (allVals.T != null) params += "&temperature=" + allVals.T;

        var url = "/thermo/gas-law?" + params;
        var st = qs("gas-status"), cx = qs("gas-context"), js = qs("gas-json");
        if (st) st.textContent = "Calculating\u2026";
        return fetch(url)
            .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, status: res.status, data: d }; }); })
            .then(function (out) {
                if (!out.ok) {
                    stopGasAnimation();
                    if (st) st.textContent = "Error " + out.status;
                    if (cx) cx.innerHTML = formatContext(formatDetail(out.data));
                    if (js) js.textContent = JSON.stringify(out.data, null, 2);
                    paintPlaceholder(qs("canvas-gaslaw"), "API error");
                    return;
                }
                var d = out.data;
                allVals[solveFor] = d.result;
                var solvedEl = qs(fieldMap[solveFor]);
                if (solvedEl) solvedEl.placeholder = fmtNum(d.result);

                if (st) st.textContent = "Live";
                if (cx) cx.innerHTML = formatContext(d.context);
                if (js) js.textContent = prettyJson(d);
                var unitLabel = d.unit === "Pa" ? "Pressure" : d.unit === "m\u00b3" ? "Volume" : d.unit === "mol" ? "Moles" : "Temperature";
                renderStatPills("gas-key-stats", [
                    { label: unitLabel, value: fmtNum(d.result) + " " + d.unit },
                    { label: "Equation", value: d.equation_used }
                ]);
                startGasAnimation(solveFor, allVals);
            })
            .catch(function () {
                stopGasAnimation();
                if (st) st.textContent = "Network error";
                paintPlaceholder(qs("canvas-gaslaw"), "Offline");
            });
    }

    function bindGasLaw() {
        syncGasLawUI();
        var deb = debounce(fetchGasLaw, 300);
        var sel = qs("gas-solve");
        if (sel) sel.addEventListener("change", function () { syncGasLawUI(); deb(); });
        ["gas-pressure", "gas-volume", "gas-moles", "gas-temp"].forEach(function (id) {
            var el = qs(id);
            if (el) el.addEventListener("input", deb);
        });
        var btn = qs("gas-run");
        if (btn) btn.addEventListener("click", fetchGasLaw);
    }

    var colRafId = null;
    var colAnim = null;

    function stopColAnimation() {
        if (colRafId != null) { cancelAnimationFrame(colRafId); colRafId = null; }
        colAnim = null;
    }

    function drawCollisionFrame(canvas, anim, progress) {
        if (!canvas) return;
        var ctx = canvas.getContext("2d"), cw = canvas.width, ch = canvas.height;
        ctx.fillStyle = "#0d0a08"; ctx.fillRect(0, 0, cw, ch);

        var cy = ch * 0.42;
        var r1 = 15 + anim.m1 * 2, r2 = 15 + anim.m2 * 2;
        var scaleV = 22;
        var collisionX = cw * 0.5;

        var x1, x2, v1Arrow, v2Arrow, phaseLabel;

        if (progress < 0.4) {
            var t = progress / 0.4;
            x1 = collisionX - r1 - 100 * (1 - t);
            x2 = collisionX + r2 + 100 * (1 - t);
            v1Arrow = anim.v1x; v2Arrow = anim.v2x;
            phaseLabel = "BEFORE";
        } else if (progress < 0.5) {
            x1 = collisionX - r1;
            x2 = collisionX + r2;
            v1Arrow = 0; v2Arrow = 0;
            phaseLabel = "COLLISION";
        } else {
            var t2 = (progress - 0.5) / 0.5;
            x1 = collisionX - r1 + anim.f1x * scaleV * t2 * 3;
            x2 = collisionX + r2 + anim.f2x * scaleV * t2 * 3;
            v1Arrow = anim.f1x; v2Arrow = anim.f2x;
            phaseLabel = "AFTER";
        }

        ctx.fillStyle = "rgba(255,184,112,0.5)"; ctx.font = "bold 12px Inter, sans-serif"; ctx.textAlign = "center";
        ctx.fillText(phaseLabel, cw / 2, 26);

        if (progress >= 0.4 && progress < 0.5) {
            var flash = 1 - (progress - 0.4) / 0.1;
            ctx.fillStyle = "rgba(255,200,120," + (flash * 0.3) + ")";
            ctx.beginPath(); ctx.arc(collisionX, cy, 40 + flash * 30, 0, Math.PI * 2); ctx.fill();
        }

        ctx.fillStyle = "rgba(255,184,112,0.85)";
        ctx.beginPath(); ctx.arc(x1, cy, r1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#0d0a08"; ctx.font = "bold 10px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(anim.m1 + "kg", x1, cy);

        ctx.fillStyle = "rgba(255,120,64,0.85)";
        ctx.beginPath(); ctx.arc(x2, cy, r2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#0d0a08";
        ctx.fillText(anim.m2 + "kg", x2, cy);
        ctx.textBaseline = "alphabetic";

        function drawArrow(ax, ay, vx, radius, color) {
            if (Math.abs(vx) < 0.05) return;
            var len = vx * scaleV;
            var sX = ax + (vx > 0 ? radius + 4 : -radius - 4);
            var eX = sX + len;
            ctx.strokeStyle = color; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(sX, ay); ctx.lineTo(eX, ay); ctx.stroke();
            var dir = vx > 0 ? -1 : 1;
            ctx.beginPath(); ctx.moveTo(eX, ay); ctx.lineTo(eX + dir * 6, ay - 4); ctx.lineTo(eX + dir * 6, ay + 4); ctx.closePath();
            ctx.fillStyle = color; ctx.fill();
            ctx.fillStyle = color; ctx.font = "10px JetBrains Mono, monospace"; ctx.textAlign = "center";
            ctx.fillText(fmtNum(vx, 1) + " m/s", (sX + eX) / 2, ay - 12);
        }

        drawArrow(x1, cy, v1Arrow, r1, "rgba(255,184,112,0.7)");
        drawArrow(x2, cy, v2Arrow, r2, "rgba(255,120,64,0.7)");

        if (anim.keBefore > 0) {
            var barY = ch - 80, barMaxW = cw - 100, barH = 14;
            ctx.fillStyle = "rgba(247,241,232,0.4)"; ctx.font = "10px Inter, sans-serif"; ctx.textAlign = "left";
            ctx.fillText("KE before: " + fmtNum(anim.keBefore, 2) + " J", 10, barY - 4);
            ctx.fillStyle = "rgba(255,184,112,0.3)";
            ctx.fillRect(10, barY, barMaxW, barH);

            var afterW = Math.max(1, (anim.keAfter / anim.keBefore) * barMaxW);
            ctx.fillText("KE after:   " + fmtNum(anim.keAfter, 2) + " J", 10, barY + barH + 18);
            ctx.fillStyle = anim.energyLost > 0.001 ? "rgba(232,106,36,0.5)" : "rgba(100,220,100,0.4)";
            ctx.fillRect(10, barY + barH + 22, afterW, barH);

            if (anim.energyLost > 0.001) {
                ctx.fillStyle = "rgba(255,80,80,0.25)";
                ctx.fillRect(10 + afterW, barY + barH + 22, barMaxW - afterW, barH);
                ctx.fillStyle = "rgba(255,80,80,0.6)"; ctx.font = "9px JetBrains Mono, monospace"; ctx.textAlign = "center";
                ctx.fillText("-" + fmtNum(anim.energyLost, 2) + " J", 10 + afterW + (barMaxW - afterW) / 2, barY + barH + 22 + barH / 2 + 3);
            }
        }

        ctx.fillStyle = "rgba(200,190,175,0.3)"; ctx.font = "10px JetBrains Mono, monospace"; ctx.textAlign = "center";
        ctx.fillText(anim.type.toUpperCase() + " COLLISION", cw / 2, ch - 10);
    }

    function startColAnimation(data) {
        stopColAnimation();
        colAnim = data;
        var totalMs = 3000;
        var startMs = null;
        function tick(now) {
            if (!colAnim) return;
            if (startMs == null) startMs = now;
            var progress = Math.min((now - startMs) / totalMs, 1);
            drawCollisionFrame(qs("canvas-collision"), colAnim, progress);
            if (progress < 1) {
                colRafId = requestAnimationFrame(tick);
            } else {
                startMs = now;
                colRafId = requestAnimationFrame(tick);
            }
        }
        colRafId = requestAnimationFrame(tick);
    }

    function fetchCollision() {
        var m1 = qs("col-m1") ? Number(qs("col-m1").value) : 2;
        var m2 = qs("col-m2") ? Number(qs("col-m2").value) : 1;
        var v1 = qs("col-v1") ? Number(qs("col-v1").value) : 3;
        var v2 = qs("col-v2") ? Number(qs("col-v2").value) : -1;
        var type = qs("col-type") ? qs("col-type").value : "elastic";
        var body = {
            mass1: m1, mass2: m2,
            velocity1: { x: v1, y: 0 }, velocity2: { x: v2, y: 0 },
            collision_type: type, restitution: type === "inelastic" ? 0.5 : 1.0
        };
        var st = qs("col-status"), cx = qs("col-context"), js = qs("col-json");
        if (st) st.textContent = "Simulating\u2026";
        stopColAnimation();
        return fetch("/mechanics/collision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
            .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, status: res.status, data: d }; }); })
            .then(function (out) {
                if (!out.ok) {
                    if (st) st.textContent = "Error " + out.status;
                    if (cx) cx.innerHTML = formatContext(formatDetail(out.data));
                    if (js) js.textContent = JSON.stringify(out.data, null, 2);
                    paintPlaceholder(qs("canvas-collision"), "API error");
                    return;
                }
                var d = out.data;
                if (st) st.textContent = "Animating";
                if (cx) cx.innerHTML = formatContext(d.context);
                if (js) js.textContent = prettyJson(d);
                renderStatPills("col-key-stats", [
                    { label: "KE before", value: fmtNum(d.kinetic_energy_before, 2) + " J" },
                    { label: "KE after", value: fmtNum(d.kinetic_energy_after, 2) + " J" },
                    { label: "Energy lost", value: fmtNum(d.energy_lost, 4) + " J" },
                    { label: "p conserved", value: d.momentum_conserved ? "\u2713 Yes" : "\u2717 No" }
                ]);
                startColAnimation({
                    m1: m1, m2: m2, v1x: v1, v2x: v2,
                    f1x: d.final_velocity1.x, f2x: d.final_velocity2.x,
                    keBefore: d.kinetic_energy_before, keAfter: d.kinetic_energy_after,
                    energyLost: d.energy_lost, type: type
                });
            })
            .catch(function () {
                stopColAnimation();
                if (st) st.textContent = "Network error";
                paintPlaceholder(qs("canvas-collision"), "Offline");
            });
    }

    function syncColLabels() {
        var m1 = qs("col-m1"), m2 = qs("col-m2"), v1 = qs("col-v1"), v2 = qs("col-v2");
        if (m1 && qs("col-m1-val")) qs("col-m1-val").textContent = Number(m1.value).toFixed(1) + " kg";
        if (m2 && qs("col-m2-val")) qs("col-m2-val").textContent = Number(m2.value).toFixed(1) + " kg";
        if (v1 && qs("col-v1-val")) qs("col-v1-val").textContent = Number(v1.value).toFixed(1) + " m/s";
        if (v2 && qs("col-v2-val")) qs("col-v2-val").textContent = Number(v2.value).toFixed(1) + " m/s";
    }

    function bindCollision() {
        syncColLabels();
        ["col-m1", "col-m2", "col-v1", "col-v2"].forEach(function (id) {
            var el = qs(id);
            if (el) el.addEventListener("input", syncColLabels);
        });
        var btn = qs("col-run");
        if (btn) btn.addEventListener("click", fetchCollision);
    }

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
        bindEscape(); bindInterference(); bindGasLaw(); bindCollision();
        fetchChaosSimulation({ compare: false }); fetchProjectile(); fetchDoppler(); fetchTimeDilation();
        fetchEscape(); fetchInterference(); fetchGasLaw(); fetchCollision();
    });
})();
