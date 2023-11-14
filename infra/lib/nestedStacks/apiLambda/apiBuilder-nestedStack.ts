/* eslint-disable @typescript-eslint/no-unused-vars */
/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Construct } from "constructs";
import { Names } from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwv2 from "@aws-cdk/aws-apigatewayv2-alpha";
import * as logs from "aws-cdk-lib/aws-logs";
import { ApiGatewayV2LambdaConstruct } from "./constructs/apigatewayv2-lambda-construct";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { storageResources } from "../storage/storageBuilder-nestedStack";
import { buildConfigService } from "../../lambdaBuilder/configFunctions";
import { LayerVersion } from "aws-cdk-lib/aws-lambda";
import * as cdk from "aws-cdk-lib";
import {
    buildCreateDatabaseLambdaFunction,
    buildDatabaseService,
} from "../../lambdaBuilder/databaseFunctions";
import {
    buildListlWorkflowExecutionsFunction,
    buildWorkflowService,
    buildCreateWorkflowFunction,
    buildRunWorkflowFunction,
} from "../../lambdaBuilder/workflowFunctions";
import {
    buildAssetColumnsFunction,
    buildAssetMetadataFunction,
    buildAssetService,
    buildUploadAllAssetsFunction,
    buildUploadAssetFunction,
    buildFetchVisualizerAssetFunction,
    buildDownloadAssetFunction,
    buildRevertAssetFunction,
    buildUploadAssetWorkflowFunction,
    buildAssetFiles,
} from "../../lambdaBuilder/assetFunctions";
import {
    buildAddCommentLambdaFunction,
    buildEditCommentLambdaFunction,
    buildCommentService,
} from "../../lambdaBuilder/commentFunctions";
import {
    buildCreatePipelineFunction,
    buildEnablePipelineFunction,
    buildPipelineService,
} from "../../lambdaBuilder/pipelineFunctions";
import { NestedStack } from "aws-cdk-lib";

import { buildMetadataSchemaService } from "../../lambdaBuilder/metadataSchemaFunctions";

import { buildMetadataFunctions } from "../../lambdaBuilder/metadataFunctions";
import { buildUploadAssetWorkflow } from "./constructs/uploadAssetWorkflowBuilder";
import { buildAuthFunctions } from "../../lambdaBuilder/authFunctions";
import { NagSuppressions } from "cdk-nag";
import * as Config from "../../../config/config";
import { generateUniqueNameHash } from "../../helper/security";
import * as ec2 from "aws-cdk-lib/aws-ec2";

interface apiGatewayLambdaConfiguration {
    routePath: string;
    method: apigwv2.HttpMethod;
    api: apigwv2.HttpApi;
}

export class ApiBuilderNestedStack extends NestedStack {
    constructor(
        parent: Construct,
        name: string,
        config: Config.Config,
        api: apigwv2.HttpApi,
        storageResources: storageResources,
        lambdaCommonBaseLayer: LayerVersion,
        lambdaCommonServiceSDKLayer: LayerVersion,
        vpc: ec2.IVpc
    ) {
        super(parent, name);

        apiBuilder(this, config, api, storageResources, lambdaCommonBaseLayer, lambdaCommonServiceSDKLayer, vpc);
    }
}

export function attachFunctionToApi(
    scope: Construct,
    lambdaFunction: lambda.Function,
    apiGatewayConfiguration: apiGatewayLambdaConfiguration
) {
    const apig = new ApiGatewayV2LambdaConstruct(
        scope,
        apiGatewayConfiguration.method + apiGatewayConfiguration.routePath,
        {
            ...{},
            lambdaFn: lambdaFunction,
            routePath: apiGatewayConfiguration.routePath,
            methods: [apiGatewayConfiguration.method],
            api: apiGatewayConfiguration.api,
        }
    );
}

