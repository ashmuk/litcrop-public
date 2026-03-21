#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { LitCropStack } from '../lib/litcrop-stack';

const app = new cdk.App();

new LitCropStack(app, 'LitCropStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-northeast-1',
  },
  description: 'LitCrop MVP — remote farm observation web app infrastructure',
});

app.synth();
