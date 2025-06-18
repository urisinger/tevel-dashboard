use std::collections::{HashMap, HashSet};

use crate::{
    lexer::Span,
    parser::{DefinitionAST, FieldAST},
};

/// Validate a FieldAST for basic type existence (structs/enums).
/// Validate a FieldAST for type existence and exhaustiveness:
/// - Struct: ensures the named struct exists in `built_types` and in `parent_fields`.
/// - Match: ensures discriminant is an enum, enum exists, variants are known, and exhaustiveness.
/// - Array: recurses into element type.
pub fn check_definitions(
    types: &HashMap<String, DefinitionAST>,
    mut emit: impl FnMut(String, Span, Span),
) {
    for ast in types.values() {
        match ast {
            DefinitionAST::Struct { fields, .. } => {
                let mut enum_names = HashMap::new();
                for ((label, field), span) in &fields.0 {
                    let enum_name = if let FieldAST::Enum { name, .. } = &field.0 {
                        Some(name.0.clone())
                    } else {
                        None
                    };

                    if enum_names.insert(label.0.clone(), enum_name).is_some() {
                        emit(
                            format!("Duplicate field '{}' in struct", label.0),
                            *span,
                            ast.name_span(),
                        );
                    }

                    check_field(&field.0, &enum_names, types, &mut |e, s| {
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

fn check_field(
    ast: &FieldAST,
    field_enum_names: &HashMap<String, Option<String>>,
    built_types: &HashMap<String, DefinitionAST>,
    emit: &mut impl FnMut(String, Span),
) {
    match ast {
        FieldAST::Struct { name } => {
            // Check that struct exists in definitions
            if !built_types.contains_key(&name.0) {
                emit(format!("Undefined struct type '{}'", name.0), name.1);
            }
        }
        FieldAST::Match {
            discriminant,
            cases,
        } => {
            let disc = &discriminant.0;
            let enum_name = if let Some(disc_ty) = field_enum_names.get(disc) {
                if let Some(name) = disc_ty {
                    name
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
            // Recurse into each case's field AST
            for ((_, (ft_ast, _)), _) in &cases.0 {
                check_field(ft_ast, field_enum_names, built_types, emit);
            }
        }
        FieldAST::Array { element_type, .. } => {
            check_field(&element_type.0, field_enum_names, built_types, emit);
        }
        _ => {}
    }
}

pub fn check_recursion(
    built_types: &HashMap<String, DefinitionAST>,
    mut emit: impl FnMut(String, Span),
) {
    fn dfs<'a>(
        node: &'a str,
        built_types: &'a HashMap<String, DefinitionAST>,
        stack: &mut Vec<&'a str>,
        visited: &mut HashSet<&'a str>,
        emit: &mut impl FnMut(String),
    ) {
        if stack.contains(&node) {
            let cycle = stack
                .iter()
                .chain(std::iter::once(&node))
                .cloned()
                .collect::<Vec<_>>();
            let path = cycle.join(" -> ");
            emit(format!("Recursive struct definition detected: {}", path));
            return;
        }
        if visited.contains(node) {
            return;
        }
        visited.insert(node);
        stack.push(node);
        if let Some(neighbors) = get_referenced_structs(built_types, node) {
            for nbr in neighbors {
                dfs(nbr, built_types, stack, visited, emit);
            }
        }
        stack.pop();
    }

    let mut visited = HashSet::new();
    let mut stack = Vec::new();
    for (name, def) in built_types {
        dfs(name, built_types, &mut stack, &mut visited, &mut |e| {
            emit(e, def.name_span())
        });
    }
}

fn get_referenced_structs<'a>(
    built_types: &'a HashMap<String, DefinitionAST>,
    struct_name: &'a str,
) -> Option<impl Iterator<Item = &'a str> + 'a> {
    built_types.get(struct_name).and_then(|def| {
        if let DefinitionAST::Struct { fields, .. } = def {
            Some(
                fields
                    .0
                    .iter()
                    .filter_map(move |((_, (field_type, _)), _)| {
                        if let FieldAST::Struct { name } = field_type {
                            Some(name.0.as_str())
                        } else {
                            None
                        }
                    }),
            )
        } else {
            None
        }
    })
}
