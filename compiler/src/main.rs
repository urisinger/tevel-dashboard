use type_expr_compiler::compile;

use std::env;
use std::fs;

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() != 2 {
        eprintln!("Usage: {} <input_file>", args[0]);
        std::process::exit(1);
    }

    let source = fs::read_to_string(&args[1]).unwrap_or_else(|e| {
        eprintln!("Failed to read file: {}", e);
        std::process::exit(1);
    });

    match compile(&source) {
        Ok(json) => {
            let output_path = std::path::Path::new(&args[1]).with_extension("json");
            fs::write(&output_path, json).unwrap_or_else(|e| {
                eprintln!("Failed to write output file: {}", e);
                std::process::exit(1);
            });
        }
        Err(msg) => {
            eprintln!("{}", msg);
            std::process::exit(1);
        }
    }
}
