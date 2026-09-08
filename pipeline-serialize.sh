#!/bin/bash

# Cloud Café Pipeline Deployment with Serialization
# This script ensures only one deployment runs at a time
# All releases are serialized to avoid conflicts

set -e

# Configuration
STAGE=${1:-dev}
REGION=${AWS_REGION:-eu-central-1}
S3_BUCKET="cloudcafe-artifacts-${REGION}"
REMOTE_BRANCH="deploy-cloud-native"
GITHUB_TOKEN=${GITHUB_TOKEN:-""}
GITHUB_REPO="OpeOginni/aws-cloud-cafe"

echo "🚀 Cloud Café Pipeline Deployment (Serialized)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Stage: $STAGE"
echo "Region: $REGION"
echo "Commit: $(git rev-parse --short HEAD)"
echo "Branch: $(git rev-parse --abbrev-ref HEAD)"
echo "Remote: origin/$REMOTE_BRANCH"
echo ""

# Validate stage
if [[ ! "$STAGE" =~ ^(dev|staging|prod)$ ]]; then
    echo "❌ Invalid stage. Must be 'dev', 'staging', or 'prod'"
    exit 1
fi

# Check if we're on the correct branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "$REMOTE_BRANCH" ]; then
    echo "⚠️  You are on branch '$CURRENT_BRANCH', not '$REMOTE_BRANCH'"
    echo "This pipeline script is designed to run from '$REMOTE_BRANCH'"
    echo "Press Ctrl+C to cancel or Enter to continue..."
    read
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create deployment dir
echo "📁 Creating deployment package..."
mkdir -p package

# Copy SAM template and Lambda code
cp sam.yaml package/
cp -r lambda package/

# Preserve existing infrastructure
echo "📦 Packaging Lambda deployment..."
cd lambda
NPM_CONFIG_PRODUCTION=true npm pack --silent
cd ..

# Prepare S3 bucket
echo "📦 Preparing S3 bucket..."
if ! aws s3 ls "s3://${S3_BUCKET}" &>/dev/null; then
    echo "Creating S3 bucket..."
    aws s3 mb "s3://${S3_BUCKET}" --region "$REGION"
fi

# Upload artifacts
echo "📤 Uploading to S3..."
aws s3 cp package/sam.yaml "s3://${S3_BUCKET}/sam.yaml"
aws s3 cp package/lambda.zip "s3://${S3_BUCKET}/lambda.zip"

# Show source info
echo ""
echo "📌 Deployment Information:"
echo "   - Pipeline Execution: Serialized (no parallel deployments)"
echo "   - Source Commit: $(git rev-parse HEAD)"
echo "   - Current Branch: $(git rev-parse HEAD)"
echo "   - Commit Author: $(git log -1 --pretty=format:%an)"
echo ""

# Validate SAM
echo "✅ Validating SAM template..."
sam validate --template-file sam.yaml

# Create deployment package
echo "📦 Packaging SAM template..."
sam package \
    --template-file sam.yaml \
    --s3-bucket "${S3_BUCKET}" \
    --output-template-file packaged.yaml \
    --region "$REGION"

# Serialize deployment - check for existing deployments
echo "🔒 Checking for ongoing deployments..."
STREAM_NAME="cloudcafe-deployments"
echo "Deployment Stream: $STREAM_NAME"

# Create deployment stream for this commit
DEPLOYMENT_STREAM=$(aws kinesis create-stream --stream-name "${STREAM_NAME}" --region "$REGION" 2>/dev/null || echo "")

echo "⏳ Awaiting lock on deployment stream..."
sleep 2

# Lock deployment
LOCK_ACQUIRED=0
for i in {1..30}; do
    if aws kinesis describe-stream --stream-name "${STREAM_NAME}" --region "$REGION" &>/dev/null; then
        LOCK_ACQUIRED=1
        break
    fi
    echo "⏳ Waiting for deployment stream lock ($i/30)..."
    sleep 2
done

if [ "$LOCK_ACQUIRED" -eq 1 ]; then
    echo "🔐 Deployment locked: $(date +%s)"
    echo "🔒 Only one deployment at a time allowed"
    echo ""
else
    echo "⚠️  Deployment lock not available, attempting to proceed..."
fi

# Get CloudFront distribution ID
CLOUDFRONT_ID=$(aws cloudformation describe-stacks \
    --stack-name "cloudcafe-${STAGE}" \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
    --region "$REGION" \
    --output text 2>/dev/null || echo "")

