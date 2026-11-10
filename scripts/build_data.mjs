// data/dongs.geojson + data/population.json → 지도용 data/unyeon_data.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (f) => JSON.parse(await fs.readFile(path.join(projectDir, 'data', f), 'utf8'));
const dongs = await read('dongs.geojson');
const pop = await read('population.json');
const r5 = (g) => JSON.parse(JSON.stringify(g), (k, v) => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v));

const features = dongs.features.filter((f) => f.properties.inside).map((f) => {
  const p = f.properties, o = pop.dongs[p.code];
  return {
    type: 'Feature',
    properties: { code: p.code, name: p.name, sido: p.sido, sgg: p.sgg, dist: p.dist_km, area: p.area_km2, c: [p.clon, p.clat], t: o.total.T2, tm: o.total.T3, tf: o.total.T4, m: o.m, f: o.f },
    geometry: r5(f.geometry),
  };
});
const js = `// 자동 생성: node scripts/build_data.mjs\nwindow.UNYEON = ${JSON.stringify({
  station: dongs.station, radius_km: dongs.radius_km,
  boundarySource: dongs.source, popSource: pop.source, popUrl: pop.url, period: pop.period, ages: pop.ages,
  excluded: dongs.features.filter((f) => !f.properties.inside).length,
  dongs: { type: 'FeatureCollection', features },
})};\n`;
await fs.writeFile(path.join(projectDir, 'data', 'unyeon_data.js'), js, 'utf8');
console.log('data/unyeon_data.js', (js.length / 1e6).toFixed(2) + 'MB', features.length + '개 동');
