/* eslint-disable @typescript-eslint/no-unused-vars */
/*
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as cloudTrail from "aws-cdk-lib/aws-cloudtrail";
import { apiBuilder } from "./api-builder";
import { storageResources, storageResourcesBuilder } from "./storage-builder";
import {
    AmplifyConfigLambdaConstruct,
    AmplifyConfigLambdaConstructProps,
} from "./constructs/amplify-config-lambda-construct";
import { CloudFrontS3WebSiteConstruct } from "./constructs/cloudfront-s3-website-construct";
import { VpcGatewayGovCloudConstruct } from "./constructs/vpc-gateway-govcloudDeploy-construct";
import { AlbS3WebsiteGovCloudDeployConstruct } from "./constructs/alb-s3-website-govCloudDeploy-construct";
import {
    CognitoWebNativeConstruct,
    CognitoWebNativeConstructProps,
} from "./constructs/cognito-web-native-construct";
import { ApiGatewayV2CloudFrontConstruct } from "./constructs/apigatewayv2-cloudfront-construct";
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";
import { CustomCognitoConfigConstruct } from "./constructs/custom-cognito-config-construct";
import { samlEnabled, samlSettings } from "./saml-config";
import { LocationServiceConstruct } from "./constructs/location-service-construct";
import { streamsBuilder } from "./streams-builder";
import * as apigwv2 from "@aws-cdk/aws-apigatewayv2-alpha";

interface EnvProps {
    prod: boolean; //ToDo: replace with env
    env: cdk.Environment;
    stackName: string;
    ssmWafArnParameterName: string;
    ssmWafArnParameterRegion: string;
    ssmWafArn: string;
    stagingBucket?: string;
    govCloudDeployment: boolean;
    govCloudDeploymentPublicAccess: boolean; //Primarily used to test VAMS GovCloud settings on commercial cloud with a public deployment (see instructions for additional setup requirements)
    govCloudDeploymentHostDomain: string; //Host Domain needed for ALB and SSL Certs
}

export class VAMS extends cdk.Stack {
    constructor(scope: Construct, id: string, props: EnvProps) {
        super(scope, id, { ...props, crossRegionReferences: true });

        const region = props.env.region || "us-east-1";

        const providedAdminEmailAddress =
            process.env.VAMS_ADMIN_EMAIL || scope.node.tryGetContext("adminEmailAddress");

        const adminEmailAddress = new cdk.CfnParameter(this, "adminEmailAddress", {
            type: "String",
            description:
                "Email address for login and where your password is sent to. You wil be sent a temporary password for the turbine to authenticate to Cognito.",
            default: providedAdminEmailAddress,
        });

        ///Setup optional configurations
        const govCloudDeployment_CDKParam = new cdk.CfnParameter(
            this,
            "govCloudDeployment",
            {
                type: "String",
                description:
                    "Parameter for whether VAMS is deployed to a GovCloud environment",
                default: props.govCloudDeployment,
            }
        );


        const webAppBuildPath = "../web/build";

        const storageResources = storageResourcesBuilder(this, props.stagingBucket);
        const trail = new cloudTrail.Trail(this, "CloudTrail-VAMS", {
            isMultiRegionTrail: false,
            bucket: storageResources.s3.accessLogsBucket,
            s3KeyPrefix: "cloudtrail-logs",
        });
        trail.logAllLambdaDataEvents();
        trail.logAllS3DataEvents();

        const cognitoProps: CognitoWebNativeConstructProps = {
            ...props,
            storageResources: storageResources,
        };
        if (samlEnabled) {
            cognitoProps.samlSettings = samlSettings;
        }

        const cognitoResources = new CognitoWebNativeConstruct(this, "Cognito", cognitoProps);

        const cognitoUser = new cognito.CfnUserPoolUser(this, "AdminUser", {
            username: providedAdminEmailAddress,
            userPoolId: cognitoResources.userPoolId,
            desiredDeliveryMediums: ["EMAIL"],
            userAttributes: [
                {
                    name: "email",
                    value: providedAdminEmailAddress,
                },
            ],
        });

        new cognito.CfnUserPoolGroup(this, "AdminGroup", {
            groupName: "super-admin",
            userPoolId: cognitoResources.userPoolId,
        });

        const userGroupAttachment = new cognito.CfnUserPoolUserToGroupAttachment(
            this,
            "AdminUserToGroupAttachment",
            {
                userPoolId: cognitoResources.userPoolId,
                username: providedAdminEmailAddress,
                groupName: "super-admin",
            }
        );
        userGroupAttachment.addDependency(cognitoUser);

        // initialize api gateway
        const api = new ApiGatewayV2CloudFrontConstruct(this, "api", {
            ...props,
            userPool: cognitoResources.userPool,
            userPoolClient: cognitoResources.webClientUserPool,
        });


        //Deploy website distribution infrastructure and authentication tie-ins
        if(!props.govCloudDeployment) {
            //Deploy through CloudFront (default)

            const website = new CloudFrontS3WebSiteConstruct(this, "WebApp", {
                ...props,
                webSiteBuildPath: webAppBuildPath,
                webAcl: props.ssmWafArn,
                apiUrl: api.apiUrl,
                assetBucketUrl: storageResources.s3.assetBucket.bucketRegionalDomainName,
                cognitoDomain: samlEnabled
                    ? `https://${samlSettings.cognitoDomainPrefix}.auth.${region}.amazoncognito.com`
                    : "",
            });

            // Bind API Gaeway to /api route of cloudfront
            api.addBehaviorToCloudFrontDistribution(website.cloudFrontDistribution);

            /**
             * When using federated identities, this list of callback urls must include
             * the set of names that VAMSAuth.tsx will resolve when it calls
             * window.location.origin for the redirectSignIn and redirectSignout callback urls.
             */
            const callbackUrls = [
                "http://localhost:3000",
                "http://localhost:3000/",
                `https://${website.cloudFrontDistribution.domainName}/`,
                `https://${website.cloudFrontDistribution.domainName}`,
            ];

            /**
             * Propagate Base CloudFront URL to Cognito User Pool Callback and Logout URLs
             * if SAML is enabled.
             */
            if (samlEnabled) {
                const customCognitoWebClientConfig = new CustomCognitoConfigConstruct(
                    this,
                    "CustomCognitoWebClientConfig",
                    {
                        name: "Web",
                        clientId: cognitoResources.webClientId,
                        userPoolId: cognitoResources.userPoolId,
                        callbackUrls: callbackUrls,
                        logoutUrls: callbackUrls,
                        identityProviders: ["COGNITO", samlSettings.name],
                    }
                );
                customCognitoWebClientConfig.node.addDependency(website);
            }

            NagSuppressions.addResourceSuppressionsByPath(
                this,
                `/${props.stackName}/WebApp/WebAppDistribution/Resource`,
                [
                    {
                        id: "AwsSolutions-CFR4",
                        reason: "This requires use of a custom viewer certificate which should be provided by customers.",
                    },
                ],
                true
            );

        }
        else {
            //Deploy for GovCloud (aka, use ALB->VPCEndpoint->S3 as path for web deployment)
            const webAppDistroNetwork =
                new VpcGatewayGovCloudConstruct(
                    this,
                    "WebAppDistroNetwork",
                    {
                        ...props,
                        setupPublicAccess: props.govCloudDeploymentPublicAccess
                    }
                );
                
            const website = new AlbS3WebsiteGovCloudDeployConstruct(this, "WebApp", {
                ...props,
                domainHostName: props.govCloudDeploymentHostDomain,
                webSiteBuildPath: webAppBuildPath,
                webAcl: props.ssmWafArn,
                apiUrl: api.apiUrl,
                assetBucketUrl: storageResources.s3.assetBucket.bucketRegionalDomainName,
                cognitoDomain: samlEnabled
                    ? `https://${samlSettings.cognitoDomainPrefix}.auth.${region}.amazoncognito.com`
                    : "",
                vpc: webAppDistroNetwork.vpc,
                subnets: webAppDistroNetwork.subnets.webApp,
                securityGroups: [webAppDistroNetwork.securityGroups.webApp],
                s3Endpoint: webAppDistroNetwork.s3Endpoint,
                setupPublicAccess: props.govCloudDeploymentPublicAccess,
            });

            /**
             * When using federated identities, this list of callback urls must include
             * the set of names that VAMSAuth.tsx will resolve when it calls
             * window.location.origin for the redirectSignIn and redirectSignout callback urls.
             */
            const callbackUrls = [
                "http://localhost:3000",
                "http://localhost:3000/",
                website.websiteUrl,
            ];

            /**
             * Propagate Base CloudFront URL to Cognito User Pool Callback and Logout URLs
             * if SAML is enabled.
             */
            if (samlEnabled) {
                const customCognitoWebClientConfig = new CustomCognitoConfigConstruct(
                    this,
                    "CustomCognitoWebClientConfig",
                    {
                        name: "Web",
                        clientId: cognitoResources.webClientId,
                        userPoolId: cognitoResources.userPoolId,
                        callbackUrls: callbackUrls,
                        logoutUrls: callbackUrls,
                        identityProviders: ["COGNITO", samlSettings.name],
                    }
                );
                customCognitoWebClientConfig.node.addDependency(website);
            }


            // NagSuppressions.addResourceSuppressionsByPath(
            //     this,
            //     `/${props.stackName}/WebApp/WebAppDistribution/CloudWatchRole/Resource`,
            //     [
            //         {
            //             id: "AwsSolutions-IAM4",
            //             reason: "CloudFrontApiGatewayS3WebSiteConstruct requires AWS Managed Policies for Cloudwatch logs",
            //             appliesTo: [
            //                 "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs",
            //             ],
            //         },
            //     ],
            //     true
            // );

            // NagSuppressions.addResourceSuppressionsByPath(
            //     this,
            //     `/${props.stackName}/WebApp/WebAppDistribution/Resource`,
            //     [
            //         {
            //             id: "AwsSolutions-APIG2",
            //             reason: "Request validator on individual method routes.",
            //         },
            //     ],
            //     true
            // );
        }
        
        //Deploy Backend API framework
        apiBuilder(this, api.apiGatewayV2, storageResources);

        //Deploy OpenSearch Serverless
        //Note: OpenSearch Serverless not currently supported in GovCloud
        if(!props.govCloudDeployment) {
            streamsBuilder(this, cognitoResources, api.apiGatewayV2, storageResources);
        }


        // required by AWS internal accounts.  Can be removed in customer Accounts
        // const wafv2Regional = new Wafv2BasicConstruct(this, "Wafv2Regional", {
        //     ...props,
        //     wafScope: WAFScope.REGIONAL,
        // });

        //Deploy Location Services
        //Note: Location Services currently not supported in GovCloud
        if(!props.govCloudDeployment) {
            const location = new LocationServiceConstruct(this, "LocationService", {
                role: cognitoResources.authenticatedRole,
            });
        }

        const amplifyConfigProps: AmplifyConfigLambdaConstructProps = {
            ...props,
            api: api.apiGatewayV2,
            appClientId: cognitoResources.webClientId,
            identityPoolId: cognitoResources.identityPoolId,
            userPoolId: cognitoResources.userPoolId,
            region,
        };

        if (samlEnabled) {
            amplifyConfigProps.federatedConfig = {
                customCognitoAuthDomain: `${samlSettings.cognitoDomainPrefix}.auth.${region}.amazoncognito.com`,
                customFederatedIdentityProviderName: samlSettings.name,
                // if necessary, the callback urls can be determined here and passed to the UI through the config endpoint
                // redirectSignIn: callbackUrls[0],
                // redirectSignOut: callbackUrls[0],
            };
        }

        const amplifyConfigFn = new AmplifyConfigLambdaConstruct(
            this,
            "AmplifyConfig",
            amplifyConfigProps
        );

        const assetBucketOutput = new cdk.CfnOutput(this, "AssetBucketNameOutput", {
            value: storageResources.s3.assetBucket.bucketName,
            description: "S3 bucket for asset storage",
        });

        const artefactsBucketOutput = new cdk.CfnOutput(this, "artefactsBucketOutput", {
            value: storageResources.s3.artefactsBucket.bucketName,
            description: "S3 bucket for template notebooks",
        });

        if (samlEnabled) {
            const samlIdpResponseUrl = new cdk.CfnOutput(this, "SAML_IdpResponseUrl", {
                value: `https://${samlSettings.cognitoDomainPrefix}.auth.${region}.amazoncognito.com/saml2/idpresponse`,
                description: "SAML IdP Response URL",
            });
        }

        cdk.Tags.of(this).add("vams:stackname", props.stackName);

        this.node.findAll().forEach((item) => {
            if (item instanceof cdk.aws_lambda.Function) {
                const fn = item as cdk.aws_lambda.Function;
                // python3.9 suppressed for CDK Bucket Deployment
                // nodejs14.x suppressed for use of custom resource to deploy saml in CustomCognitoConfigConstruct
                if (fn.runtime.name === "python3.9" || fn.runtime.name === "nodejs14.x") {
                    NagSuppressions.addResourceSuppressions(fn, [
                        {
                            id: "AwsSolutions-L1",
                            reason: "The lambda function is configured with the appropriate runtime version",
                        },
                    ]);
                }
                return;
            }
            return;
        });

        NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "Intend to use AWSLambdaBasicExecutionRole as is at this stage of this project.",
                    appliesTo: [
                        {
                            regex: "/.*AWSLambdaBasicExecutionRole$/g",
                        },
                    ],
                },
            ],
            true
        );


        const refactorPaths = [
            `/${props.stackName}/VAMSWorkflowIAMRole/Resource`,
            `/${props.stackName}/lambdaPipelineRole`,
            `/${props.stackName}/pipelineService`,
            `/${props.stackName}/workflowService`,
            `/${props.stackName}/listExecutions`,
        ];

        if(!props.govCloudDeployment) {
            refactorPaths.concat(`/${props.stackName}/idxa`);
            refactorPaths.concat(`/${props.stackName}/idxm`);
        }

        for (const path of refactorPaths) {
            const reason = `Intention is to refactor this model away moving forward 
            so that this type of access is not required within the stack.
            Customers are advised to isolate VAMS to its own account in test and prod
            as a substitute to tighter resource access.`;
            NagSuppressions.addResourceSuppressionsByPath(
                this,
                path,
                [
                    {
                        id: "AwsSolutions-IAM5",
                        reason: reason,
                    },
                    {
                        id: "AwsSolutions-IAM4",
                        reason: reason,
                    },
                ],
                true
            );
        }
    }
}
