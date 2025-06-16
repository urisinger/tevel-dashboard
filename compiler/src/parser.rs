use chumsky::{prelude::*, primitive::select};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::lexer::Token;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Definition {
    Struct {
        name: String,
        fields: Vec<(String, FieldType)>,
    },
    Enum {
        name: String,
        entries: Vec<(String, i64)>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum FieldType {
    Struct {
        name: String,
    },
    Array {
        #[serde(rename = "elementType")]
        element_type: Box<FieldType>,
        length: ArrayLength,
    },
    Match {
        discriminant: String,
        #[serde(rename = "enumTypeName")]
        enum_type_name: String,
        cases: HashMap<String, FieldType>,
    },
    Enum {
        name: String,
        signed: bool,
        width: u8,
        #[serde(skip_serializing_if = "Option::is_none")]
        default: Option<String>,
    },
    Int {
        signed: bool,
        width: u8,
        #[serde(skip_serializing_if = "Option::is_none")]
        default: Option<i64>,
    },
    #[serde(rename = "f32")]
    F32 {
        #[serde(skip_serializing_if = "Option::is_none")]
        default: Option<f32>,
    },
    #[serde(rename = "f64")]
    F64 {
        #[serde(skip_serializing_if = "Option::is_none")]
        default: Option<f64>,
    },
    CString {
        #[serde(skip_serializing_if = "Option::is_none")]
        default: Option<String>,
    },
    HebrewString {
        #[serde(skip_serializing_if = "Option::is_none")]
        default: Option<String>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ArrayLength {
    Static { value: u32 },
    Dynamic { field: String },
}

pub fn parser<'a>(
) -> impl Parser<'a, &'a [Token<'a>], Vec<Definition>, extra::Err<Rich<'a, Token<'a>, SimpleSpan>>>
{
    let ident = select! { Token::Identifier(name) => name.to_string() };
    let int_lit = select! { Token::Integer(num) => num.parse::<i64>().unwrap() };

    let field_type = field_type_parser();

    let field = ident.then_ignore(just(Token::Colon)).then(field_type);

    let struct_def = just(Token::Struct)
        .ignore_then(ident)
        .then_ignore(just(Token::LBrace))
        .then(
            field
                .separated_by(just(Token::Comma))
                .allow_trailing()
                .collect::<Vec<_>>(),
        )
        .then_ignore(just(Token::RBrace))
        .map(|(name, fields)| Definition::Struct { name, fields });

    let enum_entry = ident.then_ignore(just(Token::Equal)).then(int_lit);

    let enum_def = just(Token::Enum)
        .ignore_then(ident)
        .then_ignore(just(Token::LBrace))
        .then(
            enum_entry
                .separated_by(just(Token::Comma))
                .allow_trailing()
                .collect::<Vec<_>>(),
        )
        .then_ignore(just(Token::RBrace))
        .map(|(name, entries)| Definition::Enum { name, entries });

    struct_def.or(enum_def).repeated().collect()
}

fn field_type_parser<'a>(
) -> impl Parser<'a, &'a [Token<'a>], FieldType, extra::Err<Rich<'a, Token<'a>, SimpleSpan>>> {
    recursive(|field_type| {
        let ident = select! { Token::Identifier(name) => name.to_string() };
        let int_lit = select! { Token::Integer(s) => s.parse::<i64>().unwrap() };

        let default_int = just(Token::Equal).ignore_then(int_lit).or_not();
        let default_float = just(Token::Equal)
            .ignore_then(
                select! { Token::Integer(s) | Token::Float(s) => s.parse::<f64>().unwrap() },
            )
            .or_not();
        let default_string = just(Token::Equal)
            .ignore_then(select! { Token::StringLiteral(s) => s.to_string() })
            .or_not();
        let default_enum = just(Token::Equal).ignore_then(ident).or_not();

        let int_type = select! {
            Token::IntLit { signed, width } => (signed, width)
        }
        .then(default_int)
        .map(|((signed, width), default)| FieldType::Int {
            signed,
            width,
            default,
        });

        let float_type = select! {
            Token::F32 => (|d| FieldType::F32 { default: d.map(|f| f as f32) }) as fn(Option<f64>) -> FieldType,
            Token::F64 => |d| FieldType::F64 { default: d },
        }
        .then(default_float)
        .map(|(ctor, def)| ctor(def));

        let string_type = select! {
            Token::CString => (|d| FieldType::CString { default: d })  as fn(Option<String>) -> FieldType,
            Token::HebrewString => |d| FieldType::HebrewString { default: d },
        }
        .then(default_string)
        .map(|(ctor, def)| ctor(def));

        let enum_type = {
            let id = ident.clone();
            id.then_ignore(just(Token::LParen))
                .then(select! { Token::IntLit { signed, width } => (signed, width) })
                .then_ignore(just(Token::RParen))
                .map(|(name, (signed, width))| (name, signed, width))
                .then(default_enum)
                .map(|((name, signed, width), default)| FieldType::Enum {
                    name,
                    signed,
                    width,
                    default,
                })
        };

        let struct_type = ident.clone().map(|name| FieldType::Struct { name });

        // array types
        let array_type = just(Token::LBracket)
            .ignore_then(field_type.clone())
            .then_ignore(just(Token::Semicolon))
            .then(
                int_lit
                    .map(|v| ArrayLength::Static { value: v as u32 })
                    .or(ident.clone().map(|f| ArrayLength::Dynamic { field: f })),
            )
            .then_ignore(just(Token::RBracket))
            .map(|(elem, len)| FieldType::Array {
                element_type: Box::new(elem),
                length: len,
            });

        let match_case = ident
            .clone()
            .then_ignore(just(Token::FatArrow))
            .then(field_type.clone());
        let match_type = just(Token::Match)
            .ignore_then(ident.clone())
            .then_ignore(just(Token::Colon))
            .then(ident.clone())
            .then_ignore(just(Token::LBrace))
            .then(
                match_case
                    .separated_by(just(Token::Comma))
                    .allow_trailing()
                    .collect::<Vec<_>>(),
            )
            .then_ignore(just(Token::RBrace))
            .map(|((discriminant, enum_name), cases)| {
                let mut map = HashMap::new();
                for (tag, ty) in cases {
                    map.insert(tag, ty);
                }
                FieldType::Match {
                    discriminant,
                    enum_type_name: enum_name,
                    cases: map,
                }
            });

        choice((
            match_type,
            enum_type,
            int_type,
            float_type,
            string_type,
            struct_type,
            array_type,
        ))
    })
}
