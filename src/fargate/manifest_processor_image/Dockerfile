# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
FROM node:14.16.1-buster-slim

RUN mkdir -p /s3_data_pump/common
COPY common/ /s3_data_pump/common
RUN mkdir -p /s3_data_pump/fargate/manifest_processor_image
COPY fargate/manifest_processor_image/ /s3_data_pump/fargate/manifest_processor_image
COPY fargate/manifest_processor_image/package* /s3_data_pump

WORKDIR /s3_data_pump
RUN apt-get update

RUN npm cache clean -f
RUN npm install --production

CMD ["node", "fargate/manifest_processor_image/main.js"]
