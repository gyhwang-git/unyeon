// KOSIS OpenAPI로 선택된 행정동의 5세별·성별 주민등록인구(DT_1B04005N, 최신 월)를 받는다.
// 사용: node scripts/download_population.mjs   (상위 폴더 .env 에 KOSIS_...KEY 필요)
// 출력: data/population.json
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectDir } from './vworld.mjs';

const env = await fs.readFile(path.resolve(projectDir, '..', '.env'), 'utf8');
const key = env.match(/^\s*KOSIS\w*KEY\s*=\s*["']?([^"'\r\n]+)/im)?.[1]?.trim();
if (!key) throw new Error('.env 에 KOSIS 인증키(KOSIS_..._KEY)가 없습니다.');

const DATA = path.join(projectDir, 'data');
const dongs = JSON.parse(await fs.readFile(path.join(DATA, 'dongs.geojson'), 'utf8'));
const target = dongs.features.filter((f) => f.properties.inside).map((f) => f.properties);
const AGES = ['5', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55', '60', '65', '70', '75', '80', '85', '90', '95', '100', '105'];

async function get(codes) {
  const q = new URLSearchParams({ method: 'getList', apiKey: key, itmId: 'T2+T3+T4+', objL1: codes.join('+') + '+', objL2: ['0', ...AGES].join('+') + '+', format: 'json', jsonVD: 'Y', prdSe: 'M', newEstPrdCnt: '1', orgId: '101', tblId: 'DT_1B04005N' });
  const r = await fetch('https://kosis.kr/openapi/Param/statisticsParameterData.do?' + q);
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { throw new Error('KOSIS 응답 해석 실패: ' + t.replaceAll(key, '***').slice(0, 300)); }
  if (!Array.isArray(j)) throw new Error('KOSIS 오류: ' + JSON.stringify(j).replaceAll(key, '***').slice(0, 300));
  return j;
}

const out = {}; let period = null;
for (let i = 0; i < target.length; i += 25) {
  const batch = target.slice(i, i + 25);
  const rows = await get(batch.map((d) => d.code));
  for (const r of rows) {
    period ??= r.PRD_DE;
    const o = (out[r.C1] ??= { kosis_name: r.C1_NM, total: {}, m: Array(21).fill(null), f: Array(21).fill(null) });
    const v = Number(r.DT);
    if (r.C2 === '0') o.total[r.ITM_ID] = v;
    else { const k = AGES.indexOf(r.C2); if (r.ITM_ID === 'T3') o.m[k] = v; if (r.ITM_ID === 'T4') o.f[k] = v; }
  }
  console.log(`${Math.min(i + 25, target.length)}/${target.length} 행정동 조회`);
}

// 검증: 누락 동, 연령 합계 = 계
const missing = target.filter((d) => !out[d.code]);
const bad = Object.entries(out).filter(([, o]) => o.m.reduce((s, v) => s + v, 0) !== o.total.T3 || o.f.reduce((s, v) => s + v, 0) !== o.total.T4 || o.total.T3 + o.total.T4 !== o.total.T2);
const nameMismatch = target.filter((d) => out[d.code] && out[d.code].kosis_name !== d.name).map((d) => `${d.code} 경계:${d.name} / KOSIS:${out[d.code].kosis_name}`);
console.log('기준 시점', period, '| 받은 동', Object.keys(out).length, '| 누락', missing.map((d) => d.code + ' ' + d.full), '| 합계 불일치', bad.map(([c]) => c), '| 이름 차이', nameMismatch);

await fs.writeFile(path.join(DATA, 'population.json'), JSON.stringify({
  source: '국가데이터처(통계청) KOSIS, 주민등록인구현황 「행정구역(읍면동)별/5세별 주민등록인구(2011년~)」 [DT_1B04005N]',
  url: 'https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1B04005N',
  period, ages: ['0–4', '5–9', '10–14', '15–19', '20–24', '25–29', '30–34', '35–39', '40–44', '45–49', '50–54', '55–59', '60–64', '65–69', '70–74', '75–79', '80–84', '85–89', '90–94', '95–99', '100+'],
  dongs: out,
}), 'utf8');
