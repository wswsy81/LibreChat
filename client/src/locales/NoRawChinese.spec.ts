import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const SOURCE_ROOT = path.resolve(__dirname, '..');
const HAN = /\p{Script=Han}/u;

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(absolute) : [absolute];
  });
}

function excluded(file: string) {
  const relative = path.relative(SOURCE_ROOT, file).split(path.sep).join('/');
  return (
    !/\.[jt]sx?$/u.test(relative) ||
    /\.(?:spec|test)\.[jt]sx?$/u.test(relative) ||
    relative.startsWith('locales/') ||
    relative.includes('/admin/') ||
    relative === 'features/life-design/routes/AdminRoute.tsx' ||
    relative.endsWith('/BasicsForm.tsx')
  );
}

function rawChinese(file: string) {
  const source = fs.readFileSync(file, 'utf8');
  const scriptKind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const hits: string[] = [];

  const visit = (node: ts.Node) => {
    let value = '';
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      value = node.text;
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      value = node.text;
    } else if (ts.isJsxText(node)) {
      value = node.text.trim();
    }

    if (value && HAN.test(value)) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      hits.push(
        `${path.relative(SOURCE_ROOT, file)}:${position.line + 1} ${JSON.stringify(value)}`,
      );
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return hits;
}

test('client/src 用户可见文案不得新增裸中文，必须进入 translation／CopyPanel 热轨', () => {
  const hits = sourceFiles(SOURCE_ROOT)
    .filter((file) => !excluded(file))
    .flatMap(rawChinese);

  expect(hits).toEqual([]);
});
