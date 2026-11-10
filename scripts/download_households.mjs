// 인구총조사 「가구원수별 가구 - 읍면동」 [DT_1JC1502] 최신 연도(2025)를 선택된 행정동에 대해 받는다.
// 인구총조사는 통계청 8자리 행정구역코드(admdongkor 의 adm_cd)를 쓴다. 코드가 없으면 시군구+동 이름으로 찾는다.
// 출력: data/households.json
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectDir } from './vworld.mjs';
import { kosis } from './kosis.mjs';

const DATA = path.join(projectDir, 'data');
const dongs = JSON.parse(await fs.readFile(path.join(DATA, 'dongs.geojson'), 'utf8')).features.filter((f) => f.properties.inside).map((f) => f.properties);
const ITEMS = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T8']; // 계, 1~5인, 6인 이상
const YEAR = '2025';

// 2026년 인천 행정체제 개편으로 코드가 바뀐 동: 2025년 조사 당시(인천 서구) 코드
const CODE_2025 = { '23130630': '23080630', '23130640': '23080640', '23130650': '23080650' };
const c25 = (d) => CODE_2025[d.sgis] ?? d.sgis;

const got = {}, raw = {};
for (let i = 0; i < dongs.length; i += 40) {
  const rows = await kosis({ tblId: 'DT_1JC1502', itmId: ITEMS, objL1: dongs.slice(i, i + 40).map(c25), prdSe: 'Y', startPrdDe: YEAR, endPrdDe: YEAR });
  for (const r of rows) {
    // KOSIS 의 '-' 는 해당 없음(0). 그 밖의 숫자가 아닌 값은 비공개 등으로 보고 null 로 둔다
    const v = r.DT === '-' ? 0 : Number(r.DT);
    if (!Number.isFinite(v)) (raw[r.C1] ??= []).push(`${r.ITM_ID}=${r.DT}`);
    ((got[r.C1] ??= { kosis_name: r.C1_NM })[r.ITM_ID] = Number.isFinite(v) ? v : null);
  }
}
if (Object.keys(raw).length) console.log('숫자가 아닌 값', raw);
const out = {}, missing = [];
for (const d of dongs) {
  const g = got[c25(d)];
  if (!g) { missing.push(`${d.code} ${d.sgis} ${d.full}`); continue; }
  const sizes = ['T1', 'T2', 'T3', 'T4', 'T5', 'T8'].map((k) => g[k]);
  out[d.code] = { sgis: c25(d), kosis_name: g.kosis_name, total: g.T0, sizes, check: sizes.reduce((s, v) => s + v, 0) === g.T0 };
}
console.log('받은 동', Object.keys(out).length, '/', dongs.length, '| 누락', missing, '| 합계 불일치', Object.entries(out).filter(([, o]) => !o.check).map(([c]) => c));
await fs.writeFile(path.join(DATA, 'households.json'), JSON.stringify({
  source: '국가데이터처(통계청) KOSIS, 인구총조사 「가구원수별 가구 - 읍면동」 [DT_1JC1502]',
  url: 'https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1JC1502',
  year: YEAR, sizes: ['1인', '2인', '3인', '4인', '5인', '6인 이상'], unit: '일반가구', dongs: out, missing,
}), 'utf8');
