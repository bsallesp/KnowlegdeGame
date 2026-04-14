import {
  AccountInfo,
  PublicClientApplication,
  type AuthenticationResult,
} from "@azure/msal-browser";
import { config } from "./config";

// Standard delegated scope for Azure Resource Manager (Azure Service Management).
// The user must have RBAC on the target subscription/resource group.
const ARM_SCOPE = "https://management.azure.com/user_impersonation";

export const msal = new PublicClientApplication({
  auth: {
    clientId: config.clientId,
    authority: `https://login.microsoftonline.com/${config.tenantId}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "localStorage",
  },
});

export async function initAuth() {
  await msal.initialize();
  const existing = msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null;
  if (existing) msal.setActiveAccount(existing);
}

export function getAccount(): AccountInfo | null {
  return msal.getActiveAccount() ?? null;
}

export async function login(): Promise<AuthenticationResult> {
  const result = await msal.loginPopup({
    scopes: [ARM_SCOPE],
    prompt: "select_account",
  });
  msal.setActiveAccount(result.account);
  return result;
}

export async function logout() {
  const account = getAccount();
  await msal.logoutPopup({ account: account ?? undefined });
}

export async function getArmAccessToken(): Promise<string> {
  const account = getAccount();
  if (!account) {
    throw new Error("Not logged in");
  }
  const result = await msal.acquireTokenSilent({
    account,
    scopes: [ARM_SCOPE],
  });
  return result.accessToken;
}
