/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import * as aws from 'aws-sdk';
import { CopyRequestRecord, STATUS_VALUES } from "../../common/copy-request-record";
import { MultipartCopier } from "./mutipart-copier";
import { TrackingDb } from "../../common/tracking-db";
import { DeadLetterQueue } from "../../common/dead-letter-queue";
import { RegularCopier } from "./regular-copier";

export class ObjectCopier {
    private static readonly MAX_FILE_SIZE_WITHOUT_MULTIPART = 1024 * 1024 * 1024 * 5;

    // This function processes an SQS message to copy an S3 object.
    public static async processCopyObjectMessage(record: any) {
        let s3CopyRequest = null;
        try {
            console.log(`Received message - ${JSON.stringify(record)}`);

            // Validate the message that was received.
            if(!Boolean(record.messageAttributes)) {
                await ObjectCopier.rejectCopyRequest(record, null, `No message attributes received for S3 copy request - ${JSON.stringify(record)}`);
            } else {
                s3CopyRequest = new CopyRequestRecord(
                    record.messageAttributes.manifest_file.stringValue,
                    record.messageAttributes.source_bucket.stringValue,
                    record.messageAttributes.source_object_path.stringValue,
                    record.messageAttributes.source_tags ? record.messageAttributes.source_tags.stringValue : '',
                    parseInt(record.messageAttributes.size.stringValue, 10),
                    record.messageAttributes.storage_class.stringValue,
                    record.messageAttributes.target_bucket.stringValue,
                    record.messageAttributes.target_object_path.stringValue,
                    record.messageAttributes.target_storage_class.stringValue,
                    record.messageAttributes.target_tags ? record.messageAttributes.target_tags.stringValue : ''
                );

                if(!s3CopyRequest.isValid()) {
                    await ObjectCopier.rejectCopyRequest(record, null, `Invalid S3 copy request with errors ${s3CopyRequest.getValidationErrors()}: ${JSON.stringify(record)}`);
                } else {
                    // Perform the S3 copy operation for this request.
                    if(s3CopyRequest.size > ObjectCopier.MAX_FILE_SIZE_WITHOUT_MULTIPART) {
                        let multipartUploader = new MultipartCopier(s3CopyRequest);
                        await multipartUploader.copyS3ObjectMultiPart();
                    } else {
                        await RegularCopier.copyS3Object(s3CopyRequest);
                    }

                    // Update the tracking status with the completed status.
                    s3CopyRequest.processing_status = STATUS_VALUES.COPY_COMPLETED;
                    await TrackingDb.addRecord(s3CopyRequest);
                }
            }
        } catch(e) {
            await ObjectCopier.rejectCopyRequest(record, s3CopyRequest, `An error occurred while processing copy request - ${JSON.stringify(record)}.  Error message is ${e}`);
        } finally {
            // Delete the message from the queue since it's been successfully processed.
            await ObjectCopier.deleteMessageFromQueue(record);

            console.log(`Finished processing message - ${JSON.stringify(record)}`);
        }
    }

    // This function handles the scenario where the copy request can't be handled due to a fatal error.
    private static async rejectCopyRequest(record: any, s3CopyRequest: CopyRequestRecord | null, errorMessage: string) {
        try {
            console.error(errorMessage);

            // Move this message from the regular queue to the dead letter queue since it can't be processed.
            try {
                await DeadLetterQueue.submitRecordToDeadLetterQueue(record);
            } catch(dlqException) {
                console.error(`An error occurred while adding record to dead letter queue: ${JSON.stringify(s3CopyRequest)} - ${errorMessage} - ${dlqException} ${dlqException instanceof Error? dlqException.stack : ""}`);
            }

            // Update the tracking table if we can find the original record.
            if(s3CopyRequest) {
                // Update the tracking status with the error status.
                s3CopyRequest.processing_status = STATUS_VALUES.ERROR;
                s3CopyRequest.error_message = errorMessage;
                await TrackingDb.addRecord(s3CopyRequest);
            }
        } catch(e) {
            console.error(`An error occurred while rejecting copy request: ${JSON.stringify(s3CopyRequest)} - ${errorMessage} - ${e} ${e instanceof Error? e.stack : ""}`);
        }
    }

    // This function removes the message from the SQS queue
    private static async deleteMessageFromQueue(record: any) {
        try {
            return new Promise((resolve, reject) => {
                console.log(`Deleting message from queue - ${JSON.stringify(record)}`);

                let sqs = new aws.SQS();
                let eventSourceARNParts = record.eventSourceARN.split(":");
                let accountId = eventSourceARNParts[4];
                let queueName = eventSourceARNParts[5];
                let queueUrl = `${sqs.endpoint.href}${accountId}/${queueName}`;

                let params = {
                    QueueUrl: queueUrl,
                    ReceiptHandle: record.receiptHandle
                };

                console.log(`Submitting message delete for message ID=${record.messageId}, ReceiptHandle=${record.receiptHandle}, QueueUrl=${queueUrl}`);
                sqs.deleteMessage(params)
                    .on('success', (response: any) => {
                        console.log(`Successfully deleted message: ${record.messageId}`);
                        resolve(response);
                    })
                    .on('error', (e: Error) => {
                        console.error(`An error occurred deleting message ${record.messageId}: ${e} ${e.stack}`);
                        reject(e);
                    })
                    .send();
            });
        } catch(e) {
            console.error(`An error occurred deleting message from queue ${JSON.stringify(record)}: ${e} ${e instanceof Error? e.stack : ""}`);
        }
    }
}
