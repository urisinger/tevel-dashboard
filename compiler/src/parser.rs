use chumsky::prelude::*;
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
        entries: Vec<(String, usize)>,
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
    Enum {
        name: String,
        base: IntegerBase,
    },
    Match {
        discriminant: String,
        #[serde(rename = "enumTypeName")]
        enum_type_name: String,
        cases: HashMap<String, FieldType>,
    },
    #[serde(rename = "i8")]
    I8,
    #[serde(rename = "i16")]
    I16,
    #[serde(rename = "i32")]
    I32,
    #[serde(rename = "i64")]
    I64,
    #[serde(rename = "f32")]
    F32,
    #[serde(rename = "f64")]
    F64,
    CString,
    HebrewString,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ArrayLength {
    Static { value: usize },
    Dynamic { field: String },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IntegerBase {
    I8,
    I16,
    I32,
    I64,
}

pub fn parser<'a>()
-> impl Parser<'a, &'a [Token<'a>], Vec<Definition>, extra::Err<Rich<'a, Token<'a>, SimpleSpan>>> {
    let ident = select! { Token::Identifier(name) => name.to_string() };
    let int_lit = select! { Token::Integer(num) => num.parse::<usize>().unwrap() };

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

fn field_type_parser<'a>()
-> impl Parser<'a, &'a [Token<'a>], FieldType, extra::Err<Rich<'a, Token<'a>, SimpleSpan>>> {
    recursive(|field_type| {
        let ident = select! {
            Token::Identifier(name) => name.to_string(),
        };

        let int_lit = select! {
            Token::Integer(num_str) => num_str.parse::<usize>().unwrap()
        };

        let int_base = select! {
            Token::I8 => IntegerBase::I8,
            Token::I16 => IntegerBase::I16,
            Token::I32 => IntegerBase::I32,
            Token::I64 => IntegerBase::I64,
        };

        let basic_type = select! {
            Token::I8 => FieldType::I8,
            Token::I16 => FieldType::I16,
            Token::I32 => FieldType::I32,
            Token::I64 => FieldType::I64,
            Token::F32 => FieldType::F32,
            Token::F64 => FieldType::F64,
            Token::CString => FieldType::CString,
            Token::HebrewString => FieldType::HebrewString,
        };

        let struct_type = ident.map(|name| FieldType::Struct { name });

        let enum_type = ident
            .then_ignore(just(Token::LParen))
            .then(int_base)
            .then_ignore(just(Token::RParen))
            .map(|(name, base)| FieldType::Enum { name, base });

        let array_length = int_lit
            .map(|value| ArrayLength::Static { value })
            .or(ident.map(|field| ArrayLength::Dynamic { field }));

        let array_type = just(Token::LBracket)
            .ignore_then(field_type.clone())
            .then_ignore(just(Token::Semicolon))
            .then(array_length)
            .then_ignore(just(Token::RBracket))
            .map(|(element_type, length)| FieldType::Array {
                element_type: Box::new(element_type),
                length,
            });

        let match_case = ident
            .then_ignore(just(Token::FatArrow))
            .then(field_type.clone());

        let match_type = just(Token::Match)
            .ignore_then(ident)
            .then_ignore(just(Token::Colon))
            .then(ident) // enum type name
            .then_ignore(just(Token::LBrace))
            .then(
                match_case
                    .separated_by(just(Token::Comma))
                    .allow_trailing()
                    .collect::<Vec<_>>(),
            )
            .then_ignore(just(Token::RBrace))
            .map(|((discriminant, enum_type_name), cases)| {
                let mut map = HashMap::new();
                for (tag, typ) in cases {
                    map.insert(tag, typ);
                }
                FieldType::Match {
                    discriminant,
                    enum_type_name,
                    cases: map,
                }
            });

        choice((match_type, enum_type, struct_type, array_type, basic_type))
    })
}
