import fs from 'node:fs';

const requiredFiles = ['package.json','pnpm-lock.yaml','vite.config.ts','vercel.json','index.html','.env.example','public/manifest.webmanifest','public/icons/icon.svg','public/icons/icon-192.png','public/icons/apple-touch-icon.png','src/integrations/supabase/client.ts'];
const errors = requiredFiles.filter(file => !fs.existsSync(file)).map(file => `Archivo ausente: ${file}`);
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));
const manifest = JSON.parse(fs.readFileSync('public/manifest.webmanifest','utf8'));
if (manifest.name !== 'Nexora' || manifest.short_name !== 'Nexora') errors.push('El manifiesto instalable debe identificar la app como Nexora');
if (!Array.isArray(manifest.icons) || !manifest.icons.some(icon => icon.src === "/icons/icon.svg") || !manifest.icons.some(icon => icon.src === "/icons/icon-192.png")) errors.push('El manifiesto debe incluir los iconos actuales de Nexora');
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
