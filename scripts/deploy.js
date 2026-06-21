#!/usr/bin/env node
/**
 * Deploy script: bump version, build, zip production files, upload via SFTP, unzip on server.
 * Usage: npm run deploy
 *
 * Requires `.env.deploy` placed ONE LEVEL ABOVE the project root (i.e. alongside VibeDarkness/,
 * not inside it). This keeps secrets out of the repo directory entirely.
 * See `.env.deploy.example` in that same parent directory for the required fields.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { posix } from 'node:path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import { Client } from 'ssh2';

/** Single files to include in the deploy archive (relative to project root). */
const DEPLOY_FILES = [
  'index.php',
  'composer.json',
  'composer.lock',
  'global_constants.js',
  'global_constants.php',
];

/** Directories to include in the deploy archive (relative to project root). */
const DEPLOY_DIRS = [
  'dist',
  'backend',
  'vendor',
];

/** Output zip filename (created in project root). */
const DEPLOY_ZIP_NAME = 'deploy.zip';

const DEFAULT_REMOTE_PATH = '~/public_html/darkness.jprevoe.com';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
// .env.deploy lives one level above the project root so it is never inside the repo directory.
const deployEnvDir = path.resolve(rootDir, '..');
const zipPath = path.join(rootDir, DEPLOY_ZIP_NAME);
const packageJsonPath = path.join(rootDir, 'package.json');

function loadDeployEnv() {
  const envPath = path.join(deployEnvDir, '.env.deploy');
  if (!fs.existsSync(envPath)) {
    return {};
  }
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function requireDeployConfig(env) {
  const missing = ['DEPLOY_SSH_HOST', 'DEPLOY_SSH_USER', 'DEPLOY_SSH_KEY'].filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(', ')} in .env.deploy. Copy .env.deploy.example from the Programming/ directory (one level above VibeDarkness/) and fill in your SSH details.`,
    );
  }
  const keyPath = path.resolve(rootDir, env.DEPLOY_SSH_KEY);
  if (!fs.existsSync(keyPath)) {
    throw new Error(`SSH private key not found: ${keyPath}`);
  }
  return {
    host: env.DEPLOY_SSH_HOST,
    port: Number(env.DEPLOY_SSH_PORT || 22),
    username: env.DEPLOY_SSH_USER,
    privateKeyPath: keyPath,
    passphrase: env.DEPLOY_SSH_PASSPHRASE || undefined,
    remotePath: env.DEPLOY_REMOTE_PATH || DEFAULT_REMOTE_PATH,
  };
}

function bumpMinorVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid package.json version: ${version}`);
  }
  const major = match[1];
  const minor = Number(match[2]) + 1;
  return `${major}.${minor}.0`;
}

function bumpPackageMinorVersion() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const previous = pkg.version;
  const next = bumpMinorVersion(previous);
  pkg.version = next;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  console.log(`Deploy: version ${previous} → ${next}`);
  return next;
}

function renderUploadProgress(transferred, total) {
  const width = 32;
  const pct = total > 0 ? transferred / total : 0;
  const filled = Math.round(width * pct);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const mb = (n) => (n / 1024 / 1024).toFixed(1);
  process.stdout.write(
    `\rDeploy: upload [${bar}] ${(pct * 100).toFixed(0)}% ${mb(transferred)}/${mb(total)} MB`,
  );
}

function sshConnect(config) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on('ready', () => resolve(conn))
      .on('error', reject)
      .connect({
        host: config.host,
        port: config.port,
        username: config.username,
        privateKey: fs.readFileSync(config.privateKeyPath),
        ...(config.passphrase ? { passphrase: config.passphrase } : {}),
      });
  });
}

function sftpSession(conn) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)));
  });
}

function sftpRealpath(sftp, remote) {
  return new Promise((resolve, reject) => {
    sftp.realpath(remote, (err, abs) => (err ? reject(err) : resolve(abs)));
  });
}

async function resolveRemoteDir(sftp, configuredPath) {
  if (!configuredPath.startsWith('~/')) {
    return configuredPath;
  }
  const home = await sftpRealpath(sftp, '.');
  return posix.join(home, configuredPath.slice(2));
}

function sftpFastPut(sftp, localPath, remotePath, totalBytes) {
  return new Promise((resolve, reject) => {
    let lastPct = -1;
    sftp.fastPut(localPath, remotePath, {
      step: (transferred) => {
        const pct = totalBytes > 0 ? Math.floor((transferred / totalBytes) * 100) : 0;
        if (pct !== lastPct) {
          lastPct = pct;
          renderUploadProgress(transferred, totalBytes);
        }
      },
    }, (err) => {
      if (err) {
        reject(err);
        return;
      }
      renderUploadProgress(totalBytes, totalBytes);
      process.stdout.write('\n');
      resolve();
    });
  });
}

