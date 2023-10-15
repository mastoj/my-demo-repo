import * as pulumi from "@pulumi/pulumi";

export const azureCredentials = pulumi.secret(process.env.RG_HELLO);
