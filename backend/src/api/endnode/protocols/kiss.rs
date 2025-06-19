pub const FEND: u8 = 0xC0;
const FESC: u8 = 0xDB;
const TFEND: u8 = 0xDC;
const TFESC: u8 = 0xDD;

pub struct KissFrame {
    pub port: u8,
    pub cmd: u8,
    pub payload: Vec<u8>,
}

#[derive(Debug, PartialEq)]
pub enum DecodeError {
    MissingStart,
    MissingEnd,
    TooShort,
    BadEscape,
}

impl KissFrame {
    pub fn new(port: u8, cmd: u8, payload: Vec<u8>) -> Self {
        assert!(port < 16, "port must be 0..15");
        assert!(cmd < 16, "cmd must be 0..15");
        KissFrame { port, cmd, payload }
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(2 + self.payload.len() * 2 + 1);
        buf.push(FEND);
        buf.push((self.port << 4) | (self.cmd & 0x0F));

        for &b in &self.payload {
            match b {
                FEND => {
                    buf.push(FESC);
                    buf.push(TFEND);
                }
                FESC => {
                    buf.push(FESC);
                    buf.push(TFESC);
                }
                _ => buf.push(b),
            }
        }

        buf.push(FEND);
        buf
    }

    pub fn decode(data: &[u8]) -> Result<Self, DecodeError> {
        let start = data
            .iter()
            .position(|&b| b == FEND)
            .ok_or(DecodeError::MissingStart)?;
        let rest = &data[start + 1..];

        if rest.len() < 2 {
            return Err(DecodeError::TooShort);
        }

        let end = rest
            .iter()
            .position(|&b| b == FEND)
            .ok_or(DecodeError::MissingEnd)?;
        let frame = &rest[..end];
        let mut iter = frame.iter().cloned();

        let pc = iter.next().ok_or(DecodeError::TooShort)?;
        let port = pc >> 4;
        let cmd = pc & 0x0F;

        let mut payload = Vec::with_capacity(frame.len());
        while let Some(b) = iter.next() {
            if b == FESC {
                let t = iter.next().ok_or(DecodeError::BadEscape)?;
                match t {
                    TFEND => payload.push(FEND),
                    TFESC => payload.push(FESC),
                    _ => return Err(DecodeError::BadEscape),
                }
            } else {
                payload.push(b);
            }
        }

        Ok(KissFrame { port, cmd, payload })
    }
}
