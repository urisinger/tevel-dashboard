pub mod lexer;
pub mod parser;

use chumsky::Parser;
use lexer::Lexer;

pub fn compile(source: &str) -> Result<String, String> {
    let mut lexer = Lexer::new(source);
    let tokens = lexer.tokenize();

    let parser = parser::parser();

    match parser.parse(tokens.as_slice()).into_result() {
        Ok(ast) => {
            serde_json::to_string_pretty(&ast).map_err(|e| format!("Serialization error: {}", e))
        }
        Err(errors) => {
            let mut message = String::from("Parsing failed:\n");
            for err in errors {
                message.push_str(&format!("{:?}\n", err));
            }
            Err(message)
        }
    }
}
