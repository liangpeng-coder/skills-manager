use serde::Serialize;
use std::path::Path;

use super::{content_hash, skill_metadata};

#[derive(Debug, Clone, Serialize)]
pub struct ProjectSkillInfo {
    pub name: String,
    pub dir_name: String,
    pub description: Option<String>,
    pub path: String,
    pub files: Vec<String>,
    pub enabled: bool,
    #[serde(default)]
    pub in_center: bool,
    #[serde(skip_serializing)]
    pub content_hash: Option<String>,
}

/// Read all skills under `<project_path>/.claude/skills/` and `.claude/skills-disabled/`.
pub fn read_project_skills(project_path: &Path) -> Vec<ProjectSkillInfo> {
    let claude_dir = project_path.join(".claude");
    let skills_dir = claude_dir.join("skills");
    let disabled_dir = claude_dir.join("skills-disabled");

    let mut skills = Vec::new();

    read_skills_from_dir(&skills_dir, true, &mut skills);
    read_skills_from_dir(&disabled_dir, false, &mut skills);

    skills.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    skills
}

fn read_skills_from_dir(dir: &Path, enabled: bool, skills: &mut Vec<ProjectSkillInfo>) {
    if !dir.is_dir() {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let dir_name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string());

            let meta = skill_metadata::parse_skill_md(&path);
            let name = meta
                .name
                .filter(|n| !n.is_empty())
                .unwrap_or_else(|| dir_name.clone());

            let files = list_files(&path);

            skills.push(ProjectSkillInfo {
                name,
                dir_name: dir_name.clone(),
                description: meta.description,
                path: path.to_string_lossy().to_string(),
                files,
                enabled,
                in_center: false,
                content_hash: content_hash::hash_directory(&path).ok(),
            });
        }
    }
}

/// Scan a root directory for projects containing `.claude/skills/`.
pub fn scan_projects_in_dir(root: &Path, max_depth: usize) -> Vec<String> {
    let mut results = Vec::new();
    scan_recursive(root, 0, max_depth, &mut results);
    results.sort();
    results
}

fn scan_recursive(dir: &Path, depth: usize, max_depth: usize, results: &mut Vec<String>) {
    if depth > max_depth {
        return;
    }

    let claude_skills = dir.join(".claude").join("skills");
    if claude_skills.is_dir() {
        results.push(dir.to_string_lossy().to_string());
        return; // don't recurse into subdirectories of a matched project
    }

    if depth == max_depth {
        return;
    }

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            // Skip hidden directories and common non-project dirs
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.starts_with('.') || name == "node_modules" || name == "target" || name == "__pycache__" {
                continue;
            }
            scan_recursive(&path, depth + 1, max_depth, results);
        }
    }
}

fn list_files(dir: &Path) -> Vec<String> {
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name() {
                    files.push(name.to_string_lossy().to_string());
                }
            }
        }
    }
    files.sort();
    files
}