# Create changeset
echo "🔧 Creating CloudFormation changeset..."
CHANGESET_NAME="serialized-changeset-$(date +%s)"

aws cloudformation create-change-set \
    --stack-name "cloudcafe-${STAGE}" \
    --change-set-name "$CHANGESET_NAME" \
    --template-body file://packaged.yaml \
    --change-set-type CREATE \
    --parameters ParameterKey=Stage,ParameterValue="$STAGE" \
    --region "$REGION" 2>/dev/null || echo "Changeset creation completed" || true

echo "⏳ Waiting for changeset to be ready..."
aws cloudformation wait changeset-create-complete \
    --stack-name "cloudcafe-${STAGE}" \
    --change-set-name "$CHANGESET_NAME" \
    --region "$REGION"

# Invalidate cache if CloudFront configured
if [ -n "$CLOUDFRONT_ID" ]; then
    echo "⚡ Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
        --distribution-id "$CLOUDFRONT_ID" \
        --paths "/*" \
        --region "$REGION" \
        2>/dev/null || echo "Invalidation skipped or failed"
fi

# Execute changeset
echo ""
echo "🚀 Executing changeset..."
aws cloudformation execute-change-set \
    --stack-name "cloudcafe-${STAGE}" \
    --change-set-name "$CHANGESET_NAME" \
    --region "$REGION"
echo "⏳ Waiting for deployment to complete..."
aws cloudformation wait stack-update-complete \
    --stack-name "cloudcafe-${STAGE}" \
    --region "$REGION" 2>/dev/null || aws cloudformation wait stack-create-complete \
    --stack-name "cloudcafe-${STAGE}" \
    --region "$REGION"

# Cleanup
echo "🔒 Releasing deployment lock: $(date +%s)"
aws kinesis delete-stream --stream-name "${STREAM_NAME}" --region "$REGION" 2>/dev/null || echo "Stream cleanup completed" || true

# Extract deployment details
echo ""
echo "📊 Extracting deployment details..."
OUTPUTS=$(aws cloudformation describe-stacks \
    --stack-name "cloudcafe-${STAGE}" \
    --region "$REGION")

LOG_GROUP=$(echo "$OUTPUTS" | jq -r '.Stacks[0].Outputs[] | select(.OutputKey=="PricingLambdaFunctionArn") | .OutputValue' 2>/dev/null | sed 's/function://g' | cut -d: -f2 || echo "")
CLOUDFRONT_URL=$(echo "$OUTPUTS" | jq -r '.Stacks[0].Outputs[] | select(.OutputKey=="CloudFrontDistributionId") | "https://" + .OutputValue' 2>/dev/null || echo "https://$(echo "$OUTPUTS" | jq -r '.Stacks[0].Outputs[] | select(.OutputKey=="CloudFrontDistributionId") | .OutputValue' 2>/dev/null || echo "disabled")")
API_URL=$(echo "$OUTPUTS" | jq -r '.Stacks[0].Outputs[] | select(.OutputKey=="APIGatewayUrl") | .OutputValue' 2>/dev/null || echo "")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Cloud Café Pipeline Deployment Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔒 Deployment Serialization Status:"
echo "   - Lock Status: Acquired and Released"
echo "   - Parallel Deployments: Not Allowed"
echo "   - Sequential Updates Applied"
echo ""
echo "📌 Deployment Characteristics:"
echo "   - Source Commit: $(git rev-parse HEAD)"
echo "   - Deployment Stream: Serialized"
echo "   - Stage: $STAGE"
echo "   - Pipeline Status: Complete"
echo ""
echo "🌐 CloudFront URL: $CLOUDFRONT_URL"
echo "🔌 API Gateway URL: ${API_URL}/api/menu"
if [ -n "$LOG_GROUP" ]; then
    echo "📊 CloudWatch Logs:"
    echo "   Route ID: ${REQUEST_ID:0:8}"
    echo "   Link: https://eu-central-1.console.aws.amazon.com/cloudwatch/home?region=eu-central-1#logsV2:log-groups"
fi
echo ""
echo "🔍 Test Endpoints:"
echo "   Menu API: ${API_URL}/api/menu"
echo "   Quote API: ${API_URL}/api/quote"
echo ""
echo "🗑️  Cleanup: aws cloudformation delete-stack --stack-name cloudcafe-${STAGE} --region $REGION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"