// 브이월드 데이터 API 공통 함수. 키는 상위 폴더 .env 의 V-WORLD_KEY 에서 읽는다(저장소에 커밋하지 않음).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function loadKey() {
  for (const p of [path.join(projectDir, '.env'), path.resolve(projectDir, '..', '.env')]) {
    const env = await fs.readFile(p, 'utf8').catch(() => '');
    const key = env.match(/^\s*V-WORLD_KEY\s*=\s*["']?([^"'\r\n]+)/m)?.[1]?.trim();
    if (key) return key;
  }
  throw new Error('.env 에 V-WORLD_KEY 가 없습니다.');
}

const key = await loadKey();

// 브이월드 GetFeature 호출. 결과 feature 배열을 돌려준다.
export async function getFeatures(params) {
  const q = new URLSearchParams({ service: 'data', version: '2.0', request: 'GetFeature', format: 'json', key, domain: 'localhost', geometry: 'true', attribute: 'true', crs: 'EPSG:4326', ...params });
  for (let i = 0; i < 8; i++) {
    try {
      const r = await fetch('https://api.vworld.kr/req/data?' + q);
      const b = await r.json();
      const st = b?.response?.status;
      if (st === 'OK') return b.response.result.featureCollection.features || [];
      if (st === 'NOT_FOUND') return [];
      const err = new Error(b?.response?.error?.code + ' ' + b?.response?.error?.text);
      if (b?.response?.error?.code === 'INVALID_KEY') { err.fatal = true; throw err; }
      throw err;
    } catch (e) {
      if (e.fatal || i === 7) throw e;
      console.log(`  재시도 ${i + 1}: ${e.cause?.code || e.message}`);
      await new Promise((res) => setTimeout(res, Math.min(30000, 1500 * 2 ** i)));
    }
  }
}
