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

// ── 시군구 간 이동(화살표)용 상대 지역 위치: 행정동 중심점 평균
const fl = await read('flows.json');
const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const ringC = (g) => { const r = polys(g).sort((a, b) => b[0].length - a[0].length)[0][0]; return [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length]; };
const acc = {};
for (const f of raw.features) {
  if (!f.geometry) continue;
  const c5 = String(f.properties.adm_cd2).slice(0, 5), c = ringC(f.geometry);
  for (const k of [c5, c5.slice(0, 4) + '0']) { (acc[k] ??= []).push(c); }
}
// 2025년 자료의 옛 인천 구 → 2026년 개편 뒤 구역(위치만 근사)
const LEGACY = { '28110': ['28125', '28155'], '28140': ['28125'], '28260': ['28260', '28275', '28290'] };
// 광주·전남(29·46) 코드가 2026년 통합으로 12로 바뀐 경우: 새 코드 체계에서 시군구 이름으로 찾는다
const byName = {};
for (const f of raw.features) {
  if (!f.geometry) continue;
  const parts = f.properties.adm_nm.split(' '), c5 = String(f.properties.adm_cd2).slice(0, 5);
  if (c5.startsWith('12')) (byName[parts[1]] ??= []).push(ringC(f.geometry));
}
const centroidOf = (code) => {
  let pts = (LEGACY[code] ?? [code]).flatMap((k) => acc[k] ?? []);
  if (!pts.length && /^(29|46)/.test(code)) {
    const nm = fl.names[code].replace(/\s+/g, '');
    pts = byName[code.startsWith('29') ? '광주' + nm : nm] ?? byName[nm] ?? [];
  }
  return pts.length ? [Math.round(pts.reduce((s, p) => s + p[0], 0) / pts.length * 1e4) / 1e4, Math.round(pts.reduce((s, p) => s + p[1], 0) / pts.length * 1e4) / 1e4] : null;
};
const codeKey = Object.fromEntries(fl.sgg.map((s) => [s.code, s.key]));
const partnerCodes = [...new Set(fl.flows.flatMap((f) => [f.from, f.to]))];
const places = {}, noPos = [];
// 이름: 시도 + 시군구 (서구·동구처럼 여러 시도에 같은 이름이 있음). 2025년 자료의 옛 인천 구는 '(개편 전)'
const SIDO = { 11: '서울', 26: '부산', 27: '대구', 28: '인천', 29: '광주', 30: '대전', 31: '울산', 36: '세종', 41: '경기', 42: '강원', 43: '충북', 44: '충남', 45: '전북', 46: '전남', 47: '경북', 48: '경남', 50: '제주', 51: '강원', 52: '전북' };
const nameOf = (c) => `${SIDO[c.slice(0, 2)] ?? ''} ${fl.names[c].replace(/\s+/g, '')}${LEGACY[c] ? '(개편 전)' : ''}`.trim();
for (const c of partnerCodes) { const xy = centroidOf(c); if (xy) places[c] = { n: nameOf(c), xy, k: codeKey[c] || null }; else noPos.push(c + fl.names[c]); }
console.log('위치 못 찾은 상대지역', noPos);

const js = `// 자동 생성: node scripts/build_data.mjs\nwindow.UNYEON = ${JSON.stringify({
  flows: { reasonSource: fl.reasonSource, reasonUrl: fl.reasonUrl, odSource: fl.odSource, odUrl: fl.odUrl, year: fl.year, reasonNames: fl.reasonNames, reasons: fl.reasons, codeKey, places, od: fl.flows.filter((f) => places[f.from] && places[f.to]).map((f) => [f.from, f.to, f.n]) },
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
