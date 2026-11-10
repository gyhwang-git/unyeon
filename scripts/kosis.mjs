// KOSIS OpenAPI 공통 함수. 키는 상위 폴더 .env 의 KOSIS_..._KEY (커밋 금지)
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectDir } from './vworld.mjs';

const env = await fs.readFile(path.resolve(projectDir, '..', '.env'), 'utf8');
const key = env.match(/^\s*KOSIS\w*KEY\s*=\s*["']?([^"'\r\n]+)/im)?.[1]?.trim();
if (!key) throw new Error('.env 에 KOSIS 인증키(KOSIS_..._KEY)가 없습니다.');

const join = (v) => (Array.isArray(v) ? v.join('+') + '+' : v);
// params: { tblId, itmId, objL1.., prdSe, startPrdDe/endPrdDe | newEstPrdCnt }
export async function kosis(params) {
  const q = new URLSearchParams({ method: 'getList', apiKey: key, format: 'json', jsonVD: 'Y', orgId: '101' });
  for (const [k, v] of Object.entries(params)) q.set(k, join(v));
  for (let i = 0; i < 4; i++) {
    const r = await fetch('https://kosis.kr/openapi/Param/statisticsParameterData.do?' + q);
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { j = null; }
    if (Array.isArray(j)) return j;
    const msg = JSON.stringify(j ?? t).replaceAll(key, '***').slice(0, 300);
    if (/"err":"30"/.test(msg)) return []; // 데이터 없음
    if (i === 3) throw new Error('KOSIS 오류: ' + msg);
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
  }
}
