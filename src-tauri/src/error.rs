//! One error type across the database, the filesystem and the IPC boundary.
//!
//! Tauri commands must return something `serde` can encode, so the error
//! serialises to its message — which is also exactly what the UI puts in front
//! of the user.

use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Validation(String),

    #[error("Could not find {0}")]
    NotFound(String),

    #[error("Database error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("File error: {0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
