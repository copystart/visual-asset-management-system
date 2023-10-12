/*
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { Duration } from "aws-cdk-lib";
import { LayerVersion } from 'aws-cdk-lib/aws-lambda';

export function buildCreateDatabaseLambdaFunction(
    scope: Construct,
    lambdaCommonBaseLayer: LayerVersion,
    databaseStorageTable: dynamodb.Table
): lambda.Function {
    const name = "createDatabase";
    const createDatabaseFunction = new lambda.Function(scope, name, {
        code: lambda.Code.fromAsset(path.join(__dirname, `../../../backend/backend`)),
        handler: `handlers.databases.${name}.lambda_handler`,
        runtime: lambda.Runtime.PYTHON_3_10,
        layers: [lambdaCommonBaseLayer],
        timeout: Duration.minutes(15),
        memorySize: 3008,
        environment: {
            DATABASE_STORAGE_TABLE_NAME: databaseStorageTable.tableName,
        },
    });
    databaseStorageTable.grantReadWriteData(createDatabaseFunction);
    return createDatabaseFunction;
}

export function buildDatabaseService(
    scope: Construct,
    lambdaCommonBaseLayer: LayerVersion,
    databaseStorageTable: dynamodb.Table,
    workflowStorageTable: dynamodb.Table,
    pipelineStorageTable: dynamodb.Table,
    assetStorageTable: dynamodb.Table
): lambda.Function {
    const name = "databaseService";
    const databaseService = new lambda.Function(scope, name, {
        code: lambda.Code.fromAsset(path.join(__dirname, `../../../backend/backend`)),
        handler: `handlers.databases.${name}.lambda_handler`,
        runtime: lambda.Runtime.PYTHON_3_10,
        layers: [lambdaCommonBaseLayer],
        timeout: Duration.minutes(15),
        memorySize: 3008,
        environment: {
            DATABASE_STORAGE_TABLE_NAME: databaseStorageTable.tableName,
            ASSET_STORAGE_TABLE_NAME: assetStorageTable.tableName,
            PIPELINE_STORAGE_TABLE_NAME: pipelineStorageTable.tableName,
            WORKFLOW_STORAGE_TABLE_NAME: workflowStorageTable.tableName,
        },
    });
    databaseStorageTable.grantReadWriteData(databaseService);
    workflowStorageTable.grantReadData(databaseService);
    pipelineStorageTable.grantReadData(databaseService);
    assetStorageTable.grantReadData(databaseService);

    return databaseService;
}
