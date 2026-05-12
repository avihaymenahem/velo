#[tauri::command]
pub fn extract_pdf_text(file_path: String) -> Result<String, String> {
    let doc = lopdf::Document::load(&file_path).map_err(|e| e.to_string())?;
    let mut text = String::new();
    for (page_number, _) in doc.page_iter() {
        if let Ok(content) = doc.extract_text(&[page_number]) {
            text.push_str(&content);
            text.push('\n');
        }
    }
    Ok(text)
}
