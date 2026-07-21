import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { Route53Client, ListHostedZonesByNameCommand } from "@aws-sdk/client-route-53";
import { SESClient, GetAccountSendingEnabledCommand, GetSendQuotaCommand, ListIdentitiesCommand } from "@aws-sdk/client-ses";
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import { IAMClient, GetUserCommand } from "@aws-sdk/client-iam";
import { loadLocalEnv } from "./load-local-env.mjs";

await loadLocalEnv();
const region = process.env.AWS_REGION || process.env.AWS_SES_REGION || "ap-south-1";
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}),
};
const checks = {
  identity: () => new STSClient({ region, credentials }).send(new GetCallerIdentityCommand({})),
  route53: () => new Route53Client({ region: "us-east-1", credentials }).send(new ListHostedZonesByNameCommand({ DNSName: "pnut.monster", MaxItems: 10 })),
  sesSending: () => new SESClient({ region, credentials }).send(new GetAccountSendingEnabledCommand({})),
  sesQuota: () => new SESClient({ region, credentials }).send(new GetSendQuotaCommand({})),
  sesIdentities: () => new SESClient({ region, credentials }).send(new ListIdentitiesCommand({ IdentityType: "Domain" })),
  s3: () => new S3Client({ region, credentials }).send(new ListBucketsCommand({})),
  iam: () => new IAMClient({ region: "us-east-1", credentials }).send(new GetUserCommand({})),
};

const output = { region, checks: {} };
for (const [name, run] of Object.entries(checks)) {
  try {
    const result = await run();
    output.checks[name] = { allowed: true };
    if (name === "identity") Object.assign(output.checks[name], { account: result.Account, arn: result.Arn });
    if (name === "route53") {
      const zone = result.HostedZones?.find((item) => item.Name === "pnut.monster.");
      Object.assign(output.checks[name], { hostedZone: zone ? { id: zone.Id, private: zone.Config?.PrivateZone === true } : null });
    }
    if (name === "sesSending") output.checks[name].enabled = result.Enabled === true;
    if (name === "sesQuota") Object.assign(output.checks[name], { max24HourSend: result.Max24HourSend, maxSendRate: result.MaxSendRate });
    if (name === "sesIdentities") output.checks[name].domainExists = result.Identities?.includes("pnut.monster") === true;
  } catch (error) {
    output.checks[name] = { allowed: false, error: error.name || "Error", message: error.message };
  }
}
process.stdout.write(JSON.stringify(output, null, 2));
