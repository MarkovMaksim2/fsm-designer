use std::{
    net::TcpStream,
    path::PathBuf,
    process::{Child, Command},
    sync::Mutex,
    thread::sleep,
    time::Duration,
};

use tauri::{AppHandle, Manager, RunEvent, State};

const BACKEND_HOST: &str = "127.0.0.1";
const BACKEND_PORT: u16 = 38123;

struct BackendState(Mutex<Option<Child>>);

fn packaged_backend_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "fsm-backend.exe"
    } else {
        "fsm-backend"
    }
}

fn candidate_backend_paths(app: &AppHandle) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let binary_name = packaged_backend_name();

    if let Ok(resource_dir) = app.path().resource_dir() {
        paths.push(resource_dir.join("bin").join(binary_name));
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            paths.push(exe_dir.join("../Resources/bin").join(binary_name));
            paths.push(exe_dir.join("bin").join(binary_name));
        }
    }

    if cfg!(debug_assertions) {
        if let Ok(current_dir) = std::env::current_dir() {
            paths.push(current_dir.join("src-tauri").join("bin").join(binary_name));
            paths.push(current_dir.join("bin").join(binary_name));
        }
    }

    paths
}

fn spawn_packaged_backend(app: &AppHandle) -> Result<Child, String> {
    let backend_path = candidate_backend_paths(app)
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(|| "Не найден упакованный backend-sidecar `fsm-backend`.".to_string())?;

    Command::new(&backend_path)
        .env("FSM_DESKTOP_HOST", BACKEND_HOST)
        .env("FSM_DESKTOP_PORT", BACKEND_PORT.to_string())
        .spawn()
        .map_err(|error| {
            format!(
                "Не удалось запустить backend-sidecar `{}`: {error}",
                backend_path.display()
            )
        })
}

fn spawn_dev_backend() -> Result<Child, String> {
    Command::new("python3")
        .arg("../src/desktop_server.py")
        .env("FSM_DESKTOP_HOST", BACKEND_HOST)
        .env("FSM_DESKTOP_PORT", BACKEND_PORT.to_string())
        .spawn()
        .map_err(|error| format!("Не удалось запустить backend в dev-режиме: {error}"))
}

fn wait_for_backend() -> Result<(), String> {
    for _ in 0..50 {
        if TcpStream::connect((BACKEND_HOST, BACKEND_PORT)).is_ok() {
            return Ok(());
        }
        sleep(Duration::from_millis(100));
    }

    Err("Backend не поднялся вовремя на `127.0.0.1:38123`.".to_string())
}

fn ensure_backend(app: &AppHandle, state: State<'_, BackendState>) -> Result<(), String> {
    let mut child_guard = state
        .0
        .lock()
        .map_err(|_| "Не удалось захватить состояние backend.".to_string())?;
    if child_guard.is_some() {
        return Ok(());
    }

    let child = if cfg!(debug_assertions) {
        spawn_dev_backend().or_else(|_| spawn_packaged_backend(app))?
    } else {
        spawn_packaged_backend(app)?
    };

    *child_guard = Some(child);
    drop(child_guard);
    wait_for_backend()
}

fn stop_backend(state: State<'_, BackendState>) {
    if let Ok(mut child_guard) = state.0.lock() {
        if let Some(mut child) = child_guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(BackendState(Mutex::new(None)));
            ensure_backend(&app.handle(), app.state::<BackendState>())
                .map_err(|message| std::io::Error::new(std::io::ErrorKind::Other, message))?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Не удалось собрать desktop-приложение")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
                stop_backend(app.state::<BackendState>());
            }
        });
}
