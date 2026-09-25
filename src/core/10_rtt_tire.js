// LUCID MOTO core · RTT — real-time tire model
// ------------------------------------------------------------------------------------------
// Physically structured motorcycle tire that runs ~1000x faster than the legacy
// FiniteThicknessTyreSolverV5 (15 ms per substep -> ~15 µs), so the free-road chassis can run
// in real time. The legacy particle tire stays available as the REFERENCE mode.
//
//  Vertical  : exact geometric intersection of the Ducati 916 tread profile (from the GLB tire
//              assets) with the road plane at the current camber; load = contact pressure x area,
//              contact pressure = inflation gauge + carcass support. Gives load-dependent patch
//              size/shape, camber-dependent stiffness and the lateral contact-point migration of a
//              round-profile motorcycle tire directly from the geometry.
//  Horizontal: 3-lane x N-station brush patch. Bristle deflections are advected through the patch
//              semi-Lagrangianly (unconditionally stable from standstill to top speed) and driven by
//              the tread-base slip velocity: longitudinal slip, lateral slip, turn slip (carrier yaw
//              rate) and camber spin (spin-axis component along the road normal). Friction ellipse
//              with velocity-dependent mu. Camber thrust, pneumatic trail / aligning moment,
//              combined slip and the camber twisting moment all emerge from the patch.
//  Transient : lateral carcass compliance in series with the brush (two-stage relaxation).
//
// Frame convention matches the legacy V5 free-road solver: fwd / right / up where
// right = fwd x up (a left-handed triad), camber gamma > 0 when the axle's right end dips.
(function (root) {
  "use strict";
  const PSI = 6894.757293168;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  // ---------------------------------------------------------------- tread profile geometry
  class TireGeometry {
    constructor(asset, opt = {}) {
      const P = asset.profile;
      // Tread section = profile without the two bead points. Catmull-Rom (centripetal) resample.
      const pts = P.slice(1, P.length - 1).map((p) => [p[0], p[1]]);
      const n = opt.stations || 161;
      const dense = [];
      const seg = (p0, p1, p2, p3, t) => {
        // centripetal Catmull-Rom
        const tj = (ti, a, b) => ti + Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5);
        const t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
        const tt = t1 + (t2 - t1) * t;
        const L = (a, b, ta, tb) => [((tb - tt) * a[0] + (tt - ta) * b[0]) / (tb - ta), ((tb - tt) * a[1] + (tt - ta) * b[1]) / (tb - ta)];
        const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
        const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
        return L(B1, B2, t1, t2);
      };
      const ext = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts, [2 * pts[pts.length - 1][0] - pts[pts.length - 2][0], 2 * pts[pts.length - 1][1] - pts[pts.length - 2][1]]];
      for (let i = 1; i < ext.length - 2; i++) for (let k = 0; k < 24; k++) dense.push(seg(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], k / 24));
      dense.push(pts[pts.length - 1]);
      // arc-length resample, then enforce exact lateral symmetry about the crown
      const s = [0];
      for (let i = 1; i < dense.length; i++) s.push(s[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
      const total = s[s.length - 1];
      this.x = new Float64Array(n);
      this.r = new Float64Array(n);
      let k = 0;
      for (let j = 0; j < n; j++) {
        const target = (total * j) / (n - 1);
        while (k < s.length - 2 && s[k + 1] < target) k++;
        const t = (target - s[k]) / Math.max(1e-12, s[k + 1] - s[k]);
        this.x[j] = dense[k][0] + (dense[k + 1][0] - dense[k][0]) * t;
        this.r[j] = dense[k][1] + (dense[k + 1][1] - dense[k][1]) * t;
      }
      for (let j = 0; j < n >> 1; j++) {
        const m = n - 1 - j, xm = 0.5 * (Math.abs(this.x[j]) + Math.abs(this.x[m])), rm = 0.5 * (this.r[j] + this.r[m]);
        this.x[j] = -xm; this.x[m] = xm; this.r[j] = this.r[m] = rm;
      }
      if (n & 1) this.x[n >> 1] = 0;
      this.n = n;
      this.R0 = asset.nominal.R0;
      this.halfWidth = Math.max(...this.x);
      this.arcLength = total;
      // crown radius (least squares circle over the central +-15 mm)
      let num = 0, den = 0;
      for (let j = 0; j < n; j++) if (Math.abs(this.x[j]) < 0.015 && this.x[j] !== 0) { num += this.x[j] * this.x[j]; den += 2 * (this.R0 - this.r[j]); }
      this.crownRadius = den > 0 ? num / den : 0.04;
      // maximum camber before the contact runs off the tread edge
      const j0 = 0, j1 = 3;
      this.edgeCamberRad = Math.atan2(this.r[j1] - this.r[j0], this.x[j1] - this.x[j0]);
    }
    // Unloaded hub height above the road at camber gamma (support function of the profile).
    touchHeight(gamma) {
      const s = Math.sin(gamma), c = Math.cos(gamma);
      let h = -Infinity;
      for (let j = 0; j < this.n; j++) { const z = this.x[j] * s + this.r[j] * c; if (z > h) h = z; }
      return h;
    }
  }

  // ---------------------------------------------------------------- parameter presets
  // Literature-grounded sport motorcycle tire characteristics (normalised by load):
  //   cornering stiffness ~ 11-15 /rad, camber stiffness ~ 0.8-1.1 /rad, longitudinal slip
  //   stiffness ~ 15-25, relaxation length 0.1-0.25 m, vertical stiffness 150-250 kN/m.
  // The tread geometry comes from the Ducati 916 GLB assets; everything else is exposed so the
  // model can be A/B'd against the legacy particle tire or re-calibrated to measured data.
  const PRESETS = {
    front: {
      id: "120/70 ZR17 front", nominalLoadN: 1400, nominalPsi: 32,
      carcassPressurePa: 36000,          // structural support added to inflation gauge pressure
      verticalDampingNs: 180,            // tire hysteresis damping (N s/m)
      rimStopDeflectionM: 0.042,         // onset of rim contact / sidewall collapse
      rimStopStiffness: 1.8e6,
      corneringStiffness: 13.5, corneringLoadExp: 0.78, corneringPressureExp: 0.22,
      longStiffness: 18.5, longLoadExp: 0.85,
      camberGain: 1.08,                  // camber-spin effectiveness (1 = thin disc); tuned so C_Fgamma ~ 0.95 Fz
      turnSlipGain: 1.0,
      mu: 1.18, muKineticRatio: 0.78, muDecayVelocity: 6.0, muLateralRatio: 0.97,
      carcassLateralStiffness: 1.25e5, carcassTau: 0.0035,
      rollingResistance: 0.013,
      effectiveRadiusDeflectionFactor: 0.33,
      lowSpeedDamping: 2.2e5, lowSpeedDampingVel: 0.6,
    },
    rear: {
      id: "180/55 ZR17 rear", nominalLoadN: 1500, nominalPsi: 34.8,
      carcassPressurePa: 42000,
      verticalDampingNs: 220,
      rimStopDeflectionM: 0.040,
      rimStopStiffness: 2.2e6,
      corneringStiffness: 12.5, corneringLoadExp: 0.8, corneringPressureExp: 0.2,
      longStiffness: 20.5, longLoadExp: 0.85,
      camberGain: 1.42,
      turnSlipGain: 1.0,
      mu: 1.27, muKineticRatio: 0.76, muDecayVelocity: 5.5, muLateralRatio: 0.97,
      carcassLateralStiffness: 1.55e5, carcassTau: 0.0035,
      rollingResistance: 0.015,
      effectiveRadiusDeflectionFactor: 0.33,
      lowSpeedDamping: 2.4e5, lowSpeedDampingVel: 0.6,
    },
  };

  const NL = 3; // lanes across the patch
  const NX = 10; // stations along each lane

  class RealtimeTire {
    constructor(geometry, params = {}) {
      this.g = geometry;
      this.P = Object.assign({}, params);
      const n = geometry.n;
      this.pen = new Float64Array(n);
      this.half = new Float64Array(n);
      this.lat = new Float64Array(n);
      this.width = new Float64Array(n);
      this.ux = new Float64Array(NL * NX);
      this.uy = new Float64Array(NL * NX);
      this.tmpx = new Float64Array(NX);
      this.tmpy = new Float64Array(NX);
      this.slide = new Uint8Array(NL * NX);
      this.lane = { A: new Float64Array(NL), a: new Float64Array(NL), y: new Float64Array(NL), r: new Float64Array(NL), jmin: new Int32Array(NL), jmax: new Int32Array(NL) };
      this.out = {
        Fz: 0, Fx: 0, Fy: 0, Mz: 0, areaM2: 0, halfLengthM: 0, halfWidthM: 0, deflectionM: 0, contactLateralM: 0,
        contactDepthM: 0, rollingResistanceTorqueNm: 0, effectiveRadiusM: geometry.R0, loadedRadiusM: geometry.R0, kappa: 0, alpha: 0, slidingFraction: 0,
        utilization: 0, slidingPowerW: 0, rollingPowerW: 0, pneumaticTrailM: 0, contact: false, carcassYM: 0, muPeak: 0,
      };
      this.reset();
    }
    reset() {
      this.ux.fill(0);
      this.uy.fill(0);
      this.slide.fill(0);
      this.yc = 0;
      this.lastFy = 0;
      this.lastFz = 0;
      this.out.Fz = this.out.Fx = this.out.Fy = this.out.Mz = 0;
    }
    // ------------------------------------------------------------ vertical / patch geometry
    // h: hub height above road along the road normal, gamma: camber (rad)
    geometry(h, gamma) {
      const G = this.g, n = G.n, s = Math.sin(gamma), c = Math.max(0.2, Math.cos(gamma));
      const pen = this.pen, half = this.half, lat = this.lat, wid = this.width;
      let A = 0, cy = 0, jlo = -1, jhi = -1, maxPen = -Infinity;
      for (let j = 0; j < n; j++) {
        lat[j] = c * G.x[j] - s * G.r[j];
        const p = G.x[j] * s + G.r[j] * c - h;
        pen[j] = p;
        if (p > maxPen) maxPen = p;
      }
      for (let j = 0; j < n; j++) {
        const p = pen[j];
        if (p <= 0) { half[j] = 0; wid[j] = 0; continue; }
        const d = p / c, r = G.r[j];
        half[j] = Math.sqrt(Math.max(0, 2 * r * d - d * d));
        const jl = j > 0 ? j - 1 : j, jr = j < n - 1 ? j + 1 : j;
        wid[j] = Math.abs(lat[jr] - lat[jl]) / Math.max(1, jr - jl);
        const dA = 2 * half[j] * wid[j];
        A += dA;
        cy += dA * lat[j];
        if (jlo < 0) jlo = j;
        jhi = j;
      }
      const L = this.lane;
      L.A.fill(0); L.a.fill(0); L.y.fill(0); L.r.fill(0);
      const geo = this._geo || (this._geo = { A: 0, maxPen: 0, cy: 0, jlo: -1, jhi: -1 });
      geo.maxPen = maxPen;
      geo.jlo = jlo;
      geo.jhi = jhi;
      if (A <= 0) { geo.A = 0; geo.cy = 0; return geo; }
      cy /= A;
      geo.A = A;
      geo.cy = cy;
      // split contacting strips into NL lanes of equal area
      let acc = 0;
      const wsum = this._wsum || (this._wsum = new Float64Array(NL));
      wsum.fill(0);
      for (let j = jlo; j <= jhi; j++) {
        const dA = 2 * half[j] * wid[j];
        if (dA <= 0) continue;
        const k = Math.min(NL - 1, Math.floor(((acc + 0.5 * dA) / A) * NL));
        acc += dA;
        L.A[k] += dA;
        wsum[k] += 2 * wid[j];
        L.y[k] += dA * (lat[j] - cy);
        L.r[k] += dA * (G.r[j] - (pen[j] / c) * this.P.effectiveRadiusDeflectionFactor);
      }
      for (let k = 0; k < NL; k++) {
        if (L.A[k] > 0) {
          L.a[k] = L.A[k] / Math.max(1e-9, wsum[k]);
          L.y[k] /= L.A[k];
          L.r[k] /= L.A[k];
        }
      }
      return geo;
    }
    // ------------------------------------------------------------ one step
    // input: {dt, h, hDot, gamma, Vx, Vy, yawRate, omega, pressurePa, mu, muScale}
    step(I) {
      const P = this.P, o = this.out, dt = I.dt;
      const gamma = clamp(I.gamma, -1.35, 1.35);
      const geo = this.geometry(I.h, gamma);
      const gaugePa = Math.max(0, I.pressurePa ?? P.nominalPsi * PSI);
      // --- normal load: pressure x area (+ damping, + rim stop)
      let Fz = 0;
      const defl = geo.maxPen;
      if (geo.A > 0) {
        Fz = (gaugePa + P.carcassPressurePa) * geo.A;
        Fz += P.verticalDampingNs * Math.min(0, I.hDot) * -1 * clamp(defl / 0.002, 0, 1); // compression damping
        Fz -= P.verticalDampingNs * Math.max(0, I.hDot) * clamp(defl / 0.002, 0, 1) * 0.6; // lighter rebound
        if (defl > P.rimStopDeflectionM) Fz += P.rimStopStiffness * (defl - P.rimStopDeflectionM);
        Fz = Math.max(0, Fz);
      }
      o.Fz = Fz;
      o.areaM2 = geo.A;
      o.deflectionM = defl;
      o.contact = Fz > 0.5;
      o.contactLateralM = geo.A > 0 ? geo.cy : clamp(-Math.sin(gamma) * this.g.R0, -0.2, 0.2);
      o.contactDepthM = I.h;
      o.loadedRadiusM = I.h;
      const L = this.lane;
      // effective rolling radius (area-weighted)
      let Re = 0, aw = 0, amax = 0;
      for (let k = 0; k < NL; k++) { Re += L.r[k] * L.A[k]; aw += L.a[k] * L.A[k]; amax = Math.max(amax, L.a[k]); }
      Re = geo.A > 0 ? Re / geo.A : this.g.touchHeight(gamma);
      const aMean = geo.A > 0 ? aw / geo.A : 0;
      o.effectiveRadiusM = Re;
      o.halfLengthM = amax;
      o.halfWidthM = geo.A > 0 ? geo.A / Math.max(1e-6, Math.PI * Math.max(amax, 1e-4)) : 0;
      // kinematic slips for telemetry / ABS / TC (legacy conventions)
      const Vr0 = I.omega * Re;
      o.kappa = clamp((Vr0 - I.Vx) / Math.max(0.75, Math.abs(I.Vx)), -1.2, 1.2);
      o.alpha = clamp(-Math.atan2(I.Vy, Math.max(0.5, Math.abs(I.Vx))), -0.6, 0.6);
      if (!o.contact || aMean <= 1e-5) {
        this.ux.fill(0); this.uy.fill(0); this.slide.fill(0);
        this.yc *= Math.exp(-dt / 0.01);
        o.Fx = o.Fy = o.Mz = 0; o.slidingFraction = 0; o.utilization = 0; o.slidingPowerW = 0; o.rollingPowerW = 0; o.pneumaticTrailM = 0;
        o.rollingResistanceTorqueNm = 0;
        this.lastFy = 0; this.lastFz = 0; o.carcassYM = this.yc;
        return o;
      }
      // --- stiffness scheduling from target cornering / slip stiffness at the current load
      const Fz0 = P.nominalLoadN, fn = Math.max(0.02, Fz / Fz0), pr = Math.max(0.3, gaugePa / (P.nominalPsi * PSI));
      const CFa = P.corneringStiffness * Fz0 * Math.pow(fn, P.corneringLoadExp) * Math.pow(pr, P.corneringPressureExp);
      const CFk = P.longStiffness * Fz0 * Math.pow(fn, P.longLoadExp);
      let aA = 0;
      for (let k = 0; k < NL; k++) aA += L.a[k] * L.A[k];
      const ky = CFa / Math.max(1e-9, aA), kx = CFk / Math.max(1e-9, aA);
      // --- friction / slip kinematics
      const mu0 = Math.max(0.02, (I.mu ?? P.mu) * (I.muScale ?? 1));
      const muK = P.muKineticRatio, vDec = P.muDecayVelocity, muYr = P.muLateralRatio;
      const spin = I.yawRate * P.turnSlipGain + P.camberGain * I.omega * Math.sin(gamma); // (psi_dot + k w sin g)
      const lowV = P.lowSpeedDamping * Math.exp(-Math.abs(Vr0) / P.lowSpeedDampingVel);
      const ux = this.ux, uy = this.uy, tx = this.tmpx, ty = this.tmpy;
      const SX = this.sx || (this.sx = new Float64Array(NL * NX)), SY = this.sy || (this.sy = new Float64Array(NL * NX));
      const XP = this.xp || (this.xp = new Float64Array(NL * NX)), CAP = this.cap || (this.cap = new Float64Array(NL * NX * 2));
      const VS = this.vs || (this.vs = new Float64Array(NL * NX)), PLA = this.pla || (this.pla = new Float64Array(NL * NX));
      let adhA = 0, FyStar = 0;
      // ---- pass 1: advect bristles with the rim-referenced slip velocity and apply friction
      for (let k = 0; k < NL; k++) {
        const Ak = L.A[k], a = L.a[k], base = k * NX;
        if (Ak <= 0 || a <= 1e-5) {
          for (let i = 0; i < NX; i++) { ux[base + i] = 0; uy[base + i] = 0; SX[base + i] = 0; SY[base + i] = 0; this.slide[base + i] = 0; }
          continue;
        }
        const yk = L.y[k], Vr = I.omega * L.r[k];
        const vbx = I.Vx - Vr + spin * yk; // longitudinal base slip velocity (uniform along the lane)
        const vby0 = I.Vy; // lateral base velocity at patch centre (belt motion added implicitly below); varies as -spin*x
        const pMean = Fz / geo.A, dA = Ak / NX;
        for (let i = 0; i < NX; i++) { tx[i] = ux[base + i]; ty[i] = uy[base + i]; }
        const d = (Vr * dt) / a; // normalised advection distance (positive = tread moves rearward)
        for (let i = 0; i < NX; i++) {
          const xi = 1 - (2 * i + 1) / NX, x = xi * a;
          let nx, ny;
          const src = xi + d; // where this material point was one step ago (normalised)
          if (Math.abs(d) < 1e-9) {
            nx = tx[i] - vbx * dt; ny = ty[i] - (vby0 - spin * x) * dt;
          } else if (src >= 1 || src <= -1) {
            // entered through the leading edge during this step: exact accumulation since entry
            const edge = src >= 1 ? 1 : -1, xe = edge * a, tau = (xe - x) / Vr; // >0
            ny = -(vby0 * tau - (spin * (xe * xe - x * x)) / (2 * Vr));
            nx = -vbx * tau;
          } else {
            // Interpolate the previous deflection field at src. Station i sits at index-space
            // fi = (1 - xi) NX/2 - 1/2; the upstream patch edge (fi = -1/2 when rolling forward,
            // fi = NX - 1/2 when rolling backward) carries fresh, undeflected tread.
            const fi = (1 - src) * 0.5 * NX - 0.5;
            let px, py;
            if (fi <= 0) {
              const w = d > 0 ? Math.max(0, 2 * (fi + 0.5)) : 1;
              px = tx[0] * w; py = ty[0] * w;
            } else if (fi >= NX - 1) {
              const w = d < 0 ? Math.max(0, 2 * (NX - 0.5 - fi)) : 1;
              px = tx[NX - 1] * w; py = ty[NX - 1] * w;
            } else {
              const i0 = fi | 0, t = fi - i0;
              px = tx[i0] + (tx[i0 + 1] - tx[i0]) * t;
              py = ty[i0] + (ty[i0 + 1] - ty[i0]) * t;
            }
            const xm = (xi + 0.5 * d) * a;
            nx = px - vbx * dt;
            ny = py - (vby0 - spin * xm) * dt;
          }
          // local pressure (flat pneumatic profile along the lane) and friction envelope
          const x2 = xi * xi, pl = pMean * 1.25 * (1 - x2 * x2) + 1e-6;
          const vbyl = vby0 - spin * x;
          // stress = bristle elasticity + low-speed viscous bristle damping (LuGre sigma1)
          let sx = kx * nx - lowV * vbx, sy = ky * ny - lowV * vbyl;
          const vslide = Math.sqrt(vbx * vbx + vbyl * vbyl);
          const vr_ = vslide / vDec, muv = mu0 * (muK + (1 - muK) * Math.exp(-vr_ * Math.sqrt(vr_)));
          const capX = muv * pl, capY = muv * muYr * pl;
          const qx = sx / capX, qy = sy / capY, r = Math.sqrt(qx * qx + qy * qy);
          let sl = 0;
          if (r > 1) {
            // sliding bristle: stress on the friction envelope, elastic deflection follows it
            sx /= r; sy /= r;
            nx = sx / kx; ny = sy / ky;
            sl = 1;
          } else {
            adhA += dA;
          }
          ux[base + i] = nx;
          uy[base + i] = ny;
          SX[base + i] = sx;
          SY[base + i] = sy;
          XP[base + i] = x;
          CAP[2 * (base + i)] = capX;
          CAP[2 * (base + i) + 1] = capY;
          VS[base + i] = vslide;
          PLA[base + i] = pl;
          this.slide[base + i] = sl;
          FyStar += sy * dA;
        }
      }
      // ---- pass 2: implicit lateral carcass compliance (belt displacement yc relative to rim)
      // The belt is massless: Fy = c*yc in equilibrium, relaxing with time constant tau.
      // Moving the belt by dyc shifts every adhered bristle base: Fy_new = Fy* - K_b*dyc with
      // K_b = ky * adhered area. Solving both together keeps any stiffness ratio stable.
      const cC = P.carcassLateralStiffness, beta = 1 - Math.exp(-dt / P.carcassTau), Kb = ky * adhA;
      const FyNew = (FyStar + Kb * beta * this.yc) / (1 + (Kb * beta) / cC);
      const dyc = beta * (FyNew / cC - this.yc);
      this.yc += dyc;
      o.carcassYM = this.yc;
      let Fx = 0, Fy = 0, Mz = 0, slideA = 0, utilSum = 0, Psl = 0;
      for (let k = 0; k < NL; k++) {
        const Ak = L.A[k];
        if (Ak <= 0 || L.a[k] <= 1e-5) continue;
        const dA = Ak / NX, yk = L.y[k], base = k * NX;
        for (let i = 0; i < NX; i++) {
          const j = base + i;
          let sx = SX[j], sy = SY[j];
          if (!this.slide[j]) {
            uy[j] -= dyc;
            sy -= ky * dyc;
            const capX = CAP[2 * j], capY = CAP[2 * j + 1], qx = sx / capX, qy = sy / capY, r = Math.sqrt(qx * qx + qy * qy);
            if (r > 1) {
              sx /= r; sy /= r;
              ux[j] = sx / kx; uy[j] = sy / ky;
              this.slide[j] = 1;
            }
            utilSum += Math.min(1, r) * PLA[j] * dA;
          } else utilSum += PLA[j] * dA;
          if (this.slide[j]) {
            slideA += dA;
            Psl += Math.sqrt(sx * sx + sy * sy) * dA * VS[j];
          }
          const fx = sx * dA, fy = sy * dA;
          Fx += fx; Fy += fy;
          Mz += yk * fx - XP[j] * fy; // moment about the road normal (left-handed fwd/right/up)
        }
      }
      // Rolling resistance is a moment on the wheel spin from the forward-shifted pressure
      // centroid (not a force at the contact): the host applies it to the wheel, and the brush
      // then produces the matching retarding force as the wheel slows.
      o.rollingResistanceTorqueNm = P.rollingResistance * Fz * Math.max(0.1, I.h) * Math.tanh(Vr0 / 0.4);
      o.Fx = Fx; o.Fy = Fy; o.Mz = Mz;
      o.slidingFraction = slideA / geo.A;
      o.utilization = utilSum / Math.max(1e-9, Fz);
      o.slidingPowerW = Psl;
      o.rollingPowerW = Math.abs(o.rollingResistanceTorqueNm * I.omega);
      o.pneumaticTrailM = Math.abs(Fy) > 5 ? Mz / Fy : 0;
      o.muPeak = mu0;
      this.lastFy = Fy;
      this.lastFz = Fz;
      return o;
    }
    // Static load -> required hub height at camber gamma (bisection on the vertical model)
    hubHeightForLoad(loadN, gamma = 0, pressurePa) {
      let lo = this.g.touchHeight(gamma) - 0.08, hi = this.g.touchHeight(gamma);
      const gauge = pressurePa ?? this.P.nominalPsi * PSI;
      for (let i = 0; i < 60; i++) {
        const mid = 0.5 * (lo + hi), geo = this.geometry(mid, gamma);
        let F = (gauge + this.P.carcassPressurePa) * geo.A;
        if (geo.maxPen > this.P.rimStopDeflectionM) F += this.P.rimStopStiffness * (geo.maxPen - this.P.rimStopDeflectionM);
        if (F > loadN) lo = mid; else hi = mid;
      }
      return 0.5 * (lo + hi);
    }
  }

  const api = { TireGeometry, RealtimeTire, PRESETS, NL, NX, PSI, version: "RTT-1.0" };
  root.LucidRealtimeTire = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
