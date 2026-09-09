#!/usr/bin/env bash
set -euo pipefail

REGION="eu-central-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
STACK_NAME="cloud-cafe-app"
ARTIFACT_BUCKET="cloud-cafe-artifacts-${ACCOUNT_ID}"
GIT_COMMIT=$(git rev-parse --short HEAD)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Deploying Cloud Café  commit=${GIT_COMMIT}  region=${REGION}"

# ---------- 1. Ensure SAM artifact bucket exists and is secured ----------
if ! aws s3api head-bucket --bucket "$ARTIFACT_BUCKET" 2>/dev/null; then
  echo "==> Creating artifact bucket: ${ARTIFACT_BUCKET}"
  aws s3api create-bucket \
    --bucket "$ARTIFACT_BUCKET" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION"
fi

echo "==> Securing artifact bucket"
aws s3api put-public-access-block \
  --bucket "$ARTIFACT_BUCKET" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-ownership-controls \
  --bucket "$ARTIFACT_BUCKET" \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'

aws s3api put-bucket-encryption \
  --bucket "$ARTIFACT_BUCKET" \
  --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'

aws s3api put-bucket-versioning \
  --bucket "$ARTIFACT_BUCKET" \
  --versioning-configuration Status=Enabled

# ---------- 2. Copy shared module into Lambda build directory ----------
echo "==> Copying api/pricing.mjs into Lambda build directory"
cp "$ROOT_DIR/api/pricing.mjs" "$ROOT_DIR/infra/lambda/pricing.mjs"

cleanup() {
  rm -f "$ROOT_DIR/infra/lambda/pricing.mjs"
}
trap cleanup EXIT

# ---------- 3. SAM build ----------
echo "==> Building SAM application"
sam build --template-file "$ROOT_DIR/template.yaml" --base-dir "$ROOT_DIR"

# ---------- 4. SAM deploy ----------
echo "==> Deploying SAM stack: ${STACK_NAME}"
sam deploy \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --s3-bucket "$ARTIFACT_BUCKET" \
  --s3-prefix "sam" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides "GitCommit=${GIT_COMMIT}" \
  --tags Project=cloud-cafe

# ---------- 5. Upload web assets to S3 ----------
SITE_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`SiteBucketName`].OutputValue' \
  --output text)

echo "==> Syncing web/ to s3://${SITE_BUCKET}"
aws s3 sync "$ROOT_DIR/web/" "s3://${SITE_BUCKET}/" --delete \
  --cache-control "public, max-age=86400"

# ---------- 6. Invalidate CloudFront ----------
DIST_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
  --output text)

echo "==> Invalidating CloudFront distribution: ${DIST_ID}"
aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' --output text

# ---------- 7. Print outputs ----------
CF_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontUrl`].OutputValue' \
  --output text)

LOG_GROUP=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`LogGroupName`].OutputValue' \
  --output text)

echo ""
echo "=========================================="
echo "  Cloud Café deployed successfully"
echo "=========================================="
echo "  CloudFront URL : ${CF_URL}"
echo "  Stack name     : ${STACK_NAME}"
echo "  Log group      : ${LOG_GROUP}"
echo "  Git commit     : ${GIT_COMMIT}"
echo "  Region         : ${REGION}"
echo "=========================================="
