pub mod definition;
pub mod lexer;
pub mod parser;

use ariadne::{sources, Color, Config, IndexType, Label, Report, ReportKind};
use chumsky::{input::Input, Parser};
use lexer::Lexer;

pub fn compile(src: &str) -> Option<String> {
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
        Ok(ast) => Some(serde_json::to_string_pretty(&ast).expect("Serialization error")),
        Err(errs) => {
            let filename = "<input>".to_string();
            for e in errs.into_iter().map(|e| e.map_token(|t| t.to_string())) {
                let span = e.span().into_range();
                let mut rep = Report::build(ReportKind::Error, (filename.clone(), span.clone()))
                    .with_config(Config::new().with_index_type(IndexType::Byte))
                    .with_message(e.to_string())
                    .with_label(
                        Label::new((filename.clone(), span))
                            .with_message(e.reason().to_string())
                            .with_color(Color::Red),
                    );
                for (ctx_msg, ctx_span) in e.contexts() {
                    rep = rep.with_label(
                        Label::new((filename.clone(), ctx_span.into_range()))
                            .with_message(ctx_msg)
                            .with_color(Color::Yellow),
                    );
                }
                rep.finish()
                    .print(sources([(filename.clone(), src.to_string())]))
                    .unwrap();
            }
            None
        }
    }
}
