/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import { S3ObjectDetails } from '../src/common/s3-object-details'

test('Valid S3 tagging logic to generate string', async () => {
  let details = new S3ObjectDetails(
      'binary/octet-stream',
      13428638947,
      {"key1":"true"},
      [{"Key":"department","Value":"test1"}]
  );

  let tags = details.getTagsAsString('tag1=1234');
  expect(tags).toEqual('department=test1&tag1=1234');
});

test('Duplicate S3 tagging logic to generate string', async () => {
  let details = new S3ObjectDetails(
      'binary/octet-stream',
      12800,
      {"key1":"true"},
      [{"Key":"department","Value":"test1"}, {"Key":"tag1","Value":"duplicate"}]
  );

  let tags = details.getTagsAsString('tag1=1234');
  expect(tags).toEqual('department=test1&tag1=1234');
});

test('Undefined existing S3 tagging logic to generate string', async () => {
  let details = new S3ObjectDetails(
      'binary/octet-stream',
      0,
      {"key1":"true"},
      undefined
  );

  let tags = details.getTagsAsString('');
  expect(tags).toEqual('');
});

test('Empty existing S3 tagging logic with new tags to generate string', async () => {
  let details = new S3ObjectDetails(
      'binary/octet-stream',
      0,
      {"key1":"true"},
      []
  );

  let tags = details.getTagsAsString('key2=false');
  expect(tags).toEqual('key2=false');
});

test('Valid S3 tagging logic to generate tag set', async () => {
  let details = new S3ObjectDetails(
      'binary/octet-stream',
      0,
      {"key1":"true"},
      [{"Key":"department","Value":"test1"}]
  );

  let tags = details.getTagsAsTagSet('tag1=1234&tag2=2345');
  expect(tags.length).toEqual(3);
  expect(tags[0].Key).toEqual('department');
  expect(tags[0].Value).toEqual('test1');
  expect(tags[1].Key).toEqual('tag1');
  expect(tags[1].Value).toEqual('1234');
  expect(tags[2].Key).toEqual('tag2');
  expect(tags[2].Value).toEqual('2345');
});

test('Duplicate S3 tagging logic to generate tag set', async () => {
  let details = new S3ObjectDetails(
      'binary/octet-stream',
      0,
      {"key1":"true"},
      [{"Key":"department","Value":"test1"}, {"Key":"tag1","Value":"duplicate"}]
  );

  let tags = details.getTagsAsTagSet('tag1=1234&tag2=2345');
  expect(tags.length).toEqual(3);
  expect(tags[0].Key).toEqual('department');
  expect(tags[0].Value).toEqual('test1');
  expect(tags[1].Key).toEqual('tag1');
  expect(tags[1].Value).toEqual('1234');
  expect(tags[2].Key).toEqual('tag2');
  expect(tags[2].Value).toEqual('2345');
});

test('Undefined source S3 tagging logic to generate tag set', async () => {
  let details = new S3ObjectDetails(
      'binary/octet-stream',
      0,
      {"key1":"true"},
      undefined
  );

  let tags = details.getTagsAsTagSet('tag1=1234');
  expect(tags.length).toEqual(1);
  expect(tags[0].Key).toEqual('tag1');
  expect(tags[0].Value).toEqual('1234');
});

test('Empty target S3 tagging logic to generate tag set', async () => {
  let details = new S3ObjectDetails(
      'binary/octet-stream',
      0,
      {"key1":"true"},
      undefined
  );

  let tags = details.getTagsAsTagSet('');
  expect(tags.length).toEqual(0);
});