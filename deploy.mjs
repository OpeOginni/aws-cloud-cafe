#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stage = process.env.STAGE || 'dev';
const region = process.env.AWS_REGION || 'eu-central-1';
const s3Bucket = process.env.S3_BUCKET || `cloudcafe-artifacts-${region}-${Date.now()}`;
const cloudFrontDistributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID || '';

console.log('🔧 Cloud Café Cloud-Native Deployment');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Stage:', stage);
console.log('Region:', region);
console.log('S3 Bucket:', s3Bucket);
console.log('CloudFront ID:', cloudFrontDistributionId || '(not configured)');
console.log('');

async function deploy() {
  // Install dependencies if needed
  if (!process.env.SKIP_INSTALL) {
    console.log('📦 Installing dependencies...');
    execSync('npm install', { stdio: 'inherit' });
  }

  // Create packaging directory
  const deployDir = path.join(__dirname, 'deploy');
  await fs.mkdir(deployDir, { recursive: true });

  // Copy SAM template
  await fs.copyFile(path.join(__dirname, 'sam.yaml'), path.join(deployDir, 'sam.yaml'));

  // Create lambda directory
  const lambdaDir = path.join(deployDir, 'lambda');
  await fs.mkdir(lambdaDir, { recursive: true });

  // Copy lambda code with required npm modules
  await fs.copyFile(path.join(__dirname, 'lambda/index.mjs'), path.join(lambdaDir, 'index.mjs'));
  
  if (fs.existsSync(path.join(__dirname, 'api/pricing.mjs'))) {
    await fs.mkdir(path.join(lambdaDir, 'api'), { recursive: true });
    await fs.copyFile(path.join(__dirname, 'api/pricing.mjs'), path.join(lambdaDir, 'api/pricing.mjs'));
  }

  // Copy middleware if exists
  if (fs.existsSync(path.join(__dirname, 'lambda/middleware.mjs'))) {
    await fs.copyFile(path.join(__dirname, 'lambda/middleware.mjs'), path.join(lambdaDir, 'middleware.mjs'));
  }

  // Copy application files
  const appDir = path.join(deployDir, 'application');
  await fs.mkdir(appDir, { recursive: true });
  
  if (fs.existsSync(path.join(__dirname, 'application'))) {
    const appFiles = ['index.html', 'app.js', 'style.css'];
    for (const file of appFiles) {
      const source = path.join(__dirname, file);
      if (await fs.access(source).catch(() => false)) {
        await fs.copyFile(source, path.join(appDir, file));
      }
    }
  }

  console.log('📦 Packaging Lambda function...');
  
  // Build Lambda deployment package
  execSync('npm pack', { cwd: lambdaDir, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });

  // Check if packaging succeeded
  const packageFile = path.join(lambdaDir, 'package.json');
  if (!await fs.access(packageFile).catch(() => false)) {
    console.error('❌ Lambda packaging failed. Make sure dependencies are installed.');
    process.exit(1);
  }

  // Create S3 bucket if it doesn't exist
  console.log('📦 Creating S3 bucket for deployment artifacts...');
  execSync(`aws s3 mb s3://${s3Bucket} --region ${region}`, { stdio: 'inherit' });

  // Upload SAM template to S3
  console.log('📤 Uploading SAM template...');
  execSync(`aws s3 cp sam.yaml s3://${s3Bucket}/sam.yaml`, { cwd: deployDir, stdio: 'inherit' });

  // Upload Lambda package to S3
  console.log('📤 Uploading Lambda deployment package...');
  const zipFile = path.join(lambdaDir, '*', 'package.json') + '?.zip';
  execSync(`aws s3 cp ${zipFile.replace(/\*/g, '')} s3://${s3Bucket}/lambda.zip`, { cwd: lambdaDir, stdio: 'inherit' });

  console.log('📥 Deploying to AWS SAM...');
  
  const samCommands = [
    'sam package',
    `--template-file sam.yaml`,
    `--s3-bucket ${s3Bucket}`,
    `--output-template-file packaged.yaml`,
    `--region ${region}`,
    '--TAGS Stage=' + stage + ' Application=CloudCafe'
  ];

  try {
    execSync(samCommands.join(' '), { cwd: deployDir, stdio: 'inherit' });
    console.log('✅ SAM package created successfully');
  } catch (error) {
    console.error('❌ SAM packaging failed:', error.message);
    process.exit(1);
  }

  // Deploy the stack
  console.log('');
  console.log('🚀 Deploying CloudFormation stack...');
  console.log('⚠️  This will take a few minutes and incur AWS resource costs.');
  
  const deployCommands = [
    'sam deploy',
    `--template-file packaged.yaml`,
    `--stack-name cloudcafe-${stage}`,
    `--capabilities CAPABILITY_IAM`,
    `--parameter-overrides Stage=${stage}`,
    `--region ${region}`,
    `--no-confirm-changeset`,
    `--no-fail-on-empty-changeset`
  ];

  try {
    execSync(deployCommands.join(' '), { cwd: deployDir, stdio: 'inherit' });
    console.log('✅ Deployment successful!');
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }

  // Extract deployment outputs
  console.log('');
  console.log('📊 Extracting deployment details...');

  const outputs = JSON.parse(execSync(`
    aws cloudformation describe-stacks --stack-name cloudcafe-${stage} --region ${region} --query 'Stacks[0].Outputs' --output json
  `, { encoding: 'utf-8' }));

  const logGroupName = outputs.find((o) => o.OutputKey === 'PricingLambdaFunctionArn')?.OutputValue
    ?.split('function:')?.[1]?.split(':')?.[1] || '';
  
  const cloudFrontUrl = outputs.find((o) => o.OutputKey === 'CloudFrontDistributionId')?.OutputValue
    ? `https://${outputs.find((o) => o.OutputKey === 'CloudFrontDistributionId').OutputValue}`
    : outputs.find((o) => o.OutputKey === 'CloudFrontDistributionUrl')?.OutputValue || '';
  
  const apiGatewayUrl = outputs.find((o) => o.OutputKey === 'APIGatewayUrl')?.OutputValue || '';

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✨ Cloud Café Deployment Complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  if (cloudFrontUrl) {
    console.log('🌐 CloudFront URL:', cloudFrontUrl);
  }
  
  if (apiGatewayUrl) {
    console.log('🔌 API URL:', apiGatewayUrl + '/dev/_STAGE_V1/menu');
  }
  
  if (logGroupName) {
    const logGroupUrl = `https://eu-central-1.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${encodeURIComponent(logGroupName)}/log-events`;
    console.log('📊 CloudWatch Logs:', logGroupUrl);
  }
  
  if (cloudFrontDistributionId) {
    console.log('⚡ CloudFront Distribution:', cloudFrontDistributionId);
    const distStats = `https://console.aws.amazon.com/cloudfront/v4/home?region=${region}#distribution-settings?DistributionId=${cloudFrontDistributionId}`;
    console.log('📈 Distribution Stats:', distStats);
  } else {
    console.log('⚠️  Set CLOUDFRONT_DISTRIBUTION_ID to enable CloudFront logging');
  }
  
  console.log('');
  console.log('🔍 Test endpoints:');
  console.log('   Menu API:', apiGatewayUrl + '/dev/Stage_V1/menu');
  console.log('   Quote API:', apiGatewayUrl + '/dev/Stage_V1/quote');
  console.log('');
  
  if (logGroupName) {
    console.log('📝 To view Lambda logs:');
    console.log(`   aws logs tail ${logGroupName} --follow --region ${region}`);
  }
  
  console.log('');
  console.log('🗑️  To clean up: sam delete --stack-name cloudcafe-${stage} --region ${region}');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

deploy().catch((error) => {
  console.error('💥 Deployment failed:', error);
  process.exit(1);
});
