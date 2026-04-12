import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as apigwv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { HttpJwtAuthorizer } from '@aws-cdk/aws-apigatewayv2-authorizers-alpha';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';

export class LitCropStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── T-CDK-07: Cognito User Pool + App Client ──────────────────────────────
    // FR-11.1–11.3: User registration, login, password policy
    // FR-11.11: Password policy (8+ chars, mixed case + number)

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'litcrop-mvp-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // H-02: preserve user accounts on stack delete
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: 'litcrop-mvp-web',
      generateSecret: false, // Frontend SPA — no client secret
      authFlows: {
        userPassword: true,
        userSrp: true, // Secure Remote Password — preferred
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
      },
      preventUserExistenceErrors: true,
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
    });

    // ── T-CDK-02: DynamoDB Table ───────────────────────────────────────────────
    // Single-table design: PK/SK + GSI1 (entity lookup) + GSI2 (farm→plots)
    // TTL attribute for conversation history expiry (Phase 3)

    const table = new dynamodb.Table(this, 'Table', {
      tableName: 'litcrop-mvp',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true, // H-01: enable PITR for data recovery
      removalPolicy: cdk.RemovalPolicy.RETAIN, // S10: preserve data on stack delete
      timeToLiveAttribute: 'TTL',
    });

    // GSI1: direct entity lookup by ID (Plot, Image)
    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: all plots for a farm (Farm Overview screen)
    table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── Shared Logs Bucket (Pre-PROD F-01/F-02/F-03) ───────────────────────
    // Central destination for CloudFront, API Gateway, and S3 access logs.
    // 30-day lifecycle keeps storage costs bounded per CON-256-02.

    const logsBucket = new s3.Bucket(this, 'LogsBucket', {
      bucketName: 'litcrop-mvp-logs',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      lifecycleRules: [
        {
          id: 'expire-logs-30d',
          expiration: cdk.Duration.days(30),
        },
      ],
    });

    // ── T-CDK-03: S3 Bucket Constructs ────────────────────────────────────────
    // 3 buckets: images (lifecycle policies), static (CloudFront), thumbnails

    const imagesBucket = new s3.Bucket(this, 'ImagesBucket', {
      bucketName: 'litcrop-mvp-images',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // S10: preserve images on stack delete
      autoDeleteObjects: false,
      serverAccessLogsBucket: logsBucket,
      serverAccessLogsPrefix: 's3-images/',
      // ADR-004: lifecycle — Standard → IA 30d → Glacier 90d
      lifecycleRules: [
        {
          id: 'archive-images',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
        {
          id: 'expire-noncurrent-versions',
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
    });

    const staticBucket = new s3.Bucket(this, 'StaticBucket', {
      bucketName: 'litcrop-mvp-static',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      serverAccessLogsBucket: logsBucket,
      serverAccessLogsPrefix: 's3-static/',
    });

    const thumbnailsBucket = new s3.Bucket(this, 'ThumbnailsBucket', {
      bucketName: 'litcrop-mvp-thumbnails',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // S10: preserve thumbnails on stack delete
      autoDeleteObjects: false,
      serverAccessLogsBucket: logsBucket,
      serverAccessLogsPrefix: 's3-thumbnails/',
    });

    // ── T-CDK-06: CloudFront Distribution with S3 OAI ─────────────────────────
    // S3Origin creates an Origin Access Identity (OAI) and grants CloudFront read.
    // Bucket is non-public; all access goes through CloudFront (HTTPS enforced).
    // Note: Upgrade to OAC (S3BucketOrigin) when CDK ≥ 2.130 is adopted.
    // SPA fallback: 403/404 → /index.html (Astro SSG)

    // CloudFront Function: rewrite directory paths to index.html
    // S3 OAI doesn't support directory index resolution — /login/ must become /login/index.html.
    // Without this, S3 returns 403 for directory paths and CloudFront's error fallback
    // serves /index.html (the root page) instead of the intended sub-page.
    const rewriteFunction = new cloudfront.Function(this, 'UrlRewriteFunction', {
      functionName: 'litcrop-url-rewrite',
      comment: 'Append index.html to directory paths for Astro SSG',
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  // If URI ends with / → append index.html
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  }
  // If URI has no file extension → append /index.html (e.g. /login → /login/index.html)
  else if (!uri.includes('.')) {
    request.uri = uri + '/index.html';
  }
  return request;
}
      `),
    });

    // ── H-03: Security Response Headers (CSP, HSTS, X-Frame-Options) ────────
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: 'litcrop-security-headers',
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline' https://unpkg.com",
            "img-src 'self' data: blob: https:",
            `connect-src 'self' https://*.execute-api.${this.region}.amazonaws.com https://cognito-idp.${this.region}.amazonaws.com https://api.open-meteo.com https://nominatim.openstreetmap.org`,
            "frame-ancestors 'none'",
          ].join('; '),
          override: true,
        },
        contentTypeOptions: { override: true }, // X-Content-Type-Options: nosniff
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY,
          override: true,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(730), // 2 years
          includeSubdomains: true,
          override: true,
        },
      },
    });

    const distribution = new cloudfront.Distribution(this, 'StaticDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(staticBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy, // H-03: attach security headers
        compress: true,
        functionAssociations: [{
          function: rewriteFunction,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        }],
      },
      defaultRootObject: 'index.html',
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: cdk.Duration.seconds(0),
      })),
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200, // H-06: exclude expensive regions, keep Asia
      comment: 'LitCrop static frontend — Astro SSG',
      enableLogging: true,
      logBucket: logsBucket,
      logFilePrefix: 'cloudfront/',
    });

    // ── SSM Parameters ────────────────────────────────────────────────────────
    // LLM API key stored as SecureString; reference resolved at deploy time

    const llmApiKeyParam = ssm.StringParameter.fromSecureStringParameterAttributes(
      this,
      'LlmApiKeyParam',
      { parameterName: '/litcrop/llm-api-key' },
    );

    // ── SES configuration (Wave 2: Admin Email Notifications) ─────────────────
    // SES stays in sandbox for Beta-4. Each admin email must be manually verified:
    //   aws ses verify-email-identity --email-address admin@example.com --region ap-northeast-1
    // SES_FROM_EMAIL must be set in the environment before CDK synthesis.
    // Graceful degradation: if not set, notifications are disabled (events still fire for Wave 3).
    const sesFromEmail = process.env['SES_FROM_EMAIL'] ?? '';

    // ── T-CDK-04: Lambda Functions ────────────────────────────────────────────
    // NodejsFunction: esbuild bundling from src/api/src/handler.ts
    // Matches existing esbuild.config.mjs: CJS format, node22 target, @aws-sdk external

    const apiLambda = new NodejsFunction(this, 'ApiLambda', {
      functionName: 'litcrop-api',
      description: 'LitCrop MVP API — Hono router',
      currentVersionOptions: { removalPolicy: cdk.RemovalPolicy.RETAIN },
      entry: path.join(__dirname, '../../src/api/src/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64, // Graviton2: cheaper + faster for I/O-bound
      memorySize: 512,
      timeout: cdk.Duration.seconds(30), // Chat endpoint may take ~15s; 30s = safe buffer
      bundling: {
        externalModules: ['@aws-sdk/*'], // Node.js 20 Lambda includes AWS SDK v3
        // sharp uses native binaries that must match the Lambda runtime (linux-arm64).
        // commandHooks reinstalls sharp with explicit platform flags after esbuild bundles.
        nodeModules: ['sharp'],
        commandHooks: {
          beforeBundling(): string[] { return []; },
          beforeInstall(): string[] { return []; },
          afterBundling(_inputDir: string, outputDir: string): string[] {
            return [
              `cd ${outputDir}`,
              'npm install --cpu=arm64 --os=linux sharp',
            ];
          },
        },
        format: OutputFormat.CJS,
        target: 'node20',
        minify: false,
        sourceMap: true,
        // Workaround: esbuild ≥0.22 changed default bundling; --packages=bundle restores it
        // See: https://github.com/aws/aws-cdk/issues/30717
        esbuildArgs: { '--packages': 'bundle' },
      },
      environment: {
        TABLE_NAME: table.tableName,
        S3_IMAGES_BUCKET: imagesBucket.bucketName,
        S3_THUMBNAILS_BUCKET: thumbnailsBucket.bucketName,
        CLOUDFRONT_ORIGIN: `https://${distribution.distributionDomainName}`,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
        NODE_OPTIONS: '--enable-source-maps',
        // LLM / Chat configuration
        LLM_API_PROVIDER: 'anthropic',
        CHAT_MODEL: 'claude-haiku-4-5-20251001',
        CHAT_DAILY_USER_INPUT_LIMIT: '50000',
        CHAT_DAILY_USER_OUTPUT_LIMIT: '10000',
        CHAT_DAILY_GLOBAL_INPUT_LIMIT: '500000',
        CHAT_DAILY_GLOBAL_OUTPUT_LIMIT: '100000',
        // Admin designation — comma-separated email list; evaluated at synth time
        ADMIN_EMAILS: process.env['ADMIN_EMAILS'] ?? (() => {
          console.warn('[CDK] ADMIN_EMAILS not set — admin bypass will be disabled in Lambda');
          return '';
        })(),
        // SES email notifications (Wave 2) — requires manual SES sandbox verification per address
        // Leave empty to disable notifications (events still fire for Wave 3 activity log)
        SES_FROM_EMAIL: sesFromEmail,
        SES_REGION: process.env['SES_REGION'] ?? 'ap-northeast-1',
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // F-04: Lambda alias for safe rollback — point API Gateway to alias, not $LATEST
    const apiLambdaAlias = new lambda.Alias(this, 'ApiLambdaLive', {
      aliasName: 'live',
      version: apiLambda.currentVersion,
    });

    // Grant API Lambda permissions
    table.grantReadWriteData(apiLambda);
    imagesBucket.grantReadWrite(apiLambda);
    thumbnailsBucket.grantRead(apiLambda); // Read-only: signed URL generation

    // Grant API Lambda permission to read the LLM API key from SSM
    llmApiKeyParam.grantRead(apiLambda);

    // Grant API Lambda permission to send email via SES (Wave 2: notifications)
    // Note: SES SendEmail does not support resource-level ARN restrictions (AWS limitation).
    // The ses:FromAddress condition key restricts sending to the configured sender address only.
    // Manual step required: verify each admin email address in SES sandbox before deployment.
    if (sesFromEmail) {
      apiLambda.addToRolePolicy(new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'ses:FromAddress': sesFromEmail,
          },
        },
      }));
    }

    // Admin user deletion: allow Cognito AdminDeleteUser (#293)
    apiLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminDeleteUser'],
      resources: [userPool.userPoolArn],
    }));

    // CDK-Nag: suppress AwsSolutions-IAM5 for SES wildcard resource (required by AWS)
    NagSuppressions.addResourceSuppressions(apiLambda, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'SES SendEmail does not support resource-level ARN restrictions; scoped by ses:FromAddress condition key.',
        appliesTo: ['Resource::*'],
      },
    ], true);

    // Thumbnail Lambda — Phase 4: full sharp-based thumbnail generation
    const thumbnailLambda = new NodejsFunction(this, 'ThumbnailLambda', {
      functionName: 'litcrop-thumb',
      description: 'LitCrop MVP — thumbnail generator (300x300 center-crop)',
      entry: path.join(__dirname, '../../src/thumbnail/handler.ts'),
      depsLockFilePath: path.join(__dirname, '../../src/thumbnail/package-lock.json'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024, // Image processing benefits from more memory
      timeout: cdk.Duration.seconds(60),
      bundling: {
        externalModules: ['@aws-sdk/*'],
        // sharp uses native binaries; nodeModules installs it for the Lambda
        // runtime (linux-arm64) rather than attempting to bundle the .node file
        nodeModules: ['sharp'],
        format: OutputFormat.CJS,
        target: 'node20',
        minify: false,
        esbuildArgs: { '--packages': 'bundle' },
      },
      environment: {
        S3_IMAGES_BUCKET: imagesBucket.bucketName,
        S3_THUMBNAILS_BUCKET: thumbnailsBucket.bucketName,
        TABLE_NAME: table.tableName,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Grant thumbnail Lambda least-privilege S3 permissions (S8)
    // s3:GetObject on images/* prefix only; s3:PutObject on thumbnails/* prefix only
    thumbnailLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [`${imagesBucket.bucketArn}/images/*`],
    }));
    thumbnailLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject'],
      resources: [`${thumbnailsBucket.bucketArn}/thumbnails/*`],
    }));
    table.grantReadWriteData(thumbnailLambda); // QueryCommand on GSI1 (read) + update Image record (write)

    // S3 event trigger: new objects in images/ prefix → thumbnail generation
    thumbnailLambda.addEventSource(
      new lambdaEventSources.S3EventSource(imagesBucket, {
        events: [s3.EventType.OBJECT_CREATED],
        filters: [{ prefix: 'images/' }],
      }),
    );

    // ── T-CDK-05: API Gateway HTTP API ────────────────────────────────────────
    // HTTP API (v2) — cheaper than REST API, native JWT authorizer support
    // CORS configured here; Hono also validates (defense in depth)

    const lambdaIntegration = new HttpLambdaIntegration('ApiIntegration', apiLambdaAlias);

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'litcrop-mvp-api',
      description: 'LitCrop MVP HTTP API',
      corsPreflight: {
        allowOrigins: [
          'http://localhost:4321',
          'http://localhost:3000',
          `https://${distribution.distributionDomainName}`,
        ],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: [
          'Content-Type',
          'Accept',
          'Accept-Language',
          'X-Request-Id',
          'Authorization', // T-AUTH-07: allow Authorization header
        ],
        exposeHeaders: ['X-Request-Id'],
        maxAge: cdk.Duration.seconds(86400),
      },
    });

    // ── T-CDK-08: JWT Authorizer (Cognito issuer URL) ─────────────────────────
    // API Gateway validates JWTs at the gateway level — zero Lambda cost
    // Rejects unauthenticated requests with 401 before reaching Hono (FR-11.8, FR-11.10)

    const jwtAuthorizer = new HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      {
        identitySource: ['$request.header.Authorization'],
        jwtAudience: [userPoolClient.userPoolClientId],
      },
    );

    // Public routes — health checks bypass JWT authorizer (FR-11.8)
    httpApi.addRoutes({
      path: '/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: '/api/v1/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: '/api/v1',
      methods: [apigwv2.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    // Protected catch-all — JWT required for all other routes
    // Use explicit methods (not ANY) so that OPTIONS requests are handled by
    // API Gateway's built-in CORS preflight auto-response, not the JWT authorizer.
    // ANY would intercept OPTIONS → JWT rejects (no token on preflight) → 401 → CORS fail.
    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.POST,
        apigwv2.HttpMethod.PATCH,
        apigwv2.HttpMethod.DELETE,
        apigwv2.HttpMethod.PUT,
      ],
      integration: lambdaIntegration,
      authorizer: jwtAuthorizer,
    });

    // ── H-04: API Gateway Stage Throttling ──────────────────────────────────
    // Default throttle: 100 requests/sec sustained, 200 burst.
    // Per-endpoint limits (auth, chat) are enforced in application code.
    const defaultStage = httpApi.defaultStage?.node.defaultChild as cdk.CfnResource;
    defaultStage.addPropertyOverride('DefaultRouteSettings', {
      ThrottlingBurstLimit: 200,
      ThrottlingRateLimit: 100,
    });

    // ── F-02: API Gateway Access Logging ──────────────────────────────────────
    const apiAccessLog = new logs.LogGroup(this, 'ApiAccessLog', {
      logGroupName: '/litcrop/api-gateway-access',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    defaultStage.addPropertyOverride('AccessLogSettings', {
      DestinationArn: apiAccessLog.logGroupArn,
      Format: JSON.stringify({
        requestId: '$context.requestId',
        ip: '$context.identity.sourceIp',
        requestTime: '$context.requestTime',
        httpMethod: '$context.httpMethod',
        routeKey: '$context.routeKey',
        status: '$context.status',
        protocol: '$context.protocol',
        responseLength: '$context.responseLength',
        integrationLatency: '$context.integrationLatency',
        errorMessage: '$context.error.message',
      }),
    });

    // ── H-05: CloudWatch Alarms + SNS Notifications ────────────────────────
    // SNS topic for alarm notifications — email subscription via env var
    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: 'litcrop-alarms',
      displayName: 'LitCrop Alerts',
    });

    // Subscribe admin email if provided (empty string → no subscription)
    const alarmEmail = process.env['ALARM_EMAIL'] ?? '';
    if (alarmEmail) {
      alarmTopic.addSubscription(new sns_subs.EmailSubscription(alarmEmail));
    }

    const alarmAction = new cw_actions.SnsAction(alarmTopic);

    // Wire both ALARM and OK actions to the SNS topic
    function attachAlarmActions(alarm: cloudwatch.Alarm): void {
      alarm.addAlarmAction(alarmAction);
      alarm.addOkAction(alarmAction);
    }

    // Alarm 1: API Lambda error rate > 1% (5-minute evaluation)
    const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'ApiLambdaErrorAlarm', {
      alarmName: 'litcrop-api-lambda-errors',
      alarmDescription: 'API Lambda recorded at least 1 error in 5 minutes',
      metric: apiLambdaAlias.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    attachAlarmActions(lambdaErrorAlarm);

    // Alarm 2: API Gateway 5xx count > 5 in 5 minutes
    const api5xxAlarm = new cloudwatch.Alarm(this, 'Api5xxAlarm', {
      alarmName: 'litcrop-api-5xx',
      alarmDescription: 'API Gateway 5xx errors exceed 5 in 5 minutes',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5xx',
        dimensionsMap: { ApiId: httpApi.httpApiId },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    attachAlarmActions(api5xxAlarm);

    // Alarm 3: DynamoDB throttled requests > 0
    const dynamoThrottleAlarm = new cloudwatch.Alarm(this, 'DynamoThrottleAlarm', {
      alarmName: 'litcrop-dynamo-throttle',
      alarmDescription: 'DynamoDB read/write throttling detected',
      metric: table.metricThrottledRequestsForOperations({
        operations: [
          dynamodb.Operation.GET_ITEM,
          dynamodb.Operation.PUT_ITEM,
          dynamodb.Operation.QUERY,
          dynamodb.Operation.SCAN,
        ],
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    attachAlarmActions(dynamoThrottleAlarm);

    // ── F-35: AWS Budget Alert ($5 monthly ceiling) ─────────────────────────
    if (!alarmEmail) {
      console.warn('[CDK] ALARM_EMAIL not set — budget alert will NOT be created');
    }
    if (alarmEmail) {
      new cdk.aws_budgets.CfnBudget(this, 'MonthlyCostBudget', {
        budget: {
          budgetName: 'litcrop-monthly-cost',
          budgetType: 'COST',
          timeUnit: 'MONTHLY',
          budgetLimit: { amount: 5, unit: 'USD' },
        },
        notificationsWithSubscribers: [
          {
            notification: {
              notificationType: 'ACTUAL',
              comparisonOperator: 'GREATER_THAN',
              threshold: 80,
              thresholdType: 'PERCENTAGE',
            },
            subscribers: [{ subscriptionType: 'EMAIL', address: alarmEmail }],
          },
          {
            notification: {
              notificationType: 'ACTUAL',
              comparisonOperator: 'GREATER_THAN',
              threshold: 100,
              thresholdType: 'PERCENTAGE',
            },
            subscribers: [{ subscriptionType: 'EMAIL', address: alarmEmail }],
          },
        ],
      });
    }

    // ── CloudFormation Outputs ────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      description: 'SNS topic ARN for alarm notifications',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.url ?? '',
      description: 'API Gateway HTTP API URL',
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL (static frontend)',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID (public — no secret)',
    });

    new cdk.CfnOutput(this, 'DynamoTableName', {
      value: table.tableName,
      description: 'DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'ImagesBucketName', {
      value: imagesBucket.bucketName,
      description: 'S3 images bucket name',
    });

    new cdk.CfnOutput(this, 'ThumbnailsBucketName', {
      value: thumbnailsBucket.bucketName,
      description: 'S3 thumbnails bucket name',
    });

    // ── CDK-Nag Security Checks ───────────────────────────────────────────────
    // Validates stack against AWS Solutions security rules (FR-14.7)
    // Suppressions document accepted MVP deviations with explicit justification

    cdk.Aspects.of(this).add(new AwsSolutionsChecks({ verbose: false }));

    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-S1',
        reason: 'Logs bucket does not log itself (circular); all other buckets log to litcrop-mvp-logs',
      },
      {
        id: 'AwsSolutions-S10',
        reason: 'Buckets accessed via signed URLs (images) and CloudFront OAI (static); SSL policy conflicts with autoDeleteObjects CDK custom resource',
      },
      {
        id: 'AwsSolutions-CFR1',
        reason: 'MVP: Geo restrictions not required; deployment target is Japan but no need to block other regions',
      },
      {
        id: 'AwsSolutions-CFR2',
        reason: 'MVP: CloudFront WAF integration deferred to Production',
      },
      {
        id: 'AwsSolutions-CFR3',
        reason: 'CloudFront access logging enabled; logs to litcrop-mvp-logs/cloudfront/',
      },
      {
        id: 'AwsSolutions-CFR4',
        reason: 'TLS_V1_2_2021 security policy is configured via minimumProtocolVersion',
      },
      {
        id: 'AwsSolutions-APIG1',
        reason: 'API Gateway access logging enabled to CloudWatch; structured JSON format with requestId, ip, status, latency, errorMessage',
      },
      {
        id: 'AwsSolutions-APIG4',
        reason: 'Health check routes (/health, /api/v1/health, /api/v1) are intentionally public per FR-11.8',
      },
      {
        id: 'AwsSolutions-APIG3',
        reason: 'MVP: API Gateway WAF protection deferred to Production',
      },
      {
        id: 'AwsSolutions-COG1',
        reason: 'Password policy meets FR-11.11 (8+ chars, uppercase, lowercase, digits); symbols not required per architecture spec',
      },
      {
        id: 'AwsSolutions-COG2',
        reason: 'MVP: Cognito MFA deferred to Production; email verification satisfies MVP auth requirements',
      },
      {
        id: 'AwsSolutions-COG3',
        reason: 'MVP: Cognito advanced security mode (paid feature) deferred to Production',
      },
      {
        id: 'AwsSolutions-DDB3',
        reason: 'DynamoDB PITR is enabled (H-01, Beta-3)',
      },
      {
        id: 'AwsSolutions-L1',
        reason: 'NODEJS_20_X (Node.js 20.x LTS) is the configured runtime',
      },
      {
        id: 'AwsSolutions-IAM4',
        reason: 'CDK L2 grant methods use managed policies for MVP simplicity',
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'CDK L2 grant wildcard resources are scoped to specific buckets/tables',
      },
      {
        id: 'AwsSolutions-SNS2',
        reason: 'MVP: SNS alarm topic uses email protocol which does not support KMS encryption',
      },
      {
        id: 'AwsSolutions-SNS3',
        reason: 'MVP: SNS alarm topic uses email protocol; SSL enforcement not applicable to email delivery',
      },
    ]);
  }
}
