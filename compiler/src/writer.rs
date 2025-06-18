use std::io::{self, Write};

use codespan_reporting::{
    diagnostic::Diagnostic,
    files::Files,
    term::{
        self,
        termcolor::{self, Color, ColorSpec, WriteColor},
        Config,
    },
};

pub fn render_diagnostics_doc<'a, F, FileId, W>(
    out: &mut W,
    diagnostics: &[Diagnostic<FileId>],
    files: &'a F,
    config: &Config,
) -> io::Result<()>
where
    F: Files<'a, FileId = FileId>,
    FileId: Copy,
    W: Write,
{
    // 1) Document prologue
    write!(
        out,
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Diagnostics</title>
</head>
<body>
"#
    )?;

    // 2) Your existing fragment function emits the styled div + <pre>
    render_diagnostics(out, diagnostics, files, config)?;

    // 3) Close body/html
    write!(
        out,
        r#"
</body>
</html>
"#
    )?;

    out.flush()
}

pub fn render_diagnostics<'a, F, FileId, W>(
    out: &mut W,
    diagnostics: &[Diagnostic<FileId>],
    files: &'a F,
    config: &Config,
) -> io::Result<()>
where
    F: Files<'a, FileId = FileId>,
    FileId: Copy,
    W: Write,
{
    // 1) Render colored HTML into a buffer
    let mut buf = Vec::new();
    {
        let mut html_writer = HtmlWriter::new(&mut buf);
        for diag in diagnostics {
            term::emit(&mut html_writer, config, files, diag).map_err(io::Error::other)?;
        }
        html_writer.reset()?;
    }

    // 2) Emit just a div with style + pre
    write!(
        out,
        r#"<div class="diagnostics">
  <style>
    /* Base16 Tomorrow Night */
    pre {{
      background: #1d1f21;
      margin: 0;
      padding: 10px;
      border-radius: 6px;
      color: #ffffff;
      font: 12px SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace;
      white-space: pre-wrap;
      word-break: break-word;
    }}

    pre .bold {{ font-weight: bold; }}

    /* foreground */
    pre .fg.black   {{ color: #1d1f21; }}
    pre .fg.red     {{ color: #cc6666; }}
    pre .fg.green   {{ color: #b5bd68; }}
    pre .fg.yellow  {{ color: #f0c674; }}
    pre .fg.blue    {{ color: #81a2be; }}
    pre .fg.magenta {{ color: #b294bb; }}
    pre .fg.cyan    {{ color: #8abeb7; }}
    pre .fg.white   {{ color: #c5c8c6; }}

    pre .fg.black.bright    {{ color: #969896; }}
    pre .fg.red.bright      {{ color: #cc6666; }}
    pre .fg.green.bright    {{ color: #b5bd68; }}
    pre .fg.yellow.bright   {{ color: #f0c674; }}
    pre .fg.blue.bright     {{ color: #81a2be; }}
    pre .fg.magenta.bright  {{ color: #b294bb; }}
    pre .fg.cyan.bright     {{ color: #8abeb7; }}
    pre .fg.white.bright    {{ color: #ffffff; }}

    /* background */
    pre .bg.black   {{ background-color: #1d1f21; }}
    pre .bg.red     {{ background-color: #cc6666; }}
    pre .bg.green   {{ background-color: #b5bd68; }}
    pre .bg.yellow  {{ background-color: #f0c674; }}
    pre .bg.blue    {{ background-color: #81a2be; }}
    pre .bg.magenta {{ background-color: #b294bb; }}
    pre .bg.cyan    {{ background-color: #8abeb7; }}
    pre .bg.white   {{ background-color: #c5c8c6; }}

    pre .bg.black.bright    {{ background-color: #969896; }}
    pre .bg.red.bright      {{ background-color: #cc6666; }}
    pre .bg.green.bright    {{ background-color: #b5bd68; }}
    pre .bg.yellow.bright   {{ background-color: #f0c674; }}
    pre .bg.blue.bright     {{ background-color: #81a2be; }}
    pre .bg.magenta.bright  {{ background-color: #b294bb; }}
    pre .bg.cyan.bright     {{ background-color: #8abeb7; }}
    pre .bg.white.bright    {{ background-color: #ffffff; }}
  </style>
  <pre>"#
    )?;

    // 3) Insert the coloured content
    out.write_all(&buf)?;

    // 4) Close the tags
    write!(out, "</pre>\n</div>\n")?;
    out.flush()
}

pub struct HtmlWriter<W> {
    upstream: W,
    color: ColorSpec,
}

impl<W> HtmlWriter<W> {
    pub fn new(upstream: W) -> HtmlWriter<W> {
        HtmlWriter {
            upstream,
            color: ColorSpec::new(),
        }
    }
}

impl<W: Write> Write for HtmlWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.upstream.write(buf)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.upstream.flush()
    }
}

impl<W: Write> WriteColor for HtmlWriter<W> {
    fn supports_color(&self) -> bool {
        true
    }

    fn set_color(&mut self, spec: &ColorSpec) -> io::Result<()> {
        #![allow(unused_assignments)]

        if self.color == *spec {
            return Ok(());
        } else {
            if !self.color.is_none() {
                write!(self, "</span>")?;
            }
            self.color = spec.clone();
        }

        if spec.is_none() {
            write!(self, "</span>")?;
            return Ok(());
        } else {
            write!(self, "<span class=\"")?;
        }

        let mut first = true;

        fn write_first<W: Write>(first: bool, writer: &mut HtmlWriter<W>) -> io::Result<bool> {
            if !first {
                write!(writer, " ")?;
            }

            Ok(false)
        }

        fn write_color<W: Write>(color: &Color, writer: &mut HtmlWriter<W>) -> io::Result<()> {
            match color {
                Color::Black => write!(writer, "black"),
                Color::Blue => write!(writer, "blue"),
                Color::Green => write!(writer, "green"),
                Color::Red => write!(writer, "red"),
                Color::Cyan => write!(writer, "cyan"),
                Color::Magenta => write!(writer, "magenta"),
                Color::Yellow => write!(writer, "yellow"),
                Color::White => write!(writer, "white"),
                // TODO: other colors
                _ => Ok(()),
            }
        }

        if let Some(fg) = spec.fg() {
            first = write_first(first, self)?;
            write!(self, "fg ")?;
            write_color(fg, self)?;
        }

        if let Some(bg) = spec.bg() {
            first = write_first(first, self)?;
            write!(self, "bg ")?;
            write_color(bg, self)?;
        }

        if spec.bold() {
            first = write_first(first, self)?;
            write!(self, "bold")?;
        }

        if spec.underline() {
            first = write_first(first, self)?;
            write!(self, "underline")?;
        }

        if spec.intense() {
            first = write_first(first, self)?;
            write!(self, "bright")?;
        }

        write!(self, "\">")?;

        Ok(())
    }

    fn reset(&mut self) -> io::Result<()> {
        let color = self.color.clone();

        if color != ColorSpec::new() {
            write!(self, "</span>")?;
            self.color = ColorSpec::new();
        }

        Ok(())
    }
}

/// Rudimentary HTML escaper which performs the following conversions:
///
/// - `<` ⇒ `&lt;`
/// - `>` ⇒ `&gt;`
/// - `&` ⇒ `&amp;`
pub struct HtmlEscapeWriter<W> {
    upstream: W,
}

impl<W> HtmlEscapeWriter<W> {
    pub fn new(upstream: W) -> HtmlEscapeWriter<W> {
        HtmlEscapeWriter { upstream }
    }
}

impl<W: std::io::Write> std::io::Write for HtmlEscapeWriter<W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let mut last = 0;
        for (i, &b) in buf.iter().enumerate() {
            let escape = match b {
                b'<' => b"&lt;"[..].as_ref(),
                b'>' => b"&gt;"[..].as_ref(),
                b'&' => b"&amp;"[..].as_ref(),
                _ => continue,
            };
            self.upstream.write_all(&buf[last..i])?;
            self.upstream.write_all(escape)?;
            last = i + 1;
        }
        self.upstream.write_all(&buf[last..])?;
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.upstream.flush()
    }
}

impl<W: termcolor::WriteColor> termcolor::WriteColor for HtmlEscapeWriter<W> {
    fn supports_color(&self) -> bool {
        self.upstream.supports_color()
    }

    fn set_color(&mut self, spec: &termcolor::ColorSpec) -> std::io::Result<()> {
        self.upstream.set_color(spec)
    }

    fn reset(&mut self) -> std::io::Result<()> {
        self.upstream.reset()
    }
}
