/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
export class ManifestRecord {
    public source_bucket: string;
    public source_object_path: string;
    public source_tags: string;
    public target_bucket: string;
    public target_object_path: string;
    public target_storage_class: string;
    public target_tags: string;
}