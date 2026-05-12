#[cfg(not(target_os = "linux"))]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconId},
};
use tauri::{Emitter, Manager};
use tauri_plugin_autostart::MacosLauncher;

mod commands;
mod imap;
mod oauth;
mod smtp;
mod vector_search;

#[tauri::command]
fn close_splashscreen(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("splashscreen") {
        let _ = w.close();
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn set_tray_tooltip(app: tauri::AppHandle, tooltip: String) -> Result<(), String> {
    #[cfg(not(target_os = "linux"))]
    {
        let tray = app
            .tray_by_id(&TrayIconId::new("main-tray"))
            .ok_or_else(|| "Tray icon not found".to_string())?;
        tray.set_tooltip(Some(&tooltip)).map_err(|e| e.to_string())
    }
    #[cfg(target_os = "linux")]
    {
        let _ = tooltip;
        let _ = app;
        log::debug!("set_tray_tooltip is not supported on Linux (KSNI tray)");
    }
}

/// 3×5 pixel bitmaps for digits 0-9 and '+' (row-major, 3 cols × 5 rows).
#[cfg(not(target_os = "linux"))]
const FONT_3X5: &[(char, [bool; 15])] = &[
    (
        '0',
        [
            true, true, true, true, false, true, true, false, true, true, false, true, true, true,
            true,
        ],
    ),
    (
        '1',
        [
            false, true, false, true, true, false, false, true, false, false, true, false, true,
            true, true,
        ],
    ),
    (
        '2',
        [
            true, true, true, false, false, true, true, true, true, true, false, false, true, true,
            true,
        ],
    ),
    (
        '3',
        [
            true, true, true, false, false, true, false, true, true, false, false, true, true,
            true, true,
        ],
    ),
    (
        '4',
        [
            true, false, true, true, false, true, true, true, true, false, false, true, false,
            false, true,
        ],
    ),
    (
        '5',
        [
            true, true, true, true, false, false, true, true, true, false, false, true, true, true,
            true,
        ],
    ),
    (
        '6',
        [
            true, true, true, true, false, false, true, true, true, true, false, true, true, true,
            true,
        ],
    ),
    (
        '7',
        [
            true, true, true, false, false, true, false, false, true, false, false, true, false,
            false, true,
        ],
    ),
    (
        '8',
        [
            true, true, true, true, false, true, true, true, true, true, false, true, true, true,
            true,
        ],
    ),
    (
        '9',
        [
            true, true, true, true, false, true, true, true, true, false, false, true, true, true,
            true,
        ],
    ),
    (
        '+',
        [
            false, false, false, false, true, false, true, true, true, false, true, false, false,
            false, false,
        ],
    ),
];

#[cfg(not(target_os = "linux"))]
fn draw_char_on_pixels(
    pixels: &mut [u8],
    img_width: u32,
    img_height: u32,
    ch: char,
    origin_x: u32,
    origin_y: u32,
    scale: u32,
) {
    let Some((_, bitmap)) = FONT_3X5.iter().find(|(c, _)| *c == ch) else {
        return;
    };
    for row in 0u32..5 {
        for col in 0u32..3 {
            if !bitmap[(row * 3 + col) as usize] {
                continue;
            }
            for sy in 0..scale {
                for sx in 0..scale {
                    let px = origin_x + col * scale + sx;
                    let py = origin_y + row * scale + sy;
                    if px >= img_width || py >= img_height {
                        continue;
                    }
                    let idx = ((py * img_width + px) * 4) as usize;
                    pixels[idx] = 255;
                    pixels[idx + 1] = 255;
                    pixels[idx + 2] = 255;
                    pixels[idx + 3] = 255;
                }
            }
        }
    }
}

/// Decodes `tray-64x64-badge-light.png` or `tray-64x64-badge-dark.png` based on macOS appearance.
#[cfg(target_os = "macos")]
fn render_tray_badge_icon(count: usize, use_dark: bool) -> tauri::image::Image<'static> {
    const BADGE_LIGHT: &[u8] = include_bytes!("../icons/tray-64x64-badge-light.png");
    const BADGE_DARK: &[u8] = include_bytes!("../icons/tray-64x64-badge-dark.png");

    let badge_png = if use_dark { BADGE_DARK } else { BADGE_LIGHT };
    let img = image::load_from_memory(badge_png)
        .expect("Failed to decode tray-64x64-badge icon")
        .into_rgba8();
    let width = img.width();
    let height = img.height();
    let mut pixels = img.into_raw();

    const SCALE: u32 = 4;
    const CHAR_W: u32 = 3;
    const CHAR_H: u32 = 5;
    const GAP: u32 = 1;

    let label: Vec<char> = if count > 9 {
        "9+".chars().collect()
    } else {
        count.to_string().chars().collect()
    };

    let n = label.len() as u32;
    let text_w = n * CHAR_W * SCALE + (n.saturating_sub(1)) * GAP * SCALE;
    let text_h = CHAR_H * SCALE;

    let badge_cx = width * 3 / 4;
    let badge_cy = height * 3 / 4;
    let start_x = badge_cx.saturating_sub(text_w / 2);
    let start_y = badge_cy.saturating_sub(text_h / 2);

    for (ci, &ch) in label.iter().enumerate() {
        let x_off = ci as u32 * (CHAR_W * SCALE + GAP * SCALE);
        draw_char_on_pixels(
            &mut pixels,
            width,
            height,
            ch,
            start_x + x_off,
            start_y,
            SCALE,
        );
    }

    tauri::image::Image::new_owned(pixels, width, height)
}

/// Fallback for non-macOS platforms
#[cfg(not(target_os = "macos"))]
fn render_tray_badge_icon(count: usize, _use_dark: bool) -> tauri::image::Image<'static> {
    const BADGE_PNG: &[u8] = include_bytes!("../icons/tray-64x64-badge.png");

    let img = image::load_from_memory(BADGE_PNG)
        .expect("Failed to decode tray-64x64-badge.png")
        .into_rgba8();
    let width = img.width();
    let height = img.height();
    let mut pixels = img.into_raw();

    const SCALE: u32 = 4;
    const CHAR_W: u32 = 3;
    const CHAR_H: u32 = 5;
    const GAP: u32 = 1;

    let label: Vec<char> = if count > 9 {
        "9+".chars().collect()
    } else {
        count.to_string().chars().collect()
    };

    let n = label.len() as u32;
    let text_w = n * CHAR_W * SCALE + (n.saturating_sub(1)) * GAP * SCALE;
    let text_h = CHAR_H * SCALE;

    let badge_cx = width * 3 / 4;
    let badge_cy = height * 3 / 4;
    let start_x = badge_cx.saturating_sub(text_w / 2);
    let start_y = badge_cy.saturating_sub(text_h / 2);

    for (ci, &ch) in label.iter().enumerate() {
        let x_off = ci as u32 * (CHAR_W * SCALE + GAP * SCALE);
        draw_char_on_pixels(
            &mut pixels,
            width,
            height,
            ch,
            start_x + x_off,
            start_y,
            SCALE,
        );
    }

    tauri::image::Image::new_owned(pixels, width, height)
}

