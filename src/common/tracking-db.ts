/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import * as aws from 'aws-sdk';
import { CopyRequestRecord } from "./copy-request-record";

export class TrackingDb {
    private static readonly TRACKING_TABLE_NAME : any = process.env.TRACKING_TABLE_NAME;

    // Add a record to the tracking table
    public static async addRecord(copyRequest: CopyRequestRecord, retry: number = 0) {
        try {
            await TrackingDb.tryAddRecord(copyRequest);
        } catch(e){
            if(retry < 2) {
                await new Promise(resolve => setTimeout(resolve, 10 * retry));
                await TrackingDb.addRecord(copyRequest, ++retry);
            } else {
                console.error(`An error occurred adding tracking table record ${e} ${e instanceof Error? e.stack : ""}`);
            }
        }
    }

    private static async tryAddRecord(copyRequest: CopyRequestRecord) {
        return new Promise((resolve, reject) => {
            console.log(`Adding tracking table record ${JSON.stringify(copyRequest)}`);

            let dbClient = new aws.DynamoDB.DocumentClient();

            let params = {
                TableName: TrackingDb.TRACKING_TABLE_NAME,
                Item: copyRequest
            };

            dbClient.put(params)
                .on('success', (response : any) => {
                    console.log(`Successfully added tracking table record: ${response.httpResponse.statusCode} - ${JSON.stringify(copyRequest)}`);
                    resolve(response.data);
                })
                .on('error', (e : Error) => {
                    reject(e);
                })
                .send();
        });
    }

    // Get a record from the tracking table
    public static async getRecord(source_bucket: string, source_object_path: string, retry: number = 0): Promise<any> {
        try {
            return await TrackingDb.tryGetRecord(source_bucket, source_object_path);
        } catch(e: any){
            if(retry < 2) {
                await new Promise(resolve => setTimeout(resolve, 10 * retry));
                return await TrackingDb.getRecord(source_bucket, source_object_path, ++retry);
            } else {
                console.error(`An error occurred retrieving tracking table record ${e} ${e instanceof Error? e.stack : ""}`);
                return null;
            }
        }
    }

    private static async tryGetRecord(source_bucket: string, source_object_path: string) {
        return new Promise((resolve, reject) => {
            console.log(`Getting tracking table record for source bucket ${source_bucket} and source object path ${source_object_path}`);
            let dbClient = new aws.DynamoDB.DocumentClient();

            let params = {
                TableName: TrackingDb.TRACKING_TABLE_NAME,
                Key:{
                    "source_bucket": source_bucket,
                    "source_object_path": source_object_path
                }
            };

            return dbClient.get(params)
                .on('success', (response : any) => {
                    console.log(`Successfully retrieved tracking table record: ${response.httpResponse.statusCode} - ${JSON.stringify(response.data.Item)}`);
                    resolve(response.data.Item);
                })
                .on('error', (e : Error) => {
                    reject(e);
                })
                .send();
        });
    }
}
