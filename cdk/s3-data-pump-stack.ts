/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import * as cdk from '@aws-cdk/core';
import * as sqs from '@aws-cdk/aws-sqs';
import * as dynamo from '@aws-cdk/aws-dynamodb';
import { ManifestProcessorConstruct } from './constructs/manifest-processor-construct';
import { CopyObjectsConstruct } from "./constructs/copy-objects-construct";
import { RestoreEventHandlerConstruct } from "./constructs/restore-event-handler-construct";

export class S3DataPumpStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get the configuration variables from the CDK context
    const sourceBuckets = scope.node.tryGetContext('SourceS3Buckets');
    if(sourceBuckets == null || sourceBuckets.length == 0) {
      const errorMsg = 'Source bucket configuration is empty.'
      console.error(errorMsg);
      throw new Error(errorMsg)
    }
    const targetBuckets = scope.node.tryGetContext('TargetS3Buckets');
    if(targetBuckets == null || targetBuckets.length == 0) {
      const errorMsg = 'Target bucket configuration is empty.'
      console.error(errorMsg);
      throw new Error(errorMsg)
    }

    const queueVisibilityTimeout = this.node.tryGetContext('QueueVisibilityTimeout');
    console.log(`Queue visibility timeout specified in configuration = ${queueVisibilityTimeout}`);
    const maxQueueRetries = this.node.tryGetContext('MaxQueueRetries');
    console.log(`Max queue retried specified in configuration = ${maxQueueRetries}`);

    // Create the dead letter queue for messages that can't be processed
    const deadLetterQueue = new sqs.Queue(this, 'S3CopyDeadLetterQueue', {
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.KMS_MANAGED
    });

    // Create the queue for handling copy requests
    const copyQueue = new sqs.Queue(this, 'S3CopyQueue', {
      visibilityTimeout: cdk.Duration.seconds(queueVisibilityTimeout),
      encryption: sqs.QueueEncryption.KMS_MANAGED,
      deadLetterQueue: {
        maxReceiveCount: maxQueueRetries,
        queue: deadLetterQueue
      }
    });

    // Create DynamoDB table for tracking the object copy status
    const trackingTable = new dynamo.Table(this, 'S3DataPump', {
      partitionKey: { name: 'source_object_path', type: dynamo.AttributeType.STRING },
      sortKey: { name: 'source_bucket', type: dynamo.AttributeType.STRING },
      billingMode: dynamo.BillingMode.PAY_PER_REQUEST,
      encryption: dynamo.TableEncryption.AWS_MANAGED
    });

    // Add an index to the DynamoDB table to enable querying by the manifest file
    trackingTable.addGlobalSecondaryIndex({
      indexName: 'S3DataPumpResultsManifestGSI',
      partitionKey: {name: 'manifest_file', type: dynamo.AttributeType.STRING},
      sortKey: {name: 'processing_status', type: dynamo.AttributeType.STRING},
      projectionType: dynamo.ProjectionType.ALL,
    });

    // Setup the manifest processor components
    new ManifestProcessorConstruct(this, 'MPConstruct', {
      copyQueue: copyQueue,
      trackingTable: trackingTable
    });

    // Setup the restore event handler components
    new RestoreEventHandlerConstruct(this, 'REConstruct', {
      copyQueue: copyQueue,
      trackingTable: trackingTable
    });

    // Setup the copy objects components
    new CopyObjectsConstruct(this, 'COConstruct', {
      copyQueue: copyQueue,
      deadLetterQueue: deadLetterQueue,
      trackingTable: trackingTable
    });
  }
}