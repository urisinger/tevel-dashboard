use std::fmt;

use chumsky::span::SimpleSpan;

#[derive(Debug, Clone, PartialEq)]
pub enum Token<'a> {
    Identifier(&'a str),
    Integer(&'a str),
    Float(&'a str),
    StringLiteral(String),
    IntLit { signed: bool, width: u8 },
    F32,
    F64,
    Match,
    Enum,
    Struct,
    CString,
    HebrewString,

    // Symbols
    LBrace,
    RBrace,
    LBracket,
    RBracket,
    LParen,
    RParen,
    Colon,
    Comma,
    Semicolon,
    Equal,
    FatArrow,

    Unknown(char),
}

impl<'a> fmt::Display for Token<'a> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Token::Identifier(s) => write!(f, "{}", s),
            Token::Integer(s) => write!(f, "{}", s),
            Token::Float(s) => write!(f, "{}", s),
            Token::StringLiteral(s) => write!(f, "{}", s),
            Token::IntLit { signed, width } => {
                write!(f, "{}{}", if *signed { "i" } else { "u" }, width)
            }
            Token::F32 => write!(f, "f32"),
            Token::F64 => write!(f, "f64"),
            Token::Match => write!(f, "match"),
            Token::Enum => write!(f, "enum"),
            Token::Struct => write!(f, "struct"),
            Token::CString => write!(f, "CString"),
            Token::HebrewString => write!(f, "HebrewString"),
            Token::LBrace => write!(f, "{{"),
            Token::RBrace => write!(f, "}}"),
            Token::LBracket => write!(f, "["),
            Token::RBracket => write!(f, "]"),
            Token::LParen => write!(f, "("),
            Token::RParen => write!(f, ")"),
            Token::Colon => write!(f, ":"),
            Token::Comma => write!(f, ","),
            Token::Semicolon => write!(f, ";"),
            Token::Equal => write!(f, "="),
            Token::FatArrow => write!(f, "=>"),
            Token::Unknown(c) => write!(f, "{}", c),
        }
    }
}

pub type Span = SimpleSpan;
pub type Spanned<T> = (T, Span);

pub struct Lexer<'a> {
    input: &'a str,
    pos: usize,
}

impl<'a> Lexer<'a> {
    pub fn new(input: &'a str) -> Self {
        Lexer { input, pos: 0 }
    }

    fn peek(&self) -> Option<char> {
        self.input[self.pos..].chars().next()
    }

    fn bump(&mut self) -> Option<char> {
        if let Some(c) = self.peek() {
            self.pos += c.len_utf8();
            Some(c)
        } else {
            None
        }
    }

    fn consume_while<F>(&mut self, cond: F) -> &'a str
    where
        F: Fn(char) -> bool,
    {
        let start = self.pos;
        while let Some(c) = self.peek() {
            if cond(c) {
                self.bump();
            } else {
                break;
            }
        }
        &self.input[start..self.pos]
    }

    fn lex_number(&mut self, start_pos: usize) -> Option<Token<'a>> {
        let mut has_dot = false;

        let _int = self.consume_while(|c| c.is_ascii_digit());

        if self.peek() == Some('.') {
            has_dot = true;
            self.bump();
            let _frac = self.consume_while(|c| c.is_ascii_digit());
        }

        if matches!(self.peek(), Some('e' | 'E')) {
            has_dot = true;
            self.bump();
            if matches!(self.peek(), Some('+') | Some('-')) {
                self.bump();
            }
            let _exp = self.consume_while(|c| c.is_ascii_digit());
        }

        if self.pos == start_pos {
            return None;
        }

