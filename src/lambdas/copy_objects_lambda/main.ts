/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import { ObjectCopier } from './object-copier';

export const handler = async (event: any, context: any) => {
    console.log(`Request for copying S3 objects: ${JSON.stringify(event, undefined, 2)}`);

    // Loop through the records for the S3 event.  Should only be one manifest file.
    let promises: Array<Promise<any>> = [];
    for (let record of event.Records) {
        promises.push(ObjectCopier.processCopyObjectMessage(record));
    }
    await Promise.all(promises);

    return('Lambda processing complete');
  };
  