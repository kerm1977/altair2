const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CFG = path.join(ROOT, 'config', 'template.json');

function readJSON(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function replaceInFile(file, regex, value) {
  if (!fs.existsSync(file)) return;
  let txt = fs.readFileSync(file, 'utf8');
  txt = txt.replace(regex, value);
  fs.writeFileSync(file, txt, 'utf8');
}

const t = readJSON(CFG);
const app = t.appId || 'com.app.local';
const name = t.appName || 'MiApp';
const slug = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

const cap = readJSON(path.join(ROOT, 'capacitor.config.json'));
cap.appName = name;
cap.appId = app;
writeJSON(path.join(ROOT, 'capacitor.config.json'), cap);

const pkg = readJSON(path.join(ROOT, 'package.json'));
pkg.name = slug;
writeJSON(path.join(ROOT, 'package.json'), pkg);

const apiFile = path.join(ROOT, 'www', 'js', 'api_db.js');
replaceInFile(apiFile, /const API_URL = ".*";/, `const API_URL = "${t.apiUrl}";`);

const apiDbPaths = [
  path.join(ROOT, 'api_db.js'),
  path.join(ROOT, 'www', 'api_db.js'),
  path.join(ROOT, 'www', 'js', 'api_db.js')
];
apiDbPaths.forEach(p => replaceInFile(p, /const API_URL = ".*";/, `const API_URL = "${t.apiUrl}";`));

const varsFile = path.join(ROOT, 'android', 'variables.gradle');
if (fs.existsSync(varsFile)) {
  let v = fs.readFileSync(varsFile, 'utf8');
  v = v.replace(/minSdkVersion = \d+/, `minSdkVersion = ${t.minSdkVersion}`);
  v = v.replace(/compileSdkVersion = \d+/, `compileSdkVersion = ${t.compileSdkVersion}`);
  v = v.replace(/targetSdkVersion = \d+/, `targetSdkVersion = ${t.targetSdkVersion}`);
  v = v.replace(/javaVersion = \d+/, `javaVersion = ${t.javaVersion}`);
  fs.writeFileSync(varsFile, v, 'utf8');
}

const appBuild = path.join(ROOT, 'android', 'app', 'build.gradle');
if (fs.existsSync(appBuild)) {
  let b = fs.readFileSync(appBuild, 'utf8');
  const ver = t.javaVersion || 21;
  b = b.replace(/sourceCompatibility JavaVersion\.VERSION_\d+/, `sourceCompatibility JavaVersion.VERSION_${ver}`);
  b = b.replace(/targetCompatibility JavaVersion\.VERSION_\d+/, `targetCompatibility JavaVersion.VERSION_${ver}`);
  b = b.replace(/languageVersion = JavaLanguageVersion\.of\(\d+\)/, `languageVersion = JavaLanguageVersion.of(${ver})`);
  fs.writeFileSync(appBuild, b, 'utf8');
}

console.log(`[TEMPLATE] Aplicado: ${name} (${app})`);
