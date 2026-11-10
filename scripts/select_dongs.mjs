// 1) 브이월드 검색 API로 운연역 좌표를 찾고
// 2) 행정동 경계(vuski/admdongkor, 통계청 행정구역 경계 기반) 중 중심점이 반경 10km 안인 행정동을 고른다.
// 출력: data/station.json, data/dongs.geojson (선택된 행정동, 거리·면적 포함)
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectDir, loadKey } from './vworld.mjs';

const RADIUS_KM = 10;
const DATA = path.join(projectDir, 'data');
const key = await loadKey();

// ── 운연역 좌표 (브이월드 검색 API, 장소 검색)
const q = new URLSearchParams({ service: 'search', request: 'search', version: '2.0', crs: 'EPSG:4326', size: '10', page: '1', query: '운연역', type: 'place', format: 'json', errorformat: 'json', key, domain: 'localhost' });
const sr = await (await fetch('https://api.vworld.kr/req/search?' + q)).json();
const items = sr?.response?.result?.items ?? [];
console.log('검색 결과:', items.map((i) => `${i.title} | ${i.category} | ${i.address?.road || i.address?.parcel} | ${i.point.x},${i.point.y}`).join('\n  '));
const st = items.find((i) => /운연역/.test(i.title) && /지하철|역|철도|교통/.test(i.category || '')) || items.find((i) => /운연역/.test(i.title));
if (!st) throw new Error('운연역을 찾지 못했습니다');
const station = { name: '운연역', title: st.title, category: st.category, address: st.address, lon: Number(st.point.x), lat: Number(st.point.y), source: '브이월드 검색 API (장소)' };
await fs.writeFile(path.join(DATA, 'station.json'), JSON.stringify(station, null, 1), 'utf8');
console.log('운연역:', station.lon, station.lat, station.title);

// ── 행정동 경계
const DONG_URL = 'https://raw.githubusercontent.com/vuski/admdongkor/master/ver20261001/HangJeongDong_ver20261001.geojson';
const cache = path.join(DATA, 'raw_admdong.geojson');
let all = JSON.parse(await fs.readFile(cache, 'utf8').catch(() => 'null'));
if (!all) { console.log('행정동 경계 내려받는 중…'); all = await (await fetch(DONG_URL)).json(); await fs.writeFile(cache, JSON.stringify(all), 'utf8'); }

const R = 6371.0088, rad = Math.PI / 180;
const dist = (lon, lat) => { const dφ = (lat - station.lat) * rad, dλ = (lon - station.lon) * rad; const a = Math.sin(dφ / 2) ** 2 + Math.cos(station.lat * rad) * Math.cos(lat * rad) * Math.sin(dλ / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); };
const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
// 넓이 가중 중심점 + 넓이(㎢, 국지 평면 근사)
function centroidArea(g) {
  const kx = 111.32 * Math.cos(station.lat * rad), ky = 110.57;
  let A2 = 0, X = 0, Y = 0;
  for (const p of polys(g)) for (let ri = 0; ri < p.length; ri++) {
    const r = p[ri]; let a = 0, x = 0, y = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += f; x += (r[j][0] + r[i][0]) * f; y += (r[j][1] + r[i][1]) * f; }
    const sgn = (ri === 0 ? 1 : -1) * Math.sign(a); // 외곽 +, 구멍 −
    A2 += sgn * a / 2; X += sgn * x / 6; Y += sgn * y / 6;
  }
  return { lon: X / A2, lat: Y / A2, km2: Math.abs(A2) * kx * ky };
}
// 경계가 원과 겹치는지(꼭짓점 중 하나라도 반경 안)
const touches = (g) => polys(g).some((p) => p[0].some(([x, y]) => dist(x, y) <= RADIUS_KM));

const sel = [];
for (const f of all.features) {
  const g = f.geometry; if (!g) continue;
  const c = centroidArea(g), d = dist(c.lon, c.lat);
  if (d > RADIUS_KM + 5) continue;
  const inside = d <= RADIUS_KM;
  if (!inside && !touches(g)) continue;
  const [sido, sgg, ...rest] = f.properties.adm_nm.split(' ');
  sel.push({ type: 'Feature', properties: { code: f.properties.adm_cd2, sgis: f.properties.adm_cd, sido, sgg: rest.length > 1 ? `${sgg} ${rest[0]}` : sgg, name: rest.at(-1), full: f.properties.adm_nm, dist_km: Math.round(d * 100) / 100, area_km2: Math.round(c.km2 * 100) / 100, clon: Math.round(c.lon * 1e5) / 1e5, clat: Math.round(c.lat * 1e5) / 1e5, inside }, geometry: g });
}
sel.sort((a, b) => a.properties.dist_km - b.properties.dist_km);
await fs.writeFile(path.join(DATA, 'dongs.geojson'), JSON.stringify({ type: 'FeatureCollection', source: '행정동 경계: vuski/admdongkor ver20261001 (통계청 행정구역 경계 기반)', station, radius_km: RADIUS_KM, features: sel }), 'utf8');

const inn = sel.filter((f) => f.properties.inside);
const bySgg = {}; for (const f of inn) { const k = f.properties.sido.slice(0, 2) + ' ' + f.properties.sgg; bySgg[k] = (bySgg[k] || 0) + 1; }
console.log(`중심점 10km 이내 ${inn.length}개 행정동, 경계만 걸친 행정동 ${sel.length - inn.length}개`);
console.log(bySgg);
console.log('코드 예시', inn.slice(0, 5).map((f) => f.properties.code + ' ' + f.properties.full + ' ' + f.properties.dist_km + 'km'));
