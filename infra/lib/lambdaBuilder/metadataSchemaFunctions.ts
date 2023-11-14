/*
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import { Construct } from "constructs";
import { Duration } from "aws-cdk-lib";
import { storageResources } from "../nestedStacks/storage/storageBuilder-nestedStack";
import { LayerVersion } from "aws-cdk-lib/aws-lambda";
import { LAMBDA_PYTHON_RUNTIME } from "../../config/config";
import * as Config from "../../config/config";
import * as ec2 from "aws-cdk-lib/aws-ec2";

export function buildMetadataSchemaService(
    scope: Construct,
    lambdaCommonBaseLayer: LayerVersion,
    storageResources: storageResources,
    config: Config.Config,
    vpc: ec2.IVpc
): lambda.Function {
    const name = "schema";
    const fn = new lambda.Function(scope, name, {
        code: lambda.Code.fromAsset(path.join(__dirname, `../../../backend/backend`)),
        handler: `handlers.metadataschema.${name}.lambda_handler`,
        runtime: LAMBDA_PYTHON_RUNTIME,
        layers: [lambdaCommonBaseLayer],
        timeout: Duration.minutes(15),
        memorySize: 512,
        vpc: (config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas)? vpc : undefined, //Use VPC when flagged to use for all lambdas
        environment: {
            DATABASE_STORAGE_TABLE_NAME: storageResources.dynamo.databaseStorageTable.tableName,
            METADATA_SCHEMA_STORAGE_TABLE_NAME:
                storageResources.dynamo.metadataSchemaStorageTable.tableName,
        },
    });
    storageResources.dynamo.databaseStorageTable.grantReadData(fn);
    storageResources.dynamo.metadataSchemaStorageTable.grantReadWriteData(fn);

    return fn;
}
