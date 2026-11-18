import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { execSync } from 'child_process';

const PROJECT_ID = 'yemenedu-69e4e';
const SITE_ID = 'yemenedu-69e4e';
const DIST_DIR = path.resolve('dist');

async function getAccessToken() {
  const tokenJson = execSync(
    'curl -s -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"'
  ).toString();
  return JSON.parse(tokenJson).access_token;
}

function getAllFiles(dir, base = '') {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const fullPath = path.join(dir, item);
    const relPath = '/' + path.join(base, item).replace(/\\/g, '/');
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, path.join(base, item)));
    } else {
      const rawContent = fs.readFileSync(fullPath);
      const gzippedContent = zlib.gzipSync(rawContent, { level: 9 });
      const hash = crypto.createHash('sha256').update(gzippedContent).digest('hex');
      results.push({
        relPath,
        fullPath,
        gzippedContent,
        hash,
        size: rawContent.length,
        gzSize: gzippedContent.length,
      });
    }
  }
  return results;
}

async function apiRequest(url, method = 'GET', body = null, token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Goog-User-Project': PROJECT_ID,
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API Error [${method} ${url}]: ${res.status} - ${errorText}`);
  }
  return await res.json();
}

async function deploy() {
  console.log('🚀 Starting Firebase Hosting deployment for', PROJECT_ID);

  const token = await getAccessToken();
  const files = getAllFiles(DIST_DIR);
  console.log(`📁 Found ${files.length} files in dist/ to deploy:`);
  for (const f of files) {
    console.log(`  - ${f.relPath} (${f.size} bytes -> gz: ${f.gzSize} bytes, hash: ${f.hash.substring(0, 10)}...)`);
  }

  // 1. Create new Hosting version with SPA rewrite rule
  console.log('1️⃣ Creating new Hosting version...');
  const versionPayload = {
    config: {
      headers: [
        {
          glob: '/sw.js',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        },
        {
          glob: '**',
          headers: {
            'Cache-Control': 'no-cache',
          },
        },
      ],
      rewrites: [
        {
          glob: '**',
          path: '/index.html',
        },
      ],
    },
  };
  const versionRes = await apiRequest(
    `https://firebasehosting.googleapis.com/v1beta1/projects/${PROJECT_ID}/sites/${SITE_ID}/versions`,
    'POST',
    versionPayload,
    token
  );
  const versionName = versionRes.name;
  console.log(`✅ Version created: ${versionName}`);

  // 2. Populate files with gzipped SHA256 hashes
  console.log('2️⃣ Populating files dictionary...');
  const filesMap = {};
  for (const f of files) {
    filesMap[f.relPath] = f.hash;
  }
  const popRes = await apiRequest(
    `https://firebasehosting.googleapis.com/v1beta1/${versionName}:populateFiles`,
    'POST',
    { files: filesMap },
    token
  );

  const requiredHashes = new Set(popRes.uploadRequiredHashes || []);
  const uploadUrl = popRes.uploadUrl;
  console.log(`📦 Need to upload ${requiredHashes.size} new/modified files (out of ${files.length})`);

  // 3. Upload required files
  for (const f of files) {
    if (requiredHashes.has(f.hash)) {
      console.log(`⬆️ Uploading ${f.relPath}...`);
      const targetUrl = `${uploadUrl}/${f.hash}`;
      const upRes = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Goog-User-Project': PROJECT_ID,
          'Content-Type': 'application/octet-stream',
        },
        body: f.gzippedContent,
      });
      if (!upRes.ok) {
        throw new Error(`Failed to upload ${f.relPath}: ${upRes.status} ${await upRes.text()}`);
      }
      console.log(`  ✓ Uploaded ${f.relPath}`);
    } else {
      console.log(`  ↪ Already in cache: ${f.relPath}`);
    }
  }

  // 4. Finalize version
  console.log('4️⃣ Finalizing version...');
  await apiRequest(
    `https://firebasehosting.googleapis.com/v1beta1/${versionName}?update_mask=status`,
    'PATCH',
    { status: 'FINALIZED' },
    token
  );
  console.log('✅ Version finalized.');

  // 5. Release version to production
  console.log('5️⃣ Releasing version to production...');
  const releaseRes = await apiRequest(
    `https://firebasehosting.googleapis.com/v1beta1/projects/${PROJECT_ID}/sites/${SITE_ID}/releases?version_name=${versionName}`,
    'POST',
    null,
    token
  );
  console.log('🎉 Deployment complete!', releaseRes.name);
  console.log(`🔗 Live URLs:`);
  console.log(`   👉 https://${SITE_ID}.web.app`);
  console.log(`   👉 https://${SITE_ID}.firebaseapp.com`);
}

deploy().catch((err) => {
  console.error('❌ Deployment failed:', err);
  process.exit(1);
});