        let slice = &self.input[start_pos..self.pos];
        Some(if has_dot {
            Token::Float(slice)
        } else {
            Token::Integer(slice)
        })
    }

    fn skip_whitespace(&mut self) {
        self.consume_while(|c| c.is_whitespace());
    }

    fn skip_comment(&mut self) {
        if self.peek() == Some('/') {
            let mut chars = self.input[self.pos..].chars();
            chars.next();
            if chars.next() == Some('/') {
                self.bump();
                self.bump();
                self.consume_while(|c| c != '\n');
            }
        }
    }

    fn skip_trivia(&mut self) {
        loop {
            let before = self.pos;
            self.skip_whitespace();
            self.skip_comment();
            if self.pos == before {
                break;
            }
        }
    }

    pub fn next_token(&mut self) -> Option<Spanned<Token<'a>>> {
        self.skip_trivia();
        let start = self.pos;
        let tok = match self.peek()? {
            //–– Number or negative number
            '-' => {
                // peek ahead – if next is digit or “.digit” → treat as number:
                if self.input[self.pos + 1..]
                    .chars()
                    .next()
                    .is_some_and(|c| c.is_ascii_digit() || c == '.')
                {
                    self.bump(); // consume '-'
                    self.lex_number(start)
                } else {
                    self.bump();
                    Some(Token::Unknown('-'))
                }
            }

            '0'..='9' | '.' => self.lex_number(start),
            '"' => {
                self.bump();
                let mut content = String::new();
                while let Some(c) = self.peek() {
                    if c == '"' {
                        break;
                    }
                    if c == '\\' {
                        self.bump();
                        if let Some(esc) = self.peek() {
                            let escaped_char = match esc {
                                'n' => '\n',
                                't' => '\t',
                                'r' => '\r',
                                '\\' => '\\',
                                '"' => '"',
                                other => other,
                            };
                            content.push(escaped_char);
                            self.bump();
                            continue;
                        } else {
                            break;
                        }
                    }
                    content.push(c);
                    self.bump();
                }
                if self.peek() == Some('"') {
                    self.bump();
                }
                Some(Token::StringLiteral(content))
            }
            c if c.is_ascii_alphabetic() || c == '_' => {
                let ident = self.consume_while(|c| c.is_ascii_alphanumeric() || c == '_');

                if let Some((prefix, digits)) = ident.split_at(1).into() {
                    if (prefix == "i" || prefix == "u")
                        && !digits.is_empty()
                        && digits.chars().all(|d| d.is_ascii_digit())
                    {
                        if let Ok(n) = digits.parse::<u8>() {
                            if (1..=64).contains(&n) {
                                return Some((
                                    Token::IntLit {
                                        signed: prefix == "i",
                                        width: n,
                                    },
                                    (start..self.pos).into(),
                                ));
                            }
                        }
                    }
                }

                let tok = match ident {
                    "match" => Token::Match,
                    "enum" => Token::Enum,
                    "struct" => Token::Struct,
                    "CString" => Token::CString,
                    "HebrewString" => Token::HebrewString,
                    "f32" => Token::F32,
                    "f64" => Token::F64,
                    _ => Token::Identifier(ident),
                };
                Some(tok)
            }
            c if c.is_ascii_digit() => {
                let num = self.consume_while(|c| c.is_ascii_digit());
                Some(Token::Integer(num))
            }
            c => {
                self.bump();
                Some(match c {
                    '=' => {
                        if self.peek() == Some('>') {
                            self.bump();
                            Token::FatArrow
                        } else {
                            Token::Equal
                        }
                    }
                    '{' => Token::LBrace,
                    '}' => Token::RBrace,
                    '[' => Token::LBracket,
                    ']' => Token::RBracket,
                    '(' => Token::LParen,
                    ')' => Token::RParen,
                    ':' => Token::Colon,
                    ',' => Token::Comma,
                    ';' => Token::Semicolon,
                    _ => Token::Unknown(c),
                })
            }
        };

        tok.map(|tok| (tok, (start..self.pos).into()))
    }

    pub fn tokenize(&mut self) -> Vec<Spanned<Token<'a>>> {
        let mut tokens = Vec::new();
        while let Some(tok) = self.next_token() {
            tokens.push(tok);
        }
        tokens
    }
}
