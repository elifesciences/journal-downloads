import * as os from "os";
import { fromTokenFile } from "@aws-sdk/credential-provider-web-identity";
import { S3Client } from "bun";


export const createS3 = async () => {
  let options = {};

  if (process.env.AWS_WEB_IDENTITY_TOKEN_FILE) {
    const credentials = await fromTokenFile({
      roleArn: process.env.AWS_ROLE_ARN,
      roleSessionName: 'journal-downloads-' + os.hostname(),
      webIdentityTokenFile: process.env.AWS_WEB_IDENTITY_TOKEN_FILE,
      durationSeconds: 3600,
    })();

    options = {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    };
  }

  return new S3Client(options);
}
