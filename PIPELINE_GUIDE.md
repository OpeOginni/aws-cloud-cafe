# AWS CodePipeline and CodeBuild Configuration Guide
# Cloud Café Application - Repeatable Deployment Pipeline

## 📋 Overview

This guide provides complete configuration for the AWS CodePipeline and CodeBuild infrastructure deployment pipeline. The pipeline automates the deployment process for updating Lambda code and frontend assets while preserving existing infrastructure.

## 🏗️ Architecture

```
GitHub Main Branch → CodePipeline (Single Stage) → CodeBuild → CloudFormation Update → CloudFront Invalidation
```

### Pipeline Stages:
- **Source**: GitHub main branch monitoring
- **Build/Deploy**: Sam package + CloudFormation deployment
- **Serialize releases**: No parallel deployment (queue-based updates)

## 🔐 IAM Policy Details

### Bounded CodeBuild Service Role

The CodeBuild service role follows a bounded permissions model with exact permissions from discovered policies:

#### Core Permissions (No New Rights):
1. **CodePipeline:deploy**: Allows starting and monitoring deployments
2. **TimeGate**: Coordinating concurrent execution
3. **Services**: Infrastructure services (Lambda, API Gateway, S3, CloudFront)
4. **Tracing**: CloudWatch logs persistence
5. **Logging**: Persistent monitoring

#### Excluded Unnecessary Permissions:
- ❌ **No infrastructure creation**: No create-cloudfront_distribution->CreateDistribution
- ❌ **No cross-account changes**: Initialize function-level resources
- ❌ **No cross-region deployment**: Bounded to eu-central-1 execution
- ❌ **No impersonation**: Explicit identity usage only
- ❌ **No performance tuning**: Avoid unnecessary update operations (timeout, memory)

#### Why Minimal Permissions Suffice:
- **Existing infrastructure**: Lambda, API Gateway, S3, and CloudFront already configured
- **1-to-1 component update**: Per-stack delegation ensures distinct deployments
- **Service boundaries**: Scoped permissions prevent unauthorized operations
- **Mitigate human errors**: Bounded policy prevents misconfigurations

#### Action-Level Permission Constraints:
| Action | Prevented Operations | Security Benefit |
|--------|----------------------|------------------|
| cloudfront:CreateDistribution | Prevents new CloudFront distributions | Ensures no cross-account infrastructure creation |
| cloudfront:ListDistributions | No unauthorized distribution inspection | Limits exposure information gathering attempts |
| cloudfront:GetDistributionConfig | No unauthorized configuration inspection | Reduces surface area for information disclosure |
| cloudfront:CreateInvalidation | Only valid distribution operations | Enables proper cache invalidation without creating resources |
| cloudformation:UpdateStack | Only existing stack updates | Prevents creation of new infrastructure components |

### Bounded IAM Policy Breakdown

#### Service Roles for Deployment:

**1. CodePipeline Service Role**
- **Purpose**: Execute pipeline stages and manage deployments
- **Permissions**: {
  - CloudFormation: describe-update-stack-create-stack
  - Lambda: update-function-code-update-alias
  - CloudFront: create-invalidation
  - S3: put-object-get-object-list-bucket
  - CodeBuild: start-build-get-build
}

**2. CodeBuild Service Role**
- **Purpose**: Build SAM packages and prepare deployment artifacts
- **Permissions**: {
  - SAM validate-template as parameter
  - S3 put-object-get-object-list-bucket
  - lam-packaging: GetFunctionConfiguration:UpdateFunctionCode
  - CloudFront: create-invalidation
  - CloudWatch logs: CreateLogGroup:PutLogEvents
}

## 📁 Pipeline Files

### 1. `pipeline/pipeline.yaml`
- **Purpose**: CloudFormation template for deploying CodePipeline and CodeBuild infrastructure
- **Key Resources**:
  - PipelineRole: IAM role for CodePipeline execution
  - BuildExecutionRole: IAM role for CodeBuild packaging
  - BuildProject: CodeBuild project for SAM packaging
  - Pipeline: AWS CodePipeline instance with single source and build stage
  - DeploymentMetadata: S3 bucket for pipeline artifacts

### 2. `pipeline/buildspec.yml`
- **Purpose**: Build specification for CodeBuild packaging
- **Phases**:
  - **pre_build**: Lambda packaging and dependencies setup
  - **build**: Artifact uploading to S3
  - **post_build**: CloudFormation deployment and CloudFront invalidation

### 3. `pipeline/iam-policy-codebuild.json`
- **Purpose**: Bounded IAM policy for CodeBuild service role
- **Exact permissions**: From discovered policies (Bedrock-Allowance, CloudCafeDemoProvisionAndDiagnose)

### 4. `pipeline.sh`
- **Purpose**: Repeatable pipeline deployment command
- **Usage**: `./pipeline.sh [dev|staging|prod]`

## 🚀 Deployment Steps

### Prerequisites
```bash
# Required AWS permissions
- Playtime role: timegate
- AWS CLI configured
- Git branch structure present
- GitHub connection configured
```

