#!/usr/bin/env node

import { spawnSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function deploy() {
  const stage = process.env.STAGE || 'dev';
  const region = process.env.AWS_REGION || 'eu-central-1';
  
  const deployDir = path.join(__dirname, 'deploy');
  const lambdaDir = path.join(deployDir, 'lambda');
  const appDir = path.join(deployDir, 'application');
  
  // Setup directories
  await fs.mkdir(deployDir, { recursive: true });
  await fs.mkdir(lambdaDir, { recursive: true });
  await fs.mkdir(appDir, { recursive: true });
  
  // Copy files
  await fs.copyFile(path.join(__dirname, 'sam.yaml'), path.join(deployDir, 'sam.yaml'));
  await fs.copyFile(path.join(__dirname, 'lambda/index.mjs'), path.join(lambdaDir, 'index.mjs'));
  await fs.copyFile(path.join(__dirname, 'lambda/middleware.mjs'), path.join(lambdaDir, 'middleware.mjs'));
  
  // Copy API
  await fs.mkdir(path.join(lambdaDir, 'api'), { recursive: true });
  await fs.copyFile(path.join(__dirname, 'api/pricing.mjs'), path.join(lambdaDir, 'api/pricing.mjs'));
  
  // Copy app base files
  const appBaseDir = path.join(__dirname, 'application');
  await fs.copyFile(path.join(appBaseDir, 'index.html'), path.join(appDir, 'index.html'));
  await fs.copyFile(path.join(appBaseDir, 'app.js'), path.join(appDir, 'app.js'));
  await fs.copyFile(path.join(appBaseDir, 'style.css'), path.join(appDir, 'style.css'));
  
  // Create package.json
  const packageJson = {
    name: 'cloudcafe',
    type: 'module',
    main: 'index.mjs'
  };
  await fs.writeFile(path.join(lambdaDir, 'package.json'), JSON.stringify(packageJson, null, 2));
  
  // Perform deployment
  console.log(`📦 Deploying to ${stage} in ${region}...`);
  
  // Package with SAM
  const packageResult = spawnSync('npm', ['pack'], { cwd: lambdaDir, stdio: 'inherit' });
  if (packageResult.status !== 0) {
    throw new Error('Failed to package Lambda function');
  }
  
  // Create S3 bucket
  const bucketName = `cloudcafe-artifacts-${region}-$(date +%s)`;
  const bucketCreateResult = spawnSync('aws', ['s3', 'mb', `s3://${bucketName}`, '--region', region], { 
    stdio: 'inherit',
    shell: '/bin/bash'
  });
  
  // Upload files
  const upload1 = spawnSync('aws', ['s3', 'cp', 'sam.yaml', `s3://${bucketName}/sam.yaml`], { cwd: deployDir, stdio: 'inherit' });
  const upload2 = spawnSync('aws', ['s3', 'cp', `${path.join(lambdaDir, '*/package.json')}?.zip`, `s3://${bucketName}/lambda.zip`], { cwd: lambdaDir, stdio: 'inherit', shell: '/bin/bash' });
  
  // Deploy with SAM
  const deployResult = spawnSync('sam', ['package', '--template-file', 'sam.yaml', '--s3-bucket', bucketName, '--output-template-file', 'packaged.yaml', '--region', region, `--TAGS Stage=${stage}`], { cwd: deployDir, stdio: 'inherit' });
  
  if (deployResult.status !== 0) {
    throw new Error('Sison deployment failed');
  }
  
  // Deploy stack
  const stackResult = spawnSync('sam', ['deploy', '--template-file', 'packaged.yaml', '--stack-name', `cloudcafe-${stage}`, '--capabilities', 'CAPABILITY_IAM', `--parameter-overrides Stage=${stage}`, '--region', region, '--no-confirm-changeset', '--no-fail-on-empty-changeset'], { cwd: deployDir, stdio: 'inherit' });
  
  if (stackResult.status !== 0) {
    throw new Error('Stack deployment failed');
  }
  
  // Get outputs
  const outputs = spawnSync('aws', ['cloudformation', 'describe-stacks', '--stack-name', `cloudcafe-${stage}`, '--region', region, '--query', 'Stacks[0].Outputs', '--output', 'json'], { encoding: 'utf-8' }).stdout;
  const outputArray = JSON.parse(outputs);
  
  const cloudFrontUrl = outputArray.find(o => o.OutputKey === 'CloudFrontDistributionUrl')?.OutputValue || '';
  const apiGatewayUrl = outputArray.find(o => o.OutputKey === 'APIGatewayUrl')?.OutputValue || '';
  const logGroupName = outputArray.find(o => o.OutputKey === 'PricingLambdaFunctionArn')?.OutputValue?.split('function:')?.[1]?.split(':')?.[1] || '';
  
  console.log('\n✨ Deployment Complete!\n');
  if (cloudFrontUrl) console.log('🌐 URL:', cloudFrontUrl);
  if (apiGatewayUrl) console.log('🔌 API:', apiGatewayUrl + '/dev/_STAGE_V1/menu');
  if (logGroupName) {
    const lgLink = `https://eu-central-1.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${encodeURIComponent(logGroupName)}/log-events`;
    console.log('📊 Logs:', lgLink);
  }
}

deploy();
