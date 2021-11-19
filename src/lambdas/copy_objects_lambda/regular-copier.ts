/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import { CopyRequestRecord } from "../../common/copy-request-record";
import { S3ObjectApi } from "../../common/s3-object-api";
import { S3ObjectDetails } from "../../common/s3-object-details";

export class RegularCopier {
    // This function does a regular S3 object copy operation.
    public static async copyS3Object(record: CopyRequestRecord) {
        console.log(`Copying object with normal operation - ${JSON.stringify(record)}`);

        // Only need the existing tags for a regular copy because the other metadata will copy automatically.
        console.log(`Getting existing object tags...`);
        let existingTags : any = await S3ObjectApi.getS3ObjectTags(record.source_bucket, record.source_object_path)
        console.log(`Got existing object tags - ${JSON.stringify(existingTags)}`);
        let objectDetails = new S3ObjectDetails(undefined, record.size,undefined, existingTags);

        await S3ObjectApi.copyS3Object(record, objectDetails);

        console.log(`Finished copying object with normal operation - ${JSON.stringify(record)}`);

        // After the copy is complete, tag the source record with the requested tags if any.
        if(Boolean(record.source_tags)) {
            await S3ObjectApi.tagS3Object(record.source_bucket, record.source_object_path, objectDetails.getTagsAsTagSet(record.source_tags));
        }
    }
}
