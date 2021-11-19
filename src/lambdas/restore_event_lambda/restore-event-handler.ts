/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import { CopyQueue } from '../../common/copy-queue';
import { CopyRequestRecord, STATUS_VALUES } from "../../common/copy-request-record";
import { TrackingDb } from "../../common/tracking-db";

export class RestoreEventHandler {
    // This function processes a single restore event
    public static async handleRestoreEvent (record: any) {
        try {
            // Retrieve the tracking record for this object to determine the target bucket / path.
            let copyRequest = await TrackingDb.getRecord(record.s3.bucket.name, record.s3.object.key);
            if(Boolean(copyRequest)) {
                let s3CopyRequest = new CopyRequestRecord(
                    copyRequest.manifest_file,
                    record.s3.bucket.name,
                    record.s3.object.key,
                    copyRequest.source_tags,
                    record.s3.object.size,
                    copyRequest.storage_class,
                    copyRequest.target_bucket,
                    copyRequest.target_object_path,
                    copyRequest.target_storage_class,
                    copyRequest.target_tags
                )

                // Set the tracking status to indicate the restore is complete.
                s3CopyRequest.processing_status = STATUS_VALUES.QUEUED_FOR_COPY;
                await TrackingDb.addRecord(s3CopyRequest);

                console.log(`Submitting restored Glacier object to the copy queue: ${JSON.stringify(s3CopyRequest)}`);
                await CopyQueue.submitCopyObjectToQueue(s3CopyRequest);
            } else {
                console.error(`An error occurred retrieving the target bucket / path for: ${JSON.stringify(record)}`);
            }
        } catch(e) {
            console.error(`An error occurred while processing restore event: ${JSON.stringify(record)}`);
        }
    }
}
