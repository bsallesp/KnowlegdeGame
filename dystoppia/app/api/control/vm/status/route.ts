import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";
import { ComputeManagementClient } from "@azure/arm-compute";
import { DefaultAzureCredential } from "@azure/identity";

export const dynamic = "force-dynamic";

function getAzureConfig() {
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  const resourceGroup = process.env.VM_RESOURCE_GROUP;
  const vmName = process.env.VM_NAME;

  if (!subscriptionId || !resourceGroup || !vmName) {
    return null;
  }
  return { subscriptionId, resourceGroup, vmName };
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "master");
  if (auth instanceof NextResponse) return auth;

  const cfg = getAzureConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Azure VM env vars not configured (AZURE_SUBSCRIPTION_ID, VM_RESOURCE_GROUP, VM_NAME)" },
      { status: 503 },
    );
  }

  try {
    const client = new ComputeManagementClient(new DefaultAzureCredential(), cfg.subscriptionId);
    const vm = await client.virtualMachines.get(cfg.resourceGroup, cfg.vmName, {
      expand: "instanceView",
    });

    const statuses = vm.instanceView?.statuses ?? [];
    const powerStatus = statuses.find((s) => s.code?.startsWith("PowerState/"));
    const provisioningStatus = statuses.find((s) => s.code?.startsWith("ProvisioningState/"));

    return NextResponse.json({
      name: vm.name,
      location: vm.location,
      powerState: powerStatus?.displayStatus ?? "Unknown",
      provisioningState: provisioningStatus?.displayStatus ?? vm.provisioningState ?? "Unknown",
      vmSize: vm.hardwareProfile?.vmSize,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
