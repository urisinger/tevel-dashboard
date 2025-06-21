use chumsky::span::SimpleSpan;

use crate::definition::ArrayLength;

mod lexer;
mod parser;

pub use lexer::{Lexer, Token};
pub use parser::parser;

pub type Span = SimpleSpan;
pub type Spanned<T> = (T, Span);

// All fields are spanned to allow for better error messages
pub enum DefinitionAST {
    Struct {
        name: Spanned<String>,
        #[allow(clippy::type_complexity)]
        fields: Spanned<Vec<Spanned<(Spanned<String>, Spanned<FieldAST>)>>>,
    },
    Enum {
        name: Spanned<String>,
        #[allow(clippy::type_complexity)]
        entries: Spanned<Vec<Spanned<(Spanned<String>, Spanned<i64>)>>>,
    },
}

impl DefinitionAST {
    pub fn name(&self) -> &str {
        match self {
            Self::Enum { name, .. } | Self::Struct { name, .. } => &name.0,
        }
    }

    pub fn name_span(&self) -> Span {
        match self {
            Self::Enum { name, .. } | Self::Struct { name, .. } => name.1,
        }
    }
}

#[derive(Debug)]
pub enum FieldAST {
    Struct {
        name: Spanned<String>,
    },
    Array {
        element_type: Box<Spanned<FieldAST>>,
        length: Spanned<ArrayLength>,
    },
    Match {
        discriminant: Spanned<String>,
        #[allow(clippy::type_complexity)]
        cases: Spanned<Vec<Spanned<(Spanned<String>, Spanned<FieldAST>)>>>,
    },
    Enum {
        name: Spanned<String>,
        int_span: Span,
        signed: bool,
        width: u8,
        default: Option<Spanned<String>>,
    },
    Int {
        span: Span,
        signed: bool,
        width: u8,
        default: Option<Spanned<i64>>,
    },
    F32 {
        default: Option<Spanned<f64>>,
    },
    F64 {
        default: Option<Spanned<f64>>,
    },
    CString {
        default: Option<Spanned<String>>,
    },
    HebrewString {
        default: Option<Spanned<String>>,
    },
}
