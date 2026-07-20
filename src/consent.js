export const MFA_CONSENT_KEY = "mfaConsentGranted";

export async function hasMfaConsent() {
  const { [MFA_CONSENT_KEY]: granted } = await chrome.storage.local.get(MFA_CONSENT_KEY);
  return granted === true;
}

export async function grantMfaConsent() {
  await chrome.storage.local.set({ [MFA_CONSENT_KEY]: true });
}

export async function revokeMfaConsent() {
  await chrome.storage.local.remove(MFA_CONSENT_KEY);
}
