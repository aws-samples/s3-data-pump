# Release Notes

## Version 1.0
 Initial release of the solution with these features
 * Multiple source and target S3 buckets
 * Handles Glacier restore for source objects
 * Reduces time when source Glacier objects need to be in standard storage tier
 * Handles objects larger than 5 GB in size via multi-part copy
 * Copies existing metadata and tags for all objects
 * Enables additional tags to be added during copy process
 * DynamoDB table for tracking each object copy status
    
## Version 1.1
 * Changed manifest file processing from S3 streaming to download locally on ECS node for better reliability
 * Added manifest file column to DynamoDB status table
 * Added global index to DynamoDB status table to query by manifest file
 * Test mode for manifest processing that will just read all lines but not process them, which is run by:
   BUCKET_NAME="<bucket>" OBJECT_KEY="<manifest file name>" node "src/fargate/manifest_processor_image/main.js" TEST
 * Upgraded dependency libraries to latest
 * Improved error handling