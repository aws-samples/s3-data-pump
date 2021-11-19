#!/usr/bin/env node
/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
import * as cdk from '@aws-cdk/core';
import { S3DataPumpStack } from './s3-data-pump-stack';

const app = new cdk.App();
new S3DataPumpStack(app, 'S3DataPumpStack');
