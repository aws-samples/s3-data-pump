/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import { RestoreEventHandler } from "./restore-event-handler";

export const handler = async (event: any, context: any) => {
    console.log(`Request after Glacier object restore: ${JSON.stringify(event, undefined, 2)}`);

    // Loop through the records for the S3 event.  Should only be restore event.
    let promises: Array<Promise<any>> = [];
    for (let record of event.Records) {
        if (record.eventName == "ObjectRestore:Completed") {
            promises.push(RestoreEventHandler.handleRestoreEvent(record));
        } else {
            console.log(`Unrecognized event type received in Restore Event Lambda ${JSON.stringify(record)}`);
        }
    }
    await Promise.all(promises);

    return('Lambda processing complete');
  };
  