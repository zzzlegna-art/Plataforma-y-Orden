import fs from 'node:fs';

const requiredFiles = ['package.json','pnpm-lock.yaml','vite.config.ts','vercel.json','index.html','src/integrations/supabase/client.ts','public/manifest.webmanifest','public/sw.js'];
const errors = requiredFiles.filter(file => !fs.existsSync(file)).map(file => `Archivo ausente: ${file}`);
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));
if (!pkg.scripts?.build) errors.push('Falta script build');
if (!Array.isArray(vercel.rewrites) || !vercel.rewrites.some(rule => rule.destination === '/index.html')) errors.push('Falta fallback SPA');
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (process.env.CHECK_DEPLOY_ENV === '1') {
  if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) errors.push('VITE_SUPABASE_URL inválida');
  if (!key || key.includes('TU_') || key.length < 20) errors.push('Falta clave pública de Supabase');
}
if (errors.length) { console.error('Verificación fallida:\n' + errors.map(e => '- ' + e).join('\n')); process.exit(1); }
console.log('Estructura de despliegue OK.' + (process.env.CHECK_DEPLOY_ENV === '1' ? ' Variables públicas presentes.' : ' Variables de entorno no comprobadas.'));
