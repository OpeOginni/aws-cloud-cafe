# AWS CodePipeline: Cloud Café Deployment

## Pipeline Configuration Overview

This repository includes complete AWS CodePipeline and CodeBuild configuration for automated deployments of the Cloud Café application.

## 📦 Pipeline Components

### 1. Infrastructure Setup
- **File**: `pipeline/`
- **Files**:
  - `pipeline.yaml`: CloudFormation template for deploying CodePipeline infrastructure
  - `buildspec.yml`: Build specification for CodeBuild packaging
  - `iam-policy-codebuild.json`: Bounded IAM policy for CodeBuild service role
  - `guest-role-policy.json`: Guest role policy for CodePipeline

### 2. Deployment Scripts
- **Files**:
  - `pipeline.sh`: Bash script for repeatable pipeline deployment
  - `pipeline.mjs`: Node.js script for complete pipeline control
  - `deploy.mjs`: Local fallback deployment script

## 🚀 Usage

### Automated Pipeline Deployment
```bash
# Stage deployment
./pipeline.sh dev
./pipeline.sh staging
./pipeline.sh prod
```

### Node.js Pipeline Script
```bash
# Execute pipeline with environment variables
STAGE=staging npm run pipeline
```

### Local Fallback
```bash
# Keep local deployment available
node deploy.mjs
```

## 🔐 Key Features

### Bounded Permissions Model
- **Exact permissions**: From discovered policies only
- **Infrastructure preservation**: No new resources created
- **Update-only mode**: CloudFormation updates existing infrastructure
- **Security controls**: Minimal necessary permissions

### Deployment Strategy
- **Serialize releases**: No parallel deployment
- **Fail-fast**: Package/deploy errors prevent deployment
- **Source tracking**: Commit hash embedded in Lambda response
- **Cache invalidation**: CloudFront cache cleared on each deployment

## 📊 Integration Details

### Lambda Response Headers
```javascript
// Automatically includes deployment metadata in quote responses
{
  "headers": {
    "x-pipeline-status": "complete",
    "x-source-commit": "b3284da",
    "x-pipeline-build-id": "123456",
    "x-deployment-timestamp": "2026-09-08T..."
  }
}
```

### IAM Policy Breakdown
- **CodePipeline Role**: Stage execution and deployment orchestration
- **CodeBuild Role**: SAM packaging and artifact management
- **Bounded Actions**: Exact permissions from discovered policies only

## 📝 Deployment Process

1. **Source Stage**: GitHub main branch monitoring
2. **Build Stage**: SAM package creation and CloudFormation validation
3. **Deploy Stage**: CloudFormation changeset creation and execution
4. **Post-Deployment**: CloudFront cache invalidation

## 🔍 Support and Troubleshooting

### Common Issues
- **Build failures**: Check SAM template validity with `sam validate --template-file sam.yaml`
- **Pipeline failures**: Use `aws codepipeline get-pipeline-state` for details
- **CloudFormation errors**: Check stack events with `aws cloudformation describe-stack-events`

### Monitoring
- CloudWatch Logs: `aws logs tail /aws/lambda/your-lambda-name --follow --region eu-central-1`
- Pipeline status: AWS CodePipeline console
- Stack status: AWS CloudFormation console

## 🗑️ Cleanup
```bash
# Delete stack and pipeline
aws cloudformation delete-stack --stack-name cloudcafe-deploy-cloud-native
aws codepipeline delete-pipeline --name CloudCafePipeline
```

## 📚 Additional Documentation
- [`PIPELINE_GUIDE.md`](PIPELINE_GUIDE.md): Complete pipeline configuration guide
- [`DEPLOYMENT.md`](DEPLOYMENT.md): Local deployment instructions
- [`FINAL_DELIVERABLES.md`](FINAL_DELIVERABLES.md): Deployment status and delivery summary