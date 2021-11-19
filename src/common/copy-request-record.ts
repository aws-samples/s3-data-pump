/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
export enum STATUS_VALUES {
    INITIATING = 'INITIATING',
    RESTORING = 'RESTORING',
    QUEUED_FOR_COPY = 'QUEUED FOR COPY',
    COPY_COMPLETED = 'COPY COMPLETED',
    ERROR = 'ERROR'
}

export const STORAGE_CLASS_GLACIER = 'GLACIER';
export const STORAGE_CLASS_DEEP_ARCHIVE = 'DEEP_ARCHIVE';
const VALID_STORAGE_CLASSES = ['STANDARD', 'REDUCED_REDUNDANCY', 'STANDARD_IA', 'ONEZONE_IA', 'INTELLIGENT_TIERING', 'GLACIER', 'DEEP_ARCHIVE', 'OUTPOSTS'];
const TAGS_REGX = new RegExp('^([^&= ]+)=([^&= ]+)(&([^&= ]+)=([^&= ]+))*$');

export class CopyRequestRecord {
    public error_message: string;
    public processing_status: string = STATUS_VALUES.INITIATING;
    public creation_time: String = new Date().toUTCString();
    public last_update_time: String = new Date().toUTCString();

    constructor(public manifest_file: string,
                public source_bucket: string,
                public source_object_path: string,
                public source_tags: string,
                public size: number,
                public storage_class: string,
                public target_bucket: string,
                public target_object_path: string,
                public target_storage_class: string,
                public target_tags: string) {
        if(!Boolean(target_object_path)) {
            this.target_object_path = source_object_path;
        }
        if(!Boolean(target_storage_class)) {
            this.target_storage_class = STORAGE_CLASS_GLACIER;
        }
    }

    // Validate storage classes
    private isValidStorageClass(storageClass: string): boolean {
        return(VALID_STORAGE_CLASSES.includes(storageClass));
    }

    // Evaluates if this is a valid copy request.
    public isValid(): boolean {
        return (
            Boolean(this.manifest_file) &&
            Boolean(this.source_bucket) &&
            Boolean(this.source_object_path) &&
            (!Boolean(this.source_tags) || TAGS_REGX.test(this.source_tags)) &&
            this.size > 0 &&
            Boolean(this.storage_class) &&
            this.isValidStorageClass(this.storage_class) &&
            Boolean(this.target_bucket) &&
            Boolean(this.target_object_path) &&
            Boolean(this.target_storage_class) &&
            this.isValidStorageClass(this.target_storage_class) &&
            (!Boolean(this.target_tags) || TAGS_REGX.test(this.target_tags))
        );
    }

    // Get the list of validation errors for the copy request object
    public getValidationErrors(): Array<string> {
        let errors: Array<string> = [];

        if(!Boolean(this.manifest_file)) {
            errors.push('Manifest file is empty in copy request.');
        }
        if(!Boolean(this.source_bucket)) {
            errors.push('Source bucket value is empty in copy request.');
        }
        if(!Boolean(this.source_object_path)) {
            errors.push('Source object path is empty in copy request.');
        }
        if(Boolean(this.source_tags) && !TAGS_REGX.test(this.source_tags)) {
            errors.push('Source tags incorrectly formatted in copy request.  Must be in format "tag=value&tag2=value2');
        }
        if(this.size <= 0) {
            errors.push('Size must be greater than zero in copy request.');
        }
        if(!Boolean(this.storage_class)) {
            errors.push('Storage class is empty in copy request.');
        }
        if(!this.isValidStorageClass(this.storage_class)) {
            errors.push(`Storage class does not have a valid value in copy request.  Must be one of: ${VALID_STORAGE_CLASSES}`);
        }
        if(!Boolean(this.target_bucket)) {
            errors.push('Target bucket value is empty in copy request.');
        }
        if(!Boolean(this.target_object_path)) {
            errors.push('Target object path is empty in copy request.');
        }
        if(!Boolean(this.target_storage_class)) {
            errors.push('Target storage class is empty in copy request.');
        }
        if(!this.isValidStorageClass(this.target_storage_class)) {
            errors.push(`Target storage class does not have a valid value in copy request.  Must be one of: ${VALID_STORAGE_CLASSES}`);
        }
        if(Boolean(this.target_tags) && !TAGS_REGX.test(this.target_tags)) {
            errors.push('Target tags incorrectly formatted in copy request.  Must be in format "tag=value&tag2=value2');
        }

        return errors;
    }
}