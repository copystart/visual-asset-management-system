/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as crypto from 'crypto';
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";

/*

    from https://aws.amazon.com/premiumsupport/knowledge-center/s3-bucket-policy-for-config-rule/

    {
      "Id": "ExamplePolicy",
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "AllowSSLRequestsOnly",
          "Action": "s3:*",
          "Effect": "Deny",
          "Resource": [
            `arn:${Service.Partition()}:s3:::DOC-EXAMPLE-BUCKET`,
            `arn:${Service.Partition()}:s3:::DOC-EXAMPLE-BUCKET/*`
          ],
          "Condition": {
            "Bool": {
              "aws:SecureTransport": "false"
            }
          },
          "Principal": "*"
        }
      ]
    }

    */
export function requireTLSAddToResourcePolicy(bucket: s3.Bucket) {
    bucket.addToResourcePolicy(
        new iam.PolicyStatement({
            effect: iam.Effect.DENY,
            principals: [new iam.AnyPrincipal()],
            actions: ["s3:*"],
            resources: [`${bucket.bucketArn}/*`, bucket.bucketArn],
            conditions: {
                Bool: { "aws:SecureTransport": "false" },
            },
        })
    );
}

export function generateUniqueNameHash(stackName:string, accountId:string, resourceIdentifier:string, maxLength:number=32) {
    const hash = crypto.getHashes();
    const hashPwd = crypto.createHash('sha1')
            .update(stackName+accountId+resourceIdentifier).digest('hex').toString().toLowerCase();
    return hashPwd.substring(0, maxLength)
}

export function suppressCdkNagErrorsByGrantReadWrite(scope: Construct) {
    const reason =
        "This lambda owns the data in this bucket and should have full access to control its assets.";
    NagSuppressions.addResourceSuppressions(
        scope,
        [
            {
                id: "AwsSolutions-IAM5",
                reason: reason,
                appliesTo: [
                    {
                        regex: "/Action::s3:.*/g",
                    },
                ],
            },
            {
                id: "AwsSolutions-IAM5",
                reason: reason,
                appliesTo: [
                    {
                        // https://github.com/cdklabs/cdk-nag#suppressing-a-rule
                        regex: "/^Resource::.*/g",
                    },
                ],
            },
        ],
        true
    );
}
