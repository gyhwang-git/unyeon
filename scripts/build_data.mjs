// data/*.json·geojson → 지도용 data/unyeon_data.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (f) => JSON.parse(await fs.readFile(path.join(projectDir, 'data', f), 'utf8'));
const dongs = await read('dongs.geojson');
const pop = await read('population.json');
const hh = await read('households.json');
const mig = await read('migration.json');
const raw = await read('raw_admdong.geojson');
const r4 = (g) => JSON.parse(JSON.stringify(g), (k, v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v));
const r5 = (g) => JSON.parse(JSON.stringify(g), (k, v) => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v));

// 행정동 → 이동통계 시군구 키 (부천 3개 구는 부천시 하나)
const sido2 = (s) => s.replace(/(특별시|광역시|특별자치도|도)$/, '');
const migKey = (sido, sgg) => `${sido2(sido)} ${sgg.replace(/^부천시\S+구$/, '부천시')}`;

const features = dongs.features.filter((f) => f.properties.inside).map((f) => {
  const p = f.properties, o = pop.dongs[p.code], h = hh.dongs[p.code];
  return {
    type: 'Feature',
    properties: { code: p.code, name: p.name, sido: p.sido, sgg: p.sgg, mk: migKey(p.sido, p.sgg), dist: p.dist_km, area: p.area_km2, c: [p.clon, p.clat], t: o.total.T2, tm: o.total.T3, tf: o.total.T4, m: o.m, f: o.f, hh: h ? h.total : null, hs: h ? h.sizes : null },
    geometry: r5(f.geometry),
  };
});

// 시군구 전체 영역(이동통계 단위) — 해당 시군구의 모든 행정동 폴리곤
const keys = Object.keys(mig.sgg);
const sggFeatures = [];
for (const f of raw.features) {
  const [sido, sgg, ...rest] = f.properties.adm_nm.split(' ');
  const k = migKey(sido, rest.length > 1 ? `${sgg} ${rest[0]}` : sgg);
  if (keys.includes(k)) sggFeatures.push({ type: 'Feature', properties: { k }, geometry: r4(f.geometry) });
}

const js = `// 자동 생성: node scripts/build_data.mjs\nwindow.UNYEON = ${JSON.stringify({
  station: dongs.station, radius_km: dongs.radius_km,
  boundarySource: dongs.source, popSource: pop.source, popUrl: pop.url, period: pop.period, ages: pop.ages,
  hh: { source: hh.source, url: hh.url, year: hh.year, sizes: hh.sizes },
  mig: { source: mig.source, url: mig.url, year: mig.year, ages: mig.ages, sgg: mig.sgg },
  excluded: dongs.features.filter((f) => !f.properties.inside).length,
  dongs: { type: 'FeatureCollection', features },
  sggAreas: { type: 'FeatureCollection', features: sggFeatures },
})};\n`;
await fs.writeFile(path.join(projectDir, 'data', 'unyeon_data.js'), js, 'utf8');
console.log('data/unyeon_data.js', (js.length / 1e6).toFixed(2) + 'MB', features.length + '개 동', sggFeatures.length + '개 시군구 내 행정동 폴리곤', 'mig keys', keys.join(','));
console.log('이동 키 없는 동', [...new Set(features.map((f) => f.properties.mk))].filter((k) => !keys.includes(k)));
