# Cloud Café - AWS Cloud-Native Deployment

## Overview
This project provides a complete cloud-native deployment for the Cloud Café application using AWS SAM, Lambda, API Gateway, S3, and CloudFront.

## Architecture
```
┌─────────────────────────────────────────────────────────┐
│                   CloudFront Distribution               │
│            (HTTPS & Static Content Delivery)            │
└─────────────────┬───────────────────────────────────────┘
                  │
      ┌───────────┴───────────┐
      │                       │
┌─────▼─────┐           ┌─────▼─────┐
│  S3 Bucket│           │   API GW   │
│ (Menu &   │           │   HTTP API │
│Frontend)  │           │    (v2)    │
└─────┬─────┘           └─────┬─────┘
      │                       │
      └───────────┬───────────┘
                  │
         ┌────────▼────────┐
         │  Lambda Function │
         │   (pricing.mjs)  │
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │  CloudWatch Logs│
         └─────────────────┘
```

## Prerequisites
- AWS Account with appropriate permissions
- AWS CLI configured
- Node.js 20.x
- SAM CLI installed
- Git

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Deploy to Development Stage
```bash
# Set your AWS environment
export AWS_REGION=eu-central-1
export STAGE=dev
export S3_BUCKET=your-bucket-name

# Deploy (upload to remote S3 bucket)
node deploy.mjs

# Or deploy directly (console-based deployment)
sh deploy.sh
```

### 3. Deployment Options

#### Option A: Remote S3 Bucket
```bash
npm install
aws s3 mb s3://my-cloudcafe-artifacts --region eu-central-1
node deploy.mjs
```

#### Option B: Direct Deployment
```bash
npm install
node deploy.mjs
# Follow prompts for S3 bucket and deployment
```

### 4. Access Your Application

Once deployed, you'll receive:
- **CloudFront URL** for the frontend
- **API Gateway URL** for the menu and quote endpoints
- **Log Group** for debugging

#### Test Menu Endpoint
```bash
curl https://your-cloudfront-url/api/menu
```

#### Test Quote Endpoint
```bash
curl -X POST https://your-apigateway-url/api/quote \
  -H "Content-Type: application/json" \
  -d '{"fulfillment": "delivery", "items": [{"id": "flat-white", "quantity": 2}]}'
```

#### Verify Pricing
```bash
# Pickup for 2 flat whites = 840 cents + 0 fee = 840 cents
curl -X POST https://your-apigateway-url/api/quote \
  -H "Content-Type: application/json" \
  -d '{"fulfillment": "pickup", "items": [{"id": "flat-white", "quantity": 2}]}'

# Delivery for 2 flat whites = 840 cents + 490 fee = 1330 cents
curl -X POST https://your-apigateway-url/api/quote \
  -H "Content-Type: application/json" \
  -d '{"fulfillment": "delivery", "items": [{"id": "flat-white", "quantity": 2}]}'
```

## Infrastructure Components

### SAM Template
- **PricingLambda**: Node.js 20.x Lambda function with pricing logic
- **MenuS3**: Private S3 bucket for menu and frontend assets
- **APIGateway**: HTTP API v2 for REST endpoints
- **CloudFrontDistribution**: CloudFront distribution for secure HTTPS delivery
- **ServiceRole**: IAM role for Lambda execution
- **Middleware**: CloudFront middleware for custom logging

### Lambda Handler
- **GET /api/menu**: Returns the coffee menu catalog
- **POST /api/quote**: Calculates pricing for orders
- **Request ID**: Propagates from API Gateway to Lambda
- **CloudWatch Logs**: JSON-formatted logging

### S3 Bucket Configuration
- **Public Access**: Fully blocked
- **Encryption**: AES256
- **Versioning**: Suspended
- **Private**: Only accessible through CloudFront

## CloudFront Configuration
- **HTTPS Only**: Redirects to secure URL
- **Cache Policy**: Browser cache disabled (no-store)
- **Error Handling**: Returns index.html for 404/403/500 errors
- **Custom Headers**: Additional logging metadata

