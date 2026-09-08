#!/usr/bin/env node

/**
 * Cloud Café Pipeline Deployment Controller
 * 
 * This script provides a complete deployment pipeline workflow:
 * - Validate deployment configuration
 * - Package SAM templates and Lambda code
 * - Execute controlled CloudFormation deployments
 * - Manage CloudFront cache invalidation
 * - Provide deployment status and metadata
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const gitCommit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
})();

const gitBranch = (() => {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
})();

const stage = process.env.STAGE || 'dev';
const region = process.env.AWS_REGION || 'eu-central-1';
const s3Bucket = process.env.S3_BUCKET || `cloudcafe-artifacts-${region}`;
const cloudFrontDistributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID || '';

console.log('🚀 Cloud Café Pipeline Deployment');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Stage:', stage);
console.log('Region:', region);
console.log('Commit:', gitCommit);
console.log('Branch:', gitBranch);
console.log('S3 Bucket:', s3Bucket);
console.log('');

async function validateStage() {
  if (!['dev', 'staging', 'prod'].includes(stage)) {
    throw new Error(`Invalid stage '${stage}'. Must be 'dev', 'staging', or 'prod'`);
  }
}

async function installDependencies() {
  console.log('📦 Installing dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('✅ Dependencies installed');
  } catch (error) {
    throw new Error('Failed to install dependencies: ' + error.message);
  }
}

async function createDeploymentPackage() {
  console.log('📁 Creating deployment artifacts...');
  const packageDir = path.join(__dirname, 'pipeline-package');
  await fs.mkdir(packageDir, { recursive: true });
  
  // Copy SAM template
  await fs.copyFile(path.join(__dirname, 'sam.yaml'), path.join(packageDir, 'sam.yaml'));
  
  // Copy Lambda code
  const lambdaDir = path.join(packageDir, 'lambda');
  await fs.mkdir(lambdaDir, { recursive: true });
  await fs.copyFile(path.join(__dirname, 'lambda/index.mjs'), path.join(lambdaDir, 'index.mjs'));
  
  if (fs.existsSync(path.join(__dirname, 'lambda/middleware.mjs'))) {
    await fs.copyFile(path.join(__dirname, 'lambda/middleware.mjs'), path.join(lambdaDir, 'middleware.mjs'));
  }
  
  console.log('✅ Deployment package created');
  return packageDir;
}

async function prepareS3Bucket() {
  console.log('📦 Preparing S3 bucket...');
  try {
    const bucketExists = execSync(
      `aws s3 ls s3://${s3Bucket} --region ${region}`,
      { encoding: 'utf-8' }
    );
    if (!bucketExists) {
      console.log('Creating S3 bucket...');
      execSync(`aws s3 mb s3://${s3Bucket} --region ${region}`, { stdio: 'inherit' });
    }
    console.log('✅ S3 bucket ready');
  } catch (error) {
    throw new Error('Failed to prepare S3 bucket: ' + error.message);
  }
}

async function uploadArtifacts(packageDir) {
  console.log('📤 Uploading artifacts to S3...');
  
  try {
    // Upload SAM template
    execSync(
      `aws s3 cp sam.yaml s3://${s3Bucket}/sam.yaml`,
      { cwd: packageDir, stdio: 'inherit' }
    );
    console.log('✅ SAM template uploaded');
    
    // Upload Lambda package
    const lambdaPackage = await fs.readdir(path.join(packageDir, 'lambda'));
    const lambdaZip = lambdaPackage.find(f => f.endsWith('.zip'));
    if (lambdaZip) {
      execSync(
        `aws s3 cp ${path.join('lambda', lambdaZip)} s3://${s3Bucket}/lambda.zip`,
        { cwd: packageDir, stdio: 'inherit' }
      );
      console.log('✅ Lambda package uploaded');
    }
  } catch (error) {
    throw new Error('Failed to upload artifacts: ' + error.message);
  }
}

async function validateSamTemplate() {
  console.log('✅ Validating SAM template...');
  try {
    execSync('sam validate --template-file sam.yaml', { stdio: 'inherit' });
    console.log('✅ SAM template valid');
  } catch (error) {
    throw new Error('SAM template validation failed: ' + error.message);
  }
}

async function packageSamTemplate() {
  console.log('📦 Packaging SAM template...');
  try {
    execSync(
      `sam package --template-file sam.yaml --s3-bucket ${s3Bucket} --output-template-file packaged.yaml --region ${region}`,
      { stdio: 'inherit' }
    );
    console.log('✅ SAM template packaged');
  } catch (error) {
    throw new Error('SAM packaging failed: ' + error.message);
  }
}

async function createCloudFormationChangeset() {
  console.log('🔧 Creating CloudFormation changeset...');
  
  const timestamp = Date.now();
  const changesetName = `pipeline-changeset-${timestamp}`;
  
  try {
    execSync(
      `aws cloudformation create-change-set --stack-name cloudcafe-${stage} --change-set-name ${changesetName} --template-body file://packaged.yaml --change-set-type CREATE --parameters ParameterKey=Stage,ParameterValue=${stage} --region ${region}`,
      { stdio: 'inherit' }
    );
    
    console.log('✅ Changeset creation initiated');
    console.log('⏳ Waiting for changeset to be ready...');
    
    // Wait for changeset completion
    await waitUntil((deadline) => {
      try {
        execSync(
          `aws cloudformation describe-change-set --stack-name cloudcafe-${stage} --change-set-name ${changesetName} --region ${region}`,
          { stdio: 'inherit' }
        );
        return true;
      } catch (error) {
        return false;
      }
    }, 60 * 1000); // Wait up to 60 seconds
    
    console.log('✅ Changeset ready');
    return changesetName;
  } catch (error) {
    throw new Error('Failed to create changeset: ' + error.message);
  }
}

async function getCloudFrontDistributionId() {
  try {
    const output = execSync(
      `aws cloudformation describe-stacks --stack-name cloudcafe-${stage} --query 'Stacks[0].Outputs[?OutputKey==\`CloudFrontDistributionId\`].OutputValue' --region ${region} --output text`,
      { encoding: 'utf-8' }
    );
    return output.trim();
  } catch {
    return '';
  }
}

async function invalidateCloudFront(cache) {
  if (!cache) {
    console.log('⚠️  CloudFront invalidation skipped: Distribution ID not configured');
    return;
  }
  
  console.log('⚡ Invalidating CloudFront cache...');
  try {
    execSync(
      `aws cloudfront create-invalidation --distribution-id ${cache} --paths "/*" --region ${region}`,
      { stdio: 'inherit' }
    );
    console.log('✅ CloudFront cache invalidated');
  } catch (error) {
    console.log('⚠️  CloudFront invalidation failed:', error.message);
  }
}

async function executeCloudFormationChangeset(changesetName) {
  console.log('🚀 Executing CloudFormation changeset...');
  
  try {
    execSync(
      `aws cloudformation execute-change-set --stack-name cloudcafe-${stage} --change-set-name ${changesetName} --region ${region}`,
      { stdio: 'inherit' }
    );
    
    console.log('⏳ Waiting for deployment to complete...');
    
    // Wait for stack update/create completion
    await waitUntil((deadline) => {
      try {
        execSync(
          `aws cloudformation describe-stacks --stack-name cloudcafe-${stage} --region ${region}`,
          { stdio: 'inherit' }
        );
        return true;
      } catch (error) {
        return false;
      }
    }, 10 * 60 * 1000); // Wait up to 10 minutes
    
    console.log('✅ Deployment successful');
  } catch (error) {
    throw new Error('Deployment failed: ' + error.message);
  }
}

async function extractDeploymentOutputs() {
  console.log('📊 Extracting deployment details...');
  try {
    const output = execSync(
      `aws cloudformation describe-stacks --stack-name cloudcafe-${stage} --region ${region}`,
      { encoding: 'utf-8' }
    );
    
    const stackOutput = JSON.parse(output).Stacks[0];
    
    const lambdaFunctionName = stackOutput.Outputs.find(o => o.OutputKey === 'PricingFunctionName')?.OutputValue || '';
    const cloudFrontDistributionId = stackOutput.Outputs.find(o => o.OutputKey === 'CloudFrontDistributionId')?.OutputValue || '';
    const cloudFrontUrl = cloudFrontDistributionId ? `https://${cloudFrontDistributionId}` : '';
    const apiGatewayUrl = stackOutput.Outputs.find(o => o.OutputKey === 'APIGatewayUrl')?.OutputValue || '';
    const logGroupName = stackOutput.Outputs.find(o => o.OutputKey === 'PricingFunctionArn')?.OutputValue?.split(':')?.[1]?.split(':')?.[1] || '';
    
    const outputs = {
      lambdaFunctionName,
      cloudFrontDistributionId,
      cloudFrontUrl,
      apiGatewayUrl,
      logGroupName,
      stackStatus: stackOutput.StackStatus,
      stackId: stackOutput.StackId
    };
    
    console.log('✅ Deployment details extracted');
    return outputs;
  } catch (error) {
    throw new Error('Failed to extract deployment outputs: ' + error.message);
  }
}

function waitUntil(condition, timeout) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    
    const check = () => {
      try {
        if (condition()) {
          resolve();
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }
      
      if (Date.now() >= deadline) {
        reject(new Error('Timeout waiting for operation to complete'));
        return;
      }
      
      setTimeout(check, 5000);
    };
    
    check();
  });
}

function printDeploymentResults(outputs) {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✨ Cloud Café Pipeline Deployment Complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('🌐 CloudFront URL:', outputs.cloudFrontUrl);
  console.log('🔌 API Gateway URL:', outputs.apiGatewayUrl + '/api/menu');
  console.log('📊 Lambda Function:', outputs.lambdaFunctionName);
  console.log('');
  
  if (outputs.logGroupName) {
    const logGroupUrl = `https://eu-central-1.console.aws.amazon.com/cloudwatch/home?region=eu-central-1#logsV2:log-groups/log-group/${encodeURIComponent(outputs.logGroupName)}/log-events`;
    console.log('📊 CloudWatch Logs:', logGroupUrl);
  }
  
  if (outputs.cloudFrontDistributionId) {
    const distUrl = `https://console.aws.amazon.com/cloudfront/v4/home?region=eu-central-1#distribution-settings?DistributionId=${outputs.cloudFrontDistributionId}`;
    console.log('⚡ CloudFront Distribution:', outputs.cloudFrontDistributionId);
    console.log('📈 Distribution URL:', distUrl);
  }
  
  console.log('');
  console.log('📌 Pipeline Details');
  console.log('   - Source Commit:', gitCommit);
  console.log('   - Deployment Branch:', gitBranch);
  console.log('   - Stage:', stage);
  console.log('   - Pipeline ID:', Date.now());
  console.log('   - Build ID: ' + Date.now());
  console.log('');
  console.log('🔍 Test Endpoints');
  console.log('   Menu API: ${outputs.apiGatewayUrl}/api/menu');
  console.log('   Quote API: ${outputs.apiGatewayUrl}/api/quote');
  console.log('');
  console.log('🗑️  Cleanup: aws cloudformation delete-stack --stack-name cloudcafe-${stage} --region ${region}');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

async function cleanup(packageDir) {
  await fs.rm(packageDir, { recursive: true, force: true });
  console.log('✅ Package directory cleaned up');
}

async function main() {
  try {
    // Validate Stage
    await validateStage();
    
    // Install dependencies
    await installDependencies();
    
    // Create deployment package
    const packageDir = await createDeploymentPackage();
    
    // Prepare S3 bucket
    await prepareS3Bucket();
    
    // Upload artifacts
    await uploadArtifacts(packageDir);
    
    // Validate and package SAM template
    await validateSamTemplate();
    await packageSamTemplate();
    
    // Create and execute CloudFormation changeset
    const changesetName = await createCloudFormationChangeset();
    
    // Get CloudFront distribution ID
    const cloudFrontDistributionId = await getCloudFrontDistributionId();
    
    // Invalidate CloudFront cache
    await invalidateCloudFront(cloudFrontDistributionId);
    
    // Execute deployment
    await executeCloudFormationChangeset(changesetName);
    
    // Extract and display deployment results
    const outputs = await extractDeploymentOutputs();
    
    // Print final results
    printDeploymentResults(outputs);
    
    // Cleanup
    await cleanup(packageDir);
    
  } catch (error) {
    console.error('💥 Pipeline deployment failed:', error.message);
    process.exit(1);
  }
}

main();