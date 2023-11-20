/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as path from "path";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { Duration } from "aws-cdk-lib";
import { suppressCdkNagErrorsByGrantReadWrite } from "../helper/security";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import { LayerVersion } from "aws-cdk-lib/aws-lambda";
import { LAMBDA_PYTHON_RUNTIME } from "../../config/config";
import { Service } from "../helper/service-helper";
import * as Config from "../../config/config";
import * as ec2 from "aws-cdk-lib/aws-ec2";

export function buildAssetService(
    scope: Construct,
    lambdaCommonBaseLayer: LayerVersion,
    assetStorageTable: dynamodb.Table,
    databaseStorageTable: dynamodb.Table,
    assetStorageBucket: s3.Bucket,
    assetVisualizerStorageBucket: s3.Bucket,
    config: Config.Config,
    vpc: ec2.IVpc,
    subnets: ec2.ISubnet[]
): lambda.Function {
    const name = "assetService";
    const assetService = new lambda.Function(scope, name, {
        code: lambda.Code.fromAsset(path.join(__dirname, `../../../backend/backend`)),
        handler: `handlers.assets.${name}.lambda_handler`,
        runtime: LAMBDA_PYTHON_RUNTIME,
        layers: [lambdaCommonBaseLayer],
        timeout: Duration.minutes(15),
        memorySize: 3008,
        vpc:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? vpc
                : undefined, //Use VPC when flagged to use for all lambdas
        vpcSubnets:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? { subnets: subnets }
                : undefined,

        environment: {
            DATABASE_STORAGE_TABLE_NAME: databaseStorageTable.tableName,
            ASSET_STORAGE_TABLE_NAME: assetStorageTable.tableName,
            S3_ASSET_VISUALIZER_BUCKET: assetVisualizerStorageBucket.bucketName,
        },
    });
    assetStorageTable.grantReadWriteData(assetService);
    assetVisualizerStorageBucket.grantReadWrite(assetService);
    databaseStorageTable.grantReadWriteData(assetService);
    assetStorageBucket.grantReadWrite(assetService);

    suppressCdkNagErrorsByGrantReadWrite(scope);

    return assetService;
}

export function buildAssetFiles(
    scope: Construct,
    lambdaCommonBaseLayer: LayerVersion,
    assetStorageTable: dynamodb.Table,
    databaseStorageTable: dynamodb.Table,
    assetStorageBucket: s3.Bucket,
    config: Config.Config,
    vpc: ec2.IVpc,
    subnets: ec2.ISubnet[]
): lambda.Function {
    const name = "assetFiles";
    const assetService = new lambda.Function(scope, name, {
        code: lambda.Code.fromAsset(path.join(__dirname, `../../../backend/backend`)),
        handler: `handlers.assets.${name}.lambda_handler`,
        runtime: LAMBDA_PYTHON_RUNTIME,
        layers: [lambdaCommonBaseLayer],
        timeout: Duration.minutes(15),
        memorySize: 3008,
        vpc:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? vpc
                : undefined, //Use VPC when flagged to use for all lambdas
        vpcSubnets:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? { subnets: subnets }
                : undefined,

        environment: {
            ASSET_STORAGE_TABLE_NAME: assetStorageTable.tableName,
        },
    });
    assetStorageTable.grantReadWriteData(assetService);
    databaseStorageTable.grantReadWriteData(assetService);
    assetStorageBucket.grantReadWrite(assetService);

    suppressCdkNagErrorsByGrantReadWrite(scope);

    return assetService;
}

export function buildUploadAssetFunction(
    scope: Construct,
    lambdaCommonBaseLayer: LayerVersion,
    assetStorageBucket: s3.Bucket,
    databaseStorageTable: dynamodb.Table,
    assetStorageTable: dynamodb.Table,
    config: Config.Config,
    vpc: ec2.IVpc,
    subnets: ec2.ISubnet[]
): lambda.Function {
    const name = "uploadAsset";
    const uploadAssetFunction = new lambda.Function(scope, name, {
        code: lambda.Code.fromAsset(path.join(__dirname, `../../../backend/backend`)),
        handler: `handlers.assets.${name}.lambda_handler`,
        runtime: LAMBDA_PYTHON_RUNTIME,
        layers: [lambdaCommonBaseLayer],
        timeout: Duration.minutes(15),
        memorySize: 3008,
        vpc:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? vpc
                : undefined, //Use VPC when flagged to use for all lambdas
        vpcSubnets:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? { subnets: subnets }
                : undefined,
        environment: {
            DATABASE_STORAGE_TABLE_NAME: databaseStorageTable.tableName,
            ASSET_STORAGE_TABLE_NAME: assetStorageTable.tableName,
        },
    });
    assetStorageBucket.grantReadWrite(uploadAssetFunction);
    databaseStorageTable.grantReadWriteData(uploadAssetFunction);
    assetStorageTable.grantReadWriteData(uploadAssetFunction);
    suppressCdkNagErrorsByGrantReadWrite(scope);
    return uploadAssetFunction;
}

