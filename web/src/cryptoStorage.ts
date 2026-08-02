import type { AppData } from "./types";

export const LOCAL_ENCRYPTION_VERSION = 2 as const;
export const LOCAL_ENCRYPTION_ALGORITHM = "AES-GCM" as const;

const additionalData = new TextEncoder().encode("heritg:local-family-data:v2");

export interface EncryptedAppData {
  version: typeof LOCAL_ENCRYPTION_VERSION;
  algorithm: typeof LOCAL_ENCRYPTION_ALGORITHM;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer;
}

export const isEncryptedAppData = (value: unknown): value is EncryptedAppData => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EncryptedAppData>;
  const iv = candidate.iv as { byteLength?: unknown } | undefined;
  const ciphertext = candidate.ciphertext as { byteLength?: unknown } | undefined;
  return candidate.version === LOCAL_ENCRYPTION_VERSION &&
    candidate.algorithm === LOCAL_ENCRYPTION_ALGORITHM &&
    iv?.byteLength === 12 &&
    typeof ciphertext?.byteLength === "number";
};

export const generateLocalEncryptionKey = () => crypto.subtle.generateKey(
  { name: LOCAL_ENCRYPTION_ALGORITHM, length: 256 },
  false,
  ["encrypt", "decrypt"]
);

export async function encryptAppData(
  data: AppData,
  key: CryptoKey
): Promise<EncryptedAppData> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: LOCAL_ENCRYPTION_ALGORITHM, iv, additionalData },
    key,
    new TextEncoder().encode(JSON.stringify(data))
  );
  return {
    version: LOCAL_ENCRYPTION_VERSION,
    algorithm: LOCAL_ENCRYPTION_ALGORITHM,
    iv,
    ciphertext
  };
}

export async function decryptAppData(
  payload: EncryptedAppData,
  key: CryptoKey
): Promise<AppData> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: LOCAL_ENCRYPTION_ALGORITHM,
      iv: payload.iv,
      additionalData
    },
    key,
    payload.ciphertext
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as AppData;
}
