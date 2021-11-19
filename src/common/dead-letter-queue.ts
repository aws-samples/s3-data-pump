/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import * as aws from 'aws-sdk';

export class DeadLetterQueue {
    private static readonly DEAD_LETTER_QUEUE_URL : any = process.env.DEAD_LETTER_QUEUE_URL;

    // This function submits a copy request record to the dead letter queue because it couldn't be processed.
    public static async submitRecordToDeadLetterQueue(record: any) {
        return new Promise((resolve, reject) => {
            let sqs = new aws.SQS();

            const params : any = {
                MessageAttributes: {
                    "manifest_file": {
                        DataType: "String",
                        StringValue: record.messageAttributes.manifest_file
                    },
                    "source_bucket": {
                        DataType: "String",
                        StringValue: record.messageAttributes.source_bucket.stringValue
                    },
                    "source_object_path": {
                        DataType: "String",
                        StringValue: record.messageAttributes.source_object_path.stringValue
                    },
                    "size": {
                        DataType: "Number",
                        StringValue: record.messageAttributes.size.stringValue
                    },
                    "storage_class": {
                        DataType: "String",
                        StringValue: record.messageAttributes.storage_class.stringValue
                    },
                    "target_bucket": {
                        DataType: "String",
                        StringValue: record.messageAttributes.target_bucket.stringValue
                    },
                    "target_object_path": {
                        DataType: "String",
                        StringValue: record.messageAttributes.target_object_path.stringValue
                    },
                    "target_storage_class": {
                        DataType: "String",
                        StringValue: record.messageAttributes.target_storage_class.stringValue
                    }
                },
                MessageBody: record.body,
                QueueUrl: DeadLetterQueue.DEAD_LETTER_QUEUE_URL
            };

            if(Boolean(record.messageAttributes.source_tags)) {
                params.MessageAttributes.source_tags = {
                    DataType: "String",
                    StringValue: record.messageAttributes.source_tags.stringValue
                };
            }

            if(Boolean(record.messageAttributes.target_tags)) {
                params.MessageAttributes.target_tags = {
                    DataType: "String",
                    StringValue: record.messageAttributes.target_tags.stringValue
                };
            }

            sqs.sendMessage(params)
                .on('success', (data : any) => {
                    console.log(`Successfully submitted rejected record to the dead letter queue with response: ${data.httpResponse.statusCode}`);
                    resolve(data);
                })
                .on('error', (e : Error) => {
                    console.error(`An error occurred submitting record to the dead letter queue ${e} ${e.stack}`);
                    reject(e);
                })
                .send();
        });
    }
}
