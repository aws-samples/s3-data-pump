import * as fs from 'fs';
import * as aws from 'aws-sdk';
import csvParse from 'csv-parser';
import * as through2 from 'through2-concurrent';
import { ManifestRecord } from './manifest-record';
import { CopyQueue } from '../../common/copy-queue';
import { CopyRequestRecord, STATUS_VALUES, STORAGE_CLASS_GLACIER, STORAGE_CLASS_DEEP_ARCHIVE } from "../../common/copy-request-record";
import { TrackingDb } from "../../common/tracking-db";
import { S3ObjectApi } from "../../common/s3-object-api";

export class ManifestProcessor {
    private static readonly s3 = new aws.S3();
    private static readonly PARALLEL_TASKS = parseInt(process.env.PARALLEL_TASKS ? process.env.PARALLEL_TASKS : '100', 10);

    // This processes a single manifest file
    public static async processManifestFile (manifestBucketName: string, manifestRecordKey: string, testFlag: boolean) {
        return new Promise(async (resolve, reject) => {
            try {
                let parser: csvParse.CsvParser = csvParse();

                // Download the manifest file locally for processing.
                await ManifestProcessor.downloadManifest(manifestBucketName, manifestRecordKey);

                // Stream the file and process the rows in batches.
                let rowNumber = 0;
                fs.createReadStream(manifestRecordKey)
                    .pipe(parser)
                    .pipe(through2.obj(
                        {maxConcurrency: ManifestProcessor.PARALLEL_TASKS},
                        async function (data:any, enc:any, callback:any) {
                            rowNumber++;
                            await ManifestProcessor.processManifestRecord(manifestRecordKey, data, rowNumber, testFlag);
                            callback();
                        })
                    )
                    .on('data', (data: any) => {
                        console.log('Finished processing a batch of data.')
                    })
                    .on('end', () => {
                        console.log(`Finished processing all ${rowNumber} rows for manifest:  ${manifestRecordKey}`);
                        resolve(true);
                    })
                    .on('error', (e: Error) => {
                        console.error(`An error occurred processing manifest: ${manifestRecordKey} - ${e} ${e.stack}`);
                        reject(e);
                    });
            } catch(e) {
                console.error(`An error occurred while processing manifest: ${manifestBucketName} / ${manifestRecordKey} - ${e} ${e instanceof Error? e.stack : ""}`);
            }
        });
    }

    // This function downloads a manifest file from S3 and stores it in the local ECS storage.
    // Previously, used S3 streaming but the stream would stop randomly.  This is a safer approach.
    private static async downloadManifest(manifestBucketName: string, manifestRecordKey: string) {
        return new Promise(async(resolve, reject) => {
            try {
                console.log(`Starting to read manifest from S3: ${manifestRecordKey}`);

                const params = {
                    Bucket: manifestBucketName,
                    Key: manifestRecordKey
                };

                await ManifestProcessor.s3.getObject(params, (e: any, fileContents: any) => {
                    if (e) {
                        console.error(`An error occurred reading manifest: ${manifestRecordKey} - ${e} ${e.stack}`);
                        reject(e);
                    } else {
                        console.log(`Got manifest from S3 and writing to disk now: ${manifestRecordKey}`);
                        fs.writeFileSync(manifestRecordKey, fileContents.Body.toString());
                        console.log(`Finished writing manifest to disk: ${manifestRecordKey}`);
                        resolve(true);
                    }
                });
            } catch(e) {
                console.error(`An error occurred while downloading manifest: ${manifestBucketName} / ${manifestRecordKey} - ${e} ${e instanceof Error? e.stack : ""}`);
            }
        });
    }