#[cfg(target_os = "macos")]
fn is_macos_dark_mode(app: &tauri::AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.theme().ok())
        .map(|t| t == tauri::Theme::Dark)
        .unwrap_or(false)
}

#[cfg(not(target_os = "macos"))]
fn is_macos_dark_mode(_app: &tauri::AppHandle) -> bool {
    false
}

#[tauri::command]
fn set_tray_badge(app: tauri::AppHandle, count: Option<usize>) -> Result<(), String> {
    #[cfg(not(target_os = "linux"))]
    {
        let tray = app
            .tray_by_id(&TrayIconId::new("main-tray"))
            .ok_or_else(|| "Tray icon not found".to_string())?;

        let use_dark = is_macos_dark_mode(&app);

        match count {
            Some(c) if c > 0 => {
                let icon = render_tray_badge_icon(c, use_dark);
                tray.set_icon(Some(icon)).map_err(|e| e.to_string())?;
                tray.set_icon_as_template(false)
                    .map_err(|e| e.to_string())?;
                let _ = tray.set_title(None::<&str>);
            }
            _ => {
                let icon = tauri::include_image!("icons/tray-64x64.png");
                tray.set_icon(Some(icon)).map_err(|e| e.to_string())?;
                tray.set_icon_as_template(true).map_err(|e| e.to_string())?;
                let _ = tray.set_title(None::<&str>);
            }
        }
        Ok(())
    }
    #[cfg(target_os = "linux")]
    {
        let _ = app;
        let _ = count;
        Ok(())
    }
}

#[tauri::command]
fn open_devtools(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        w.open_devtools();
    }
}

