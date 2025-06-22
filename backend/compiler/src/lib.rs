pub mod checks;
pub mod definition;
pub mod diagnostics;
pub mod syntax;

use checks::{check_recursion, check_usage};
use chumsky::{input::Input, Parser};
use diagnostics::{make_compile_error, CompileError};
use syntax::Lexer;

pub fn compile(filename: impl Into<String>, src: &str) -> Result<String, CompileError> {
    let mut lexer = Lexer::new(src);
    let tokens = lexer.tokenize();
    let parser = syntax::parser();

    match parser
        .parse(
            tokens
                .as_slice()
                .map((src.len()..src.len()).into(), |(t, s)| (t, s)),
        )
        .into_result()
    {
        Ok(ast) => {
            let mut errs = Vec::new();

            check_recursion(&ast, |msg, name_span| errs.push((msg, name_span, vec![])));
            check_usage(&ast, |msg, span, name_span| {
                errs.push((
                    msg.to_string(),
                    span,
                    vec![("In this struct".into(), name_span)],
                ));
            });

            if errs.is_empty() {
                Ok(serde_json::to_string_pretty(&definition::build_all(&ast)).unwrap())
            } else {
                Err(make_compile_error(filename, src, errs))
            }
        }
        Err(parse_errs) => {
            let errs = parse_errs.into_iter().map(|e| {
                let primary = e.span();
                let mut secondary = Vec::new();
                for (msg, ctx_span) in e.contexts() {
                    secondary.push((msg.to_string(), *ctx_span));
                }
                (e.to_string(), *primary, secondary)
            });
            Err(make_compile_error(filename, src, errs))
        }
    }
}
