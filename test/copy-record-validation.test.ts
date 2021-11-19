/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import { CopyRequestRecord } from '../src/common/copy-request-record'

test('Valid copy record validation', async () => {
  const testRecord = new CopyRequestRecord(
      'test_manifest.csv',
      'source_bucket',
      'source_object',
      '',
      100,
      'GLACIER',
      'target_bucket',
      'target_object',
      'GLACIER',
      'tag=value&tag2=value2'
  );
  expect(testRecord.isValid()).toBeTruthy();
});

test('Valid copy record validation with no optional fields', async () => {
  const testRecord = new CopyRequestRecord(
      'test_manifest.csv',
      'source_bucket',
      'source_object',
      '',
      100,
      'GLACIER',
      'target_bucket',
      '',
      '',
      ''
  );
  expect(testRecord.isValid()).toBeTruthy();
  expect(testRecord.target_object_path).toEqual(testRecord.source_object_path);
  expect(testRecord.target_storage_class).toEqual('GLACIER');
});

test('Valid copy record validation with no optional fields', async () => {
  const testRecord = new CopyRequestRecord(
      'test_manifest.csv',
      'source_bucket',
      'source_object',
      '',
      100,
      'GLACIER',
      'target_bucket',
      '',
      '',
      'tag=value'
  );
  expect(testRecord.isValid()).toBeTruthy();
  expect(testRecord.target_object_path).toEqual(testRecord.source_object_path);
  expect(testRecord.target_storage_class).toEqual('GLACIER');
});

test('Invalid copy record validation', async () => {
  const testRecord = new CopyRequestRecord(
      'test_manifest.csv',
      'source_bucket',
      'source_object',
      '',
      0,
      'GLACIER',
      'target_bucket',
      'target_object',
      'GLACIER2',
      'tag=value&=value2'
  );
  expect(testRecord.isValid()).toBeFalsy();
  const errors = testRecord.getValidationErrors();
  expect(errors.length).toEqual(3);
  expect(errors.indexOf('Size must be greater than zero in copy request.')).toBeGreaterThan(-1);
  expect(errors.indexOf('Target tags incorrectly formatted in copy request.  Must be in format "tag=value&tag2=value2')).toBeGreaterThan(-1);
  expect(errors.indexOf('Target storage class does not have a valid value in copy request.  Must be one of: STANDARD,REDUCED_REDUNDANCY,STANDARD_IA,ONEZONE_IA,INTELLIGENT_TIERING,GLACIER,DEEP_ARCHIVE,OUTPOSTS')).toBeGreaterThan(-1);
});