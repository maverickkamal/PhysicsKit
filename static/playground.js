(function () {
    function qs(id) {
        return document.getElementById(id);
    }

    function initTabs() {
        var tabs = document.querySelectorAll(".tab");
        var panels = document.querySelectorAll(".panel");
        tabs.forEach(function (tab) {
            tab.addEventListener("click", function () {
                var target = tab.getAttribute("data-panel");
                tabs.forEach(function (t) {
                    t.classList.remove("tab-active");
                    t.setAttribute("aria-selected", "false");
                });
                tab.classList.add("tab-active");
                tab.setAttribute("aria-selected", "true");
                panels.forEach(function (p) {
                    p.classList.remove("panel-active");
                    p.setAttribute("aria-hidden", "true");
                });
                var panel = document.getElementById("panel-" + target);
                if (panel) {
                    panel.classList.add("panel-active");
                    panel.setAttribute("aria-hidden", "false");
                }
            });
        });
    }

    function syncChaosLabels() {
        var t1 = qs("chaos-theta1");
        var t2 = qs("chaos-theta2");
        var dur = qs("chaos-duration");
        if (t1 && qs("chaos-theta1-val")) qs("chaos-theta1-val").textContent = t1.value;
        if (t2 && qs("chaos-theta2-val")) qs("chaos-theta2-val").textContent = t2.value;
        if (dur && qs("chaos-duration-val")) qs("chaos-duration-val").textContent = dur.value;
    }

    function paintChaosPlaceholder(canvas, message) {
        if (!canvas || !canvas.getContext) return;
        var ctx = canvas.getContext("2d");
        var w = canvas.width;
        var h = canvas.height;
        ctx.fillStyle = "#0d0a08";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#a89888";
        ctx.font = "14px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText(message || "Canvas animation in Phase 3B", w / 2, h / 2);
    }

    function renderChaosKeyStats(data) {
        var el = qs("chaos-key-stats");
        if (!el) return;
        el.innerHTML = "";
        var pills = [
            { label: "trajectory points", value: data.trajectory2 ? String(data.trajectory2.length) : "—" },
            { label: "chaotic", value: data.is_chaotic ? "yes" : "no" },
        ];
        if (data.compare_mode && data.divergence_time != null) {
            pills.push({ label: "divergence", value: String(data.divergence_time) + " s" });
        }
        pills.forEach(function (p) {
            var span = document.createElement("span");
            span.className = "stat-pill";
            span.innerHTML =
                '<span class="mono">' +
                escapeHtml(p.label) +
                "</span>: <span class=\"mono\">" +
                escapeHtml(p.value) +
                "</span>";
            el.appendChild(span);
        });
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function fetchChaosSimulation(opts) {
        opts = opts || {};
        var compare = !!opts.compare;
        var theta1 = opts.theta1 != null ? Number(opts.theta1) : 120;
        var theta2 = opts.theta2 != null ? Number(opts.theta2) : 120;
        var duration = opts.duration != null ? Number(opts.duration) : 15;

        var statusEl = qs("chaos-status");
        var ctxEl = qs("chaos-context");
        var jsonEl = qs("chaos-json");
        var canvas = qs("canvas-chaos");

        if (statusEl) statusEl.textContent = compare ? "Loading compare run…" : "Loading simulation…";
        paintChaosPlaceholder(canvas, "Fetching physics…");

        var body = {
            theta1: theta1,
            theta2: theta2,
            omega1: 0,
            omega2: 0,
            length1: 1,
            length2: 1,
            mass1: 1,
            mass2: 1,
            duration: duration,
            compare_mode: compare,
        };

        return fetch("/chaos/double-pendulum", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        })
            .then(function (res) {
                return res.json().then(function (data) {
                    return { ok: res.ok, status: res.status, data: data };
                });
            })
            .then(function (out) {
                if (!out.ok) {
                    var d = out.data && out.data.detail;
                    var msg = "Request failed.";
                    if (typeof d === "string") {
                        msg = d;
                    } else if (Array.isArray(d)) {
                        msg = d
                            .map(function (e) {
                                return e.msg || JSON.stringify(e);
                            })
                            .join("; ");
                    } else if (d != null) {
                        msg = JSON.stringify(d);
                    }
                    if (statusEl) statusEl.textContent = "Error " + out.status;
                    if (ctxEl) ctxEl.textContent = msg;
                    if (jsonEl) jsonEl.textContent = JSON.stringify(out.data, null, 2);
                    paintChaosPlaceholder(canvas, "API error");
                    return null;
                }
                var data = out.data;
                data.compare_mode = compare;
                if (statusEl) statusEl.textContent = "Simulation ready";
                if (ctxEl) ctxEl.textContent = data.context || "";
                if (jsonEl) jsonEl.textContent = JSON.stringify(data, null, 2);
                renderChaosKeyStats(data);
                paintChaosPlaceholder(canvas, "Phase 3B: pendulum animation");
                return data;
            })
            .catch(function () {
                if (statusEl) statusEl.textContent = "Network error";
                if (ctxEl) ctxEl.textContent = "Could not reach the API. Is the server running?";
                paintChaosPlaceholder(canvas, "Offline");
            });
    }

    function bindChaosControls() {
        ["chaos-theta1", "chaos-theta2", "chaos-duration"].forEach(function (id) {
            var el = qs(id);
            if (el) el.addEventListener("input", syncChaosLabels);
        });
        syncChaosLabels();

        var runBtn = qs("chaos-run");
        if (runBtn) {
            runBtn.addEventListener("click", function () {
                var t1 = qs("chaos-theta1");
                var t2 = qs("chaos-theta2");
                var dur = qs("chaos-duration");
                var cmp = qs("chaos-compare");
                fetchChaosSimulation({
                    theta1: t1 ? t1.value : 120,
                    theta2: t2 ? t2.value : 120,
                    duration: dur ? dur.value : 15,
                    compare: cmp && cmp.checked,
                });
            });
        }

        var canvases = ["canvas-projectile", "canvas-doppler", "canvas-time"];
        canvases.forEach(function (cid) {
            var c = qs(cid);
            paintChaosPlaceholder(c, "Phase 3C");
        });
    }

    document.addEventListener("DOMContentLoaded", function () {
        initTabs();
        bindChaosControls();
        fetchChaosSimulation({ compare: false });
    });
})();
