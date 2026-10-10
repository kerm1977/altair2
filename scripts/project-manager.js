const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const THIS_DIR = path.resolve(__dirname, '..');
const MASTER = path.join(THIS_DIR, 'config', 'master.json');
const TEMPLATE_ROOT = fs.existsSync(MASTER)
  ? JSON.parse(fs.readFileSync(MASTER, 'utf8')).templateRoot
  : THIS_DIR;

const PROJECTS_DIR = path.join(TEMPLATE_ROOT, '..', 'projects');
const SDK_ROOT = path.join(TEMPLATE_ROOT, 'tools', 'sdk');
const EXCLUDE = ['.git', 'node_modules', 'tools', 'apks', 'projects', '.temp', 'test-rl.js', 'test-rl2.js', 'test-rl3.js', 'test-rl2-input.txt', 'pm-test.txt'];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

function slugify(n) { return n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'app'; }
function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function allowed(src) { return !EXCLUDE.includes(path.basename(src)); }
function writeJson(f, d) { fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n', 'utf8'); }

function copyTemplate(dest) {
  fs.cpSync(TEMPLATE_ROOT, dest, { recursive: true, filter: (src) => allowed(src) });
}

function applyConfig(projectDir, cfg) {
  const capFile = path.join(projectDir, 'capacitor.config.json');
  if (fs.existsSync(capFile)) {
    const cap = JSON.parse(fs.readFileSync(capFile, 'utf8'));
    cap.appName = cfg.appName; cap.appId = cfg.appId; cap.webDir = 'www';
    writeJson(capFile, cap);
  }
  const pkgFile = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgFile)) {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    pkg.name = cfg.slug; writeJson(pkgFile, pkg);
  }
  const apiFiles = [
    path.join(projectDir, 'www', 'js', 'api_db.js'),
    path.join(projectDir, 'www', 'api_db.js'),
    path.join(projectDir, 'api_db.js')
  ];
  apiFiles.forEach((f) => {
    if (fs.existsSync(f)) {
      let t = fs.readFileSync(f, 'utf8');
      t = t.replace(/const API_URL = ".*";/, `const API_URL = "${cfg.apiUrl}";`);
      fs.writeFileSync(f, t, 'utf8');
    }
  });
  ensureDir(path.join(projectDir, 'config'));
  writeJson(path.join(projectDir, 'config', 'template.json'), cfg);
  writeJson(path.join(projectDir, 'config', 'master.json'), { templateRoot: TEMPLATE_ROOT });
  const setenv = path.join(projectDir, 'scripts', 'setenv.bat');
  if (fs.existsSync(setenv)) {
    let t = fs.readFileSync(setenv, 'utf8');
    t = t.replace('set "SDK_ROOT=%~dp0..\\tools\\sdk"', `set "SDK_ROOT=${cfg.sdkRoot}"`);
    fs.writeFileSync(setenv, t, 'utf8');
  }
}

function createProject(name, appId, apiUrl, installDeps = false) {
  if (!name.trim()) { console.log('Nombre obligatorio'); return; }
  const slug = slugify(name);
  const defaultId = `com.${slug}.app`;
  appId = appId || defaultId;
  apiUrl = apiUrl || `https://kenth1977.pythonanywhere.com/api/${name.replace(/\s+/g, '')}`;
  const dest = path.join(PROJECTS_DIR, slug);
  if (fs.existsSync(dest)) { console.log('Ese proyecto ya existe.'); return; }

  ensureDir(PROJECTS_DIR);
  console.log(`Creando proyecto "${name}" desde plantilla maestra...`);
  copyTemplate(dest);
  applyConfig(dest, { appName: name, appId, slug, apiUrl, sdkRoot: SDK_ROOT, webDir: 'www', minSdkVersion: 24, compileSdkVersion: 35, targetSdkVersion: 35, javaVersion: 21 });
  console.log(`[OK] Proyecto creado: ${dest}`);

  if (installDeps) {
    console.log('Instalando dependencias npm...');
    execSync('npm install --legacy-peer-deps', { cwd: dest, stdio: 'inherit' });
    console.log('[OK] Dependencias instaladas.');
  }
}

function listProjects() {
  ensureDir(PROJECTS_DIR);
  const dirs = fs.readdirSync(PROJECTS_DIR).filter((f) => fs.statSync(path.join(PROJECTS_DIR, f)).isDirectory());
  console.log('\nProyectos hijos:');
  dirs.length ? dirs.forEach((d) => console.log(` - ${d}`)) : console.log(' (ninguno)');
  console.log('');
}

function buildProject(slug) {
  if (!slug) { console.log('Indica el slug del proyecto'); return; }
  const p = path.join(PROJECTS_DIR, slug);
  if (!fs.existsSync(p)) { console.log('Proyecto no encontrado'); return; }
  console.log(`Compilando ${slug}...`);
  execSync('scripts\\build.bat', { cwd: p, stdio: 'inherit' });
  console.log('[OK] Compilación finalizada.');
}

async function interactiveMenu() {
  console.log('\n=== Administrador de Plantillas Altair ===');
  console.log(`Plantilla maestra: ${TEMPLATE_ROOT}`);
  console.log('1. Crear proyecto nuevo');
  console.log('2. Listar proyectos');
  console.log('3. Compilar proyecto Android');
  console.log('4. Salir');
  const opt = (await ask('Opción: ')).trim();
  if (opt === '1') {
    const name = (await ask('Nombre del proyecto: ')).trim();
    const appId = (await ask(`App ID [com.${slugify(name)}.app]: `)).trim();
    const apiUrl = (await ask(`API URL [https://...]: `)).trim();
    const install = (await ask('Instalar npm ahora? (s/n): ')).trim().toLowerCase();
    createProject(name, appId, apiUrl, install.startsWith('s'));
  } else if (opt === '2') listProjects();
  else if (opt === '3') {
    listProjects();
    const slug = (await ask('Slug del proyecto: ')).trim();
    buildProject(slug);
  } else if (opt === '4' || opt.toLowerCase() === 'salir') { console.log('Bye'); rl.close(); process.exit(0); }
  else console.log('Opción no válida.');
  interactiveMenu();
}

const [, , cmd, ...args] = process.argv;
if (cmd === 'create') {
  const install = args.includes('install');
  const [name, appId, apiUrl] = args.filter((a) => a !== 'install');
  createProject(name || '', appId, apiUrl, install);
  rl.close();
} else if (cmd === 'list') {
  listProjects(); rl.close();
} else if (cmd === 'build') {
  buildProject(args[0]); rl.close();
} else {
  interactiveMenu();
}
