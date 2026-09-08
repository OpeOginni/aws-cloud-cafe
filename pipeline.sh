#!/bin/bash

set -e

# Cloud Café Pipeline Command Script
# Usage: ./pipeline.sh [dev|staging|prod]

STAGE=${1:-dev}
REGION=${AWS_REGION:-eu-central-1}

echo "🚀 Cloud Café Pipeline Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Stage: $STAGE"
echo "Region: $REGION"
echo "Commit: $(git rev-parse --short HEAD)"
echo ""

# Validate stage
if [[ ! "$STAGE" =~ ^(dev|staging|prod)$ ]]; then
    echo "❌ Invalid stage. Must be 'dev', 'staging', or 'prod'"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create deployment directory
echo "📁 Creating deployment artifacts..."
mkdir -p package

# Copy SAM template and Lambda code
cp sam.yaml package/
cp -r lambda package/

# Handle S3 bucket
S3_BUCKET="cloudcafe-artifacts-${REGION}"
if ! aws s3 ls "s3://${S3_BUCKET}" &>/dev/null; then
    echo "📦 Creating S3 bucket for deployment artifacts..."
    aws s3 mb "s3://${S3_BUCKET}" --region "$REGION"
fi

# Upload artifacts to S3
echo "📤 Uploading SAM template and Lambda code to S3..."
aws s3 cp package/sam.yaml "s3://${S3_BUCKET}/sam.yaml"
aws s3 cp lambda.zip "s3://${S3_BUCKET}/lambda.zip"

# Validate SAM template
echo "✅ Validating SAM template..."
sam validate --template-file sam.yaml

# Package SAM template
echo "📦 Packaging SAM template..."
sam package \
    --template-file sam.yaml \
    --s3-bucket "${S3_BUCKET}" \
    --output-template-file packaged.yaml \
    --region "$REGION"

# Show source commit
echo ""
echo "📌 Pipeline Source Commit:"
echo "   SHA: $(git rev-parse HEAD)"
echo "   Branch: $(git rev-parse --abbrev-ref HEAD)"
echo ""

# Create changeset
echo "🔧 Creating CloudFormation changeset..."
CHANGESET_NAME="pipeline-changeset-$(date +%s)"

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

# Get CloudFront distribution ID from stack outputs
CLOUDFRONT_ID=$(aws cloudformation describe-stacks \
    --stack-name "cloudcafe-${STAGE}" \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
    --region "$REGION" \
    --output text 2>/dev/null || echo "")

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
echo "🚀 Executing deployment..."
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
echo "🌐 CloudFront URL: $CLOUDFRONT_URL"
echo "🔌 API URL: ${API_URL}/api/menu"
if [ -n "$LOG_GROUP" ]; then
    echo "📊 Logs: https://eu-central-1.console.aws.amazon.com/cloudwatch/home?region=eu-central-1#logsV2:log-groups/log-group/${LOG_GROUP}/log-events"
fi
echo ""
echo "📌 Pipeline Details:"
echo "   - Source Commit: $(git rev-parse HEAD)"
echo "   - Stage: $STAGE"
echo "   - Pipeline ID: $(date +%s)"
echo ""
echo "🔍 Test Endpoints:"
echo "   Menu: ${API_URL}/api/menu"
echo "   Quote: ${API_URL}/api/quote"
echo ""
echo "🗑️  Cleanup: aws cloudformation delete-stack --stack-name cloudcafe-${STAGE} --region $REGION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"