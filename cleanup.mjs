#!/usr/bin/env node

import { spawnSync } from 'child_process';

const stage = process.argv[2] || 'dev';
const region = process.env.AWS_REGION || 'eu-central-1';

console.log(`🧹 Cleaning up Cloud Café stack: cloudcafe-${stage}`);
console.log('');

const deleteResult = spawnSync('sam', ['delete', '--stack-name', `cloudcafe-${stage}`, '--region', region], { stdio: 'inherit' });

if (deleteResult.status !== 0) {
  console.error('\n❌ Deletion failed');
  process.exit(1);
}

console.log('\n✅ Stack deleted successfully');
