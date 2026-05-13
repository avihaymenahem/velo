use serde::{Deserialize, Serialize};
use trust_dns_resolver::config::{ResolverConfig, ResolverOpts};
use trust_dns_resolver::TokioAsyncResolver;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsblResult {
    pub list_name: String,
    pub listed: bool,
    pub responded: bool,
}

const DNSBLS: &[(&str, &str)] = &[
    ("Spamhaus", "zen.spamhaus.org"),
    ("Barracuda", "b.barracudacentral.org"),
    ("SpamCop", "bl.spamcop.net"),
    ("SURBL", "multi.surbl.org"),
];

fn ip_to_reversed(ip: &str) -> Option<String> {
    let parts: Vec<&str> = ip.split('.').collect();
    if parts.len() != 4 {
        return None;
    }
    Some(parts.iter().rev().map(|p| *p).collect::<Vec<_>>().join("."))
}

pub async fn check_dnsbl(ip: &str) -> Vec<DnsblResult> {
    let reversed = match ip_to_reversed(ip) {
        Some(r) => r,
        None => {
            return vec![];
        }
    };

    let resolver = TokioAsyncResolver::tokio(ResolverConfig::default(), ResolverOpts::default());

    let mut results = Vec::new();
    for (name, host) in DNSBLS {
        let query_host = format!("{}.{}", reversed, host);
        match resolver.txt_lookup(&query_host).await {
            Ok(response) => {
                let records: Vec<_> = response.iter().collect();
                let listed = !records.is_empty();
                results.push(DnsblResult {
                    list_name: name.to_string(),
                    listed,
                    responded: true,
                });
            }
            Err(_) => {
                results.push(DnsblResult {
                    list_name: name.to_string(),
                    listed: false,
                    responded: false,
                });
            }
        }
    }

    results
}

#[tauri::command]
pub async fn check_dnsbl_cmd(ip: String) -> Result<Vec<DnsblResult>, String> {
    Ok(check_dnsbl(&ip).await)
}
