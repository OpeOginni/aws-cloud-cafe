#!/bin/bash

# Cloud Café - Quick Start Pipeline Deployment
# Minimal pipeline execution for rapid deployment

set -e

# Quick deployment with default configuration
STAGE=${1:-dev}

echo " 📦 Cloud Café - Quick Pipeline Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Stage: $STAGE"
echo "Region: ${AWS_REGION:-eu-central-1}"
echo ""

# Validate stage
if ! echo "$STAGE" | grep -qE "^(dev|staging|prod)$"; then
  echo " ❌ Invalid stage: $STAGE (must be dev, staging, or prod)"
  exit 1
fi

# Run validated pipeline
if [ -f "validate-pipeline.sh" ]; then
  echo "🔍 Running pipeline validation..."
  bash validate-pipeline.sh
else
  echo "⚠️  Validation skipped, proceeding directly..."
fi

echo ""
echo "🚀 Starting pipeline deployment..."

if [ -f "pipeline.sh" ]; then
  bash pipeline.sh "$STAGE"
else
  echo "❌ Pipeline script not found"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✅ Deployment Complete"
echo ""
echo "📖 Documentation:"
echo "   • PIPELINE_GUIDE.md"
echo "   • README_PIPELINE.md"
echo "   • PIPELINE_DELIVERABLES.md"
echo ""
echo "🚀 Next Steps:"
echo "   1. Test the deployed Lambda: npm test"
echo "   2. Monitor CloudWatch Logs"
echo "   3. Verify CloudFront URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"