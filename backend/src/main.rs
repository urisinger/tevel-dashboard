#[cfg(feature = "api")]
mod api;
#[cfg(feature = "static-files")]
mod static_files;

use api::{api_service, ApiOpts};
use axum::Router;
use clap::Parser;
use std::net::SocketAddr;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Parser, Debug)]
#[command(name = "proxy-server")]
struct Opts {
    #[arg(long, default_value = "0.0.0.0:8080")]
    addr: SocketAddr,

    #[clap(flatten)]
    api_opts: ApiOpts,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .init();

    let args = Opts::parse();

    let app = Router::new();

    #[cfg(feature = "api")]
    let app = app.nest("/api", api_service(args.api_opts).await);

    #[cfg(feature = "static-files")]
    let app = app
        .route("/", axum::routing::get(static_files::index_handler))
        .route(
            "/index.html",
            axum::routing::get(static_files::index_handler),
        )
        .fallback_service(axum::routing::get(static_files::static_handler))
        .fallback_service(axum::routing::get(static_files::static_handler));

    let app = app.layer(TraceLayer::new_for_http());

    println!("🚀 Serving on http://{}", args.addr);
    axum::serve(
        tokio::net::TcpListener::bind(args.addr).await.unwrap(),
        app.into_make_service(),
    )
    .await
    .unwrap();
}
