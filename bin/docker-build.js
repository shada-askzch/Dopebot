#!/usr/bin/env node

/**
 * Build all Docker images locally (in parallel).
 *
 * Usage:
 *   npm run docker:build            # build all images in parallel
 *   npm run docker:build -- --image event-handler   # build one image
 *
 * Reads the version from package.json and tags each image as:
 *   stephengpope/thepopebot:{image}-{version}
 *
 * The coding-agent images use a two-stage build: a shared base image
 * (Dockerfile) is built first, then each agent-specific Dockerfile
 * extends it. The base is tagged as coding-agent-base-{version} and
 * is NOT pushed — it's only used locally as a build dependency.
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const REPO = 'stephengpope/thepopebot';

// Base image built first — all coding-agent images depend on it
const BASE_IMAGE = {
  name: 'coding-agent-base',
  context: 'docker/coding-agent',
  dockerfile: 'docker/coding-agent/Dockerfile',
};

// Agent-specific images (extend the base)
const CODING_AGENTS = [
  {
    name: 'coding-agent-claude-code',
    context: 'docker/coding-agent',
    dockerfile: 'docker/coding-agent/Dockerfile.claude-code',
  },
  {
    name: 'coding-agent-pi-coding-agent',
    context: 'docker/coding-agent',
    dockerfile: 'docker/coding-agent/Dockerfile.pi-coding-agent',
  },
  {
    name: 'coding-agent-gemini-cli',
    context: 'docker/coding-agent',
    dockerfile: 'docker/coding-agent/Dockerfile.gemini-cli',
  },
  {
    name: 'coding-agent-codex-cli',
    context: 'docker/coding-agent',
    dockerfile: 'docker/coding-agent/Dockerfile.codex-cli',
  },
  {
    name: 'coding-agent-opencode',
    context: 'docker/coding-agent',
    dockerfile: 'docker/coding-agent/Dockerfile.opencode',
  },
  {
    name: 'coding-agent-kimi-cli',
    context: 'docker/coding-agent',
    dockerfile: 'docker/coding-agent/Dockerfile.kimi-cli',
  },
];

// Non-coding-agent images (independent, built in parallel)
const OTHER_IMAGES = [
  {
    name: 'event-handler',
    context: '.',
    dockerfile: 'docker/event-handler/Dockerfile',
  },
];

const ALL_IMAGES = [BASE_IMAGE, ...CODING_AGENTS, ...OTHER_IMAGES];

// Parse --image flag
const filterArg = process.argv.find((_, i, a) => a[i - 1] === '--image');

if (filterArg && !ALL_IMAGES.some(img => img.name === filterArg)) {
  console.error(`Unknown image: ${filterArg}`);
  console.error(`Available: ${ALL_IMAGES.map((i) => i.name).join(', ')}`);
  process.exit(1);
}

// Pad image name for aligned output
const maxName = Math.max(...ALL_IMAGES.map((i) => i.name.length));

function buildImage(img) {
  const tag = `${REPO}:${img.name}-${VERSION}`;
  const context = path.resolve(ROOT, img.context);
  const dockerfile = path.resolve(ROOT, img.dockerfile);
  const label = img.name.padEnd(maxName);

  console.log(`  ${label}  building — ${tag}`);

  return new Promise((resolve, reject) => {
    // Tag base image as both versioned and unversioned (agent Dockerfiles use FROM coding-agent-base)
    const args = ['build', '-t', tag, '-f', dockerfile];
    if (img.name === 'coding-agent-base') {
      args.push('-t', 'coding-agent-base');
    }
    args.push(context);

    const proc = spawn(
      'docker',
      args,
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let output = '';
    let stepInfo = '';

    function processLine(line) {
      output += line + '\n';
      // Docker build step lines (classic builder)
      const stepMatch = line.match(/^Step (\d+\/\d+)\s*:\s*(.*)/);
      if (stepMatch) {
        stepInfo = `step ${stepMatch[1]} — ${stepMatch[2]}`;
        process.stderr.write(`  ${label}  ${stepInfo}\n`);
        return;
      }
      // BuildKit step lines
      const bkMatch = line.match(/^#\d+\s+\[.*?\]\s*(.*)/);
      if (bkMatch) {
        stepInfo = bkMatch[1].trim();
        process.stderr.write(`  ${label}  ${stepInfo}\n`);
        return;
      }
      // Download / install progress
      const dlMatch = line.match(/((?:Get|Fetching|Downloading|Installing|npm|Unpacking).*)/i);
      if (dlMatch) {
        process.stderr.write(`  ${label}  ${dlMatch[1].trim().slice(0, 80)}\n`);
      }
    }

    let stdoutBuf = '';
    proc.stdout.on('data', (d) => {
      stdoutBuf += d;
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop();
      lines.forEach(processLine);
    });

    let stderrBuf = '';
    proc.stderr.on('data', (d) => {
      stderrBuf += d;
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop();
      lines.forEach(processLine);
    });

    proc.on('close', (code) => {
      if (stdoutBuf) processLine(stdoutBuf);
      if (stderrBuf) processLine(stderrBuf);

      if (code === 0) {
        console.log(`  ${label}  done`);
        resolve(img.name);
      } else {
        console.error(`  ${label}  FAILED (exit ${code})`);
        console.error(output);
        reject(new Error(`${img.name} failed with exit code ${code}`));
      }
    });
  });
}

// Build logic: base first, then agents + others in parallel
async function run() {
  if (filterArg) {
    // Single image build
    if (filterArg === BASE_IMAGE.name) {
      console.log(`Building 1 image — version ${VERSION}\n`);
      await buildImage(BASE_IMAGE);
    } else {
      const isCodingAgent = CODING_AGENTS.some(img => img.name === filterArg);
      if (isCodingAgent) {
        // Need base first
        console.log(`Building base + 1 agent image — version ${VERSION}\n`);
        await buildImage(BASE_IMAGE);
        const agent = CODING_AGENTS.find(img => img.name === filterArg);
        await buildImage(agent);
      } else {
        console.log(`Building 1 image — version ${VERSION}\n`);
        const img = OTHER_IMAGES.find(img => img.name === filterArg);
        await buildImage(img);
      }
    }
    console.log('\n1/1 images built successfully.');
    return;
  }

  // Full build: base first, then everything else in parallel
  const totalCount = ALL_IMAGES.length;
  console.log(`Building ${totalCount} images (base first, then parallel) — version ${VERSION}\n`);

  // Step 1: Build base
  await buildImage(BASE_IMAGE);

  // Step 2: Build all agents + other images in parallel
  const parallel = [...CODING_AGENTS, ...OTHER_IMAGES];
  const results = await Promise.allSettled(parallel.map(buildImage));

  const failed = results.filter((r) => r.status === 'rejected');
  const succeeded = results.filter((r) => r.status === 'fulfilled');

  // +1 for the base image
  console.log(`\n${succeeded.length + 1}/${totalCount} images built successfully.`);

  if (failed.length > 0) {
    console.error(`${failed.length} failed: ${failed.map((r) => r.reason.message).join(', ')}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
