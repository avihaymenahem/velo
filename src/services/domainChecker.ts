import { invoke } from "@tauri-apps/api/core";

export interface DnsCheckResult {
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
}

/**
 * Query DNS records for a domain to check email authentication setup.
 * Checks SPF (TXT), DKIM (default._domainkey TXT), and DMARC (_dmarc TXT).
 */
export async function checkDomainDns(domain: string): Promise<DnsCheckResult> {
  return invoke<DnsCheckResult>("check_dns_records", { domain });
}

/**
 * Extract the domain part from an email address.
 */
export function extractDomain(email: string): string | null {
  const match = email.match(/@([^@]+)$/);
  return match?.[1] ?? null;
}