export function buildUploadAllAssetsFunction(
    scope: Construct,
    lambdaCommonBaseLayer: LayerVersion,
    assetStorageBucket: s3.Bucket,
    databaseStorageTable: dynamodb.Table,
    assetStorageTable: dynamodb.Table,
    workflowExecutionTable: dynamodb.Table,
    uploadAssetLambdaFunction: lambda.Function,
    config: Config.Config,
    vpc: ec2.IVpc,
    subnets: ec2.ISubnet[]
): lambda.Function {
    const name = "uploadAllAssets";
    const uploadAllAssetFunction = new lambda.Function(scope, name, {
        code: lambda.Code.fromAsset(path.join(__dirname, `../../../backend/backend`)),
        handler: `handlers.assets.${name}.lambda_handler`,
        runtime: LAMBDA_PYTHON_RUNTIME,
        layers: [lambdaCommonBaseLayer],
        timeout: Duration.minutes(15),
        memorySize: 3008,
        vpc:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? vpc
                : undefined, //Use VPC when flagged to use for all lambdas
        vpcSubnets:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? { subnets: subnets }
                : undefined,
        environment: {
            DATABASE_STORAGE_TABLE_NAME: databaseStorageTable.tableName,
            ASSET_STORAGE_TABLE_NAME: assetStorageTable.tableName,
            WORKFLOW_EXECUTION_STORAGE_TABLE_NAME: workflowExecutionTable.tableName,
            UPLOAD_LAMBDA_FUNCTION_NAME: uploadAssetLambdaFunction.functionName,
        },
    });
    uploadAssetLambdaFunction.grantInvoke(uploadAllAssetFunction);
    assetStorageBucket.grantReadWrite(uploadAllAssetFunction);
    databaseStorageTable.grantReadWriteData(uploadAllAssetFunction);
    assetStorageTable.grantReadData(uploadAllAssetFunction);
    workflowExecutionTable.grantReadWriteData(uploadAllAssetFunction);
    suppressCdkNagErrorsByGrantReadWrite(scope);
    return uploadAllAssetFunction;
}

export function buildAssetMetadataFunction(
    scope: Construct,
    lambdaCommonBaseLayer: LayerVersion,
    assetStorageBucket: s3.Bucket,
    assetStorageTable: dynamodb.Table,
    config: Config.Config,
    vpc: ec2.IVpc,
    subnets: ec2.ISubnet[]
) {
    const name = "metadata";
    const assetMetadataFunction = new lambda.Function(scope, name, {
        code: lambda.Code.fromAsset(path.join(__dirname, `../../../backend/backend`)),
        handler: `handlers.assets.${name}.lambda_handler`,
        runtime: LAMBDA_PYTHON_RUNTIME,
        layers: [lambdaCommonBaseLayer],
        timeout: Duration.minutes(15),
        memorySize: 3008,
        vpc:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? vpc
                : undefined, //Use VPC when flagged to use for all lambdas
        vpcSubnets:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? { subnets: subnets }
                : undefined,
        environment: {
            ASSET_STORAGE_TABLE_NAME: assetStorageTable.tableName,
        },
    });
    assetStorageBucket.grantRead(assetMetadataFunction);
    assetStorageTable.grantReadData(assetMetadataFunction);

    suppressCdkNagErrorsByGrantReadWrite(scope);
    return assetMetadataFunction;
}

export function buildAssetColumnsFunction(
    scope: Construct,
    lambdaCommonBaseLayer: LayerVersion,
    assetStorageBucket: s3.Bucket,
    assetStorageTable: dynamodb.Table,
    config: Config.Config,
    vpc: ec2.IVpc,
    subnets: ec2.ISubnet[]
) {
    const name = "assetColumns";
    const assetColumnsFunction = new lambda.Function(scope, name, {
        code: lambda.Code.fromAsset(path.join(__dirname, `../../../backend/backend`)),
        handler: `handlers.assets.${name}.lambda_handler`,
        runtime: LAMBDA_PYTHON_RUNTIME,
        layers: [lambdaCommonBaseLayer],
        timeout: Duration.minutes(15),
        memorySize: 3008,
        vpc:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? vpc
                : undefined, //Use VPC when flagged to use for all lambdas
        vpcSubnets:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? { subnets: subnets }
                : undefined,
        environment: {
            ASSET_STORAGE_TABLE_NAME: assetStorageTable.tableName,
        },
    });
    assetStorageBucket.grantRead(assetColumnsFunction);
    assetStorageTable.grantReadData(assetColumnsFunction);

    suppressCdkNagErrorsByGrantReadWrite(scope);
    return assetColumnsFunction;
}

