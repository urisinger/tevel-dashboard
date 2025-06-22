use std::collections::HashMap;

use chumsky::{input::ValueInput, prelude::*};

use crate::definition::ArrayLength;

use super::{lexer::Token, DefinitionAST, FieldAST, Span};

pub fn parser<'tokens, 'src: 'tokens, I>() -> impl Parser<
    'tokens,
    I,
    HashMap<String, DefinitionAST>,
    extra::Err<Rich<'tokens, Token<'src>, Span>>,
> + Clone
where
    I: ValueInput<'tokens, Token = Token<'src>, Span = Span>,
{
    let ident = select! { Token::Identifier(name) => name.to_string() }
        .map_with(|ident, e| (ident, e.span()))
        .labelled("identifier");
    let int_lit = select! { Token::Integer(num) => num.parse::<i64>().unwrap() }
        .map_with(|ident, e| (ident, e.span()))
        .labelled("integer literal");

    let field_type = type_parser()
        .labelled("type")
        .map_with(|field, e| (field, e.span()));

    let field = ident
        .then_ignore(just(Token::Colon))
        .then(field_type)
        .map_with(|field, e| (field, e.span()));

    let main_body = field
        .separated_by(just(Token::Comma))
        .allow_trailing()
        .collect::<Vec<_>>()
        .map_with(|fields, e| (fields, e.span()));

    let closing_brace = choice((
        just(Token::RBrace).to(true),
        one_of([Token::Enum, Token::Struct]).rewind().to(false),
        end().to(false),
    ));

    let main_body_closed = main_body.then(closing_brace);

    let struct_body = just(Token::LBrace)
        .ignore_then(main_body_closed.clone())
        .recover_with(via_parser(main_body_closed))
        .recover_with(via_parser(nested_delimiters(
            Token::LBrace,
            Token::RBrace,
            [
                (Token::LParen, Token::RParen),
                (Token::LBracket, Token::RBracket),
            ],
            |span| ((Vec::new(), span), true),
        )));

    let struct_def = just(Token::Struct)
        .ignore_then(ident)
        .then(struct_body)
        .boxed()
        .validate(|(name, (fields, saw_close)), e, emitter| {
            if !saw_close {
                emitter.emit(Rich::custom(e.span(), "unclosed struct body"));
            }
            (name, fields)
        })
        .map(|(name, fields)| (name.0.clone(), DefinitionAST::Struct { name, fields }));

    let enum_entry = ident
        .then_ignore(just(Token::Equal))
        .then(int_lit)
        .map_with(|ident, e| (ident, e.span()));

    let enum_body = enum_entry
        .separated_by(just(Token::Comma))
        .allow_trailing()
        .collect::<Vec<_>>()
        .delimited_by(just(Token::LBrace), just(Token::RBrace))
        .boxed()
        .recover_with(via_parser(nested_delimiters(
            Token::LBrace,
            Token::RBrace,
            [
                (Token::LParen, Token::RParen),
                (Token::LBracket, Token::RBracket),
            ],
            |_| Vec::new(),
        )))
        .map_with(|ident, e| (ident, e.span()));

    let enum_def = just(Token::Enum)
        .ignore_then(ident)
        .boxed()
        .then(enum_body)
        .map(|(name, entries)| (name.0.clone(), DefinitionAST::Enum { name, entries }));

    struct_def
        .or(enum_def)
        .boxed()
        .repeated()
        .collect::<HashMap<_, _>>()
}

fn type_parser<'tokens, 'src: 'tokens, I>(
) -> impl Parser<'tokens, I, FieldAST, extra::Err<Rich<'tokens, Token<'src>, Span>>> + Clone
where
    I: ValueInput<'tokens, Token = Token<'src>, Span = Span>,
{
    recursive(|field_type| {
        let field_type = field_type
            .map_with(|int, e| (int, e.span()))
            .labelled("type");
        let ident = select! { Token::Identifier(name) => name.to_string() }
            .map_with(|int, e| (int, e.span()))
            .labelled("identifier");
        let int_lit = select! { Token::Integer(s) => s.parse::<i64>().unwrap() }
            .map_with(|int, e| (int, e.span()))
            .labelled("int literal");
        let float_lit = select! { Token::Integer(s) | Token::Float(s) => s.parse::<f64>().unwrap()}
            .map_with(|int, e| (int, e.span()))
            .labelled("float literal");
        let string_lit = select! { Token::StringLiteral(s) => s.to_string() }
            .map_with(|int, e| (int, e.span()))
            .labelled("string literal");

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
        .map_with(|int, e| (int, e.span()))
        .then(default_int)
        .map(|(((signed, width), span), default)| FieldAST::Int {
            signed,
            span,
            width,
            default,
        });

        let float_type = select! {
            Token::F32 => (|d| FieldAST::F32 { default: d }) as fn(_) -> _,
            Token::F64 => |d| FieldAST::F64 { default: d },
        }
        .then(default_float)
        .map(|(ctor, def)| ctor(def));

        let string_type = select! {
            Token::CString => (|d| FieldAST::CString { default: d })  as fn(_) -> _,
            Token::HebrewString => |d| FieldAST::HebrewString { default: d },
        }
        .then(default_string)
        .map(|(ctor, def)| ctor(def));

        let enum_type = {
            ident
                .then(
                    select! { Token::IntLit { signed, width } => (signed, width) }
                        .delimited_by(just(Token::LParen), just(Token::RParen))
                        .map_with(|int, e| (int, e.span())),
                )
                .then(default_enum)
                .boxed()
                .map(
                    |((name, ((signed, width), int_span)), default)| FieldAST::Enum {
                        name,
                        signed,
                        width,
                        int_span,
                        default,
                    },
                )
        };

        let struct_type = ident.map(|name| FieldAST::Struct { name });

        let array_type = field_type
            .clone()
            .then_ignore(just(Token::Semicolon))
            .then(
                int_lit
                    .map(|v| ArrayLength::Static { value: v.0 as u32 })
                    .or(ident.map(|f| ArrayLength::Dynamic { field: f.0 }))
                    .map_with(|len, e| (len, e.span())),
            )
            .map(|(elem, len)| FieldAST::Array {
                element_type: Box::new(elem),
                length: len,
            })
            .boxed()
            .delimited_by(just(Token::LBracket), just(Token::RBracket));

        let match_case = ident
            .then_ignore(just(Token::FatArrow))
            .then(field_type.clone())
            .map_with(|cases, e| (cases, e.span()));
        let match_type = just(Token::Match)
            .ignore_then(ident)
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
                    )))
                    .boxed()
                    .map_with(|cases, e| (cases, e.span())),
            )
            .map(|(discriminant, cases)| FieldAST::Match {
                discriminant,
                cases,
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
