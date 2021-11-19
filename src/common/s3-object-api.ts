/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import * as aws from "aws-sdk";
import {KeyValue, S3ObjectDetails} from "./s3-object-details";
import { CopyRequestRecord } from "./copy-request-record";

export class S3ObjectApi {
    private static readonly s3 = new aws.S3();

    // Get object information from S3.
    public static async getS3ObjectInfo(bucketName: string, objectKey: string) {
        return new Promise(async (resolve, reject) => {
            try {
                const params = {
                    Bucket: bucketName,
                    Prefix: objectKey,
                };

                await this.s3.listObjects(params)
                    .on('success', (response : any) => {
                        console.log(`Successfully retrieved S3 object info: ${JSON.stringify(response.data)}`);
                        resolve(response.data.Contents[0]);
                    })
                    .on('error', (e : Error) => {
                        reject(e);
                    })
                    .send();
            } catch(e) {
                reject(e);
            }
        });
    }

    // Get the object details from S3 for metadata and tags.
    public static async getS3ObjectDetails(bucketName: string, objectKey: string) : Promise<S3ObjectDetails> {
        let promises = [
            this.getS3ObjectMetadata(bucketName, objectKey),
            this.getS3ObjectTags(bucketName, objectKey)
        ];

        const response: Array<any> = await Promise.all(promises);
        return (new S3ObjectDetails(
            response[0].ContentType,
            response[0].ContentLength,
            response[0].Metadata,
            response[1]
        ));
    }

    // Get object metadata from S3.
    private static async getS3ObjectMetadata(bucketName: string, objectKey: string) {
        return new Promise((resolve, reject) => {
            const params = {
                Bucket: bucketName,
                Key: objectKey
            };

            this.s3.headObject(params)
                .on('success', (response : any) => {
                    console.log(`Successfully retrieved S3 object details: ${JSON.stringify(response.data)}`);
                    resolve(response.data);
                })
                .on('error', (e : Error) => {
                    reject(e);
                })
                .send();
        });
    }

    // Get object tags from S3.
    public static async getS3ObjectTags(bucketName: string, objectKey: string) {
        return new Promise((resolve, reject) => {
            const params = {
                Bucket: bucketName,
                Key: objectKey
            };

            this.s3.getObjectTagging(params)
                .on('success', (response : any) => {
                    console.log(`Successfully retrieved S3 object tags: ${JSON.stringify(response.data)}`);
                    resolve(response.data.TagSet);
                })
                .on('error', (e : Error) => {
                    reject(e);
                })
                .send();
        });
    }

    // Apply tags to an S3 object
    public static async tagS3Object(bucketName: string, objectKey: string, tagSet: Array<KeyValue>) {
        return new Promise((resolve, reject) => {
            const params = {
                Bucket: bucketName,
                Key: objectKey,
                Tagging: {
                    TagSet: tagSet
                }
            };

            this.s3.putObjectTagging(params)
                .on('success', (response : any) => {
                    console.log(`Successfully applied tags ${JSON.stringify(tagSet)} to object ${bucketName}/${objectKey}`);
                    resolve(response.data.TagSet);
                })
                .on('error', (e : Error) => {
                    console.error(`An error occurred applying tags ${JSON.stringify(tagSet)} to object ${bucketName}/${objectKey}: ${e} ${e.stack}`);
                    resolve(null);
                })
                .send();
        });
    }

    // Invoke the regular copy S3 API for an object.
    public static async copyS3Object(record: CopyRequestRecord, objectDetails: S3ObjectDetails) {
        return new Promise((resolve, reject) => {
            let params = {
                Bucket: record.target_bucket,
                CopySource: `/${record.source_bucket}/${record.source_object_path}`,
                Key: record.target_object_path,
                StorageClass: record.target_storage_class,
                RequestPayer: 'requester',
                MetadataDirective: 'COPY',
                TaggingDirective: 'REPLACE',
                Tagging: objectDetails.getTagsAsString(record.target_tags),
                ACL: 'bucket-owner-full-control'
            };

            console.log(`Copying S3 object with params ${JSON.stringify(params)}`);

            this.s3.copyObject(params)
                .on('success', (data: any) => {
                    console.log(`Successfully processed S3 object copy request: ${JSON.stringify(record)}`);
                    resolve(data);
                })
                .on('error', (e: Error) => {
                    console.error(`An error occurred processing S3 object copy ${JSON.stringify(record)}: ${e} ${e.stack}`);
                    reject(e);
                })
                .send();
        });
    }
}