## IAM Permissions

The deployment creates the following IAM policies:
- **Lambda Execution**: CloudWatch logs creation
- **S3 Access**: Read-only access to menu bucket
- **API Gateway**: Lambda invocations
- **CloudFront**: Custom middleware execution

## Testing

### Local Tests
```bash
npm test
```

### Lambda-specific tests (new)
```bash
node test/lambda.test.mjs
```

### Integration Testing
```bash
# After deployment, test the endpoints
curl https://your-cloudfront-url/api/menu
curl -X POST https://your-apigateway-url/api/quote \
  -H "Content-Type: application/json" \
  -d '{"fulfillment": "delivery", "items": [{"id": "flat-white", "quantity": 2}]}'
```

## Monitoring

### View CloudWatch Logs
```bash
aws logs tail /aws/lambda/your-lambda-name --follow --region eu-central-1
```

### CloudFront Analytics
```bash
aws cloudfront get-distribution-configuration --id YOUR_DISTRIBUTION_ID
```

## Cleanup

### Delete Stack
```bash
sam delete --stack-name cloudcafe-dev --region eu-central-1
```

### Delete S3 Bucket
```bash
aws s3 rb s3://your-bucket-name --force --region eu-central-1
```

## Environment Variables

### Available Parameters
- `STAGE`: Deployment stage (dev/staging/prod)
- `S3BucketArtifact`: Explicit S3 bucket for artifacts
- `CloudFrontDistributionId`: Custom CloudFront distribution
- `LambdaTimeout`: Lambda timeout in seconds
- `LambdaMemory`: Lambda memory in MB

### Production Considerations
- Set appropriate timeouts and memory
- Implement custom domain names
- Add WAF security rules
- Configure proper HTTPS requirements
- Set up alarms for high latency/error rates

## Troubleshooting

### Deployment Issues
```bash
# Check SAM build status
sam version

# Test Lambda deployment locally
sam local invoke PricingFunction --event payload.json

# View CloudFormation stack events
aws cloudformation describe-stack-events \
  --stack-name cloudcafe-dev \
  --region eu-central-1
```

### Lambda Issues
```bash
# Check Lambda logs
aws logs tail /aws/lambda/your-lambda-name \
  --since 24h \
  --region eu-central-1

# Test Lambda locally with sample event
sam local invoke PricingFunction \
  --event '{"requestContext":{"requestId":"test123"}}'
```

## Security Considerations
- ✅ No public S3 bucket access
- ✅ HTTPS only delivery via CloudFront
- ✅ Lambda with proper execution IAM role
- ✅ No sensitive data in logs
- ✅ Log retention policies
- ✅ MFA required for deployment

## Performance Optimizations
- ✅ Lambda function for stateless pricing computation
- ✅ CloudFront for edge delivery
- ✅ S3 for static content storage
- ✅ HTTP API v2 for low latency
- ✅ No database for demo use case

## Development Workflow

1. **Add Features**
   ```bash
   # Modify code files
   # Update Lambda handler if needed
   # Test locally
   ```

2. **Test Locally**
   ```bash
   npm test
   ```

3. **Deploy Updates**
   ```bash
   node deploy.mjs
   ```

4. **Monitor**
   ```bash
   aws logs tail /aws/lambda/your-lambda-name --follow
   ```

## Project Structure
```
.
├── application/          # Frontend assets
│   ├── index.html
│   ├── app.js
│   └── style.css
├── api/                  # API modules
│   └── pricing.mjs
├── lambda/               # Lambda handlers
│   ├── index.mjs
│   └── middleware.mjs
├── test/                 # Test files
│   ├── api.test.mjs
│   └── lambda.test.mjs
├── sam.yaml             # SAM template
├── deploy.mjs           # Deployment script
└── README.md           # This file
```

## License
MIT License - Feel free to use for AWS User Group events and demos!

## Support
For issues or questions, please reach out to the AWS User Group Frankfurt team.
