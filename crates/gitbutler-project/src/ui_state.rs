use std::{path::PathBuf, time::SystemTime};

use anyhow::{Context as _, Result};
use serde::{Deserialize, Serialize};

use crate::{Project, ProjectHandleOrLegacyProjectId};

const UI_STATE_FILE: &str = "ui_state.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "export-schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
pub struct ProjectUiState {
    pub route: String,
    pub selected_stack_id: Option<String>,
    pub selected_files: Vec<String>,
    pub expanded_directories: Vec<String>,
    pub pr_panel: PrPanelState,
    pub settings_panel: SettingsPanelState,
    pub updated_at: SystemTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "export-schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
pub struct PrPanelState {
    pub open: bool,
    pub pr_number: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "export-schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
pub struct SettingsPanelState {
    pub open: bool,
    pub page_id: Option<String>,
}

impl Default for ProjectUiState {
    fn default() -> Self {
        Self {
            route: String::new(),
            selected_stack_id: None,
            selected_files: Vec::new(),
            expanded_directories: Vec::new(),
            pr_panel: PrPanelState {
                open: false,
                pr_number: None,
            },
            settings_panel: SettingsPanelState {
                open: false,
                page_id: None,
            },
            updated_at: SystemTime::now(),
        }
    }
}

impl Project {
    pub fn read_ui_state(&self) -> Result<Option<ProjectUiState>> {
        let gb_dir = self.gb_dir()?;
        let file_path = gb_dir.join(UI_STATE_FILE);

        if !file_path.exists() {
            return Ok(None);
        }

        let content = std::fs::read_to_string(&file_path)
            .with_context(|| format!("Failed to read UI state file at {}", file_path.display()))?;

        let state: ProjectUiState = serde_json::from_str(&content)
            .with_context(|| format!("Failed to parse UI state from {}", file_path.display()))?;

        Ok(Some(state))
    }

    pub fn write_ui_state(&self, state: &ProjectUiState) -> Result<()> {
        let gb_dir = self.gb_dir()?;
        std::fs::create_dir_all(&gb_dir)
            .with_context(|| format!("Failed to create directory {}", gb_dir.display()))?;

        let file_path = gb_dir.join(UI_STATE_FILE);
        let content = serde_json::to_string_pretty(state)
            .context("Failed to serialize UI state")?;

        std::fs::write(&file_path, content)
            .with_context(|| format!("Failed to write UI state to {}", file_path.display()))?;

        Ok(())
    }

    pub fn delete_ui_state(&self) -> Result<()> {
        let gb_dir = self.gb_dir()?;
        let file_path = gb_dir.join(UI_STATE_FILE);

        if file_path.exists() {
            std::fs::remove_file(&file_path)
                .with_context(|| format!("Failed to delete UI state at {}", file_path.display()))?;
        }

        Ok(())
    }
}

pub fn read_ui_state(project_id: ProjectHandleOrLegacyProjectId) -> Result<Option<ProjectUiState>> {
    let project = crate::get(project_id)?;
    project.read_ui_state()
}

pub fn write_ui_state(
    project_id: ProjectHandleOrLegacyProjectId,
    state: &ProjectUiState,
) -> Result<()> {
    let project = crate::get(project_id)?;
    project.write_ui_state(state)
}

pub fn get_ui_state_path(project_id: ProjectHandleOrLegacyProjectId) -> Result<PathBuf> {
    let project = crate::get(project_id)?;
    Ok(project.gb_dir()?.join(UI_STATE_FILE))
}
