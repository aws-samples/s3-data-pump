/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import { ManifestDispatcher } from './manifest-dispatcher';

export const handler = async (event: any, context: any) => {
    console.log(`Request for processing manifest file: ${JSON.stringify(event, undefined, 2)}`);

    // Loop through the records for the S3 event.  Should only be one manifest file.
    let promises: Array<Promise<any>> = [];
    for (let record of event.Records) {
        if(record.s3 && record.s3.bucket && record.s3.object) {
            let bucketName = record.s3.bucket.name;
            let objectKey = record.s3.object.key;
            if(bucketName && objectKey) {
                promises.push(ManifestDispatcher.dispatchManifestFile(bucketName, objectKey));
            }
        } else {
            console.log(`Unrecognized event received in Manifest Processor Lambda ${JSON.stringify(record)}`);
        }
    }
    await Promise.all(promises);

    return('Lambda processing complete');
  };
  