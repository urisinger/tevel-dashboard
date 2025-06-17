use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Definition {
    Struct {
        name: String,
        fields: Vec<(String, FieldType)>,
    },
    Enum {
        name: String,
        entries: Vec<(String, i64)>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum FieldType {
    Struct {
        name: String,
    },
    Array {
        #[serde(rename = "elementType")]
        element_type: Box<FieldType>,
        length: ArrayLength,
    },
    Match {
        discriminant: String,
        #[serde(rename = "enumTypeName")]
        enum_type_name: String,
        cases: HashMap<String, FieldType>,
    },
    Enum {
        name: String,
        signed: bool,
        width: u8,
        #[serde(skip_serializing_if = "Option::is_none")]
        default: Option<String>,
    },
    Int {
        signed: bool,
        width: u8,
        #[serde(skip_serializing_if = "Option::is_none")]
        default: Option<i64>,
    },
    #[serde(rename = "f32")]
    F32 {
        #[serde(skip_serializing_if = "Option::is_none")]
        default: Option<f32>,
    },
    #[serde(rename = "f64")]
    F64 {
        #[serde(skip_serializing_if = "Option::is_none")]
        default: Option<f64>,
    },
    CString {
        #[serde(skip_serializing_if = "Option::is_none")]
        default: Option<String>,
    },
    HebrewString {
        #[serde(skip_serializing_if = "Option::is_none")]
        default: Option<String>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ArrayLength {
    Static { value: u32 },
    Dynamic { field: String },
}
