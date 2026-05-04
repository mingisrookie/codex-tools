use std::fs;
use std::path::Path;
use std::path::PathBuf;

#[cfg(feature = "desktop")]
use tauri::AppHandle;
#[cfg(feature = "desktop")]
use tauri::Manager;

const DEV_APP_DATA_DIR_ENV: &str = "CODEX_TOOLS_DEV_DATA_DIR";
const DEV_CODEX_DIR_ENV: &str = "CODEX_TOOLS_DEV_CODEX_DIR";
const PORTABLE_APP_DATA_DIR_NAME: &str = "Codex Tools Data";
const MIGRATION_MARKER_FILE_NAME: &str = ".appdata-migrated";

fn env_path(name: &str) -> Option<PathBuf> {
    let value = std::env::var(name).ok()?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(PathBuf::from(trimmed))
}

#[cfg(feature = "desktop")]
pub(crate) fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        if let Some(path) = env_path(DEV_APP_DATA_DIR_ENV) {
            return Ok(path);
        }
    }

    let fallback_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法获取应用数据目录: {error}"))?;
    let exe_path =
        std::env::current_exe().map_err(|error| format!("无法获取应用运行路径: {error}"))?;
    resolve_app_data_dir_for_exe(&exe_path, fallback_dir)
}

pub(crate) fn codex_dir() -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        if let Some(path) = env_path(DEV_CODEX_DIR_ENV) {
            return Ok(path);
        }
    }

    let home = dirs::home_dir().ok_or_else(|| "无法读取 HOME 目录".to_string())?;
    Ok(home.join(".codex"))
}

pub(crate) fn codex_auth_path() -> Result<PathBuf, String> {
    Ok(codex_dir()?.join("auth.json"))
}

pub(crate) fn codex_config_path() -> Result<PathBuf, String> {
    Ok(codex_dir()?.join("config.toml"))
}

pub(crate) fn portable_app_data_dir_for_exe(exe_path: &Path) -> Option<PathBuf> {
    exe_path
        .parent()
        .map(|parent| parent.join(PORTABLE_APP_DATA_DIR_NAME))
}

fn resolve_app_data_dir_for_exe(
    exe_path: &Path,
    fallback_app_data_dir: PathBuf,
) -> Result<PathBuf, String> {
    let Some(portable_dir) = portable_app_data_dir_for_exe(exe_path) else {
        fs::create_dir_all(&fallback_app_data_dir).map_err(|error| {
            format!(
                "创建应用数据目录失败 {}: {error}",
                fallback_app_data_dir.display()
            )
        })?;
        return Ok(fallback_app_data_dir);
    };

    if ensure_writable_dir(&portable_dir).is_ok() {
        if let Err(error) = migrate_legacy_app_data_once(&fallback_app_data_dir, &portable_dir) {
            log::warn!(
                "迁移旧应用数据失败 {} -> {}: {}",
                fallback_app_data_dir.display(),
                portable_dir.display(),
                error
            );
        }
        return Ok(portable_dir);
    }

    fs::create_dir_all(&fallback_app_data_dir).map_err(|error| {
        format!(
            "创建应用数据目录失败 {}: {error}",
            fallback_app_data_dir.display()
        )
    })?;
    Ok(fallback_app_data_dir)
}

fn ensure_writable_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path)
        .map_err(|error| format!("创建便携数据目录失败 {}: {error}", path.display()))?;
    let probe = path.join(format!(".write-test-{}", uuid::Uuid::new_v4()));
    fs::write(&probe, b"ok")
        .map_err(|error| format!("写入便携数据目录失败 {}: {error}", probe.display()))?;
    fs::remove_file(&probe)
        .map_err(|error| format!("清理便携数据目录探针失败 {}: {error}", probe.display()))?;
    Ok(())
}

