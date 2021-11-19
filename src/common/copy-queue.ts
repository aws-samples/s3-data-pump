/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import * as aws from 'aws-sdk';
import { CopyRequestRecord } from "./copy-request-record";

export class CopyQueue {
    private static readonly COPY_QUEUE_URL : any = process.env.COPY_QUEUE_URL;

    // This function submits a copy object request to the queue.
    public static async submitCopyObjectToQueue(copyRequest: CopyRequestRecord) {
        return new Promise((resolve, reject) => {
            let sqs = new aws.SQS();

            const params : any = {
                MessageAttributes: {
                    "manifest_file": {
                        DataType: "String",
                        StringValue: copyRequest.manifest_file
                    },
                    "source_bucket": {
                        DataType: "String",
                        StringValue: copyRequest.source_bucket
                    },
                    "source_object_path": {
                        DataType: "String",
                        StringValue: copyRequest.source_object_path
                    },
                    "size": {
                        DataType: "Number",
                        StringValue: copyRequest.size.toString(10)
                    },
                    "storage_class": {
                        DataType: "String",
                        StringValue: copyRequest.storage_class
                    },
                    "target_bucket": {
                        DataType: "String",
                        StringValue: copyRequest.target_bucket
                    },
                    "target_object_path": {
                        DataType: "String",
                        StringValue: copyRequest.target_object_path
                    },
                    "target_storage_class": {
                        DataType: "String",
                        StringValue: copyRequest.target_storage_class
                    }
                },
                MessageBody: "Copy request for S3 object",
                QueueUrl: CopyQueue.COPY_QUEUE_URL
            };

            if(Boolean(copyRequest.source_tags)) {
                params.MessageAttributes.source_tags = {
                    DataType: "String",
                    StringValue: copyRequest.source_tags
                };
            }

            if(Boolean(copyRequest.target_tags)) {
                params.MessageAttributes.target_tags = {
                    DataType: "String",
                        StringValue: copyRequest.target_tags
                };
            }

            sqs.sendMessage(params)
                .on('success', (data : any) => {
                    console.log(`Successfully submitted copy object request to queue with response: ${data.httpResponse.statusCode}`);
                    resolve(data);
                })
                .on('error', (e : Error) => {
                    console.error(`An error occurred submitting copy object request to queue ${e} ${e.stack}`);
                    reject(e);
                })
                .send();
        });
    }
}
