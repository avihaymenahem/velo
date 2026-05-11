use std::error::Error;

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct CsvContact {
    pub email: String,
    pub display_name: Option<String>,
    pub notes: Option<String>,
}

/// Parse CSV content (bytes) into CsvContact records.
/// Expects a header row with at minimum an `email` column.
/// Also recognizes: `name`, `display_name`, `first_name`, `last_name`, `notes`.
pub fn parse_csv_content(content: &str) -> Result<Vec<CsvContact>, Box<dyn Error + Send + Sync>> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(content.as_bytes());

    let headers = reader.headers()?.clone();
    let email_idx = find_column(&headers, &["email", "e-mail", "mail"]);
    let name_idx = find_column(
        &headers,
        &[
            "name",
            "display_name",
            "display name",
            "full_name",
            "full name",
        ],
    );
    let first_name_idx = find_column(
        &headers,
        &["first_name", "first name", "given_name", "given name"],
    );
    let last_name_idx = find_column(
        &headers,
        &["last_name", "last name", "family_name", "family name"],
    );
    let notes_idx = find_column(&headers, &["notes", "note", "comment", "description"]);

    let email_idx = email_idx.ok_or("CSV missing required 'email' column")?;

    let mut contacts = Vec::new();
    for result in reader.records() {
        let record = result?;
        let email = record
            .get(email_idx)
            .ok_or("Missing email field in row")?
            .trim()
            .to_lowercase();
        if email.is_empty() {
            continue;
        }

        let display_name = name_idx
            .and_then(|i| record.get(i))
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.trim().to_string())
            .or_else(|| {
                let first = first_name_idx
                    .and_then(|i| record.get(i))
                    .filter(|s| !s.trim().is_empty());
                let last = last_name_idx
                    .and_then(|i| record.get(i))
                    .filter(|s| !s.trim().is_empty());
                match (first, last) {
                    (Some(f), Some(l)) => Some(format!("{} {}", f.trim(), l.trim())),
                    (Some(f), None) => Some(f.trim().to_string()),
                    (None, Some(l)) => Some(l.trim().to_string()),
                    _ => None,
                }
            });

        let notes = notes_idx
            .and_then(|i| record.get(i))
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.trim().to_string());

        contacts.push(CsvContact {
            email,
            display_name,
            notes,
        });
    }

    Ok(contacts)
}

fn find_column(headers: &csv::StringRecord, names: &[&str]) -> Option<usize> {
    for name in names {
        if let Some(idx) = headers
            .iter()
            .position(|h| h.trim().eq_ignore_ascii_case(name))
        {
            return Some(idx);
        }
    }
    None
}

#[tauri::command]
pub fn parse_csv(csv_content: String) -> Result<Vec<CsvContact>, String> {
    parse_csv_content(&csv_content).map_err(|e| e.to_string())
}
