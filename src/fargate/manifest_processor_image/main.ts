/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import { ManifestProcessor } from './manifest-processor';

(async() => {
    const BUCKET_NAME = process.env.BUCKET_NAME;
    const OBJECT_KEY = process.env.OBJECT_KEY;
    const TEST_FLAG = process.argv[2];

    console.log(`Manifest processor invoked with bucket "${BUCKET_NAME}" and object "${OBJECT_KEY}"`);

    if(BUCKET_NAME && OBJECT_KEY) {
        const TEST_FLAG_BOOL : boolean = (TEST_FLAG != null && TEST_FLAG == "TEST");
        await ManifestProcessor.processManifestFile(BUCKET_NAME, OBJECT_KEY, TEST_FLAG_BOOL);
    } else {
        console.error(`Invalid parameters received to process manifest file with bucket "${BUCKET_NAME}" and object "${OBJECT_KEY}"`)
    }
})()
