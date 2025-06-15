#[derive(Debug, Clone, PartialEq)]
pub enum Token<'a> {
    Identifier(&'a str),
    Integer(&'a str),
    Match,
    Enum,
    Struct,
    I8,
    I16,
    I32,
    I64,
    F32,
    F64,
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

    pub fn next_token(&mut self) -> Option<Token<'a>> {
        self.skip_trivia();
        match self.peek()? {
            c if c.is_ascii_alphabetic() || c == '_' => {
                let ident = self.consume_while(|c| c.is_ascii_alphanumeric() || c == '_');
                Some(match ident {
                    "match" => Token::Match,
                    "enum" => Token::Enum,
                    "struct" => Token::Struct,
                    "CString" => Token::CString,
                    "HebrewString" => Token::HebrewString,
                    "i8" => Token::I8,
                    "i16" => Token::I16,
                    "i32" => Token::I32,
                    "i64" => Token::I64,
                    "f32" => Token::F32,
                    "f64" => Token::F64,
                    _ => Token::Identifier(ident),
                })
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
        }
    }

    pub fn tokenize(&mut self) -> Vec<Token<'a>> {
        let mut tokens = Vec::new();
        while let Some(tok) = self.next_token() {
            tokens.push(tok);
        }
        tokens
    }
}
