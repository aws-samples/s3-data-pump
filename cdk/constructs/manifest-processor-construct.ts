/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import * as iam from '@aws-cdk/aws-iam';
import * as sqs from '@aws-cdk/aws-sqs';
import * as dynamo from "@aws-cdk/aws-dynamodb";
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import { S3EventSource } from '@aws-cdk/aws-lambda-event-sources';
import {Permissions} from "../common/permissions";

export interface ManifestProcessorProps {
    copyQueue: sqs.Queue;
    trackingTable: dynamo.Table;
}

export class ManifestProcessorConstruct extends cdk.Construct {
    constructor(scope: cdk.Construct, id: string, props: ManifestProcessorProps) {
        super(scope, id);

        // Get the configuration variables from the CDK context
        const sourceBuckets = scope.node.tryGetContext('SourceS3Buckets');
        console.log(`Source buckets specified in configuration = ${sourceBuckets}`);
        const manifestLambdaTimeout = scope.node.tryGetContext('ManifestLambdaTimeout');
        console.log(`Manifest lambda timeout specified in configuration = ${manifestLambdaTimeout}`);
        const manifestFargateVpcCidr = scope.node.tryGetContext('ManifestFargateVpcCidr');
        console.log(`Manifest Fargate VPC CIDR specified in configuration = ${manifestFargateVpcCidr}`);
        const manifestFargateCpu = scope.node.tryGetContext('ManifestFargateCpu');
        console.log(`Manifest Fargate CPU specified in configuration = ${manifestFargateCpu}`);
        const manifestFargateMemory = scope.node.tryGetContext('ManifestFargateMemory');
        console.log(`Manifest Fargate memory specified in configuration = ${manifestFargateMemory}`);
        const manifestFargateParallelTasks = scope.node.tryGetContext('ManifestFargateParallelTasks');
        console.log(`Manifest Fargate parallel tasks specified in configuration = ${manifestFargateParallelTasks}`);
        const glacierRestoreTier = scope.node.tryGetContext('GlacierRestoreTier');
        console.log(`Glacier restore tier specified in configuration = ${glacierRestoreTier}`);
        const glacierRestoreDays = scope.node.tryGetContext('GlacierRestoreDays');
        console.log(`Glacier restore days specified in configuration = ${glacierRestoreDays}`);

        // Create the S3 bucket where manifest files will be uploaded.
        const manifestBucket = new s3.Bucket(this, 'S3MoveManifest', {
            encryption: s3.BucketEncryption.KMS
        });

        // Create a new VPC for the Fargate task to use.
        const vpc = new ec2.Vpc(this, 'ManifestProcessorVPC', {
            cidr: manifestFargateVpcCidr,
            maxAzs: 1
        });

        // Used to keep traffic private from the VPC to public services endpoints.
        vpc.addGatewayEndpoint('ManifestProcessorS3Endpoint', {
            service: ec2.GatewayVpcEndpointAwsService.S3
        });
        vpc.addGatewayEndpoint('ManifestProcessorDynamoEndpoint', {
            service: ec2.GatewayVpcEndpointAwsService.DYNAMODB
        });

        // Create the ECS cluster for the Fargate task.
        const cluster = new ecs.Cluster(this, 'ManifestProcessorCluster', {
            vpc: vpc,
            containerInsights: true,
            clusterName: 'manifest-processor-fargate-cluster'
        });

        // Create the Fargate task definition.
        const taskDefinition = new ecs.FargateTaskDefinition(this, 'ManifestProcessorTask', {
            cpu: manifestFargateCpu,
            memoryLimitMiB: manifestFargateMemory
        });

        // Add the Docker container to the Fargate task.
        taskDefinition.addContainer('ManifestProcessorContainer', {
            image: ecs.ContainerImage.fromAsset('./src', { file: './fargate/manifest_processor_image/Dockerfile' }),
            logging: new ecs.AwsLogDriver({ streamPrefix: 'manifest-processor-fargate' }),
            environment: {
                COPY_QUEUE_URL: props.copyQueue.queueUrl,
                TRACKING_TABLE_NAME: props.trackingTable.tableName,
                GLACIER_RESTORE_TIER: glacierRestoreTier,
                GLACIER_RESTORE_DAYS: glacierRestoreDays.toString(),
                PARALLEL_TASKS: manifestFargateParallelTasks.toString()
            }
        });

        // Grant read access to the manifest S3 bucket for the Fargate task.
        manifestBucket.grantRead(taskDefinition.taskRole);

        // Grant Glacier restore rights for all the source S3 buckets.
        this.grantRightsToSourceBuckets(sourceBuckets, taskDefinition.taskRole);

        // Grant the Fargate task rights to add messages to the S3 object copy SQS queue.
        console.log(`Adding grant put message rights to SQS queue.`);
        props.copyQueue.grantSendMessages(taskDefinition.taskRole);

        // Grant the Fargate task rights to read and write to the DynamoDB tracking table.
        console.log(`Adding grant to read and write to the tracking table.`);
        props.trackingTable.grantReadWriteData(taskDefinition.taskRole);

        // Defines the Lambda function to dispatch the processing of the manifest files
        let manifestDispatcherLambda = new lambda.Function(this, 'ManifestDispatcherLambda', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset('.', {
                bundling: {
                    image: lambda.Runtime.NODEJS_14_X.bundlingImage,
                    command: [
                        'bash', '-c', [
                            'npm install esbuild',
                            'node_modules/esbuild/bin/esbuild src/lambdas/manifest_dispatcher_lambda/main.ts --bundle --platform=node --target=node14 --external:aws-sdk --outfile=/asset-output/main.js --minify'
                        ].join(' && ')
                    ],
                    user: 'root'
                }
            }),
            handler: 'main.handler',
            timeout: cdk.Duration.seconds(manifestLambdaTimeout),
            memorySize: 128,
            environment: {
                    SUBNETS: `${vpc.privateSubnets.map(m => m.subnetId).join(',')}`,
                    TASK_ARN: taskDefinition.taskDefinitionArn,
                    CLUSTER_ARN: cluster.clusterArn
                }
        });

        // Invoke the manifest processor lambda whenever a new manifest file is uploaded to S3.
        manifestDispatcherLambda.addEventSource(new S3EventSource(manifestBucket, {
            events: [s3.EventType.OBJECT_CREATED]
        }));

        // Grant the Lambda function rights to invoke the Fargate task.
        manifestDispatcherLambda.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'ecs:RunTask',
            ],
            resources: [
                taskDefinition.taskDefinitionArn
            ]
        }));
        manifestDispatcherLambda.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'iam:PassRole'
            ],
            resources: [
                taskDefinition.taskRole.roleArn,
                taskDefinition.obtainExecutionRole().roleArn
            ]
        }));
    }

    // Grant Glacier read and restore rights to the source buckets if they've been specified.  Otherwise,
    // grant it to all S3 buckets.
    private grantRightsToSourceBuckets(sourceBuckets: Array<string>, taskRole: iam.IRole) {
        let resources = Permissions.getS3BucketResourceStatement(this, sourceBuckets, 'ManifestLambdaSourceBuckets', true);

        console.log(`Adding grant read and restore object rights for source bucket resources = ${resources}`);

        taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:ListBucket', 's3:RestoreObject'],
            resources: resources
        }));
    }
}