import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { defaultSounding } from "../src/sim/thermo";

const g = new Grid3D({ nx: 48, ny: 48, nz: 32, zTop: 12000 });
const s = new FluidSolver(g);
s.rebuild(g, defaultSounding(12000, 33), { bubbleStrength: 3 });
s.setRadiation({
  enabled: true,
  latitudeDeg: 35,
  month: 6,
  solarHour: 12,
  diurnalSpeed: 15,
});

const rows: Record<string, number>[] = [];
const nCells = g.n;
for (let n = 0; n <= 300; n++) {
  if (n % 30 === 0 || n === 300) {
    const st = s.cloudRainStats();
    let maxW = 0;
    let cloudy = 0;
    for (let i = 0; i < s.fields.w.length; i++) {
      if (Math.abs(s.fields.w[i]) > maxW) maxW = Math.abs(s.fields.w[i]);
      if (s.fields.qc[i] > 1e-4) cloudy++;
    }
    rows.push({
      t: Number(s.time.toFixed(0)),
      qc: Number(st.cloudMax.toExponential(3)),
      mass: Number(st.cloudMass.toFixed(3)),
      cloudyPct: Number(((100 * cloudy) / nCells).toFixed(2)),
      maxW: Number(maxW.toFixed(1)),
    });
  }
  if (n < 300) s.step(1);
}

console.log(JSON.stringify(rows, null, 2));
