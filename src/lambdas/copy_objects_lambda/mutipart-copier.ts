/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import * as aws from 'aws-sdk';
import { CopyRequestRecord } from "../../common/copy-request-record";
import { CreateMultipartUploadOutput, ETag } from "aws-sdk/clients/s3";
import { S3ObjectApi } from "../../common/s3-object-api";
import { S3ObjectDetails } from "../../common/s3-object-details";

export class MultipartCopier {
    private static readonly MAX_CHUNK_SIZE = 1000000000; // 1 GB
    private s3 = new aws.S3();
    private parts_etags: Array<ETag> = [];
    private readonly record: CopyRequestRecord;

    constructor(private _record: CopyRequestRecord) {
        this.record = _record;
    }

    // This function copies an S3 object to a new location
    public async copyS3ObjectMultiPart()  {
        console.log(`Copying object with multi-part - ${JSON.stringify(this.record)}`);

        console.log(`Getting object details needed for multi-part copy...`);
        let objectDetails = await S3ObjectApi.getS3ObjectDetails(this.record.source_bucket, this.record.source_object_path)
        console.log(`Got object details - ${JSON.stringify(objectDetails)}`);
        this.record.size = objectDetails.contentLength;

        let total_chunks = Math.floor(this.record.size / MultipartCopier.MAX_CHUNK_SIZE);
        console.log(`Total chunks to upload ${total_chunks}`);

        let multipartUpload = await this.createMultipartUpload(objectDetails);

        let remainder_chunk = this.record.size % MultipartCopier.MAX_CHUNK_SIZE;
        console.log(`Remainder bytes last chunk: ${remainder_chunk}`);

        let copyPromises = [];
        for (let i = 0; i <= total_chunks; i++) {
            let chunk: string = '';
            if (i < total_chunks) {
                chunk = `bytes=${i * MultipartCopier.MAX_CHUNK_SIZE}-${((i + 1) * MultipartCopier.MAX_CHUNK_SIZE) -1}`;
            } else if (i == total_chunks && remainder_chunk > 0) {
                chunk = `bytes=${i * MultipartCopier.MAX_CHUNK_SIZE}-${((i * MultipartCopier.MAX_CHUNK_SIZE) + remainder_chunk - 1)}`;
            }

            if(chunk.length > 0) {
                copyPromises.push(this.uploadPartCopy(i, chunk, multipartUpload));
            }
        }

        console.log("Waiting for all parts to complete uploading...");

        await Promise.all(copyPromises);

        console.log("All parts have completed uploading.");

        await this.completeMultipartUpload(multipartUpload.UploadId);

        // After the copy is complete, tag the source record with the requested tags if any.
        if(Boolean(this.record.source_tags)) {
            await S3ObjectApi.tagS3Object(this.record.source_bucket, this.record.source_object_path, objectDetails.getTagsAsTagSet(this.record.source_tags));
        }
    }

    private async createMultipartUpload(objectDetails: S3ObjectDetails) : Promise<CreateMultipartUploadOutput> {
        return new Promise((resolve, reject) => {
            console.log(`Total size to copy ${this.record.size} bytes`);

            let params = {
                Bucket: this.record.target_bucket,
                Key: this.record.target_object_path,
                StorageClass: this.record.target_storage_class,
                ContentType:  objectDetails.contentType,
                Metadata: objectDetails.metaData,
                Tagging: objectDetails.getTagsAsString(this.record.target_tags),
                ACL: 'bucket-owner-full-control'
            };

            console.log(`Creating multi-part upload with params ${JSON.stringify(params)}`);

            this.s3.createMultipartUpload(params)
                .on('success', (response : any) => {
                    console.log(`Successfully created multi-part upload: ${JSON.stringify(response.data)}`);
                    resolve(response.data);
                })
                .on('error', (e : Error) => {
                    console.error(`An error occurred creating multi-part upload ${e} ${e.stack}`);
                    reject(e);
                })
                .send();
        });
    }

    private async uploadPartCopy(i: number, chunk: string, multipartUpload: any) {
        return new Promise((resolve, reject) => {
            console.log(`Uploading chunk #${i} - ${chunk}`);

            let params = {
                Bucket: this.record.target_bucket,
                CopySource: `/${this.record.source_bucket}/${this.record.source_object_path}`,
                Key: this.record.target_object_path,
                PartNumber: i + 1,
                UploadId: multipartUpload.UploadId,
                CopySourceRange: chunk
            };

            this.s3.uploadPartCopy(params)
                .on('success', (response: any) => {
                    console.log(`Successfully uploaded part for chunk ${i}`);
                    this.parts_etags[i] = response.data.CopyPartResult.ETag;
                    resolve(response.data);
                })
                .on('error', (e: Error) => {
                    console.error(`An error occurred processing chunk ${i}: ${e} ${e.stack}`);
                    reject(e);
                })
                .send();
        });
    }

    private async completeMultipartUpload(upload_id: any) {
        return new Promise((resolve, reject) => {
            let etags_params = [];

            for (let i = 0; i < this.parts_etags.length; i++) {
                etags_params.push({
                    ETag: this.parts_etags[i],
                    PartNumber: i + 1
                });
            }

            console.log(`Parts uploaded - ${JSON.stringify(etags_params)}`);

            let params = {
                Bucket: this.record.target_bucket,
                Key: this.record.target_object_path,
                UploadId: upload_id,
                MultipartUpload: {
                    Parts: etags_params
                },
                RequestPayer: 'requester'
            };

            console.log("Completing multipart upload...");

            this.s3.completeMultipartUpload(params)
                .on('success', (response : any) => {
                    console.log(`Successfully completed multi-part upload: ${JSON.stringify(response.data)}`);
                    resolve(response.data);
                })
                .on('error', (e : Error) => {
                    console.error(`An error occurred completing the multi-part upload ${e} ${e.stack}`);
                    reject(e);
                })
                .send();
        });
    }
}
