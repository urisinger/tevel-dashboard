use std::collections::{HashMap, HashSet};

use crate::syntax::{DefinitionAST, FieldAST, Span};

/// Validate a FieldAST for basic type existence (structs/enums).
/// Validate a FieldAST for type existence and exhaustiveness:
/// - Struct: ensures the named struct exists in `built_types` and in `parent_fields`.
/// - Match: ensures discriminant is an enum, enum exists, variants are known, and exhaustiveness.
/// - Array: recurses into element type.
pub fn check_usage(
    types: &HashMap<String, DefinitionAST>,
    mut emit: impl FnMut(String, Span, Span),
) {
    for ast in types.values() {
        match ast {
            DefinitionAST::Struct { parameters, fields, .. } => {
                // Collect parameter names for validation
                let mut param_names = HashSet::new();
                if let Some(params) = parameters {
                    for (param, _span) in &params.0 {
                        if !param_names.insert(param.name.0.clone()) {
                            emit(
                                format!("Duplicate parameter '{}' in struct", param.name.0),
                                param.name.1,
                                ast.name_span(),
                            );
                        }
                    }
                }

                // Check for conflicts between parameter names and field names
                let mut field_names = HashSet::new();
                for ((label, _field), span) in &fields.0 {
                    field_names.insert(label.0.clone());
                    
                    // Check if this field name conflicts with any parameter name
                    if param_names.contains(&label.0) {
                        emit(
                            format!("Field name '{}' conflicts with parameter name", label.0),
                            *span,
                            ast.name_span(),
                        );
                    }
                }

                // First pass: collect all field names and enum types
                let mut field_types = HashMap::new();
                if let Some(params) = parameters {
                    for (param, _span) in &params.0 {
                        field_types.insert(param.name.0.clone(), &param.param_type.0);
                    }
                }
                for ((label, field), span) in &fields.0 {
                    if field_types.insert(label.0.clone(), &field.0).is_some() {
                        emit(
                            format!("Duplicate field '{}' in struct", label.0),
                            *span,
                            ast.name_span(),
                        );
                    }
                }

                // Second pass: validate field usage with complete field and parameter context
                for ((_label, field), _span) in &fields.0 {
                    check_field_usage(&field.0, &field_types, &param_names, types, &mut |e, s| {
                        emit(e, s, ast.name_span())
                    });
                }
            }
            DefinitionAST::Enum { entries, .. } => {
                let mut seen = HashSet::new();
                for entry in &entries.0 {
                    let (((label, _), _), span) = entry;
                    if !seen.insert(label.clone()) {
                        emit(
                            format!("Duplicate enum variant '{}'", label),
                            *span,
                            ast.name_span(),
                        );
                    }
                }
            }
        }
    }
}

fn check_field_usage(
    ast: &FieldAST,
    field_enum_names: &HashMap<String, &FieldAST>,
    param_names: &HashSet<String>,
    built_types: &HashMap<String, DefinitionAST>,
    emit: &mut impl FnMut(String, Span),
) {
    match ast {
        FieldAST::Struct { name, arguments } => {
            if !built_types.contains_key(&name.0) {
                emit(format!("Undefined struct type '{}'", name.0), name.1);
            }
            // TODO: Validate arguments against struct parameters
            if let Some(args) = arguments {
                for (arg, _span) in &args.0 {
                    match arg {
                        crate::syntax::ArgumentExpr::Identifier(identifier) => {
                            // Check if it's a valid field or parameter name
                            let is_field = field_enum_names.contains_key(identifier);
                            let is_param = param_names.contains(identifier);
                            
                            if !is_field && !is_param {
                                emit(format!("Undefined identifier '{}' (not a field or parameter)", identifier), name.1);
                            }
                        }
                        crate::syntax::ArgumentExpr::Literal(_) => {
                            // Literals are always valid
                        }
                    }
                }
            }
        }
        FieldAST::Match {
            discriminant,
            cases,
        } => {
            let disc = &discriminant.0;
            let enum_name = if let Some(disc_ty) = field_enum_names.get(disc) {
                if let FieldAST::Enum { name, .. } = &disc_ty {
                    &name.0
                } else {
                    emit(
                        format!("Field '{}' is not an enum at this use site", disc),
                        discriminant.1,
                    );
                    return;
                }
            } else {
                emit(
                    format!("Field '{}' is not a field of this struct", disc),
                    discriminant.1,
                );
                return;
            };
            match built_types.get(enum_name) {
                Some(DefinitionAST::Enum { entries, .. }) => {
                    let declared: HashSet<&str> = entries
                        .0
                        .iter()
                        .map(|(((label, _), _), _)| label.as_str())
                        .collect();
                    let case_labels: HashSet<&str> = cases
                        .0
                        .iter()
                        .map(|((label, _), _)| label.0.as_str())
                        .collect();
                    for (((label, cspan), _), _) in &cases.0 {
                        if !declared.contains(label.as_str()) {
                            emit(
                                format!("Unknown variant '{}' for enum '{}'", label, disc),
                                *cspan,
                            );
                        }
                    }
                    // Check exhaustiveness
                    let missing: Vec<_> = declared.difference(&case_labels).cloned().collect();
                    if !missing.is_empty() {
                        emit(
                            format!(
                                "Non-exhaustive match on enum '{}', missing: {:?}",
                                disc, missing
                            ),
                            discriminant.1,
                        );
                    }
                }
                Some(_) => {
                    emit(
                        format!("Match discriminant '{}' is not an enum type", disc),
                        discriminant.1,
                    );
                }
                None => {
                    emit(
                        format!("Match on undefined enum '{}'", disc),
                        discriminant.1,
                    );
                }
            }
            for ((_, (ft_ast, _)), _) in &cases.0 {
                check_field_usage(ft_ast, field_enum_names, param_names, built_types, emit);
            }
        }
        FieldAST::Array { element_type, .. } => {
            check_field_usage(&element_type.0, field_enum_names, param_names, built_types, emit);
        }
        _ => {}
    }
}
