use std::collections::{HashMap, HashSet};

use crate::syntax::{DefinitionAST, FieldAST, Span};

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