/// Switch the tray icon between template (auto) and fixed light/dark style.
/// Uses the same 64x64 icon with template mode for automatic dark/light adaptation.
#[tauri::command]
fn set_tray_icon_style(app: tauri::AppHandle, style: String) -> Result<(), String> {
    #[cfg(not(target_os = "linux"))]
    {
        let tray = app
            .tray_by_id(&TrayIconId::new("main-tray"))
            .ok_or_else(|| "Tray icon not found".to_string())?;
        let icon = tauri::include_image!("icons/tray-64x64.png");
        tray.set_icon(Some(icon)).map_err(|e| e.to_string())?;
        let as_template = style != "fixed";
        tray.set_icon_as_template(as_template)
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let _ = app;
        let _ = style;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Set explicit AUMID on Windows so toast notifications show "Velo"
    // instead of "Windows PowerShell"
    #[cfg(windows)]
    {
        use windows::core::w;
        use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
        unsafe {
            let _ = SetCurrentProcessExplicitAppUserModelID(w!("com.velomail.app"));
        }
    }

    tauri::Builder::default()
        // Single instance MUST be first
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
            // Forward args for deep linking
            let _ = app.emit("single-instance-args", argv);
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            oauth::start_oauth_server,
            oauth::oauth_exchange_token,
            oauth::oauth_refresh_token,
            set_tray_tooltip,
            set_tray_badge,
            set_tray_icon_style,
            close_splashscreen,
            open_devtools,
            commands::imap_test_connection,
            commands::imap_list_folders,
            commands::imap_fetch_messages,
            commands::imap_fetch_new_uids,
            commands::imap_search_all_uids,
            commands::imap_fetch_message_body,
            commands::imap_fetch_raw_message,
            commands::imap_set_flags,
            commands::imap_move_messages,
            commands::imap_delete_messages,
            commands::imap_get_folder_status,
            commands::imap_fetch_attachment,
            commands::imap_append_message,
            commands::imap_search_folder,
            commands::imap_sync_folder,
            commands::imap_raw_fetch_diagnostic,
            commands::imap_delta_check,
            commands::smtp_send_email,
            commands::smtp_test_connection,
            vector_search::store_embedding,
            vector_search::ask_inbox_rust,
        ])
        .setup(|app| {
            {
                let level = if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                };
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(level)
                        .level_for("sqlx::query", log::LevelFilter::Warn)
                        .level_for("hyper_util", log::LevelFilter::Warn)
                        .level_for("hyper", log::LevelFilter::Warn)
                        .level_for("reqwest", log::LevelFilter::Warn)
                        .build(),
                )?;
            }

            #[cfg(not(target_os = "linux"))]
            {
                // Build system tray menu
                let show = MenuItem::with_id(app, "show", "Show Velo", true, None::<&str>)?;
                let check_mail =
                    MenuItem::with_id(app, "check_mail", "Check for Mail", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show, &check_mail, &quit])?;

                // Use tray icon (embed PNG at compile time, Template for automatic dark/light mode)
                let icon = tauri::include_image!("icons/tray-64x64.png");

                TrayIconBuilder::with_id("main-tray")
                    .icon(icon)
                    .tooltip("Velo")
                    .icon_as_template(true)
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "check_mail" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.emit("tray-check-mail", ());
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }

            #[cfg(target_os = "linux")]
            {
                use tray_item::{IconSource, TrayItem};

                let app_handle = app.handle().clone();

                std::thread::spawn(move || {
                    let mut tray = match TrayItem::new("Velo", IconSource::Resource("mail-read")) {
                        Ok(t) => t,
                        Err(e) => {
                            log::warn!("Failed to create system tray: {e}");
                            return;
                        }
                    };

                    let app_handle_show = app_handle.clone();
                    if let Err(e) = tray.add_menu_item("Show Velo", move || {
                        if let Some(window) = app_handle_show.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }) {
                        log::warn!("Failed to add tray menu item 'Show Velo': {e}");
                    }

                    let app_handle_check = app_handle.clone();
                    if let Err(e) = tray.add_menu_item("Check for Mail", move || {
                        if let Some(window) = app_handle_check.get_webview_window("main") {
                            let _ = window.emit("tray-check-mail", ());
                        }
                    }) {
                        log::warn!("Failed to add tray menu item 'Check for Mail': {e}");
                    }

                    let app_handle_quit = app_handle.clone();
                    if let Err(e) = tray.add_menu_item("Quit", move || {
                        app_handle_quit.exit(0);
                    }) {
                        log::warn!("Failed to add tray menu item 'Quit': {e}");
                    }

                    loop {
                        std::thread::park();
                    }
                });
            }

            // On Windows/Linux, remove decorations for custom titlebar.
            // macOS uses titleBarStyle: "overlay" from config instead, which
            // preserves native event routing in WKWebView.
            #[cfg(not(target_os = "macos"))]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_decorations(false);
                }
            }

            // Start hidden in tray if launched with --hidden (autostart)
            if std::env::args().any(|a| a == "--hidden") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
                // Also close splash screen when starting hidden
                if let Some(splash) = app.get_webview_window("splashscreen") {
                    let _ = splash.close();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Minimize to tray on close instead of quitting (main window only)
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    // Emit an event to the frontend to trigger draft auto-save
                    let _ = window.emit("velo-save-draft-on-close", ());
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    log::info!("Tauri application exited normally");
}