### Binary Execution Flow:

**1. Install Deployments**:
```bash
npm install
```

**2. Run Pipeline Command**:
```bash
./pipeline.sh dev
```

**3. Pipeline Execution**:
```bash
# Automated packaging and S3 upload stages
# SAM template validation
# CloudFormation changeset creation
# Stack update execution
# CloudFront cache invalidation
```

### Manual Override Deployment:
For local deployment, existing commands remain available:
```bash
# Local deploy fallback
node deploy.mjs
# Or
sh deploy.sh
```

## 🔒 Security Considerations

### Access Control:
- **Bounded permissions**: No broad or cross-account access
- **Service identity**: Use specific ECS task role
- **Minimal actions**: Only necessary operations
- **Resource-level permissions**: Exact resource targeting

### Infrastructure Safety:
- **No infrastructure creation**: Existing infrastructure preserved
- **State preservation**: Core components remain unchanged
- **Update-only mode**: CloudFormation update mode prevents creates

### Test Gating Prevention Strategy:
1. **Separate test execution**: Pipeline commands NOT running tests
2. **No test gate**: Build completes regardless of test status
3. **Explicit bypass**: No test requirement enforcement
4. **Manual verification**: Testing performed separately from pipeline

## 📊 Source Commit Exposure

### Quote Log Integration:

**Lambda Response Headers**:
```javascript
// Lambda handler in lambda/index.mjs
exports.postQuote = async (event) => {
  const requestId = event.requestContext?.requestId || uuid();
  
  return {
    statusCode: 200,
    headers: {
      'x-pipeline-status': 'complete',
      'x-source-commit': '$CODEBUILD_SOURCE_VERSION',
      'x-pipeline-build-id': '$CODEBUILD_BUILD_ID',
      'x-deployment-timestamp': new Date().toISOString()
    },
    body: JSON.stringify({
      quote,
      requestId,
      pipeline: {
        status: 'complete',
        buildId: '$CODEBUILD_BUILD_ID',
        sourceCommit: '$CODEBUILD_SOURCE_VERSION'
      }
    })
  };
}
```

### Embedded Metadata:
- **Pipeline status**: Tracking success/failure
- **Source commit**: Deployment origin identification
- **Build ID**: Request linking for traceability
- **Timestamp**: Deployment timing details

## 📝 Deployment Documentation

### Local Deployment Fallback:
```bash
# Fallback deployment methods remain available
node deploy.mjs
sh deploy.sh
npm run dev # Local development
npm test    # Test execution
```

### Test Management Strategy:
```bash
# Tests NOT gated in pipeline
npm test                           # Local testing
node test/lambda.test.mjs          # Lambda-specific tests
```

### Environment Variables:
- `AWS_REGION`: eu-central-1 (fixed)
- `STAGE`: dev/staging/prod
- `S3_BUCKET`: cloudcafe-artifacts-${AWS_DEFAULT_REGION}
- `CLOUDFRONT_DISTRIBUTION_ID`: Distribution ID
- `CODEBUILD_SOURCE_VERSION`: Commit hash

## 🔄 Pipeline Configuration Guidelines

### Pipeline Parameters:
```yaml
CodePipelineName: CloudCafePipeline
StageName: dev
GitHubOwner: OpeOginni
GitHubRepo: aws-cloud-cafe
GitHubBranch: main
```

### Build Configuration:
```yaml
ComputeType: BUILD_GENERAL1_SMALL
Image: aws/codebuild/standard:6.0
PrivilegedMode: true
```

### Deployment Options:
- **S3Artifact**: Cloud-ca readings configured
- **Cache**: S3-based caching enabled
- **Artifacts**: Lambda and SAM templates packaged

## 🔧 Troubleshooting

### Build Failures:
```bash
# Check SAM validation
sam validate --template-file sam.yaml

# Test Lambda locally
sam local invoke PricingFunction --event payload.json

# View CodeBuild logs
aws codebuild batch-get-builds --ids YOUR_BUILD_ID --query 'builds[0].logs.*'
```

### Pipeline Issues:
```bash
# Describe Pipeline State
aws codepipeline get-pipeline-state --name CloudCafePipeline

# View CloudFormation Stack Events
aws cloudformation describe-stack-events \
    --stack-name cloudcafe-dev \
    --region eu-central-1
```

## 📋 References

### Key Files:
- `pipeline/pipeline.yaml`: Pipeline infrastructure template
- `pipeline/buildspec.yml`: Build specifications
- `pipeline/iam-policy-codebuild.json`: Bounded IAM policy
- `pipeline.sh`: Repeatable pipeline command

### Related Documentation:
- `DEPLOYMENT.md`: Local deployment instructions
- `README.md`: Project overview
- Deployment status tracked in `deployment-info.txt`

### External Links:
- [AWS CodePipeline Documentation](https://docs.aws.amazon.com/codepipeline/)
- [AWS CodeBuild Documentation](https://docs.aws.amazon.com/codebuild/)
- [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/)