#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { LitCropStack } from '../lib/litcrop-stack';

const app = new cdk.App();

// Environment selection via CDK context: -c env=stg (default) or -c env=prod
// Staging keeps the existing CloudFormation stack ID 'LitCropStack' to avoid
// orphaning RETAIN resources (DynamoDB, Cognito, S3 images/thumbnails).
const envKey = (app.node.tryGetContext('env') || 'stg') as string;
const envMap: Record<string, { stackId: string; envName: 'mvp' | 'prod'; description: string }> = {
  stg: { stackId: 'LitCropStack', envName: 'mvp', description: 'LitCrop MVP — remote farm observation web app infrastructure' },
  prod: { stackId: 'LitCropProd', envName: 'prod', description: 'LitCrop production — main branch' },
};
const envConfig = envMap[envKey];

if (!envConfig) {
  throw new Error(`Unknown env "${envKey}". Use -c env=stg or -c env=prod`);
}

// Custom domain (production only): -c domain=litcrop.com -c hostedZoneId=Z05...
const domainName = app.node.tryGetContext('domain') as string | undefined;
const hostedZoneId = app.node.tryGetContext('hostedZoneId') as string | undefined;

new LitCropStack(app, envConfig.stackId, {
  envName: envConfig.envName,
  domainName,
  hostedZoneId,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-northeast-1',
  },
  description: envConfig.description,
});

app.synth();
