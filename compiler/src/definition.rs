use std::collections::HashMap;

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use crate::parser::{DefinitionAST, FieldAST};

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

impl Definition {
    pub fn name(&self) -> &str {
        match self {
            Self::Enum { name, .. } | Self::Struct { name, .. } => name,
        }
    }
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
        default: Option<f64>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ArrayLength {
    Static { value: u32 },
    Dynamic { field: String },
}

fn build_field(ast: &FieldAST, parent_fields: &IndexMap<String, FieldType>) -> Option<FieldType> {
    match ast {
        FieldAST::Struct { name } => Some(FieldType::Struct {
            name: name.0.clone(),
        }),
        FieldAST::Array {
            element_type,
            length,
        } => {
            let elem = build_field(&element_type.0, parent_fields)?;
            Some(FieldType::Array {
                element_type: Box::new(elem),
                length: length.0.clone(),
            })
        }
        FieldAST::Match {
            discriminant,
            cases,
        } => {
            let disc_name = &discriminant.0;
            let disc_ty = match parent_fields.get(disc_name) {
                Some(t) => t,
                None => {
                    return None;
                }
            };
            let enum_type_name = if let FieldType::Enum { name, .. } = disc_ty {
                name.clone()
            } else {
                return None;
            };
            let mut map = HashMap::new();
            for case in &cases.0 {
                let ((label, (ft_ast, _)), _) = case;
                let lab = label.0.clone();
                if let Some(ft) = build_field(ft_ast, parent_fields) {
                    map.insert(lab, ft);
                }
            }
            Some(FieldType::Match {
                discriminant: disc_name.clone(),
                enum_type_name,
                cases: map,
            })
        }
        FieldAST::Enum {
            name,
            signed,
            width,
            default,
            ..
        } => Some(FieldType::Enum {
            name: name.0.clone(),
            signed: *signed,
            width: *width,
            default: default.as_ref().map(|d| d.0.clone()),
        }),
        FieldAST::Int {
            signed,
            width,
            default,
            ..
        } => Some(FieldType::Int {
            signed: *signed,
            width: *width,
            default: default.map(|d| d.0),
        }),
        FieldAST::F32 { default } => Some(FieldType::F32 {
            default: default.map(|d| d.0),
        }),
        FieldAST::F64 { default } => Some(FieldType::F64 {
            default: default.map(|d| d.0),
        }),
        FieldAST::CString { default } => Some(FieldType::CString {
            default: default.as_ref().map(|d| d.0.clone()),
        }),
        FieldAST::HebrewString { default } => Some(FieldType::HebrewString {
            default: default.as_ref().map(|d| d.0.clone()),
        }),
    }
}

pub fn build_definition(ast: &DefinitionAST) -> Option<Definition> {
    match ast {
        DefinitionAST::Struct { name, fields } => {
            let struct_name = name.0.clone();
            let mut built_fields = IndexMap::new();
            for ((label, field), _) in &fields.0 {
                if let Some(ft) = build_field(&field.0, &built_fields) {
                    built_fields.insert(label.0.clone(), ft);
                }
            }
            Some(Definition::Struct {
                name: struct_name,
                fields: built_fields.into_iter().collect(),
            })
        }
        DefinitionAST::Enum { name, entries } => {
            let enum_name = name.0.clone();
            let mut good = Vec::new();
            for entry in &entries.0 {
                let (((label, _ls), value), _fs) = entry;
                good.push((label.clone(), value.0));
            }
            Some(Definition::Enum {
                name: enum_name,
                entries: good,
            })
        }
    }
}

pub fn build_all(defs: &HashMap<String, DefinitionAST>) -> Vec<Definition> {
    let mut built_types = Vec::new();

    for def in defs.values() {
        let maybe_def = build_definition(def);

        if let Some(d) = maybe_def {
            built_types.push(d);
        }
    }
    built_types
}
