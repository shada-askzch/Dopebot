#!/usr/bin/env node

/**
 * get-secret.js - List available agent job secret keys
 *
 * Usage: get-secret.js
 *
 * Lists the key names from AGENT_JOB_SECRETS (not the values).
 * To get a value, use: echo $KEY_NAME
 */

const secretsJson = process.env.AGENT_JOB_SECRETS;

if (!secretsJson) {
  console.log('No AGENT_JOB_SECRETS configured.');
  process.exit(0);
}

try {
  const parsed = JSON.parse(secretsJson);
  const keys = Object.keys(parsed);

  if (keys.length === 0) {
    console.log('AGENT_JOB_SECRETS is empty.');
  } else {
    console.log('Available secrets:');
    keys.forEach(key => console.log(`  - ${key}`));
    console.log('\nTo get a value: echo $KEY_NAME');
  }
} catch (e) {
  console.error('Error parsing AGENT_JOB_SECRETS:', e.message);
  process.exit(1);
}
