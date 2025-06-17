use chumsky::{input::ValueInput, prelude::*};
use std::collections::HashMap;

use crate::{
    definition::{ArrayLength, Definition, FieldType},
    lexer::{Span, Token},
};

pub fn parser<'tokens, 'src: 'tokens, I>(
) -> impl Parser<'tokens, I, Vec<Definition>, extra::Err<Rich<'tokens, Token<'src>, Span>>> + Clone
where
    I: ValueInput<'tokens, Token = Token<'src>, Span = Span>,
{
    let ident = select! { Token::Identifier(name) => name.to_string() }.labelled("identifier");
    let int_lit =
        select! { Token::Integer(num) => num.parse::<i64>().unwrap() }.labelled("integer literal");

    let field_type = type_parser().labelled("type");

    let field = ident.then_ignore(just(Token::Colon)).then(field_type);

    let struct_body = field
        .separated_by(just(Token::Comma))
        .allow_trailing()
        .collect::<Vec<_>>()
        .delimited_by(just(Token::LBrace), just(Token::RBrace))
        .recover_with(via_parser(nested_delimiters(
            Token::LBrace,
            Token::RBrace,
            [
                (Token::LParen, Token::RParen),
                (Token::LBracket, Token::RBracket),
            ],
            |_| Vec::new(),
        )));

    let struct_def = just(Token::Struct)
        .ignore_then(ident)
        .then(struct_body)
        .map(|(name, fields)| Definition::Struct { name, fields });

    let enum_entry = ident.then_ignore(just(Token::Equal)).then(int_lit);

    let enum_body = enum_entry
        .separated_by(just(Token::Comma))
        .allow_trailing()
        .collect::<Vec<_>>()
        .delimited_by(just(Token::LBrace), just(Token::RBrace))
        .recover_with(via_parser(nested_delimiters(
            Token::LBrace,
            Token::RBrace,
            [
                (Token::LParen, Token::RParen),
                (Token::LBracket, Token::RBracket),
            ],
            |_| Vec::new(),
        )));

    let enum_def = just(Token::Enum)
        .ignore_then(ident)
        .then(enum_body)
        .map(|(name, entries)| Definition::Enum { name, entries });

    struct_def.or(enum_def).repeated().collect::<Vec<_>>()
}

fn type_parser<'tokens, 'src: 'tokens, I>(
) -> impl Parser<'tokens, I, FieldType, extra::Err<Rich<'tokens, Token<'src>, Span>>> + Clone
where
    I: ValueInput<'tokens, Token = Token<'src>, Span = Span>,
{
    recursive(|field_type| {
        let field_type = field_type.labelled("type");
        let ident = select! { Token::Identifier(name) => name.to_string() }.labelled("identifier");
        let int_lit =
            select! { Token::Integer(s) => s.parse::<i64>().unwrap() }.labelled("int literal");
        let float_lit = select! { Token::Integer(s) | Token::Float(s) => s.parse::<f64>().unwrap()}
            .labelled("float literal");
        let string_lit =
            select! { Token::StringLiteral(s) => s.to_string() }.labelled("string literal");

        let default_int = just(Token::Equal).ignore_then(int_lit).or_not();
        let default_float = just(Token::Equal).ignore_then(float_lit).or_not();
        let default_string = just(Token::Equal).ignore_then(string_lit).or_not();
        let default_enum = just(Token::Equal)
            .ignore_then(ident)
            .or_not()
            .labelled("default enum");

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
            ident
                .then(
                    select! { Token::IntLit { signed, width } => (signed, width) }
                        .delimited_by(just(Token::LParen), just(Token::RParen)),
                )
                .map(|(name, (signed, width))| (name, signed, width))
                .then(default_enum)
                .map(|((name, signed, width), default)| FieldType::Enum {
                    name,
                    signed,
                    width,
                    default,
                })
        };

        let struct_type = ident.map(|name| FieldType::Struct { name });

        let array_type = field_type
            .clone()
            .then_ignore(just(Token::Semicolon))
            .then(
                int_lit
                    .map(|v| ArrayLength::Static { value: v as u32 })
                    .or(ident.map(|f| ArrayLength::Dynamic { field: f })),
            )
            .map(|(elem, len)| FieldType::Array {
                element_type: Box::new(elem),
                length: len,
            })
            .delimited_by(just(Token::LBracket), just(Token::RBracket));

        let match_case = ident
            .then_ignore(just(Token::FatArrow))
            .then(field_type.clone());
        let match_type = just(Token::Match)
            .ignore_then(ident)
            .then_ignore(just(Token::Colon))
            .then(ident)
            .then(
                match_case
                    .separated_by(just(Token::Comma))
                    .allow_trailing()
                    .collect::<Vec<_>>()
                    .delimited_by(just(Token::LBrace), just(Token::RBrace))
                    .recover_with(via_parser(nested_delimiters(
                        Token::LBrace,
                        Token::RBrace,
                        [
                            (Token::LParen, Token::RParen),
                            (Token::LBracket, Token::RBracket),
                        ],
                        |_| Vec::new(),
                    ))),
            )
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