function sshExec(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      let stderr = '';
      stream.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Remote command failed (exit ${code}): ${stderr.trim() || command}`));
      });
      stream.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      stream.resume();
    });
  });
}

async function uploadAndExtract(config) {
  const zipBytes = fs.statSync(zipPath).size;
  const conn = await sshConnect(config);
  try {
    const sftp = await sftpSession(conn);
    const remoteDir = await resolveRemoteDir(sftp, config.remotePath);
    const remoteZip = posix.join(remoteDir, DEPLOY_ZIP_NAME);
    console.log(`Deploy: uploading to ${remoteZip}...`);
    await sftpFastPut(sftp, zipPath, remoteZip, zipBytes);
    console.log('Deploy: extracting on server...');
    const quotedDir = `'${remoteDir.replace(/'/g, `'\\''`)}'`;
    const quotedZip = `'${remoteZip.replace(/'/g, `'\\''`)}'`;
    await sshExec(conn, `cd ${quotedDir} && unzip -o ${quotedZip}`);
    console.log('Deploy: remote extract complete.');
  } finally {
    conn.end();
  }
}

async function createDeployZip() {
  console.log(`Deploy: creating ${DEPLOY_ZIP_NAME}...`);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);

    for (const name of DEPLOY_FILES) {
      const fullPath = path.join(rootDir, name);
      if (fs.existsSync(fullPath)) {
        archive.file(fullPath, { name });
      }
    }
    for (const name of DEPLOY_DIRS) {
      const fullPath = path.join(rootDir, name);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        archive.directory(fullPath, name);
      }
    }

    archive.finalize();
  });
}

const noBuild = process.argv.includes('--no-build');

const deployConfig = requireDeployConfig(loadDeployEnv());

bumpPackageMinorVersion();

if (noBuild) {
  console.log('Deploy: skipping build (--no-build).');
} else {
  console.log('Deploy: building frontend...');
  execSync('npm run build', {
    cwd: rootDir,
    stdio: 'inherit',
  });
}

await createDeployZip();
await uploadAndExtract(deployConfig);

console.log('Deploy: done.');

/***
 * AGENTS: DO NOT MODIFY THIS SECTION.  IT IS FOR HUMAN INSTRUCTION ONLY.
 *
 * Step 1: Enable SSH in GoDaddy
 * Go to GoDaddy Products
 * Under Web Hosting, click Manage on your cPanel account
 * Settings → Server → SSH access → Manage
 * Turn SSH access on
 * GoDaddy will show connection info, typically:
 *
 * Host: something like server123.web-hosting.com or an IP
 * Username: your cPanel username (not your email)
 * Port: 22
 * Password: same as your cPanel password
 * Save those — you’ll need them to test.
 *
 * Step 2: Set up SSH keys (recommended)
 * Password auth works for a quick test, but for npm run deploy you want a key so you’re not storing your cPanel password in a script.
 *
 * Generate a key on your Windows machine
 * In PowerShell:
 *
 * ssh-keygen -t ed25519 -C "vibedarkness-deploy" -f $env:USERPROFILE\.ssh\godaddy_deploy
 * Press Enter for no passphrase (convenient for automation) or set one if you prefer.
 *
 * That creates:
 *
 * Private key: C:\Users\Jeremy\.ssh\godaddy_deploy (never commit this)
 * Public key: C:\Users\Jeremy\.ssh\godaddy_deploy.pub
 * Add the public key in cPanel
 * Log into cPanel (not WHM unless you’re on a reseller plan — regular hosting uses cPanel)
 * Security → SSH Access → Manage SSH Keys
 * Import Key
 * Paste the contents of godaddy_deploy.pub
 * Click Import, then Manage → Authorize on that key
 * Test the connection
 * ssh -i $env:USERPROFILE\.ssh\godaddy_deploy YOUR_CPANEL_USER@YOUR_SSH_HOST
 * If it works, you’ll get a shell on the server. Type pwd — you’ll usually land in /home/YOUR_CPANEL_USER.
 *
 * Find your web root:
 *
 * ls
 * # look for public_html (main site) or a subfolder if you use addon domains
 * For this project the deploy target is:
 *
 * ~/public_html/darkness.jprevoe.com
 * Step 3: Test file upload manually
 * Once SSH works, test scp:
 *
 * scp -i $env:USERPROFILE\.ssh\godaddy_deploy deploy.zip YOUR_CPANEL_USER@YOUR_SSH_HOST:~/public_html/darkness.jprevoe.com/
 * Then SSH in and unzip:
 *
 * ssh -i $env:USERPROFILE\.ssh\godaddy_deploy YOUR_CPANEL_USER@YOUR_SSH_HOST "cd public_html/darkness.jprevoe.com && unzip -o deploy.zip"
 * If unzip isn’t found, try tar -xf deploy.zip or extract via cPanel File Manager once to confirm the zip is valid.
 */
