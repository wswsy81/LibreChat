import { readFileSync } from 'node:fs';

const kind = process.argv[2];
if (!['runtime', 'security_contract', 'product_catalog'].includes(kind)) {
  process.stderr.write('kind 必须是 runtime、security_contract 或 product_catalog\n');
  process.exit(2);
}
const source = readFileSync(0, 'utf8');
let document;
try {
  document = JSON.parse(source);
} catch (error) {
  process.stderr.write(`配置 JSON 无效: ${error.message}\n`);
  process.exit(2);
}
process.stdout.write(JSON.stringify({ kind, document }));