    // Processes a single manifest record.  Retrieves the S3 details for the object.  If the object is stored in Glacier, a restore is initiated.
    // Otherwise the request is put into a queue for the copy to be performed.
    private static async processManifestRecord(manifestFileName: string, manifestRecord: ManifestRecord, rowNumber: number, testFlag: boolean) {
        let copyRecord = new CopyRequestRecord(
            manifestFileName,
            manifestRecord.source_bucket,
            manifestRecord.source_object_path,
            manifestRecord.source_tags,
            0,
            '',
            manifestRecord.target_bucket,
            manifestRecord.target_object_path,
            manifestRecord.target_storage_class,
            manifestRecord.target_tags
            );

        try {
            console.log(`Start processing row #${rowNumber} - ${JSON.stringify(manifestRecord)}`);

            // This test flag allows for bypassing the record processing and just do the manifest traversal.
            if(testFlag) {
                return;
            }

            let objectInfo: any = await S3ObjectApi.getS3ObjectInfo(manifestRecord.source_bucket, manifestRecord.source_object_path);

            // Augment the copy record with the size and storage class found from S3 info.
            copyRecord.size = parseInt(objectInfo.Size, 10);
            copyRecord.storage_class = objectInfo.StorageClass;

            // Skip entries that have a zero size
            if(!copyRecord.isValid()) {
                await ManifestProcessor.logError(copyRecord, `Skipping this manifest record since it failed validation with errors ${copyRecord.getValidationErrors()}:  ${JSON.stringify(copyRecord)}`);
                return;
            }

            // If the object is in Glacier, need to restore it first.
            if(copyRecord.storage_class == STORAGE_CLASS_GLACIER || copyRecord.storage_class == STORAGE_CLASS_DEEP_ARCHIVE) {
                console.log("Found Glacier object.  Start the restore process.");
                let result = await ManifestProcessor.restoreGlacierObject(copyRecord.source_bucket, copyRecord.source_object_path);
                // If a 200 result is returned from the restore request, then the object has previously been
                // restored, so can initiate the copy right away.  Otherwise, will wait for the restore event
                // to complete, which will trigger another Lambda.
                if(result == 200) {
                    await ManifestProcessor.submitCopyRequest(copyRecord, `Submitting previously restored Glacier object to the copy queue - ${JSON.stringify(copyRecord)}`);
                } else if(result == 202) {
                    console.log(`Recording Glacier object being restored - ${JSON.stringify(copyRecord)}`);
                    copyRecord.processing_status = STATUS_VALUES.RESTORING;
                    await TrackingDb.addRecord(copyRecord);
                } else {
                    await ManifestProcessor.logError(copyRecord, `Invalid return code from Glacier restore operation ${result} - ${JSON.stringify(copyRecord)}`);
                }
            } else {
                await ManifestProcessor.submitCopyRequest(copyRecord, `Submitting regular S3 object to the copy queue - ${JSON.stringify(copyRecord)}`);
            }
        } catch(e) {
            await ManifestProcessor.logError(copyRecord, `An error occurred while processing manifest row: ${JSON.stringify(manifestRecord)} - ${e} ${e instanceof Error? e.stack : ""}`);
        } finally {
            console.log(`End processing row: ${JSON.stringify(manifestRecord)}`);
        }
    }

    // Log an error while processing a row in the manifest
    private static async logError(copyRecord: CopyRequestRecord, errorMessage: string) {
        try {
            copyRecord.processing_status = STATUS_VALUES.ERROR;
            copyRecord.error_message = errorMessage;
            console.error(errorMessage);
            await TrackingDb.addRecord(copyRecord);
        } catch(e) {
            console.error(`An error occurred while logging error to DB: ${JSON.stringify(copyRecord)} - ${errorMessage} - ${e} ${e instanceof Error? e.stack : ""}`);
        }
    }

    // Submit a request to copy the object.
    private static async submitCopyRequest(copyRecord: CopyRequestRecord, message: string) {
        console.log(message);
        copyRecord.processing_status = STATUS_VALUES.QUEUED_FOR_COPY;
        await TrackingDb.addRecord(copyRecord);
        await CopyQueue.submitCopyObjectToQueue(copyRecord);
    }

    // This function restores an object from S3 Glacier
    private static async restoreGlacierObject(bucketName: string, objectKey: string) {
        return new Promise(async (resolve, reject) => {
            try {
                console.log(`Restoring object from Glacier: ${bucketName} - ${objectKey}`);
                const params = {
                    Bucket: bucketName,
                    Key: objectKey,
                    RestoreRequest: {
                        Days: parseInt((Boolean(process.env.GLACIER_RESTORE_DAYS) ? process.env.GLACIER_RESTORE_DAYS as string : "1"), 10),
                        GlacierJobParameters: {
                            Tier: (Boolean(process.env.GLACIER_RESTORE_TIER) ? process.env.GLACIER_RESTORE_TIER as string : "Bulk")
                        }
                    }
                };

                await ManifestProcessor.s3.restoreObject(params)
                    .on('success', (response : any) => {
                        console.log(`Successfully submitted restore with response: ${response.httpResponse.statusCode}`);
                        resolve(response.httpResponse.statusCode);
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
}
