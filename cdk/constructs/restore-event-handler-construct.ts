/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sqs from '@aws-cdk/aws-sqs';
import * as dynamo from "@aws-cdk/aws-dynamodb";
import * as s3 from "@aws-cdk/aws-s3";
import * as iam from "@aws-cdk/aws-iam";
import * as cr from "@aws-cdk/custom-resources";

export interface RestoreEventHandlerProps {
    copyQueue: sqs.Queue;
    trackingTable: dynamo.Table;
}

export class RestoreEventHandlerConstruct extends cdk.Construct {
    public restoreEventHandlerLambda: lambda.Function;
    private scope;

    constructor(scope: cdk.Construct, id: string, props: RestoreEventHandlerProps) {
        super(scope, id);
        this.scope = scope;

        // Get the configuration variables from the CDK context
        const sourceBuckets = scope.node.tryGetContext('SourceS3Buckets');
        console.log(`Source buckets specified in configuration = ${sourceBuckets}`);
        const restoreEventLambdaTimeout = scope.node.tryGetContext('RestoreEventLambdaTimeout');
        console.log(`Restore event lambda timeout specified in configuration = ${restoreEventLambdaTimeout}`);

        // Defines the Lambda function to perform the copy of the S3 objects
        this.restoreEventHandlerLambda = new lambda.Function(this, 'RestoreEventHandlerLambda', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset('.', {
                bundling: {
                    image: lambda.Runtime.NODEJS_14_X.bundlingImage,
                    command: [
                        'bash', '-c', [
                            'npm install esbuild',
                            'node_modules/esbuild/bin/esbuild src/lambdas/restore_event_lambda/main.ts --bundle --platform=node --target=node14 --external:aws-sdk --outfile=/asset-output/main.js --minify'
                        ].join(' && ')
                    ],
                    user: 'root'
                }
            }),
            handler: 'main.handler',
            timeout: cdk.Duration.seconds(restoreEventLambdaTimeout),
            memorySize: 128,
            environment: {
                'COPY_QUEUE_URL': props.copyQueue.queueUrl,
                'TRACKING_TABLE_NAME': props.trackingTable.tableName
            }
        });

        // Add event trigger for each source bucket to invoke the Lambda when an S3 object is restored from Glacier.
        this.addEventTriggersToSourceBuckets(sourceBuckets);

        // Grant the lambda function rights to add messages to the S3 object copy SQS queue.
        console.log(`Adding grant put message rights to SQS queue.`);
        props.copyQueue.grantSendMessages(this.restoreEventHandlerLambda);

        // Grant the lambda function rights to read and write to the DynamoDB tracking table.
        console.log(`Adding grant to read and write to the tracking table.`);
        props.trackingTable.grantReadWriteData(this.restoreEventHandlerLambda);
    }

    // Add event triggers for all the source S3 buckets to to invoke this Lambda function whenever a Glacier
    // restore operation has completed on ann object.
    private addEventTriggersToSourceBuckets(sourceBuckets: Array<string>) {
        console.log(`Adding Restore Trigger for source bucket resources = ${sourceBuckets}`);

        if (Boolean(sourceBuckets) && sourceBuckets.length > 0) {
            (sourceBuckets).forEach((s3BucketName: string, index: number) => {
                const s3Bucket = s3.Bucket.fromBucketName(this, 'RestoreLambdaSourceBuckets' + index, s3BucketName);
                if (Boolean(s3Bucket)) {
                    this.addCustomResourceForEventTrigger(s3Bucket);
                } else {
                    console.error(`Could not find bucket with name ${s3BucketName} to add Restore Trigger`);
                }
            });
        } else {
            console.error(`No source buckets found for adding Restore Trigger!!`);
        }
    }

    // A custom resource is needed to add the event trigger for the S3 bucket to call the Lambda function.
    // Currently, CDK doesn't support adding triggers to S3 buckets not created in the same stack.
    private addCustomResourceForEventTrigger(sourceBucket: s3.IBucket) {
        console.log(`Adding custom resource for Restore Trigger for source bucket = ${sourceBucket.bucketName}`);

        const custom_resource = new cr.AwsCustomResource(this, `S3NotificationResource-${sourceBucket.bucketName}`, {
            onCreate: {
                service: 'S3',
                action: 'putBucketNotificationConfiguration',
                parameters: {
                    Bucket: sourceBucket.bucketName,
                    NotificationConfiguration: {
                        LambdaFunctionConfigurations: [
                            {
                                Events: [s3.EventType.OBJECT_RESTORE_COMPLETED],
                                LambdaFunctionArn: this.restoreEventHandlerLambda.functionArn
                            }
                        ]
                    }
                },
                physicalResourceId: cr.PhysicalResourceId.of("S3NotificationResource" + Date.now().toString())
            },
            policy: cr.AwsCustomResourcePolicy.fromStatements([
                new iam.PolicyStatement({
                    actions: ['s3:PutBucketNotification'],
                    resources: [sourceBucket.bucketArn]
                })
            ])
        });

        this.restoreEventHandlerLambda.addPermission(`AllowS3Invocation-${sourceBucket.bucketName}`, {
            action: 'lambda:InvokeFunction',
            principal: new iam.ServicePrincipal('s3.amazonaws.com'),
            sourceArn: sourceBucket.bucketArn,
            sourceAccount: this.restoreEventHandlerLambda.env.account
        });

        custom_resource.node.addDependency(this.restoreEventHandlerLambda.permissionsNode.findChild(`AllowS3Invocation-${sourceBucket.bucketName}`));
    }
}