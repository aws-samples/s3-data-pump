/*
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
*/
export interface KeyValue {
    Key: string;
    Value: string;
}

export class S3ObjectDetails {
    contentType: string | undefined;
    contentLength: number;
    metaData: any;
    tagSet: Array<KeyValue> | undefined;

    constructor(_contentType: string | undefined, _contentLength: number, _metaData: any, _tagSet: Array<KeyValue> | undefined) {
        this.contentType = _contentType;
        this.contentLength = _contentLength;
        this.metaData = _metaData;
        this.tagSet = _tagSet;
    }

    public toString() {
        return `${this.contentType}, ${this.contentLength}, ${JSON.stringify(this.metaData)}, ${JSON.stringify(this.tagSet)}`;
    }

    // Convert a tag set into a string
    public getTagsAsString(additionalTags: string): string {
        // First merge the additional tags to ensure no duplication.
        let mergedTags = this.getTagsAsTagSet(additionalTags);

        let result: Array<string> = [];
        // Format each key / value pair per tag
        for(const tag of mergedTags) {
            result.push(`${tag.Key}=${tag.Value}`);
        }
        // Join all the tags and return them as string.
        return result.join('&');
    }

    // Convert a string into a tag set
    public getTagsAsTagSet(additionalTags: string): Array<KeyValue> {
        let result: Array<KeyValue> = this.tagSet ? [...this.tagSet] : [];
        result.push(...this.parseTagString(additionalTags));
        return this.getUniqueTags(result);
    }

    // Function to parse string into TagSet.
    private parseTagString(tags: string): Array<KeyValue>{
        let result = [];
        if(tags) {
            let keyPairs = tags.split('&');
            for(let keyPair of keyPairs) {
                let keyPairParts = keyPair.split('=');
                result.push({
                    Key: keyPairParts[0],
                    Value: keyPairParts[1]
                })
            }
        }
        return result;
    }

    // Function to get the unique list of tags by removing duplicates
    private getUniqueTags(tags: Array<KeyValue>) {
        return [...new Map(tags.map(item => [item.Key, item])).values()]
    }
}