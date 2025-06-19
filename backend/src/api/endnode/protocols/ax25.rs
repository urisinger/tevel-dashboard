use std::fmt;

/// A decoded AX.25 “packet” (i.e. everything after the FCS in JS code).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ax25Packet {
    pub dest_callsign: String,
    pub dest_ssid: u8,
    pub src_callsign: String,
    pub src_ssid: u8,
    pub data: Vec<u8>,
}

/// Errors from encode/decode
#[derive(Debug)]
pub enum Ax25Error {
    BadCallsign,
    BadSsid,
    PacketTooShortOrLong,
    InvalidUtf8,
}

impl fmt::Display for Ax25Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Ax25Error::BadCallsign => write!(f, "Callsign must be exactly 6 A-Z0-9"),
            Ax25Error::BadSsid => write!(f, "SSID must be 0..9"),
            Ax25Error::PacketTooShortOrLong => write!(f, "Packet too short or too long"),
            Ax25Error::InvalidUtf8 => write!(f, "Invalid UTF-8 in callsign"),
        }
    }
}

impl std::error::Error for Ax25Error {}

pub struct Ax25Codec {
    src_callsign: String,
    src_ssid: u8,
}

impl Ax25Codec {
    pub fn new(callsign: &str, ssid: u8) -> Result<Self, Ax25Error> {
        if callsign.len() != 6 || !callsign.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err(Ax25Error::BadCallsign);
        }
        if ssid > 9 {
            return Err(Ax25Error::BadSsid);
        }
        Ok(Self {
            src_callsign: callsign.into(),
            src_ssid: ssid,
        })
    }

    pub fn decode(&self, buf: &[u8]) -> Result<Ax25Packet, Ax25Error> {
        if buf.len() < 16 || buf.len() > 272 {
            return Err(Ax25Error::PacketTooShortOrLong);
        }

        let dest_callsign = unshift_callsign(&buf[0..6])?;
        let dest_ssid = decode_ssid(buf[6]);
        let src_callsign = unshift_callsign(&buf[7..13])?;
        let src_ssid = decode_ssid(buf[13]);
        let data = buf[16..].to_vec();

        Ok(Ax25Packet {
            dest_callsign,
            dest_ssid,
            src_callsign,
            src_ssid,
            data,
        })
    }

    pub fn encode(&self, pkt: &Ax25Packet) -> Result<Vec<u8>, Ax25Error> {
        if pkt.dest_callsign.len() != 6
            || !pkt.dest_callsign.chars().all(|c| c.is_ascii_alphanumeric())
        {
            return Err(Ax25Error::BadCallsign);
        }
        if pkt.dest_ssid > 9 {
            return Err(Ax25Error::BadSsid);
        }
        let mut out = Vec::with_capacity(6 + 1 + 6 + 1 + 2 + pkt.data.len());
        out.extend_from_slice(&shift_callsign(&pkt.dest_callsign));
        out.push(encode_ssid(pkt.dest_ssid, 0));
        out.extend_from_slice(&shift_callsign(&self.src_callsign));
        out.push(encode_ssid(self.src_ssid, 1));

        // static control + PID
        out.extend_from_slice(&[0x03, 0xF0]);

        out.extend_from_slice(&pkt.data);

        if out.len() > 272 {
            return Err(Ax25Error::PacketTooShortOrLong);
        }
        Ok(out)
    }
}

/// Left-shift each ASCII byte, pad to 6 bytes with zeros.
fn shift_callsign(cs: &str) -> [u8; 6] {
    let mut buf = [0u8; 6];
    for (i, b) in cs.as_bytes().iter().enumerate().take(6) {
        buf[i] = b << 1;
    }
    buf
}

/// Right-shift each byte >>1, trim trailing spaces, interpret as UTF-8
fn unshift_callsign(raw: &[u8]) -> Result<String, Ax25Error> {
    let unmapped: Vec<u8> = raw.iter().map(|&b| b >> 1).collect();
    // treat 0 or spaces as padding
    let s = String::from_utf8(unmapped).map_err(|_| Ax25Error::InvalidUtf8)?;
    Ok(s.trim_end_matches(char::from(0)).trim().to_string())
}

/// SSID byte:  bit7..4 = SSID<<1|<others>, low bit is extension=0 in this simple version
/// fixed bits 0x60, plus type_bit (C/R flag in low bit of that nibble)
fn encode_ssid(ssid: u8, type_bit: u8) -> u8 {
    let mut v = (ssid & 0x0F) << 1;
    v |= 0x60; // fixed bits
    v |= type_bit & 0x01;
    v
}

/// To decode SSID: drop low bit, >>1, mask low 4 bits
fn decode_ssid(byte: u8) -> u8 {
    (byte >> 1) & 0x0F
}
