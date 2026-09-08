#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  CLOUD CAFÉ CLOUD-NATIVE DEPLOYMENT                             ║');
  console.log('║  AWS User Group Frankfurt                                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');

  const stage = process.env.STAGE || 'dev';
  const region = process.env.AWS_REGION || 'eu-central-1';

  console.log(`🎯 Target Stage: ${stage}`);
  console.log(`🌍 Region: ${region}`);
  console.log('');

  // Step 1: Run tests
  console.log('📊 Running verification tests...');
  try {
    execSync('node test/deployment-functionality.mjs', { stdio: 'pipe' });
    console.log('✅ All tests passed!\n');
  } catch (error) {
    console.log('❌ Tests failed. Please fix issues before deployment.\n');
    process.exit(1);
  }

  // Step 2: Verify environment
  console.log('🔧 Checking deployment environment...');
  try {
    const awsConfig = JSON.parse(execSync('aws configure list-profiles', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }));
    console.log('✅ AWS CLI configured');
  } catch (error) {
    console.log('❌ AWS CLI not configured. Run: aws configure');
    process.exit(1);
  }

  // Step 3: Deploy
  console.log('🚀 Starting AWS deployment...\n');
  try {
    execSync('node deploy.mjs', { stdio: 'inherit' });
  } catch (error) {
    console.log('❌ Deployment failed. Please check output above.\n');
    process.exit(1);
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  ✨ DEPLOYMENT COMPLETE! ✨                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Step 4: Provide access information
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Access Information');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\nSuccessfully deployed your Cloud Café to AWS with:');
  console.log('  ✅ Lambda function for pricing logic');
  console.log('  ✅ API Gateway for endpoints');
  console.log('  ✅ S3 for assets');
  console.log('  ✅ CloudFront for HTTPS');
  console.log('  ✅ CloudWatch for logs');
  console.log('');
}

main();
