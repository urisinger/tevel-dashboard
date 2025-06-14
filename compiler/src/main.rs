use struct_expr_compiler::parser;
use struct_expr_compiler::tokenizer;

use chumsky::Parser;
use std::env;
use std::fs;
use std::path::Path;
use tokenizer::Lexer;

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() != 2 {
        eprintln!("Usage: {} <input_file>", args[0]);
        std::process::exit(1);
    }
    let input_path = &args[1];

    let source = fs::read_to_string(input_path).unwrap_or_else(|e| {
        eprintln!("Failed to read file: {}", e);
        std::process::exit(1);
    });

    let mut lexer = Lexer::new(&source);
    let tokens = lexer.tokenize();

    let parser = parser::parser();

    match parser.parse(tokens.as_slice()).into_result() {
        Ok(ast) => {
            let json = serde_json::to_string_pretty(&ast).expect("Failed to serialize to JSON");

            // Output path: input.ext → input.json
            let output_path = Path::new(input_path).with_extension("json");

            fs::write(&output_path, json).expect("Failed to write output file");
            println!("✅ Compiled to: {}", output_path.display());
        }
        Err(errors) => {
            eprintln!("❌ Parsing failed:");
            for err in errors {
                eprintln!("{:?}", err);
            }
            std::process::exit(1);
        }
    }
}
