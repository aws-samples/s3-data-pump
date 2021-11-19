/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import * as aws from 'aws-sdk';

export class ManifestDispatcher {
    // This function processes a single restore event
    public static async dispatchManifestFile(bucketName: string, objectKey: string) {
        return new Promise((resolve, reject) => {
            try {
                console.log(`Creating Fargate task for manifest bucket ${JSON.stringify(bucketName)}, object ${JSON.stringify(objectKey)}, env ${JSON.stringify(process.env)}`);

                const ecs = new aws.ECS();

                let params: any = {
                    taskDefinition: process.env.TASK_ARN,
                    cluster: process.env.CLUSTER_ARN,
                    overrides: {
                        containerOverrides: [
                            {
                                "name": "ManifestProcessorContainer",
                                environment: [
                                    {
                                        "name": "BUCKET_NAME",
                                        "value": bucketName
                                    },
                                    {
                                        "name": "OBJECT_KEY",
                                        "value": objectKey
                                    }
                                ]
                            }
                        ]
                    },
                    count: 1,
                    launchType: "FARGATE",
                    networkConfiguration: {
                        awsvpcConfiguration: {
                            subnets: (process.env.SUBNETS!.split(',') || ['xx'])
                        }
                    }
                };

                ecs.runTask(params)
                    .on('success', (response: any) => {
                        console.log(`Successfully started Fargate task: ${response.httpResponse.statusCode} for manifest bucket ${JSON.stringify(bucketName)} object ${JSON.stringify(objectKey)}`);
                        resolve(response.httpResponse.statusCode);
                    })
                    .on('error', (e: Error) => {
                        console.error(`An error occurred starting Fargate task for manifest bucket ${JSON.stringify(bucketName)} object ${JSON.stringify(objectKey)} - ${e} ${e.stack}`);
                        reject(e);
                    })
                    .send();
            } catch (e) {
                console.error(`An error occurred while dispatching manifest processing manifest bucket ${JSON.stringify(bucketName)} object ${JSON.stringify(objectKey)} - ${e} ${e instanceof Error? e.stack : ""}`);
            }
        });
    }
}