export function buildFetchVisualizerAssetFunction(
    scope: Construct,
    lambdaCommonBaseLayer: LayerVersion,
    assetVisualizerStorageBucket: s3.Bucket,
    config: Config.Config,
    vpc: ec2.IVpc,
    subnets: ec2.ISubnet[]
): lambda.Function {
    const name = "fetchVisualizerAsset";
    const fetchVisualizerAssetFunction = new lambda.Function(scope, name, {
        code: lambda.Code.fromAsset(path.join(__dirname, `../../../backend/backend`)),
        handler: `handlers.assets.${name}.lambda_handler`,
        runtime: LAMBDA_PYTHON_RUNTIME,
        layers: [lambdaCommonBaseLayer],
        timeout: Duration.minutes(15),
        memorySize: 3008,
        vpc:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? vpc
                : undefined, //Use VPC when flagged to use for all lambdas
        vpcSubnets:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? { subnets: subnets }
                : undefined,
        environment: {
            ASSET_VISUALIZER_BUCKET_NAME: assetVisualizerStorageBucket.bucketName,
        },
    });
    assetVisualizerStorageBucket.grantRead(fetchVisualizerAssetFunction);
    suppressCdkNagErrorsByGrantReadWrite(scope);
    return fetchVisualizerAssetFunction;
}

export function buildDownloadAssetFunction(
    scope: Construct,
    lambdaCommonBaseLayer: LayerVersion,
    assetStorageBucket: s3.Bucket,
    assetStorageTable: dynamodb.Table,
    config: Config.Config,
    vpc: ec2.IVpc,
    subnets: ec2.ISubnet[]
) {
    const name = "downloadAsset";
    const downloadAssetFunction = new lambda.Function(scope, name, {
        code: lambda.Code.fromAsset(path.join(__dirname, `../../../backend/backend`)),
        handler: `handlers.assets.${name}.lambda_handler`,
        runtime: LAMBDA_PYTHON_RUNTIME,
        layers: [lambdaCommonBaseLayer],
        timeout: Duration.minutes(15),
        memorySize: 3008,
        vpc:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? vpc
                : undefined, //Use VPC when flagged to use for all lambdas
        vpcSubnets:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? { subnets: subnets }
                : undefined,
        environment: {
            ASSET_STORAGE_TABLE_NAME: assetStorageTable.tableName,
            S3_ENDPOINT: Service("S3").Endpoint,
        },
    });
    assetStorageBucket.grantRead(downloadAssetFunction);
    assetStorageTable.grantReadData(downloadAssetFunction);
    suppressCdkNagErrorsByGrantReadWrite(scope);

    return downloadAssetFunction;
}

export function buildRevertAssetFunction(
    scope: Construct,
    lambdaCommonBaseLayer: LayerVersion,
    assetStorageBucket: s3.Bucket,
    databaseStorageTable: dynamodb.Table,
    assetStorageTable: dynamodb.Table,
    config: Config.Config,
    vpc: ec2.IVpc,
    subnets: ec2.ISubnet[]
): lambda.Function {
    const name = "revertAsset";
    const revertAssetFunction = new lambda.Function(scope, name, {
        code: lambda.Code.fromAsset(path.join(__dirname, `../../../backend/backend`)),
        handler: `handlers.assets.${name}.lambda_handler`,
        runtime: LAMBDA_PYTHON_RUNTIME,
        layers: [lambdaCommonBaseLayer],
        timeout: Duration.minutes(15),
        memorySize: 3008,
        vpc:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? vpc
                : undefined, //Use VPC when flagged to use for all lambdas
        vpcSubnets:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? { subnets: subnets }
                : undefined,
        environment: {
            DATABASE_STORAGE_TABLE_NAME: databaseStorageTable.tableName,
            ASSET_STORAGE_TABLE_NAME: assetStorageTable.tableName,
        },
    });
    assetStorageBucket.grantReadWrite(revertAssetFunction);
    databaseStorageTable.grantReadData(revertAssetFunction);
    assetStorageTable.grantReadWriteData(revertAssetFunction);
    suppressCdkNagErrorsByGrantReadWrite(scope);
    return revertAssetFunction;
}

export function buildUploadAssetWorkflowFunction(
    scope: Construct,
    lambdaCommonBaseLayer: LayerVersion,
    uploadAssetWorkflowStateMachine: sfn.StateMachine,
    config: Config.Config,
    vpc: ec2.IVpc,
    subnets: ec2.ISubnet[]
): lambda.Function {
    const name = "upload_asset_workflow";

    //TODO: Need to send separpate PR for actual code.
    //TODO: Currently only passing this as part of the infra change.
    const uploadAssetWorkflowFunction = new lambda.Function(scope, name, {
        code: lambda.Code.fromAsset(path.join(__dirname, `../../../backend/backend`)),
        handler: `functions.assets.${name}.lambda_handler.lambda_handler`,
        runtime: LAMBDA_PYTHON_RUNTIME,
        layers: [lambdaCommonBaseLayer],
        timeout: Duration.minutes(15),
        memorySize: 3008,
        vpc:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? vpc
                : undefined, //Use VPC when flagged to use for all lambdas
        vpcSubnets:
            config.app.useGlobalVpc.enabled && config.app.useGlobalVpc.useForAllLambdas
                ? { subnets: subnets }
                : undefined,
        environment: {
            UPLOAD_WORKFLOW_ARN: uploadAssetWorkflowStateMachine.stateMachineArn,
        },
    });
    uploadAssetWorkflowStateMachine.grantStartExecution(uploadAssetWorkflowFunction);

    suppressCdkNagErrorsByGrantReadWrite(scope);
    return uploadAssetWorkflowFunction;
}
