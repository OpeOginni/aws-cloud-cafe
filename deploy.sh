#!/usr/bin/env bash

set -e

STAGE=${STAGE:-dev}
REGION=${AWS_REGION:-eu-central-1}

echo "🔧 Cloud Café Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Stage: $STAGE"
echo "Region: $REGION"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Create deployment directory
mkdir -p deploy/lambda/deploy
mkdir -p deploy/application

# Copy SAM template
cp sam.yaml deploy/

# Copy Lambda code
cp lambda/index.mjs deploy/lambda/
cp lambda/middleware.mjs deploy/lambda/2>/dev/null || true

# Copy API code
mkdir -p deploy/lambda/api
cp api/pricing.mjs deploy/lambda/api/

# Create simple README for deployed backend
cat > deploy/README.md << 'EOF'
# Cloud Café Backend
EOF

# Create package.json for Lambda
cat > deploy/lambda/package.json << 'EOF'
{
  "type": "module",
  "dependencies": {}
}
EOF

echo "📦 Packaging Lambda..."
cd deploy
npm pack
eq=?

# Determine package location
ZIP_FILE=$(find . -name "*.zip" -not -path "./node_modules/*" | head -1)

if [ -z "$ZIP_FILE" ]; then
  echo "❌ Could not find package zip file"
  exit 1
fi

# Create S3 bucket if it doesn't exist
echo "📦 Creating S3 bucket..."
RELEASE_BUCKET="cloudcafe-artifacts-${REGION}-$(date +%s)"
aws s3 mb s3://${RELEASE_BUCKET} --region ${REGION} 2>/dev/null || true

# Upload to S3
echo "📤 Uploading to S3..."
aws s3 cp sam.yaml s3://${RELEASE_BUCKET}/sam.yaml
aws s3 cp ${ZIP_FILE} s3://${RELEASE_BUCKET}/lambda.zip

echo "📥 Deploying stack..."
sam package \
  --template-file sam.yaml \
  --s3-bucket ${RELEASE_BUCKET} \
  --output-template-file packaged.yaml \
  --region ${REGION} \
  --TAGS Stage=${STAGE} Application=CloudCafe

sam deploy \
  --template-file packaged.yaml \
  --stack-name cloudcafe-${STAGE} \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides Stage=${STAGE} \
  --region ${REGION} \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset

echo ""
echo "✨ Deployment Complete!"
echo ""
echo "check deployed URL from CloudFormation outputs"
EOF