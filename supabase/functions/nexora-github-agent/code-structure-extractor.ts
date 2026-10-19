export type CodeStructure = {
  file: string;
  language: string;
  exports: string[];
  functions: string[];
  components: string[];
  imports: string[];
};

const unique = (values: string[]) => [...new Set(values)];
const capture = (source: string, pattern: RegExp) =>
  unique([...source.matchAll(pattern)].map(match => match[1]));

export function extractCodeStructure(file: string, content: string): CodeStructure {
  const imports = unique([
    ...capture(content, /\bimport\s*["']([^"']+)["']/g),
    ...capture(content, /\bimport\s+(?:type\s+)?[^;\n]*?\s+from\s+["']([^"']+)["']/g),
    ...capture(content, /\bexport\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g),
    ...capture(content, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
  ]);
  const functions = unique([
    ...capture(content, /\b(?:async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)\s*\(/g),
    ...capture(content, /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g),
  ]);
  const exports = unique([
    ...capture(content, /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)/g),
    ...capture(content, /\bexport\s*\{\s*([A-Za-z_$][\w$]*)/g),
  ]);
  return {
    file,
    language: file.endsWith(".tsx") ? "tsx" : file.endsWith(".ts") ? "typescript"
      : file.endsWith(".jsx") ? "jsx" : file.endsWith(".js") ? "javascript"
      : file.endsWith(".sql") ? "sql" : "unknown",
    exports,
    functions,
    components: functions.filter(name => /^[A-Z]/.test(name)),
    imports,
  };
}
