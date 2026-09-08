# Cloud Café Cloud-Native Deployment Guide

## Quick Start Deployment

### Prerequisites
```bash
# Install AWS CLI
sudo apt-get install awscli

# Configure AWS credentials
aws configure --profile cloudcafe

# Install Node.js 20.x
nvm install 20

# Install SAM CLI
sudo apt-get install aws-sam-cli
```

### Deployment Steps

#### 1. Prepare for Deployment
```bash
# Navigate to workspace
cd /workspace/aws-cloud-cafe

# Install dependencies
npm install

# Verify tests pass
npm test
```

#### 2. Initialize Deployment/ branch
```bash
git checkout -b deploy-cloud-native
git push origin deploy-cloud-native
```

#### 3. Deploy to AWS
```bash
# Set environment variables
export AWS_PROFILE=cloudcafe
export AWS_REGION=eu-central-1
export STAGE=dev

# Run deployment
node deploy.mjs
```

Wait for deployment to complete (typically 5-10 minutes).

#### 4. Access Your Application
After successful deployment, you'll receive:
- **CloudFront URL**: Access your deployed frontend
- **API Gateway URL**: Test menu and quote endpoints
- **Log Group**: Monitor Lambda execution

#### 5. Verify Functionality
```bash
# Test menu endpoint
curl https://<your-cloudfront-url>/api/menu

# Test quote endpoint
curl -X POST https://<your-apigateway-url>/api/quote \
  -H "Content-Type: application/json" \
  -d '{"fulfillment": "delivery", "items": [{"id": "flat-white", "quantity": 2}]}'

# Expected delivery quote: 1330 cents (840 + 490)
```

## Infrastructure Components

### SAM Template Composition
- **PricingLambda**: Node.js 20.x lambda with pricing/business logic
- **MenuS3**: Private S3 bucket for frontend assets
- **APIGateway**: HTTP API v2 for API routing
- **CloudFrontDistribution**: Edge delivery with HTTPS
- **ServiceRole**: IAM role for Lambda execution

### Lambda Function Details
```javascript
export const menu = [...]; // 4 coffee menu items
export const fees = { pickup: 0, delivery: 490 };
export function quoteOrder(input) { /* pricing logic */ }
```

### Pricing Logic Verification
```javascript
// Pickup: 2 × 420 = 840 cents, fee = 0, total = 840
// Delivery: 2 × 420 = 840 cents, fee = 490, total = 1330
```

## Deployment Options

### Option 1: Direct SAM Deployment
```bash
sam build
sam package --s3-bucket YOUR_BUCKET
sam deploy
```

### Option 2: Automated Script (Recommended)
```bash
node deploy.mjs
```

### Option 3: Manual Deployment
```bash
# Build Lambda
npm pack
# Upload to S3
aws s3 cp package.tar.gz s3://bucket-name/
# Build and deploy
sam build
sam deploy --guided
```

## Environment Configuration

### Stage-Specific Settings
```bash
# Development
export STAGE=dev
# Resource names: cloudcafe-dev-*

# Staging
export STAGE=staging
# Resource names: cloudcafe-staging-*

# Production
export STAGE=prod
# Resource names: cloudcafe-prod-*
```

### Custom CloudFront Distribution
```bash
export CLOUDFRONT_DISTRIBUTION_ID=YOUR_DISTRIBUTION_ID
```

## Monitoring and Troubleshooting

### View Lambda Logs
```bash
# Get log group name
aws cloudformation describe-stacks --stack-name cloudcafe-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`PricingLambdaFunctionArn`].OutputValue' \
  --output text

# Tail logs
aws logs tail /aws/lambda/lambda-name --follow --region eu-central-1
```

### Check Deployment Status
```bash
# View CloudFormation events
aws cloudformation describe-stack-events \
  --stack-name cloudcafe-dev \
  --region eu-central-1 \
  --max-items 100

# Check Lambda status
aws lambda describe-function-configuration \
  --function-name cloudcafe-dev-pricing-mr7s9 \
  --region eu-central-1
```

### Test API Endpoints Locally
```bash
# Forward API Gateway to localhost
sam local start-api

# Test endpoints
curl http://localhost:3000/api/menu
curl -X POST http://localhost:3000/api/quote \
  -H "Content-Type: application/json" \
  -d '{"items": [{"id": "flat-white", "quantity": 2}], "fulfillment": "delivery"}'
```

## Cleanup

### Remove CloudFormation Stack
```bash
node cleanup.mjs dev
```

### Remove S3 Bucket
```bash
aws s3 rb s3://cloudcafe-dev-menu-123 --force --region eu-central-1
```

### Remove Log Groups
```bash
aws logs delete-log-group --log-group-name /aws/lambda/lambda-name \
  --region eu-central-1
```

## Performance and Scaling

### Lambda Configuration
```
Runtime: Node.js 20.x
Timeout: 5 seconds
Memory: 256 MB
```

### Auto-scaling
Lambda functions automatically scale based on request volume.

### CloudFront Caching
Currently set to no caching (`no-store`) for frequently updated menu data.

## Security Considerations

### IAM Roles
- Lambda execution role with CloudWatch and S3 permissions
- API Gateway trigger permission
- No direct public access to S3

### Network Security
- Private S3 bucket with CloudFront origin access
- HTTPS-only CloudFront distribution
- IP whitelisting via CloudFront WAF (optional)

## Cost Estimate (Development)

```
Lambda: ~$25/month (small usage)
API Gateway: ~$3.50/month
CloudFront: ~$86/month (100GB transfer)
S3: ~$0.23/month (infrequent access)
CloudWatch Logs: ~$1/month

Total: ~$115/month for demo/prod use
```

## Common Issues and Solutions

### Issue: Deployment Timeout
```bash
# Increase Lambda timeout in sam.yaml
LambdaTimeout: 10
```

### Issue: S3 Bucket Conflict
```bash
# Use unique bucket name
export S3_BUCKET=my-unique-cloudcafe-artifacts
```

### Issue: API Gateway Path Issues
```bash
# Check API documentation
sam local start-websocket  # or just check SAM template
```

## Additional Features

### Custom Domain Names
```bash
# Update sam.yaml with custom domain
CustomDomain:
  DomainName: api.yourdomain.com
```

### WAF Security
```bash
# Create WAF and link to CloudFront
aws wafv2 create-web-acl ...
```

### Database (Future Enhancement)
Currently using Lambda-only architecture. Consider DynamoDB for production.

## Support and Contact
For questions about this deployment, consult:
- AWS User Group Frankfurt
- Cloud Café Project Repository
- SAM Documentation: https://docs.aws.amazon.com/serverless-application-model/

## Deployment Checklist
- [ ] AWS credentials configured
- [ ] Node.js and SAM CLI installed
- [ ] Tests passing locally
- [ ] SAM template reviewed
- [ ] S3 bucket available or created
- [ ] CloudFront distribution selected
- [ ] Environment variables set
- [ ] Deployment executed successfully
- [ ] API endpoints verified
- [ ] Logs monitoring configured
- [ ] Cleanup plan in place

## Next Steps
1. Deploy and test the application
2. Verify pricing logic (pickup 840c, delivery 1330c)
3. Monitor through CloudWatch
4. Set up Scheduled Events for testing
5. Consider production-specific configurations
