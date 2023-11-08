import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import * as synced from "@pulumi/synced-folder";

const indexHtml = "index.html";
const errorHtml = "error.html";
const wwwFolder = "../../www";
const azureConfig = new pulumi.Config("azure-native");
const location = azureConfig.require("location");

type AzureCredentials = {
  clientId: string;
  clientSecret: string;
  resourceGroupName: string;
  subscriptionId: string;
  tenantId: string;
};

const coreStackRef = new pulumi.StackReference("tomasja/my-demo-repo.core/dev");
const azureCredentials = coreStackRef
  .requireOutput("azureCredentials")
  .apply(JSON.parse) as pulumi.Output<AzureCredentials>;

const azureProvider = new azure.Provider("azure", {
  clientId: azureCredentials.clientId,
  clientSecret: azureCredentials.clientSecret,
  subscriptionId: azureCredentials.subscriptionId,
  tenantId: azureCredentials.tenantId,
});

const storageAccount = new azure.storage.StorageAccount(
  "storage",
  {
    resourceGroupName: azureCredentials.resourceGroupName,
    sku: {
      name: "Standard_LRS",
    },
    kind: "StorageV2",
    location,
  },
  { provider: azureProvider, parent: azureProvider }
);

const website = new azure.storage.StorageAccountStaticWebsite(
  "website",
  {
    resourceGroupName: azureCredentials.resourceGroupName,
    accountName: storageAccount.name,
    indexDocument: indexHtml,
    error404Document: errorHtml,
  },
  { provider: azureProvider, parent: storageAccount }
);

const blobFolder = new synced.AzureBlobFolder(
  "synced-folder",
  {
    path: wwwFolder,
    storageAccountName: storageAccount.name,
    containerName: website.containerName,
    resourceGroupName: azureCredentials.resourceGroupName,
    managedObjects: false,
  },
  { parent: website, provider: azureProvider }
);

const cdnProfile = new azure.cdn.Profile(
  "profile",
  {
    resourceGroupName: azureCredentials.resourceGroupName,
    sku: {
      name: "Standard_Microsoft",
    },
    location: storageAccount.location,
  },
  { provider: azureProvider }
);

const originHostname = storageAccount.primaryEndpoints.apply(
  (pe) => new URL(pe.web).host
);

const cdnEndpoint = new azure.cdn.Endpoint(
  "endpoint",
  {
    resourceGroupName: azureCredentials.resourceGroupName,
    profileName: cdnProfile.name,
    isHttpAllowed: false,
    isHttpsAllowed: true,
    isCompressionEnabled: true,
    contentTypesToCompress: ["text/html"],
    originHostHeader: originHostname,
    origins: [
      {
        name: "origin",
        hostName: originHostname,
      },
    ],
    location,
  },
  { provider: azureProvider, parent: cdnProfile }
);

export default {
  originHostname: originHostname.apply((hostName) => `https://${hostName}`),
};
