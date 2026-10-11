
export interface KycResult {
  providerId: string;
  status: "pending" | "approved" | "rejected";
  reference: string;
}

function required(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name}_NOT_CONFIGURED`);
  }

  return value;
}

export async function submitKyc(input: {
  userId: string;
  fullName: string;
  country: string;
  documentType: string;
  documentNumber: string;
}) {
  const base = required("KYC_PROVIDER_URL");
  const key = required("KYC_PROVIDER_API_KEY");

  const response = await fetch(
    `${base}/verification/submit`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(input),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error("KYC_PROVIDER_FAILED");
  }

  return response.json() as Promise<KycResult>;
}