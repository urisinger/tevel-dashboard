use std::io::{self, Write};

use codespan_reporting::{
    diagnostic::{Diagnostic, Label, LabelStyle, Severity},
    files::{Files, SimpleFiles},
    term::{Config, Renderer, RichDiagnostic},
};

use crate::syntax::Span;

pub type FileId = usize;
pub struct CompileError {
    pub files: SimpleFiles<String, String>,
    pub diagnostics: Vec<Diagnostic<FileId>>,
}

pub fn render_diagnostics<'a, F, W>(
    out: &mut W,
    diagnostics: &[Diagnostic<F::FileId>],
    files: &'a F,
    config: &Config,
) -> io::Result<()>
where
    F: Files<'a>,
    W: Write,
{
    let mut buf = Vec::new();
    {
        let mut html_writer = HtmlWriter::new(&mut buf);

        let mut renderer = Renderer::new(&mut html_writer, config);
        for diag in diagnostics {
            RichDiagnostic::new(diag, config)
                .render(files, &mut renderer)
                .map_err(io::Error::other)?;
        }
        html_writer.close_span()?;
    }

    out.write_all(&buf)?;

    out.flush()
}

pub(crate) fn make_compile_error(
    filename: impl Into<String>,
    src: &str,
    errs: impl IntoIterator<Item = (String, Span, Vec<(String, Span)>)>,
) -> CompileError {
    let mut files = SimpleFiles::new();
    let file_id = files.add(filename.into(), src.to_string());

    let diagnostics = errs
        .into_iter()
        .map(|(msg, primary, secondaries)| make_diagnostic(file_id, msg, primary, &secondaries))
        .collect();

    CompileError { files, diagnostics }
}

fn make_diagnostic(
    file_id: usize,
    msg: impl Into<String>,
    primary: Span,
    secondaries: &[(String, Span)],
) -> Diagnostic<FileId> {
    let msg_str = msg.into();
    let mut labels = vec![Label::primary(file_id, primary).with_message(msg_str.clone())];
    for (smsg, span) in secondaries {
        labels.push(Label::secondary(file_id, *span).with_message(smsg.clone()));
    }
    Diagnostic::error()
        .with_message(msg_str)
        .with_labels(labels)
}

struct HtmlWriter<W> {
    upstream: W,
    span_open: bool,
}

impl<W: Write> HtmlWriter<W> {
    pub fn new(upstream: W) -> Self {
        HtmlWriter {
            upstream,
            span_open: false,
        }
    }

    /// Close any open span
    fn close_span(&mut self) -> io::Result<()> {
        if self.span_open {
            write!(self.upstream, "</span>")?;
            self.span_open = false;
        }
        Ok(())
    }

    /// Open a new span with the given CSS class
    fn open_span(&mut self, class: &str) -> io::Result<()> {
        // close existing first
        self.close_span()?;
        write!(self.upstream, "<span class=\"{}\">", class)?;
        self.span_open = true;
        Ok(())
    }
}

impl<W: Write> Write for HtmlWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
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
    fn flush(&mut self) -> io::Result<()> {
        self.upstream.flush()
    }
}

impl<W: Write> codespan_reporting::term::WriteStyle for HtmlWriter<W> {
    fn set_header(&mut self, severity: Severity) -> io::Result<()> {
        let class = match severity {
            Severity::Bug => "header-bug",
            Severity::Error => "header-error",
            Severity::Warning => "header-warning",
            Severity::Note => "header-note",
            Severity::Help => "header-help",
        };
        self.open_span(class)
    }

    fn set_header_message(&mut self) -> io::Result<()> {
        self.open_span("header-message")
    }

    fn set_line_number(&mut self) -> io::Result<()> {
        self.open_span("line-number")
    }

    fn set_note_bullet(&mut self) -> io::Result<()> {
        self.open_span("note-bullet")
    }

    fn set_source_border(&mut self) -> io::Result<()> {
        self.open_span("source-border")
    }

    fn set_label(&mut self, severity: Severity, label_style: LabelStyle) -> io::Result<()> {
        let sev = match severity {
            Severity::Bug => "bug",
            Severity::Error => "error",
            Severity::Warning => "warning",
            Severity::Note => "note",
            Severity::Help => "help",
        };
        let typ = match label_style {
            LabelStyle::Primary => "primary",
            LabelStyle::Secondary => "secondary",
        };
        self.open_span(&format!("label-{}-{}", typ, sev))
    }

    fn reset(&mut self) -> io::Result<()> {
        self.close_span()
    }
}
