/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import { MultipartCopier } from '../src/lambdas/copy_objects_lambda/mutipart-copier'
import { CopyRequestRecord } from "../src/common/copy-request-record";
import { RegularCopier } from "../src/lambdas/copy_objects_lambda/regular-copier";

// Multi-part copy test
let multiPartTestRecord = new CopyRequestRecord(
    'test_manifest.csv',
    '<<source_bucket>>',
    '<<source_object>>',
    '',
    10737418240,
    'STANDARD',
    '<<target_bucket>>',
    '<<target_object>>',
    'GLACIER',
    'newtag=12345&newtag2=23456'
);

// Regular copy test
let regularTestRecord = new CopyRequestRecord(
    'test_manifest.csv',
    '<<source_bucket>>',
    '<<source_object>>',
    'copytag3=true',
    729,
    'GLACIER',
    '<<target_bucket>>',
    '<<target_object>>',
    'GLACIER',
    'newtag3=34567&newtag4=45678'
);


(async() => {
    console.log('Running multi-part copy test...');
    const uploader = new MultipartCopier(multiPartTestRecord);
    await uploader.copyS3ObjectMultiPart();

    console.log('Running regular copy test...');
    await RegularCopier.copyS3Object(regularTestRecord);
})()

