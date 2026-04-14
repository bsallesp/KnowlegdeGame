const axios = require("axios");
const { DefaultAzureCredential } = require("@azure/identity");
const { ComputeManagementClient } = require("@azure/arm-compute");

const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
const resourceGroup = process.env.VM_RESOURCE_GROUP;
const vmName = process.env.VM_NAME;
const vmAgentUrl = process.env.VM_AGENT_URL;

const credential = new DefaultAzureCredential();
const computeClient = new ComputeManagementClient(credential, subscriptionId);

function normalizeStatus(powerStateCode) {
  switch (powerStateCode) {
    case "PowerState/running":
      return "running";
    case "PowerState/starting":
      return "starting";
    case "PowerState/stopped":
    case "PowerState/deallocated":
      return "stopped";
    case "PowerState/deallocating":
    case "PowerState/stopping":
      return "deallocating";
    default:
      return "unknown";
  }
}

async function getVmStatus() {
  const vm = await computeClient.virtualMachines.get(resourceGroup, vmName, {
    expand: "instanceView",
  });

  const statuses = vm.instanceView?.statuses || vm.statuses || [];
  const powerStatus = statuses.find((status) =>
    String(status.code || "").startsWith("PowerState/"),
  );

  return normalizeStatus(powerStatus?.code);
}

async function startVm() {
  await computeClient.virtualMachines.beginStart(resourceGroup, vmName);
}

async function stopVm() {
  await computeClient.virtualMachines.beginDeallocate(resourceGroup, vmName);
}

async function waitForVmReady(maxWaitMs = 120000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < maxWaitMs) {
    try {
      const response = await axios.get(`${vmAgentUrl}/health`, { timeout: 3000 });
      if (response.data?.ok) {
        return true;
      }
    } catch (_error) {
      // VM ainda subindo ou endpoint indisponivel.
    }

    await new Promise((resolve) => setTimeout(resolve, 8000));
  }

  return false;
}

module.exports = {
  getVmStatus,
  startVm,
  stopVm,
  waitForVmReady,
};
