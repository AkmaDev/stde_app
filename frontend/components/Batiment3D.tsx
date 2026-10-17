"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Batiment, reconstruitContour, aireEtPerimetreContour } from "@/lib/api";

// Port du prototype "Buffon en volume" (artifact) sur des données réelles
// quelconques (plus seulement Buffon codé en dur) : extrusion simple du
// contour reconstruit (voir reconstruitContour dans lib/api.ts) à la hauteur
// mesurée APUR, projection perspective maison (sans librairie 3D), position
// réelle du soleil à la latitude de Paris. Simplifications assumées,
// documentées sur /etat-du-projet : toiture plate (pas de relevé de toiture
// réel), déclinaison fixée aux 2 solstices (pas de course continue), pas de
// correction d'équation du temps.

const LAT = (48.85 * Math.PI) / 180;

// Palette dérivée du thème clair de l'artifact d'origine, alignée sur le
// reste de l'app (accent #000091) — l'app n'a pas de mode sombre.
const COULEUR = {
  wall: "#bcd8e0",
  wallDark: "#7fa8b1",
  roof: "#6fa9b8",
  grid: "#dbe6e8",
  accent: "#1c7293",
};

function mixColor(hex: string, t: number) {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) * t) | 0;
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) * t) | 0;
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) * t) | 0;
  return `rgb(${r},${g},${b})`;
}
function normalize3(v: number[]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function convexHull(points: [number, number][]): [number, number][] {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export default function Batiment3D({ batiment }: { batiment: Batiment }) {
  const contour = useMemo(() => reconstruitContour(batiment), [batiment]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [season, setSeason] = useState<"hiver" | "ete">("hiver");
  const seasonRef = useRef(season);
  const heureRef = useRef(12);
  const [heureLabel, setHeureLabel] = useState("12h00");
  const [sunInfo, setSunInfo] = useState({ az: 0, elev: 0, dessous: false });

  useEffect(() => {
    seasonRef.current = season;
  }, [season]);

  const geo = useMemo(() => {
    if (!contour || batiment.hauteur_m == null) return null;
    const H = batiment.hauteur_m;
    const pts2d = contour.slice(0, contour.length - 1);
    const n = pts2d.length;
    const verts: [number, number, number][] = [];
    for (const p of pts2d) verts.push([p[0], p[1], 0]);
    for (const p of pts2d) verts.push([p[0], p[1], H]);
    const faces: { idx: number[]; type: "wall" | "roof" | "floor" }[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      faces.push({ idx: [i, j, n + j, n + i], type: "wall" });
    }
    const roofIdx: number[] = [];
    for (let i = 0; i < n; i++) roofIdx.push(n + i);
    faces.push({ idx: roofIdx, type: "roof" });
    const floorIdx: number[] = [];
    for (let i = n - 1; i >= 0; i--) floorIdx.push(i);
    faces.push({ idx: floorIdx, type: "floor" });

    const cx = 0;
    const cy = 0;
    const cz = H / 2;
    let radius = 0;
    verts.forEach((v) => {
      radius = Math.max(radius, Math.hypot(v[0] - cx, v[1] - cy, v[2] - cz));
    });

    return {
      pts2d,
      verts,
      faces,
      cx,
      cy,
      cz,
      radius,
      H,
      ...aireEtPerimetreContour(contour),
    };
  }, [contour, batiment.hauteur_m]);

  useEffect(() => {
    if (!geo || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rotY = 0.7;
    let rotX = -0.35;
    let zoom = 1;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let raf = 0;
    let stopped = false;

    const { verts, faces, cx, cy, cz, radius, H, pts2d } = geo;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function project(v: number[]) {
      const x = v[0] - cx;
      const y = v[1] - cy;
      const z = v[2] - cz;
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const x1 = x * cosY - y * sinY;
      const y1 = x * sinY + y * cosY;
      const z1 = z;
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const y2 = y1 * cosX - z1 * sinX;
      const z2 = y1 * sinX + z1 * cosX;
      const x2 = x1;
      const camDist = (radius * 3.4) / zoom;
      const f = camDist / (camDist - z2);
      const scale = (Math.min(canvas.clientWidth, canvas.clientHeight) / (radius * 2.6)) * zoom;
      return {
        x: canvas.clientWidth / 2 + x2 * f * scale,
        y: canvas.clientHeight / 2 - y2 * f * scale,
        depth: z2,
      };
    }

    function faceNormal(idx: number[]) {
      const a = verts[idx[0]];
      const b = verts[idx[1]];
      const c = verts[idx[2]];
      const ux = b[0] - a[0];
      const uy = b[1] - a[1];
      const uz = b[2] - a[2];
      const vx = c[0] - a[0];
      const vy = c[1] - a[1];
      const vz = c[2] - a[2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      return [nx / len, ny / len, nz / len];
    }

    function declinaison() {
      return ((seasonRef.current === "hiver" ? -23.45 : 23.45) * Math.PI) / 180;
    }
    function sunPosition() {
      const decl = declinaison();
      const Hh = ((heureRef.current - 12) * 15 * Math.PI) / 180;
      const sinElev = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(Hh);
      const elev = Math.asin(Math.max(-1, Math.min(1, sinElev)));
      const cosAz = (Math.sin(decl) - Math.sin(elev) * Math.sin(LAT)) / (Math.cos(elev) * Math.cos(LAT) || 1e-6);
      let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
      if (Hh > 0) az = 2 * Math.PI - az;
      return { elev, az };
    }
    function sunDirection() {
      const s = sunPosition();
      return {
        dir: [Math.cos(s.elev) * Math.sin(s.az), Math.cos(s.elev) * Math.cos(s.az), Math.sin(s.elev)],
        elev: s.elev,
        az: s.az,
      };
    }

    let lightDir: [number, number, number] = [0.4, -0.6, 0.7];
    let sunAboveHorizon = true;
    let lastUiUpdate = 0;

    function updateSunUI(now: number) {
      const s = sunDirection();
      lightDir = s.elev > 0.01 ? (s.dir as [number, number, number]) : normalize3([s.dir[0], s.dir[1], 0.03]);
      sunAboveHorizon = s.elev > 0.01;
      if (now - lastUiUpdate > 100) {
        lastUiUpdate = now;
        const h = heureRef.current;
        setHeureLabel(`${String(Math.floor(h)).padStart(2, "0")}h${String(Math.round((h % 1) * 60)).padStart(2, "0")}`);
        setSunInfo({
          az: Math.round((s.az * 180) / Math.PI),
          elev: Math.round((s.elev * 180) / Math.PI),
          dessous: !sunAboveHorizon,
        });
      }
      return s;
    }

    function shadowPolygon(): [number, number][] | null {
      if (!sunAboveHorizon) return null;
      const t = H / lightDir[2];
      const shadowPts: [number, number][] = pts2d.map((p) => [p[0] - t * lightDir[0], p[1] - t * lightDir[1]]);
      return convexHull(pts2d.concat(shadowPts));
    }
    function shade(baseColor: string, normal: number[]) {
      const d = Math.max(0, normal[0] * lightDir[0] + normal[1] * lightDir[1] + normal[2] * lightDir[2]);
      const t = 0.45 + 0.55 * d;
      return mixColor(baseColor, t);
    }

    function drawGrid() {
      const half = radius * 1.6;
      const step = 5;
      ctx!.strokeStyle = COULEUR.grid;
      ctx!.lineWidth = 1;
      for (let g = -half; g <= half; g += step) {
        const p1 = project([cx + g, cy - half, 0]);
        const p2 = project([cx + g, cy + half, 0]);
        ctx!.beginPath();
        ctx!.moveTo(p1.x, p1.y);
        ctx!.lineTo(p2.x, p2.y);
        ctx!.stroke();
        const p3 = project([cx - half, cy + g, 0]);
        const p4 = project([cx + half, cy + g, 0]);
        ctx!.beginPath();
        ctx!.moveTo(p3.x, p3.y);
        ctx!.lineTo(p4.x, p4.y);
        ctx!.stroke();
      }
    }
    function drawShadow() {
      const poly = shadowPolygon();
      if (!poly) return;
      ctx!.beginPath();
      poly.forEach((p, k) => {
        const pr = project([p[0], p[1], 0.01]);
        if (k === 0) ctx!.moveTo(pr.x, pr.y);
        else ctx!.lineTo(pr.x, pr.y);
      });
      ctx!.closePath();
      ctx!.fillStyle = "rgba(0,0,0,0.16)";
      ctx!.fill();
    }
    function drawSun() {
      const s = sunDirection();
      if (s.elev < 0.01) return;
      const far = radius * 6;
      const sunWorld = [cx + s.dir[0] * far, cy + s.dir[1] * far, cz + s.dir[2] * far];
      const p = project(sunWorld);
      const glow = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, 46);
      glow.addColorStop(0, "rgba(255,214,120,0.95)");
      glow.addColorStop(0.35, "rgba(255,190,80,0.45)");
      glow.addColorStop(1, "rgba(255,190,80,0)");
      ctx!.fillStyle = glow;
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, 46, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.fillStyle = "#ffcf70";
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx!.fill();
    }

    function render(now: number) {
      if (stopped) return;
      updateSunUI(now);
      ctx!.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      drawGrid();
      drawShadow();
      drawSun();

      const projected = verts.map(project);
      const drawables = faces.map((f) => {
        const avgDepth = f.idx.reduce((s, i) => s + projected[i].depth, 0) / f.idx.length;
        const normal = faceNormal(f.idx);
        const base = f.type === "roof" ? COULEUR.roof : f.type === "floor" ? COULEUR.wallDark : COULEUR.wall;
        return { f, depth: avgDepth, normal, base };
      });
      drawables.sort((a, b) => a.depth - b.depth);

      drawables.forEach((d) => {
        const idx = d.f.idx;
        ctx!.beginPath();
        idx.forEach((i, k) => {
          const p = projected[i];
          if (k === 0) ctx!.moveTo(p.x, p.y);
          else ctx!.lineTo(p.x, p.y);
        });
        ctx!.closePath();
        ctx!.fillStyle = shade(d.base, d.f.type === "floor" ? [d.normal[0], d.normal[1], -d.normal[2]] : d.normal);
        ctx!.fill();
        ctx!.strokeStyle = "rgba(20,50,60,0.2)";
        ctx!.lineWidth = 1;
        ctx!.stroke();
      });

      raf = requestAnimationFrame(render);
    }

    function pointerDown(x: number, y: number) {
      dragging = true;
      lastX = x;
      lastY = y;
    }
    function pointerMove(x: number, y: number) {
      if (!dragging) return;
      rotY += (x - lastX) * 0.008;
      rotX += (y - lastY) * 0.008;
      rotX = Math.max(-1.3, Math.min(0.2, rotX));
      lastX = x;
      lastY = y;
    }
    function pointerUp() {
      dragging = false;
    }
    const onMouseDown = (e: MouseEvent) => pointerDown(e.clientX, e.clientY);
    const onMouseMove = (e: MouseEvent) => pointerMove(e.clientX, e.clientY);
    const onTouchStart = (e: TouchEvent) => pointerDown(e.touches[0].clientX, e.touches[0].clientY);
    const onTouchMove = (e: TouchEvent) => pointerMove(e.touches[0].clientX, e.touches[0].clientY);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom = Math.max(0.4, Math.min(3, zoom * (1 - e.deltaY * 0.001)));
    };

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", pointerUp);
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", pointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    raf = requestAnimationFrame(render);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", pointerUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", pointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [geo]);

  if (!contour || !geo) {
    return (
      <div className="mut" style={{ fontSize: 12.5, padding: "20px 0" }}>
        Volume 3D non disponible : géométrie du bâtiment pas assez fiable pour cette vue.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 600 }}>
        <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#161616" }}>Volume 3D</h2>
        <p style={{ margin: 0, fontSize: 16 }}>Volume reconstruit et ensoleillement selon la saison et l&apos;heure.</p>
      </div>

      <div style={{ position: "relative", height: 420 }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", cursor: "grab", touchAction: "none" }} />
        {sunInfo.dessous && (
          <div style={{ position: "absolute", top: 14, right: 14, fontSize: 13, color: "#000091", background: "#fff", padding: "4px 10px", boxShadow: "0 2px 6px rgba(0,0,18,.16)" }}>
            ☾ Soleil sous l&apos;horizon
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 32, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 14, color: "#666" }}>Saison</span>
          <div style={{ display: "flex", gap: 8 }}>
            {(["hiver", "ete"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeason(s)}
                className={`pill-toggle${season === s ? " on" : ""}`}
              >
                {s === "hiver" ? "Hiver" : "Été"}
              </button>
            ))}
          </div>
        </div>
        <label style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 8, fontSize: 14, color: "#666" }}>
          <span style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Heure solaire</span>
            <span className="num" style={{ color: "#161616", fontWeight: 500 }}>{heureLabel}</span>
          </span>
          <input
            type="range"
            min={6}
            max={18}
            step={0.25}
            defaultValue={12}
            style={{ width: "100%", accentColor: "#000091" }}
            onChange={(e) => {
              heureRef.current = parseFloat(e.target.value);
            }}
          />
        </label>
        <div style={{ display: "flex", gap: 32 }}>
          {[["Azimut", `${sunInfo.az}°`], ["Hauteur du soleil", `${sunInfo.elev}°`]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 14, color: "#666" }}>{k}</span>
              <span className="num" style={{ fontSize: 16, fontWeight: 500, color: "#161616" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid #ddd" }}>
        {[
          ["Hauteur moyenne", `${batiment.hauteur_m?.toFixed(1)} m`],
          ["Hauteur mini / maxi", `${batiment.hauteur_min_m?.toFixed(1)} – ${batiment.hauteur_max_m?.toFixed(1)} m`],
          ["Emprise au sol", `${Math.round(geo.area)} m²`],
          ["Périmètre", `${geo.perimetre.toFixed(1)} m`],
        ].map(([label, value]) => (
          <div key={label} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 24, padding: "16px 0", borderBottom: "1px solid #eee", fontSize: 15 }}>
            <span style={{ color: "#3a3a3a" }}>{label}</span>
            <span className="num" style={{ color: "#161616", fontWeight: 500 }}>{value}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 14, color: "#666", maxWidth: 720 }}>
        Contour reconstruit à partir des façades (RNB, APUR). La toiture est simplifiée en toit plat ; aucun relevé réel.
      </p>
    </div>
  );
}
