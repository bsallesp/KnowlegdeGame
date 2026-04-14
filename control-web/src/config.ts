function required(name: string): string {
  const val = (import.meta.env[name] as string | undefined) ?? "";
  if (!val) {
    throw new Error(`Missing ${name}. Configure it in .env.local`);
  }
  return val;
}

export const config = {
  tenantId: required("VITE_AZURE_TENANT_ID"),
  clientId: required("VITE_AZURE_CLIENT_ID"),
  subscriptionId: required("VITE_AZURE_SUBSCRIPTION_ID"),
  vmResourceGroup: required("VITE_VM_RESOURCE_GROUP"),
  vmName: required("VITE_VM_NAME"),
};