export function apiBuilder(
    scope: Construct,
    config: Config.Config,
    api: apigwv2.HttpApi,
    storageResources: storageResources,
    lambdaCommonBaseLayer: LayerVersion,
    lambdaCommonServiceSDKLayer: LayerVersion,
    vpc: ec2.IVpc
) {
    //config resources
    const createConfigFunction = buildConfigService(
        scope,
        lambdaCommonBaseLayer,
        storageResources.s3.assetBucket,
        storageResources.dynamo.appFeatureEnabledStorageTable,
        config,
        vpc
    );

    attachFunctionToApi(scope, createConfigFunction, {
        routePath: "/secure-config",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });

    //Database Resources
    const createDatabaseFunction = buildCreateDatabaseLambdaFunction(
        scope,
        lambdaCommonBaseLayer,
        storageResources.dynamo.databaseStorageTable,
        config,
        vpc
    );
    attachFunctionToApi(scope, createDatabaseFunction, {
        routePath: "/databases",
        method: apigwv2.HttpMethod.PUT,
        api: api,
    });

    const databaseService = buildDatabaseService(
        scope,
        lambdaCommonBaseLayer,
        storageResources.dynamo.databaseStorageTable,
        storageResources.dynamo.workflowStorageTable,
        storageResources.dynamo.pipelineStorageTable,
        storageResources.dynamo.assetStorageTable,
        config,
        vpc
    );
    attachFunctionToApi(scope, databaseService, {
        routePath: "/databases",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });
    attachFunctionToApi(scope, databaseService, {
        routePath: "/databases/{databaseId}",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });
    attachFunctionToApi(scope, databaseService, {
        routePath: "/databases/{databaseId}",
        method: apigwv2.HttpMethod.DELETE,
        api: api,
    });

    //Comment Resources
    const commentService = buildCommentService(
        scope,
        lambdaCommonBaseLayer,
        storageResources.dynamo.commentStorageTable,
        storageResources.dynamo.assetStorageTable,
        config,
        vpc
    );

    const commentServiceRoutes = [
        "/comments/assets/{assetId}",
        "/comments/assets/{assetId}/assetVersionId/{assetVersionId}",
        "/comments/assets/{assetId}/assetVersionId:commentId/{assetVersionId:commentId}",
    ];
    for (let i = 0; i < commentServiceRoutes.length; i++) {
        attachFunctionToApi(scope, commentService, {
            routePath: commentServiceRoutes[i],
            method: apigwv2.HttpMethod.GET,
            api: api,
        });
    }

    attachFunctionToApi(scope, commentService, {
        routePath: "/comments/assets/{assetId}/assetVersionId:commentId/{assetVersionId:commentId}",
        method: apigwv2.HttpMethod.DELETE,
        api: api,
    });

    const addCommentFunction = buildAddCommentLambdaFunction(
        scope,
        lambdaCommonBaseLayer,
        storageResources.dynamo.commentStorageTable,
        config,
        vpc
    );
    attachFunctionToApi(scope, addCommentFunction, {
        routePath: "/comments/assets/{assetId}/assetVersionId:commentId/{assetVersionId:commentId}",
        method: apigwv2.HttpMethod.POST,
        api: api,
    });

    const editCommentFunction = buildEditCommentLambdaFunction(
        scope,
        lambdaCommonBaseLayer,
        storageResources.dynamo.commentStorageTable,
        config,
        vpc
    );
    attachFunctionToApi(scope, editCommentFunction, {
        routePath: "/comments/assets/{assetId}/assetVersionId:commentId/{assetVersionId:commentId}",
        method: apigwv2.HttpMethod.PUT,
        api: api,
    });

    //Asset Resources
    const assetService = buildAssetService(
        scope,
        lambdaCommonBaseLayer,
        storageResources.dynamo.assetStorageTable,
        storageResources.dynamo.databaseStorageTable,
        storageResources.s3.assetBucket,
        storageResources.s3.assetVisualizerBucket,
        config,
        vpc
    );
    attachFunctionToApi(scope, assetService, {
        routePath: "/database/{databaseId}/assets",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });
    attachFunctionToApi(scope, assetService, {
        routePath: "/database/{databaseId}/assets/{assetId}",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });
    attachFunctionToApi(scope, assetService, {
        routePath: "/database/{databaseId}/assets/{assetId}",
        method: apigwv2.HttpMethod.DELETE,
        api: api,
    });
    attachFunctionToApi(scope, assetService, {
        routePath: "/assets",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });

    const listAssetFiles = buildAssetFiles(
        scope,
        lambdaCommonBaseLayer,
        storageResources.dynamo.assetStorageTable,
        storageResources.dynamo.databaseStorageTable,
        storageResources.s3.assetBucket,
        config,
        vpc
    );
    attachFunctionToApi(scope, listAssetFiles, {
        routePath: "/database/{databaseId}/assets/{assetId}/listFiles",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });

    const assetMetadataFunction = buildAssetMetadataFunction(
        scope,
        lambdaCommonBaseLayer,
        storageResources.s3.assetBucket,
        storageResources.dynamo.assetStorageTable,
        config,
        vpc
    );
    attachFunctionToApi(scope, assetMetadataFunction, {
        routePath: "/database/{databaseId}/assets/{assetId}/metadata",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });

    const assetColumnsFunction = buildAssetColumnsFunction(
        scope,
        lambdaCommonBaseLayer,
        storageResources.s3.assetBucket,
        storageResources.dynamo.assetStorageTable,
        config,
        vpc
    );
    attachFunctionToApi(scope, assetColumnsFunction, {
        routePath: "/database/{databaseId}/assets/{assetId}/columns",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });

    const uploadAssetFunction = buildUploadAssetFunction(
        scope,
        lambdaCommonBaseLayer,
        storageResources.s3.assetBucket,
        storageResources.dynamo.databaseStorageTable,
        storageResources.dynamo.assetStorageTable,
        config,
        vpc
    );
    attachFunctionToApi(scope, uploadAssetFunction, {
        routePath: "/assets",
        method: apigwv2.HttpMethod.PUT,
        api: api,
    });

    const uploadAllAssetFunction = buildUploadAllAssetsFunction(
        scope,
        lambdaCommonBaseLayer,
        storageResources.s3.assetBucket,
        storageResources.dynamo.databaseStorageTable,
        storageResources.dynamo.assetStorageTable,
        storageResources.dynamo.workflowExecutionStorageTable,
        uploadAssetFunction,
        config,
        vpc
    );
    attachFunctionToApi(scope, uploadAllAssetFunction, {
        routePath: "/assets/all",
        method: apigwv2.HttpMethod.PUT,
        api: api,
    });

    const fetchVisualizerAssetFunction = buildFetchVisualizerAssetFunction(
        scope,
        lambdaCommonBaseLayer,
        storageResources.s3.assetVisualizerBucket,
        config,
        vpc
    );
    attachFunctionToApi(scope, fetchVisualizerAssetFunction, {
        routePath: "/visualizerAssets/{proxy+}",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });

    const assetDownloadFunction = buildDownloadAssetFunction(
        scope,
        lambdaCommonBaseLayer,
        storageResources.s3.assetBucket,
        storageResources.dynamo.assetStorageTable,
        config,
        vpc
    );
    attachFunctionToApi(scope, assetDownloadFunction, {
        routePath: "/database/{databaseId}/assets/{assetId}/download",
        method: apigwv2.HttpMethod.POST,
        api: api,
    });

    const assetRevertFunction = buildRevertAssetFunction(
        scope,
        lambdaCommonBaseLayer,
        storageResources.s3.assetBucket,
        storageResources.dynamo.databaseStorageTable,
        storageResources.dynamo.assetStorageTable,
        config,
        vpc
    );
    attachFunctionToApi(scope, assetRevertFunction, {
        routePath: "/database/{databaseId}/assets/{assetId}/revert",
        method: apigwv2.HttpMethod.POST,
        api: api,
    });

    //Pipeline Resources
    const enablePipelineFunction = buildEnablePipelineFunction(
        scope,
        lambdaCommonBaseLayer,
        storageResources.dynamo.pipelineStorageTable,
        config,
        vpc
    );

    const createPipelineFunction = buildCreatePipelineFunction(
        scope,
        lambdaCommonBaseLayer,
        storageResources.dynamo.pipelineStorageTable,
        storageResources.s3.artefactsBucket,
        storageResources.s3.sagemakerBucket,
        storageResources.s3.assetBucket,
        enablePipelineFunction,
        config,
        vpc
    );
    attachFunctionToApi(scope, createPipelineFunction, {
        routePath: "/pipelines",
        method: apigwv2.HttpMethod.PUT,
        api: api,
    });

    const pipelineService = buildPipelineService(scope, lambdaCommonBaseLayer, storageResources, config, vpc);
    attachFunctionToApi(scope, pipelineService, {
        routePath: "/database/{databaseId}/pipelines",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });
    attachFunctionToApi(scope, pipelineService, {
        routePath: "/database/{databaseId}/pipelines/{pipelineId}",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });
    attachFunctionToApi(scope, pipelineService, {
        routePath: "/database/{databaseId}/pipelines/{pipelineId}",
        method: apigwv2.HttpMethod.DELETE,
        api: api,
    });
    attachFunctionToApi(scope, pipelineService, {
        routePath: "/pipelines",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });

    //Workflows
    const workflowService = buildWorkflowService(scope, lambdaCommonBaseLayer, storageResources, config, vpc);
    attachFunctionToApi(scope, workflowService, {
        routePath: "/database/{databaseId}/workflows",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });
    attachFunctionToApi(scope, workflowService, {
        routePath: "/database/{databaseId}/workflows/{workflowId}",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });
    attachFunctionToApi(scope, workflowService, {
        routePath: "/database/{databaseId}/workflows/{workflowId}",
        method: apigwv2.HttpMethod.DELETE,
        api: api,
    });
    attachFunctionToApi(scope, workflowService, {
        routePath: "/workflows",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });

    const listWorkflowExecutionsFunction = buildListlWorkflowExecutionsFunction(
        scope,
        lambdaCommonBaseLayer,
        storageResources.dynamo.workflowExecutionStorageTable,
        config,
        vpc
    );
    attachFunctionToApi(scope, listWorkflowExecutionsFunction, {
        routePath: "/database/{databaseId}/assets/{assetId}/workflows/{workflowId}/executions",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });

    const createWorkflowFunction = buildCreateWorkflowFunction(
        scope,
        lambdaCommonServiceSDKLayer,
        storageResources.dynamo.workflowStorageTable,
        storageResources.s3.assetBucket,
        uploadAllAssetFunction,
        config.env.coreStackName,
        config,
        vpc
    );
    attachFunctionToApi(scope, createWorkflowFunction, {
        routePath: "/workflows",
        method: apigwv2.HttpMethod.PUT,
        api: api,
    });

    const runWorkflowFunction = buildRunWorkflowFunction(
        scope,
        lambdaCommonBaseLayer,
        storageResources.dynamo.workflowStorageTable,
        storageResources.dynamo.pipelineStorageTable,
        storageResources.dynamo.assetStorageTable,
        storageResources.dynamo.workflowExecutionStorageTable,
        storageResources.s3.assetBucket,
        config,
        vpc
    );
    attachFunctionToApi(scope, runWorkflowFunction, {
        routePath: "/database/{databaseId}/assets/{assetId}/workflows/{workflowId}",
        method: apigwv2.HttpMethod.POST,
        api: api,
    });
    //Enabling API Gateway Access Logging: Currently the only way to do this is via V1 constructs
    //https://github.com/aws/aws-cdk/issues/11100#issuecomment-904627081

    // metdata
    const metadataCrudFunctions = buildMetadataFunctions(
        scope,
        lambdaCommonBaseLayer,
        storageResources,
        config,
        vpc
    );
    const methods = [
        apigwv2.HttpMethod.PUT,
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.POST,
        apigwv2.HttpMethod.DELETE,
    ];
    for (let i = 0; i < methods.length; i++) {
        attachFunctionToApi(scope, metadataCrudFunctions[i], {
            routePath: "/metadata/{databaseId}/{assetId}",
            method: methods[i],
            api: api,
        });
    }

    const metadataSchemaFunctions = buildMetadataSchemaService(
        scope,
        lambdaCommonBaseLayer,
        storageResources,
        config,
        vpc
    );

    const metadataSchemaMethods = [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.POST,
        apigwv2.HttpMethod.PUT,
    ];
    for (let i = 0; i < metadataSchemaMethods.length; i++) {
        attachFunctionToApi(scope, metadataSchemaFunctions, {
            routePath: "/metadataschema/{databaseId}",
            method: metadataSchemaMethods[i],
            api: api,
        });
    }
    attachFunctionToApi(scope, metadataSchemaFunctions, {
        routePath: "/metadataschema/{databaseId}/{field}",
        method: apigwv2.HttpMethod.DELETE,
        api: api,
    });

    const uploadAssetWorkflowStateMachine = buildUploadAssetWorkflow(
        scope,
        config,
        uploadAssetFunction,
        metadataCrudFunctions[2],
        runWorkflowFunction,
        storageResources.s3.assetBucket,
        storageResources.s3.stagingBucket
    );
    uploadAssetFunction.grantInvoke(uploadAssetWorkflowStateMachine);
    storageResources.s3.assetBucket.grantReadWrite(uploadAssetWorkflowStateMachine);
    if (storageResources.s3.stagingBucket) {
        storageResources.s3.stagingBucket.grantRead(uploadAssetWorkflowStateMachine);
    }

    const uploadAssetWorkflowFunction = buildUploadAssetWorkflowFunction(
        scope,
        lambdaCommonBaseLayer,
        uploadAssetWorkflowStateMachine,
        config,
        vpc
    );
    attachFunctionToApi(scope, uploadAssetWorkflowFunction, {
        routePath: "/assets/uploadAssetWorkflow",
        method: apigwv2.HttpMethod.POST,
        api: api,
    });

    const authFunctions = buildAuthFunctions(scope, lambdaCommonBaseLayer, storageResources, config, vpc);

    attachFunctionToApi(scope, authFunctions.scopeds3access, {
        routePath: "/auth/scopeds3access",
        method: apigwv2.HttpMethod.POST,
        api: api,
    });

    attachFunctionToApi(scope, authFunctions.groups, {
        routePath: "/auth/groups",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });

    attachFunctionToApi(scope, authFunctions.constraints, {
        routePath: "/auth/constraints",
        method: apigwv2.HttpMethod.GET,
        api: api,
    });
    for (let i = 0; i < methods.length; i++) {
        attachFunctionToApi(scope, authFunctions.constraints, {
            routePath: "/auth/constraints/{constraintId}",
            method: methods[i],
            api: api,
        });
    }

    //Enabling API Gateway Access Logging: Currently the only way to do this is via V1 constructs
    //https://github.com/aws/aws-cdk/issues/11100#issuecomment-904627081

    const accessLogs = new logs.LogGroup(scope, "VAMS-API-AccessLogs", {
        logGroupName: "/aws/vendedlogs/VAMS-API-AccessLogs" + generateUniqueNameHash(config.env.coreStackName, config.env.account, "VAMS-API-AccessLogs", 10),
        retention: logs.RetentionDays.TWO_YEARS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const stage = api.defaultStage?.node.defaultChild as apigateway.CfnStage;
    stage.accessLogSettings = {
        destinationArn: accessLogs.logGroupArn,
        format: JSON.stringify({
            requestId: "$context.requestId",
            userAgent: "$context.identity.userAgent",
            sourceIp: "$context.identity.sourceIp",
            requestTime: "$context.requestTime",
            requestTimeEpoch: "$context.requestTimeEpoch",
            httpMethod: "$context.httpMethod",
            path: "$context.path",
            status: "$context.status",
            protocol: "$context.protocol",
            responseLength: "$context.responseLength",
            domainName: "$context.domainName",
        }),
    };
}
