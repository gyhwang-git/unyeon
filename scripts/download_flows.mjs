// 2025년 국내인구이동통계
//  (1) 「시군구/전입사유별 이동자수」 [DT_1B26B21] — 반경에 걸친 시군구의 사유별 전입·전출·순이동
//  (2) 「전출지/전입지(시군구)/성별 이동자수」 [DT_1B26003_A02] — 이 시군구들에서 나가고 들어온 시군구 간 이동(전국 상대지역)
// 출력: data/flows.json
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectDir } from './vworld.mjs';
import { kosis } from './kosis.mjs';

const DATA = path.join(projectDir, 'data');
const YEAR = '2025';
const mig = JSON.parse(await fs.readFile(path.join(DATA, 'migration.json'), 'utf8'));
const SGG = Object.values(mig.sgg).filter((s) => !s.missing).map((s) => ({ key: Object.keys(mig.sgg).find((k) => mig.sgg[k] === s), code: s.code, name: s.name }));
const codes = SGG.map((s) => s.code);
const REASONS = [['15', '직업'], ['20', '가족'], ['25', '주택'], ['30', '교육'], ['35', '주거환경'], ['40', '자연환경'], ['45', '기타']];

// (1) 전입사유
const rr = await kosis({ tblId: 'DT_1B26B21', itmId: ['T10', 'T20', 'T25'], objL1: codes, objL2: ['00', ...REASONS.map((r) => r[0])], prdSe: 'Y', startPrdDe: YEAR, endPrdDe: YEAR });
const reasons = {};
for (const s of SGG) {
  const g = (itm, rs) => Number(rr.find((r) => r.C1 === s.code && r.ITM_ID === itm && r.C2 === rs)?.DT ?? NaN);
  const o = { total: { in: g('T10', '00'), out: g('T20', '00'), net: g('T25', '00') }, in: REASONS.map(([c]) => g('T10', c)), out: REASONS.map(([c]) => g('T20', c)), net: REASONS.map(([c]) => g('T25', c)) };
  o.check = o.in.reduce((a, b) => a + b, 0) === o.total.in && o.out.reduce((a, b) => a + b, 0) === o.total.out && o.total.in === mig.sgg[s.key].total.in;
  reasons[s.key] = o;
}
console.log('사유', Object.entries(reasons).map(([k, o]) => `${k} 검증 ${o.check}`).join(' | '));

// (2) 시군구 간 이동: 이 시군구들 → 전국, 전국 → 이 시군구들
const outRows = await kosis({ tblId: 'DT_1B26003_A02', itmId: ['T70'], objL1: codes, objL2: 'ALL', objL3: ['0'], prdSe: 'Y', startPrdDe: YEAR, endPrdDe: YEAR });
const inRows = await kosis({ tblId: 'DT_1B26003_A02', itmId: ['T70'], objL1: 'ALL', objL2: codes, objL3: ['0'], prdSe: 'Y', startPrdDe: YEAR, endPrdDe: YEAR });
const names = {};
for (const r of [...outRows, ...inRows]) { names[r.C1] = r.C1_NM; names[r.C2] = r.C2_NM; }
// 상대 지역은 시군구(5자리, 끝자리 0이 아닌 '구' 포함)만. 시도(2자리)·전국은 뺀다.
const isSgg = (c) => /^\d{5}$/.test(c);
const flows = [];
for (const r of outRows) if (isSgg(r.C2) && r.C1 !== r.C2) flows.push({ from: r.C1, to: r.C2, n: Number(r.DT) });
for (const r of inRows) if (isSgg(r.C1) && r.C1 !== r.C2 && !codes.includes(r.C1)) flows.push({ from: r.C1, to: r.C2, n: Number(r.DT) });
// 같은 쌍이 두 번 들어간 경우(우리 시군구끼리) 정리
const seen = new Set(), F = [];
for (const f of flows) { const k = f.from + '>' + f.to; if (!seen.has(k) && Number.isFinite(f.n) && f.n > 0) { seen.add(k); F.push(f); } }
// 상위·하위 코드가 함께 나오는지(예: 수원시 41110 과 장안구 41111) 확인
const parents = [...new Set(F.flatMap((f) => [f.from, f.to]))].filter((c) => c.endsWith('0') && F.some((f) => [f.from, f.to].some((x) => x !== c && x.slice(0, 4) === c.slice(0, 4))));
console.log('흐름', F.length, '| 상위·하위 코드가 같이 있는 시', parents.map((c) => c + names[c]));
// 각 시군구의 총전출·총전입과 비교(상대지역 합 ≤ 총계)
for (const s of SGG) {
  const o = F.filter((f) => f.from === s.code).reduce((a, f) => a + f.n, 0), i = F.filter((f) => f.to === s.code).reduce((a, f) => a + f.n, 0);
  console.log(s.name, '전출 상대지역 합', o, '/ 총전출', mig.sgg[s.key].total.out, '| 전입 상대지역 합', i, '/ 총전입', mig.sgg[s.key].total.in);
}
await fs.writeFile(path.join(DATA, 'flows.json'), JSON.stringify({
  reasonSource: '국가데이터처(통계청) KOSIS, 국내인구이동통계 「시군구/전입사유별 이동자수」 [DT_1B26B21]',
  reasonUrl: 'https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1B26B21',
  odSource: '국가데이터처(통계청) KOSIS, 국내인구이동통계 「전출지/전입지(시군구)/성별 이동자수」 [DT_1B26003_A02]',
  odUrl: 'https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1B26003_A02',
  year: YEAR, reasonNames: REASONS.map((r) => r[1]), reasons, sgg: SGG, names, flows: F,
}), 'utf8');
