use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use crate::core::{installer, project_scanner, sync_engine};
use crate::core::skill_store::{ProjectRecord, SkillRecord, SkillStore};

#[derive(Serialize)]
pub struct ProjectDto {
    pub id: String,
    pub name: String,
    pub path: String,
    pub sort_order: i32,
    pub skill_count: usize,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize)]
pub struct ProjectSkillDocumentDto {
    pub skill_name: String,
    pub filename: String,
    pub content: String,
}

fn project_to_dto(rec: &ProjectRecord) -> ProjectDto {
    let skill_count = project_scanner::read_project_skills(Path::new(&rec.path)).len();
    ProjectDto {
        id: rec.id.clone(),
        name: rec.name.clone(),
        path: rec.path.clone(),
        sort_order: rec.sort_order,
        skill_count,
        created_at: rec.created_at,
        updated_at: rec.updated_at,
    }
}

#[tauri::command]
pub fn get_projects(store: State<'_, Arc<SkillStore>>) -> Result<Vec<ProjectDto>, String> {
    let records = store.get_all_projects().map_err(|e| e.to_string())?;
    Ok(records.iter().map(project_to_dto).collect())
}

#[tauri::command]
pub fn add_project(store: State<'_, Arc<SkillStore>>, path: String) -> Result<ProjectDto, String> {
    let project_path = Path::new(&path);
    let skills_dir = project_path.join(".claude").join("skills");
    if !skills_dir.is_dir() {
        return Err("Directory does not contain .claude/skills/".to_string());
    }

    let name = project_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let now = chrono::Utc::now().timestamp_millis();
    let record = ProjectRecord {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        path: path.clone(),
        sort_order: 0,
        created_at: now,
        updated_at: now,
    };

    store.insert_project(&record).map_err(|e| e.to_string())?;
    Ok(project_to_dto(&record))
}