pub(crate) fn migrate_legacy_app_data_once(
    legacy_dir: &Path,
    portable_dir: &Path,
) -> Result<(), String> {
    if legacy_dir == portable_dir || !legacy_dir.exists() {
        return Ok(());
    }
    let marker = portable_dir.join(MIGRATION_MARKER_FILE_NAME);
    if marker.exists() || portable_data_has_user_data(portable_dir) {
        return Ok(());
    }

    fs::create_dir_all(portable_dir)
        .map_err(|error| format!("创建便携数据目录失败 {}: {error}", portable_dir.display()))?;
    for name in [
        "accounts.json",
        "accounts.json.last-good.json",
        "accounts.json.prev-good.json",
        "api-proxy.key",
    ] {
        copy_file_if_exists(&legacy_dir.join(name), &portable_dir.join(name))?;
    }
    copy_dir_if_exists(&legacy_dir.join("profiles"), &portable_dir.join("profiles"))?;
    copy_dir_if_exists(&legacy_dir.join("logs"), &portable_dir.join("logs"))?;

    fs::write(&marker, b"migrated\n")
        .map_err(|error| format!("写入应用数据迁移标记失败 {}: {error}", marker.display()))?;
    Ok(())
}

fn portable_data_has_user_data(path: &Path) -> bool {
    path.join("accounts.json").exists()
        || path.join("api-proxy.key").exists()
        || path.join("profiles").exists()
}

fn copy_file_if_exists(source: &Path, target: &Path) -> Result<(), String> {
    if !source.is_file() || target.exists() {
        return Ok(());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建迁移目标目录失败 {}: {error}", parent.display()))?;
    }
    fs::copy(source, target).map_err(|error| {
        format!(
            "迁移应用数据文件失败 {} -> {}: {error}",
            source.display(),
            target.display()
        )
    })?;
    Ok(())
}

fn copy_dir_if_exists(source: &Path, target: &Path) -> Result<(), String> {
    if !source.is_dir() || target.exists() {
        return Ok(());
    }
    copy_dir_recursively(source, target)
}

fn copy_dir_recursively(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target)
        .map_err(|error| format!("创建迁移目标目录失败 {}: {error}", target.display()))?;
    for entry in fs::read_dir(source)
        .map_err(|error| format!("读取迁移来源目录失败 {}: {error}", source.display()))?
    {
        let entry = entry
            .map_err(|error| format!("读取迁移来源目录项失败 {}: {error}", source.display()))?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        let file_type = entry.file_type().map_err(|error| {
            format!(
                "读取迁移来源文件类型失败 {}: {error}",
                source_path.display()
            )
        })?;
        if file_type.is_dir() {
            copy_dir_recursively(&source_path, &target_path)?;
        } else if file_type.is_file() {
            copy_file_if_exists(&source_path, &target_path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn portable_data_dir_sits_next_to_exe() {
        let exe_path = PathBuf::from("tool-root").join("app.exe");

        assert_eq!(
            portable_app_data_dir_for_exe(&exe_path),
            Some(PathBuf::from("tool-root").join("Codex Tools Data"))
        );
    }

    #[test]
    fn legacy_migration_copies_known_runtime_files_once() {
        let root =
            std::env::temp_dir().join(format!("codex-tools-path-test-{}", uuid::Uuid::new_v4()));
        let legacy = root.join("legacy");
        let portable = root.join("portable");
        fs::create_dir_all(legacy.join("profiles").join("account-a")).unwrap();
        fs::write(legacy.join("accounts.json"), "{}").unwrap();
        fs::write(legacy.join("api-proxy.key"), "sk-test").unwrap();
        fs::write(
            legacy
                .join("profiles")
                .join("account-a")
                .join("config.toml"),
            "model = \"gpt-5.4\"",
        )
        .unwrap();

        migrate_legacy_app_data_once(&legacy, &portable).unwrap();
        fs::write(legacy.join("api-proxy.key"), "sk-mutated").unwrap();
        migrate_legacy_app_data_once(&legacy, &portable).unwrap();

        assert_eq!(
            fs::read_to_string(portable.join("accounts.json")).unwrap(),
            "{}"
        );
        assert_eq!(
            fs::read_to_string(portable.join("api-proxy.key")).unwrap(),
            "sk-test"
        );
        assert!(portable
            .join("profiles")
            .join("account-a")
            .join("config.toml")
            .is_file());
        assert!(portable.join(".appdata-migrated").is_file());

        let _ = fs::remove_dir_all(root);
    }
}
