use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

use crate::core::{installer, scanner, skill_store::SkillStore};

#[derive(Debug, Serialize)]
pub struct ScanResultDto {
    pub tools_scanned: usize,
    pub skills_found: usize,
    pub groups: Vec<scanner::DiscoveredGroup>,
}

#[tauri::command]
pub fn scan_local_skills(store: State<'_, Arc<SkillStore>>) -> Result<ScanResultDto, String> {
    let all_targets = store.get_all_targets().map_err(|e| e.to_string())?;
    let managed_paths: Vec<String> = all_targets.iter().map(|t| t.target_path.clone()).collect();

    let plan = scanner::scan_local_skills(&managed_paths).map_err(|e| e.to_string())?;

    // Clear and repopulate discovered
    store.clear_discovered().map_err(|e| e.to_string())?;
    for rec in &plan.discovered {
        store.insert_discovered(rec).map_err(|e| e.to_string())?;
    }

    let all_discovered = store.get_all_discovered().map_err(|e| e.to_string())?;
    let groups = scanner::group_discovered(&all_discovered);

    Ok(ScanResultDto {
        tools_scanned: plan.tools_scanned,
        skills_found: plan.skills_found,
        groups,
    })
}

#[tauri::command]
pub fn import_existing_skill(
    source_path: String,
    name: Option<String>,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), String> {
    let path = PathBuf::from(&source_path);
    let result = installer::install_from_local(&path, name.as_deref()).map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp_millis();
    let id = uuid::Uuid::new_v4().to_string();

    let record = crate::core::skill_store::SkillRecord {
        id: id.clone(),
        name: result.name,
        description: result.description,
        source_type: "import".to_string(),
        source_ref: Some(source_path),
        source_ref_resolved: None,
        source_subpath: None,
        source_branch: None,
        source_revision: None,
        remote_revision: None,
        central_path: result.central_path.to_string_lossy().to_string(),
        content_hash: Some(result.content_hash),
        enabled: true,
        created_at: now,
        updated_at: now,
        status: "ok".to_string(),
        update_status: "local_only".to_string(),
        last_checked_at: Some(now),
        last_check_error: None,
    };

    store.insert_skill(&record).map_err(|e| e.to_string())?;

    // Auto-add to active scenario
    if let Ok(Some(scenario_id)) = store.get_active_scenario_id() {
        store
            .add_skill_to_scenario(&scenario_id, &id)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn import_all_discovered(store: State<'_, Arc<SkillStore>>) -> Result<(), String> {
    let discovered = store.get_all_discovered().map_err(|e| e.to_string())?;
    let groups = scanner::group_discovered(&discovered);

    let active_scenario = store.get_active_scenario_id().ok().flatten();

    for group in groups {
        if group.imported {
            continue;
        }
        if let Some(first) = group.locations.first() {
            let path = PathBuf::from(&first.found_path);
            if let Ok(result) = installer::install_from_local(&path, Some(&group.name)) {
                let now = chrono::Utc::now().timestamp_millis();
                let id = uuid::Uuid::new_v4().to_string();
                let record = crate::core::skill_store::SkillRecord {
                    id: id.clone(),
                    name: result.name,
                    description: result.description,
                    source_type: "import".to_string(),
                    source_ref: Some(first.found_path.clone()),
                    source_ref_resolved: None,
                    source_subpath: None,
                    source_branch: None,
                    source_revision: None,
                    remote_revision: None,
                    central_path: result.central_path.to_string_lossy().to_string(),
                    content_hash: Some(result.content_hash),
                    enabled: true,
                    created_at: now,
                    updated_at: now,
                    status: "ok".to_string(),
                    update_status: "local_only".to_string(),
                    last_checked_at: Some(now),
                    last_check_error: None,
                };
                store.insert_skill(&record).ok();

                if let Some(ref scenario_id) = active_scenario {
                    store.add_skill_to_scenario(scenario_id, &id).ok();
                }
            }
        }
    }

    Ok(())
}
