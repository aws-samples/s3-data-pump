/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import * as s3 from "@aws-cdk/aws-s3";

export class Permissions {
    public static getS3BucketResourceStatement(context: any, s3Buckets: Array<string>, category: string, includeBucketPath = false): Array<string> {
        let resources: Array<string> = [];
        if (Boolean(s3Buckets) && s3Buckets.length > 0) {
            (s3Buckets).forEach((s3BucketName: string, index: number) => {
                const s3Bucket = s3.Bucket.fromBucketName(context, category + index, s3BucketName);
                if (Boolean(s3Bucket)) {
                    resources.push(`${s3Bucket.bucketArn}/*`);
                    if(includeBucketPath) {
                        resources.push(`${s3Bucket.bucketArn}`);
                    }
                }
            });
        }

        return resources;
    }
}