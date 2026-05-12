use serde::{Deserialize, Serialize};
use trust_dns_resolver::config::{ResolverConfig, ResolverOpts};
use trust_dns_resolver::TokioAsyncResolver;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsCheckResult {
    pub spf: Option<String>,
    pub dkim: Option<String>,
    pub dmarc: Option<String>,
}

pub async fn check_dns_records(domain: String) -> Result<DnsCheckResult, String> {
    let resolver = TokioAsyncResolver::tokio(ResolverConfig::default(), ResolverOpts::default());

    let spf = check_spf(&resolver, &domain).await;
    let dkim = check_dkim(&resolver, &domain).await;
    let dmarc = check_dmarc(&resolver, &domain).await;

    Ok(DnsCheckResult { spf, dkim, dmarc })
}

async fn check_spf(resolver: &TokioAsyncResolver, domain: &str) -> Option<String> {
    match resolver.txt_lookup(domain).await {
        Ok(response) => {
            for record in response.iter() {
                let txt = record.to_string();
                if txt.to_lowercase().starts_with("v=spf1") {
                    return Some(txt);
                }
            }
            None
        }
        Err(_) => None,
    }
}

async fn check_dkim(resolver: &TokioAsyncResolver, domain: &str) -> Option<String> {
    let dkim_domain = format!("default._domainkey.{}", domain);
    match resolver.txt_lookup(&dkim_domain).await {
        Ok(response) => {
            for record in response.iter() {
                let txt = record.to_string();
                if txt.to_lowercase().contains("v=dkim1") {
                    return Some(txt);
                }
            }
            None
        }
        Err(_) => None,
    }
}

async fn check_dmarc(resolver: &TokioAsyncResolver, domain: &str) -> Option<String> {
    let dmarc_domain = format!("_dmarc.{}", domain);
    match resolver.txt_lookup(&dmarc_domain).await {
        Ok(response) => {
            for record in response.iter() {
                let txt = record.to_string();
                if txt.to_lowercase().starts_with("v=dmarc1") {
                    return Some(txt);
                }
            }
            None
        }
        Err(_) => None,
    }
}

#[tauri::command]
pub async fn check_dns_records(domain: String) -> Result<DnsCheckResult, String> {
    check_dns_records(domain).await
}
