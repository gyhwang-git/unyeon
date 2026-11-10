// 국내인구이동통계 「시군구/성/연령(5세)별 이동자수」 [DT_1B26001] 2025년 연간 — 반경에 걸친 시군구.
// 읍면동 단위 연령별 이동 통계는 KOSIS에 없으므로 시군구 전체 값이다. 부천시는 구별 자료가 없어 시 전체.
// 출력: data/migration.json
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectDir } from './vworld.mjs';
import { kosis } from './kosis.mjs';

const DATA = path.join(projectDir, 'data');
const YEAR = '2025';
// 반경 안 행정동의 시군구 → 이동통계 시군구 코드
const SGG = [
  { key: '인천 남동구', code: '28200', name: '인천 남동구' },
  { key: '인천 부평구', code: '28237', name: '인천 부평구' },
  { key: '인천 미추홀구', code: '28177', name: '인천 미추홀구' },
  { key: '인천 연수구', code: '28185', name: '인천 연수구' },
  { key: '인천 서해구', code: '28275', name: '인천 서해구' },
  { key: '경기 시흥시', code: '41390', name: '경기 시흥시' },
  { key: '경기 부천시', code: '41190', name: '경기 부천시', note: '부천시 3개 구(원미·소사·오정)는 구별 이동 자료가 없어 시 전체' },
  { key: '경기 광명시', code: '41210', name: '경기 광명시' },
  { key: '서울 구로구', code: '11530', name: '서울 구로구' },
];
const AGES = ['020', '050', '070', '100', '120', '130', '150', '160', '180', '190', '210', '230', '260', '280', '310', '330', '340'];
const AGE_LAB = ['0–4', '5–9', '10–14', '15–19', '20–24', '25–29', '30–34', '35–39', '40–44', '45–49', '50–54', '55–59', '60–64', '65–69', '70–74', '75–79', '80+'];

const rows = await kosis({ tblId: 'DT_1B26001', itmId: ['T10', 'T20', 'T25'], objL1: SGG.map((s) => s.code), objL2: ['0'], objL3: ['000', ...AGES], prdSe: 'Y', startPrdDe: YEAR, endPrdDe: YEAR });
if (!rows.length) throw new Error('이동 자료가 비었습니다');
console.log('성별 코드 예시', [...new Set(rows.map((r) => r.C2 + ':' + r.C2_NM))]);
const out = {};
for (const s of SGG) {
  const rs = rows.filter((r) => r.C1 === s.code);
  if (!rs.length) { out[s.key] = { ...s, missing: true }; continue; }
  const pick = (itm, age) => { const r = rs.find((x) => x.ITM_ID === itm && x.C3 === age); return r ? Number(r.DT) : null; };
  out[s.key] = {
    ...s, kosis_name: rs[0].C1_NM,
    total: { in: pick('T10', '000'), out: pick('T20', '000'), net: pick('T25', '000') },
    in: AGES.map((a) => pick('T10', a)), out: AGES.map((a) => pick('T20', a)), net: AGES.map((a) => pick('T25', a)),
  };
  const o = out[s.key];
  o.check = o.in.reduce((x, y) => x + y, 0) === o.total.in && o.out.reduce((x, y) => x + y, 0) === o.total.out && o.total.in - o.total.out === o.total.net;
}
console.log(Object.values(out).map((o) => `${o.name} ${o.missing ? '자료 없음' : `전입 ${o.total.in} 전출 ${o.total.out} 순이동 ${o.total.net} 검증 ${o.check}`}`).join('\n'));
await fs.writeFile(path.join(DATA, 'migration.json'), JSON.stringify({
  source: '국가데이터처(통계청) KOSIS, 국내인구이동통계 「시군구/성/연령(5세)별 이동자수」 [DT_1B26001]',
  url: 'https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1B26001',
  year: YEAR, ages: AGE_LAB, sgg: out,
}), 'utf8');
