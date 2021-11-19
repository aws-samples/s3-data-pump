/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as iam from '@aws-cdk/aws-iam';
import * as sqs from '@aws-cdk/aws-sqs';
import * as dynamo from '@aws-cdk/aws-dynamodb';
import { SqsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import { Permissions } from '../common/permissions';

export interface CopyObjectsProps {
    copyQueue: sqs.Queue;
    deadLetterQueue: sqs.Queue;
    trackingTable: dynamo.Table;
}

export class CopyObjectsConstruct extends cdk.Construct {
    public copyObjectsLambda: lambda.Function;

    constructor(scope: cdk.Construct, id: string, props: CopyObjectsProps) {
        super(scope, id);

        // Get the configuration variables from the CDK context
        const sourceBuckets = scope.node.tryGetContext('SourceS3Buckets');
        console.log(`Source buckets specified in configuration = ${sourceBuckets}`);
        const targetBuckets = scope.node.tryGetContext('TargetS3Buckets');
        console.log(`Target buckets specified in configuration = ${targetBuckets}`);
        const copyLambdaTimeout = scope.node.tryGetContext('CopyLambdaTimeout');
        console.log(`Copy lambda timeout specified in configuration = ${copyLambdaTimeout}`);
        const copyLambdaBatchSize = scope.node.tryGetContext('CopyLambdaBatchSize');
        console.log(`Copy lambda batch size specified in configuration = ${copyLambdaBatchSize}`);
        const copyLambdaMaxBatchingWindow = scope.node.tryGetContext('CopyLambdaMaxBatchingWindow');
        console.log(`Copy lambda max batch window specified in configuration = ${copyLambdaMaxBatchingWindow}`);

        // Defines the Lambda function to perform the copy of the S3 objects
        this.copyObjectsLambda = new lambda.Function(this, 'S3CopyObjectsLambda', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset('.', {
                bundling: {
                    image: lambda.Runtime.NODEJS_14_X.bundlingImage,
                    command: [
                        'bash', '-c', [
                            'npm install esbuild',
                            'node_modules/esbuild/bin/esbuild src/lambdas/copy_objects_lambda/main.ts --bundle --platform=node --target=node14 --external:aws-sdk --outfile=/asset-output/main.js --minify'
                        ].join(' && ')
                    ],
                    user: 'root'
                }
            }),
            handler: 'main.handler',
            timeout: cdk.Duration.seconds(copyLambdaTimeout),
            memorySize: 128,
            environment: {
                'DEAD_LETTER_QUEUE_URL': props.deadLetterQueue.queueUrl,
                'TRACKING_TABLE_NAME': props.trackingTable.tableName
            }
        });

        // Invoke the manifest processor lambda whenever a new manifest file is uploaded to S3.
        this.copyObjectsLambda.addEventSource(new SqsEventSource(props.copyQueue, {
            batchSize: copyLambdaBatchSize,
            maxBatchingWindow: cdk.Duration.minutes(copyLambdaMaxBatchingWindow)
        }));

        // Grant read access for all the source S3 buckets.
        this.grantRightsToSourceBuckets(sourceBuckets);

        // Grant write access for all the target S3 buckets.
        this.grantRightsToTargetBuckets(targetBuckets);

        // Grant the lambda function rights to consume messages from the S3 object copy SQS queue.
        console.log(`Adding grant to consume messages from SQS queue.`);
        props.copyQueue.grantConsumeMessages(this.copyObjectsLambda);

        // Grant the lambda function rights to add messages to the SQS dead letter queue.
        console.log(`Adding grant put message rights to SQS dead letter queue.`);
        props.deadLetterQueue.grantSendMessages(this.copyObjectsLambda);

        // Grant the lambda function rights to read and write to the DynamoDB tracking table.
        console.log(`Adding grant to read and write to the tracking table.`);
        props.trackingTable.grantReadWriteData(this.copyObjectsLambda);
    }

    // Grant read rights to the source buckets if they've been specified.
    private grantRightsToSourceBuckets(sourceBuckets: Array<string>) {
        let resources = Permissions.getS3BucketResourceStatement(this, sourceBuckets, 'CopyLambdaSourceBuckets');

        console.log(`Adding read object and tagging rights for source bucket resources = ${resources}`);

        this.copyObjectsLambda.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:GetObject*', 's3:PutObjectTagging'],
            resources: resources
        }));
    }

    // Grant write rights to the target buckets if they've been specified.
    private grantRightsToTargetBuckets(targetBuckets: Array<string>) {
        let resources = Permissions.getS3BucketResourceStatement(this, targetBuckets, 'CopyLambdaTargetBuckets');

        console.log(`Adding write object rights for target bucket resources = ${resources}`);

        this.copyObjectsLambda.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:PutObject*'],
            resources: resources
        }));
    }
}