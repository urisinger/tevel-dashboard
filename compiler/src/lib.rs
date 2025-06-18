pub mod checks;
pub mod definition;
pub mod lexer;
pub mod parser;
pub mod writer;

use checks::{check_definitions, check_recursion};
use chumsky::{input::Input, Parser};
use lexer::{Lexer, Span};

use codespan_reporting::{
    diagnostic::{Diagnostic, Label},
    files::SimpleFiles,
};

pub type FileId = usize;
pub struct CompileError {
    pub files: SimpleFiles<String, String>,
    pub diagnostics: Vec<Diagnostic<FileId>>,
}

pub fn compile(filename: impl Into<String>, src: &str) -> Result<String, CompileError> {
    let mut lexer = Lexer::new(src);
    let tokens = lexer.tokenize();
    let parser = parser::parser();

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
            check_definitions(&ast, |msg, span, name_span| {
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

pub fn make_compile_error(
    filename: impl Into<String>,
    src: &str,
    errs: impl IntoIterator<Item = (String, Span, Vec<(String, Span)>)>,
) -> CompileError {
    let mut files = SimpleFiles::new();
    let file_id = files.add(filename.into(), src.to_string());

    let diagnostics = errs
        .into_iter()
        .map(|(msg, primary, secondaries)| make_diagnostic(file_id, msg, primary, &secondaries))
        .collect();

    CompileError { files, diagnostics }
}

pub fn make_diagnostic(
    file_id: usize,
    msg: impl Into<String>,
    primary: Span,
    secondaries: &[(String, Span)],
) -> Diagnostic<FileId> {
    let msg_str = msg.into();
    let mut labels = vec![Label::primary(file_id, primary).with_message(msg_str.clone())];
    for (smsg, span) in secondaries {
        labels.push(Label::secondary(file_id, *span).with_message(smsg.clone()));
    }
    Diagnostic::error()
        .with_message(msg_str)
        .with_labels(labels)
}
