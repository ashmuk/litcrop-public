/**
 * IAM policy regression tests (#397 — ADR-20260317 post-provisioning tightening).
 *
 * Asserts the least-privilege invariants that ADR-20260317 spells out, so a
 * future edit to scripts/iam-policy*.json can't silently regress the policy
 * back to wildcards or add destructive operations.
 *
 * What's NOT covered here:
 *   - AWS-side policy acceptance (needs `aws iam put-user-policy` which the
 *     test environment can't reach). Regression against AWS validation is
 *     covered by the deploy job failing loudly.
 *   - Whether the policy actually allows the operations the CDK needs. That
 *     surfaces during deploy; these tests only guard what we've explicitly
 *     decided should NOT be allowed.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Statement {
  Sid?: string;
  Effect: 'Allow' | 'Deny';
  Action: string | string[];
  Resource: string | string[];
}

interface Policy {
  Version: string;
  Statement: Statement[];
}

function loadPolicy(relPath: string): Policy {
  // __dirname = /workspace/src/api/src/__tests__ → four levels up = /workspace
  const abs = resolve(__dirname, '../../../..', relPath);
  return JSON.parse(readFileSync(abs, 'utf-8')) as Policy;
}

function allActions(policy: Policy): string[] {
  return policy.Statement.flatMap((s) =>
    Array.isArray(s.Action) ? s.Action : [s.Action],
  );
}

function statementBySid(policy: Policy, sid: string): Statement | undefined {
  return policy.Statement.find((s) => s.Sid === sid);
}

describe('iam-policy.json (POC — litcrop-poc-admin user)', () => {
  const policy = loadPolicy('scripts/iam-policy.json');

  it('has Version 2012-10-17', () => {
    expect(policy.Version).toBe('2012-10-17');
  });

  it('rejects wildcard service actions (no s3:*, dynamodb:*, lambda:*, cloudfront:*, apigateway:*, logs:*, iam:*)', () => {
    const bad = allActions(policy).filter((a) =>
      /^(s3|dynamodb|lambda|cloudfront|apigateway|logs|iam):\*$/.test(a),
    );
    expect(bad).toEqual([]);
  });

  it('does NOT permit destructive S3/DynamoDB/Lambda actions (least-privilege core)', () => {
    const actions = allActions(policy);
    expect(actions).not.toContain('s3:DeleteBucket');
    expect(actions).not.toContain('dynamodb:DeleteTable');
    expect(actions).not.toContain('lambda:DeleteFunction');
  });

  // #397: drop iam:CreateRole per ADR-20260317 post-provisioning recommendation.
  it('does NOT permit iam:CreateRole (#397 / ADR-20260317)', () => {
    expect(allActions(policy)).not.toContain('iam:CreateRole');
  });

  // #397: API Gateway resource scoping — narrowed from `::/*` to
  // `::/restapis/*` + `::/apis/*` so the policy can't reach
  // non-LitCrop-shaped endpoints like /tags, /account, /usageplans.
  it('scopes APIGateway to /restapis and /apis paths only (#397)', () => {
    const apigw = statementBySid(policy, 'APIGateway');
    expect(apigw).toBeDefined();
    const resources = Array.isArray(apigw!.Resource) ? apigw!.Resource : [apigw!.Resource];
    for (const r of resources) {
      expect(r).toMatch(/^arn:aws:apigateway:ap-northeast-1::\/(restapis|apis)/);
    }
  });

  // #397: POC user no longer creates/updates/deletes distributions — CDK
  // owns that path. Retained: GetDistribution, CreateInvalidation,
  // ListDistributions (needed for deploy-frontend.sh cache busting).
  it('does NOT permit cloudfront:Create/Update/Delete distribution actions (#397)', () => {
    const cf = statementBySid(policy, 'CloudFront');
    expect(cf).toBeDefined();
    const actions = Array.isArray(cf!.Action) ? cf!.Action : [cf!.Action];
    for (const bad of ['cloudfront:CreateDistribution', 'cloudfront:UpdateDistribution', 'cloudfront:DeleteDistribution']) {
      expect(actions).not.toContain(bad);
    }
    expect(actions).toContain('cloudfront:CreateInvalidation');
    expect(actions).toContain('cloudfront:GetDistribution');
  });

  it('scopes S3 resource ARNs to litcrop-poc-* prefix', () => {
    const s3 = statementBySid(policy, 'S3Buckets');
    expect(s3).toBeDefined();
    const resources = Array.isArray(s3!.Resource) ? s3!.Resource : [s3!.Resource];
    for (const r of resources) {
      expect(r).toMatch(/litcrop-poc-/);
    }
  });

  it('all non-wildcard resource ARNs include the project prefix', () => {
    // API Gateway ARNs are global paths (/restapis/*, /apis/*) and don't
    // embed project identity — scoping by action type + region is the tightest
    // AWS allows here. All other services must name the project.
    const noPrefixStatements = new Set([
      'STSIdentity',        // sts:GetCallerIdentity needs Resource: "*"
      'IAMSelfInspect',     // iam:GetUser is self-scoped by ARN already
      'CloudFront',         // CloudFront Resource: "*" (AWS doesn't support dist-scoping at IAM boundary)
      'APIGateway',         // /restapis/* and /apis/* are global paths
    ]);
    for (const stmt of policy.Statement) {
      const resources = Array.isArray(stmt.Resource) ? stmt.Resource : [stmt.Resource];
      for (const r of resources) {
        if (r === '*') continue;
        if (noPrefixStatements.has(stmt.Sid ?? '')) continue;
        expect(r, `${stmt.Sid} Resource "${r}" must be prefixed`).toMatch(
          /(litcrop|ACCOUNT_ID|<AWS_ACCOUNT_ID>)/,
        );
      }
    }
  });
});

describe('iam-policy-prod-least.json (production CDK deploy user)', () => {
  const policy = loadPolicy('scripts/iam-policy-prod-least.json');

  it('has Version 2012-10-17', () => {
    expect(policy.Version).toBe('2012-10-17');
  });

  it('rejects wildcard service actions', () => {
    const bad = allActions(policy).filter((a) =>
      /^(s3|dynamodb|lambda|cloudfront|apigateway|logs|iam|cognito-idp|sns|ssm|ses|budgets|ecr|cloudwatch):\*$/.test(a),
    );
    expect(bad).toEqual([]);
  });

  // Unlike POC, prod-least *does* allow DeleteBucket/DeleteTable/DeleteFunction
  // because CDK deploy-time legitimately needs to replace resources during
  // stack updates. But these MUST be resource-scoped, never `*`.
  it('destructive S3/DDB/Lambda actions are scoped (not wildcard)', () => {
    for (const stmt of policy.Statement) {
      const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
      const hasDestructive = actions.some((a) =>
        /^(s3:DeleteBucket|dynamodb:DeleteTable|lambda:DeleteFunction)/.test(a),
      );
      if (!hasDestructive) continue;
      const resources = Array.isArray(stmt.Resource) ? stmt.Resource : [stmt.Resource];
      for (const r of resources) {
        expect(r, `${stmt.Sid} destructive action on unscoped Resource`).not.toBe('*');
        expect(r).toMatch(/litcrop/i);
      }
    }
  });
});
