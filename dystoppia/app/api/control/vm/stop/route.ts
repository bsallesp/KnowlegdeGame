import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";
import { ComputeManagementClient } from "@azure/arm-compute";
import { DefaultAzureCredential } from "@azure/identity";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "master");
  if (auth instanceof NextResponse) return auth;

  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  const resourceGroup = process.env.VM_RESOURCE_GROUP;
  const vmName = process.env.VM_NAME;

  if (!subscriptionId || !resourceGroup || !vmName) {
    return NextResponse.json(
      { error: "Azure VM env vars not configured" },
      { status: 503 },
    );
  }

  try {
    const client = new ComputeManagementClient(new DefaultAzureCredential(), subscriptionId);
    // deallocate = stop + deallocate (stops billing for compute)
    await client.virtualMachines.beginDeallocateAndWait(resourceGroup, vmName);
    return NextResponse.json({ ok: true, action: "stop" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