#[tauri::command]
pub fn remove_project(store: State<'_, Arc<SkillStore>>, id: String) -> Result<(), String> {
    store.delete_project(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn scan_projects(root: String) -> Result<Vec<String>, String> {
    let root_path = Path::new(&root);
    if !root_path.is_dir() {
        return Err("Directory does not exist".to_string());
    }
    Ok(project_scanner::scan_projects_in_dir(root_path, 4))
}

#[tauri::command]
pub fn get_project_skills(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
) -> Result<Vec<project_scanner::ProjectSkillInfo>, String> {
    let record = store
        .get_project_by_id(&project_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    let mut skills = project_scanner::read_project_skills(Path::new(&record.path));

    // Check which project skills are already in the central library
    let all_managed = store.get_all_skills().unwrap_or_default();
    for skill in &mut skills {
        skill.in_center = all_managed.iter().any(|m| {
            // Match by source_ref path
            m.source_ref.as_deref() == Some(&skill.path)
                // Or match by name (case-insensitive)
                || m.name.to_lowercase() == skill.name.to_lowercase()
        });
    }

    Ok(skills)
}

#[tauri::command]
pub fn get_project_skill_document(
    project_path: String,
    skill_name: String,
) -> Result<ProjectSkillDocumentDto, String> {
    let claude_dir = Path::new(&project_path).join(".claude");
    let skill_dir = claude_dir.join("skills").join(&skill_name);
    let skill_dir = if skill_dir.is_dir() {
        skill_dir
    } else {
        let disabled = claude_dir.join("skills-disabled").join(&skill_name);
        if disabled.is_dir() {
            disabled
        } else {
            return Err("Skill directory not found".to_string());
        }
    };

    let candidates = ["SKILL.md", "skill.md", "CLAUDE.md", "README.md"];
    for candidate in &candidates {
        let file_path = skill_dir.join(candidate);
        if file_path.exists() {
            let content = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
            return Ok(ProjectSkillDocumentDto {
                skill_name,
                filename: candidate.to_string(),
                content,
            });
        }
    }

    Err("No document file found in skill directory".to_string())
}

#[tauri::command]
pub fn import_project_skill_to_center(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    skill_name: String,
) -> Result<(), String> {
    let record = store
        .get_project_by_id(&project_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    let skills = project_scanner::read_project_skills(Path::new(&record.path));
    let skill = skills
        .iter()
        .find(|s| s.name == skill_name)
        .ok_or_else(|| "Skill not found in project".to_string())?;

    let source_path = PathBuf::from(&skill.path);
    let result = installer::install_from_local(&source_path, Some(&skill.name))
        .map_err(|e| e.to_string())?;

    let active = store.get_active_scenario_id().ok().flatten();
    let now = chrono::Utc::now().timestamp_millis();
    let id = uuid::Uuid::new_v4().to_string();

    let skill_record = SkillRecord {
        id: id.clone(),
        name: result.name.clone(),
        description: result.description.clone(),
        source_type: "local".to_string(),
        source_ref: Some(skill.path.clone()),
        source_ref_resolved: None,
        source_subpath: None,
        source_branch: None,
        source_revision: None,
        remote_revision: None,
        central_path: result.central_path.to_string_lossy().to_string(),
        content_hash: Some(result.content_hash.clone()),
        enabled: true,
        created_at: now,
        updated_at: now,
        status: "ok".to_string(),
        update_status: "local_only".to_string(),
        last_checked_at: Some(now),
        last_check_error: None,
    };

    store.insert_skill(&skill_record).map_err(|e| e.to_string())?;

    if let Some(scenario_id) = active.as_deref() {
        store
            .add_skill_to_scenario(scenario_id, &id)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn export_skill_to_project(
    store: State<'_, Arc<SkillStore>>,
    skill_id: String,
    project_id: String,
) -> Result<(), String> {
    let project = store
        .get_project_by_id(&project_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    let skill = store
        .get_skill_by_id(&skill_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Skill not found".to_string())?;

    let target_dir = Path::new(&project.path)
        .join(".claude")
        .join("skills")
        .join(&skill.name);

    if target_dir.exists() {
        return Err(format!("Skill \"{}\" already exists in this project", skill.name));
    }

    let source = PathBuf::from(&skill.central_path);
    sync_engine::sync_skill(&source, &target_dir, sync_engine::SyncMode::Copy)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn toggle_project_skill(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    skill_name: String,
    enabled: bool,
) -> Result<(), String> {
    let record = store
        .get_project_by_id(&project_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    let claude_dir = Path::new(&record.path).join(".claude");
    let skills_dir = claude_dir.join("skills");
    let disabled_dir = claude_dir.join("skills-disabled");

    if enabled {
        // Re-enable: move from skills-disabled/ to skills/
        let from = disabled_dir.join(&skill_name);
        let to = skills_dir.join(&skill_name);

        if !from.is_dir() {
            return Err("Skill directory not found in skills-disabled".to_string());
        }
        if to.exists() {
            return Err("Skill already exists in skills directory".to_string());
        }
        std::fs::rename(&from, &to).map_err(|e| e.to_string())?;
    } else {
        // Disable: move from skills/ to skills-disabled/
        let from = skills_dir.join(&skill_name);
        let to = disabled_dir.join(&skill_name);

        if !from.is_dir() {
            return Err("Skill directory not found".to_string());
        }
        std::fs::create_dir_all(&disabled_dir).map_err(|e| e.to_string())?;
        if to.exists() {
            return Err("Skill already exists in skills-disabled directory".to_string());
        }
        std::fs::rename(&from, &to).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn delete_project_skill(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    skill_name: String,
) -> Result<(), String> {
    let record = store
        .get_project_by_id(&project_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    let claude_dir = Path::new(&record.path).join(".claude");
    let skills_dir = claude_dir.join("skills").join(&skill_name);
    let disabled_dir = claude_dir.join("skills-disabled").join(&skill_name);

    let target = if skills_dir.is_dir() {
        skills_dir
    } else if disabled_dir.is_dir() {
        disabled_dir
    } else {
        return Err("Skill directory not found".to_string());
    };

    std::fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
    Ok(())
}
